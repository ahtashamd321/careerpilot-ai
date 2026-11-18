import { adminClient } from "./supabase/admin";
import { decrypt, encrypt } from "./crypto";
import { appUrl, optionalEnv, requireEnv } from "./env";
import { HttpError } from "./util";

// Official LinkedIn APIs only:
//  - "Sign In with LinkedIn using OpenID Connect" -> scopes openid profile email
//  - "Share on LinkedIn" -> scope w_member_social (post as yourself)
// Both are self-serve products on a free LinkedIn developer app.
// LinkedIn does not offer individuals APIs for job search, people search or
// reading other profiles; those features use other legitimate sources.

export const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"];
export const redirectUri = () => `${appUrl()}/api/linkedin/callback`;

export function authorizeUrl(state: string) {
  const u = new URL("https://www.linkedin.com/oauth/v2/authorization");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", requireEnv("LINKEDIN_CLIENT_ID"));
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("state", state);
  u.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  return u.toString();
}

export async function exchangeCode(code: string) {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: requireEnv("LINKEDIN_CLIENT_ID"),
      client_secret: requireEnv("LINKEDIN_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) throw new HttpError(res.status, `LinkedIn token exchange failed: ${await res.text()}`, false);
  return (await res.json()) as { access_token: string; expires_in: number; scope?: string };
}

export async function fetchUserInfo(accessToken: string) {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new HttpError(res.status, `LinkedIn userinfo failed: ${await res.text()}`, false);
  return (await res.json()) as { sub: string; name?: string; email?: string; picture?: string };
}

export async function saveConnection(userId: string, token: { access_token: string; expires_in: number; scope?: string }) {
  const info = await fetchUserInfo(token.access_token);
  const { error } = await adminClient().from("linkedin_connections").upsert({
    user_id: userId,
    linkedin_sub: info.sub,
    name: info.name ?? null,
    email: info.email ?? null,
    picture: info.picture ?? null,
    access_token_enc: encrypt(token.access_token),
    scopes: token.scope ?? LINKEDIN_SCOPES.join(" "),
    expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    connected_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return info;
}

export type LinkedInStatus =
  | { connected: false; configured: boolean }
  | { connected: true; configured: true; name: string | null; email: string | null; picture: string | null; expiresAt: string; expired: boolean; canPost: boolean };

export async function getStatus(userId: string): Promise<LinkedInStatus> {
  const configured = Boolean(optionalEnv("LINKEDIN_CLIENT_ID") && optionalEnv("LINKEDIN_CLIENT_SECRET") && optionalEnv("TOKEN_ENCRYPTION_KEY"));
  const { data } = await adminClient().from("linkedin_connections")
    .select("name,email,picture,expires_at,scopes").eq("user_id", userId).maybeSingle();
  if (!data) return { connected: false, configured };
  const expired = new Date(data.expires_at).getTime() < Date.now();
  return {
    connected: true, configured: true, name: data.name, email: data.email, picture: data.picture,
    expiresAt: data.expires_at, expired, canPost: !expired && String(data.scopes).includes("w_member_social"),
  };
}

export async function disconnect(userId: string) {
  await adminClient().from("linkedin_connections").delete().eq("user_id", userId);
}

/** LinkedIn "little text" escaping, with hashtags as real hashtag templates. */
export function toLittleText(content: string, hashtags: string[]) {
  const esc = (s: string) => s.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`);
  const tags = hashtags.map((h) => `{hashtag|\\#|${h.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "")}}`).join(" ");
  return `${esc(content)}${tags ? `\n\n${tags}` : ""}`;
}

export function composerUrl(content: string, hashtags: string[]) {
  const text = `${content}\n\n${hashtags.join(" ")}`.trim();
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
}

/** Publishes as the connected member. Returns the post URN. */
export async function publishToLinkedIn(userId: string, content: string, hashtags: string[]): Promise<string> {
  const { data } = await adminClient().from("linkedin_connections")
    .select("linkedin_sub,access_token_enc,expires_at,scopes").eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(400, "LinkedIn is not connected.", false);
  if (new Date(data.expires_at).getTime() < Date.now()) throw new HttpError(401, "LinkedIn access has expired. Reconnect LinkedIn in Settings.", false);
  if (!String(data.scopes).includes("w_member_social")) throw new HttpError(403, "Posting permission (w_member_social) was not granted. Add the 'Share on LinkedIn' product to your LinkedIn app and reconnect.", false);
  const token = decrypt(data.access_token_enc);
  const author = `urn:li:person:${data.linkedin_sub}`;

  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": optionalEnv("LINKEDIN_API_VERSION") ?? "202604",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      commentary: toLittleText(content, hashtags),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (res.ok) return res.headers.get("x-restli-id") ?? "published";
  if (res.status === 401 || res.status === 403) {
    throw new HttpError(res.status, `LinkedIn refused the post (${res.status}): ${await res.text()}`, false);
  }
  // Version sunset or other 4xx: fall back to the legacy UGC endpoint.
  const first = await res.text();
  const legacy = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: `${content}\n\n${hashtags.join(" ")}`.trim() },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  if (legacy.ok) return legacy.headers.get("x-restli-id") ?? "published";
  throw new HttpError(legacy.status, `LinkedIn publish failed. /rest/posts: ${res.status} ${first.slice(0, 200)}; /v2/ugcPosts: ${legacy.status} ${(await legacy.text()).slice(0, 200)}`);
}

export function postUrl(urn: string | null) {
  return urn && urn.startsWith("urn:") ? `https://www.linkedin.com/feed/update/${urn}/` : null;
}

/** Publishes approved posts whose scheduled time has passed. Called by the scheduler. */
export async function publishDuePosts() {
  const db = adminClient();
  const { data: due } = await db.from("posts").select("id,user_id,content,hashtags")
    .eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).limit(20);
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const p of due ?? []) {
    // Claim the row first so overlapping runs can't double-post.
    const { data: claimed } = await db.from("posts").update({ status: "publishing" }).eq("id", p.id).eq("status", "scheduled").select("id");
    if (!claimed?.length) continue;
    try {
      const urn = await publishToLinkedIn(p.user_id, p.content, p.hashtags);
      await db.from("posts").update({ status: "published", published_at: new Date().toISOString(), linkedin_post_id: urn, error: null }).eq("id", p.id);
      results.push({ id: p.id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("posts").update({ status: "failed", error: msg }).eq("id", p.id);
      await db.from("notifications").insert({ user_id: p.user_id, kind: "error", title: "Scheduled LinkedIn post failed", body: msg, data: { post_id: p.id } });
      results.push({ id: p.id, ok: false, error: msg });
    }
  }
  return results;
}
