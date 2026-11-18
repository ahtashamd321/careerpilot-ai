import { adminClient } from "./supabase/admin";
import { generateJson, HONESTY_RULES } from "./ai";
import type { Profile } from "./types";
import { istDate } from "./util";

const BANNED = [
  "in today's fast-paced", "game-changer", "game changer", "unlock", "delve", "leverage the power",
  "i'm thrilled", "i am thrilled", "excited to announce", "humbled", "journey", "dive deep", "deep dive",
  "revolutionize", "landscape", "embark", "tapestry", "elevate", "synergy", "let that sink in",
  "never give up", "hustle", "dream big", "believe in yourself",
];

export function bannedPhrasesIn(text: string): string[] {
  const t = text.toLowerCase();
  return BANNED.filter((b) => t.includes(b));
}

const STYLE = `Write like a real early-career analyst in India talking to peers on LinkedIn.
- Open with a concrete hook in the first line: a specific observation, a number from the research, or a small mistake and what it taught. No questions like "Did you know?".
- Short paragraphs (1-2 sentences). 90-180 words.
- Give one useful, specific insight someone can apply (an Excel formula, a SQL pattern, a Power BI setting, a hiring signal).
- Tie it to the author's real work: certification projects (name them accurately) or skills. Never claim a data analyst job.
- No emojis at the start of lines, no bullet walls, no motivational slogans, no fake achievements, no "Agree?" closers.
- Avoid these words/phrases entirely: ${BANNED.join(", ")}.
- 3-5 relevant hashtags at the end, returned separately.`;

type Draft = { angle: string; content: string; hashtags: string[] };

async function draftPosts(profile: Profile, research: { title: string; summary: string; url: string }[], count: number, avoid: string[] = []) {
  const prompt = `${STYLE}
${HONESTY_RULES}

Author: ${profile.full_name}. ${profile.summary}
Skills: ${profile.skills.join(", ")}
Projects: ${profile.projects.map((p) => `${p.name} (${p.tools.join(", ")})`).join("; ")}

Today's research (use it, don't copy it; cite nothing you can't see here):
${research.map((r, i) => `[${i}] ${r.title}: ${r.summary}`).join("\n") || "(no research today — write from the projects and skills)"}

${avoid.length ? `Do not repeat these recent angles: ${avoid.join(" | ")}` : ""}

Write ${count} different posts, each with a different angle (e.g. one tool tip, one project lesson, one take on a hiring or industry trend).
Return JSON: {"posts":[{"angle":"short label","content":"post body without hashtags","hashtags":["#DataAnalytics"]}]}`;
  const { data } = await generateJson<{ posts: Draft[] }>(prompt, { temperature: 0.85 });
  return (data.posts ?? []).filter((p) => p.content?.trim());
}

async function recentContext(userId: string) {
  const db = adminClient();
  const { data: research } = await db.from("research_items").select("title,summary,url").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(12);
  const { data: recent } = await db.from("posts").select("angle").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(12);
  return { research: research ?? [], avoid: (recent ?? []).map((r) => r.angle).filter(Boolean) };
}

function cleanTags(tags: string[]) {
  return [...new Set((tags ?? []).map((h) => `#${String(h).replace(/^#+/, "").replace(/\s+/g, "")}`).filter((h) => h.length > 2))].slice(0, 5);
}

export async function runPostsStep(userId: string, profile: Profile, count: number) {
  const db = adminClient();
  const runDate = istDate();
  const { count: already } = await db.from("posts").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("run_date", runDate).neq("status", "discarded");
  const need = Math.max(0, count - (already ?? 0));
  if (!need) return { created: 0, note: "Today's drafts already exist." };

  const { research, avoid } = await recentContext(userId);
  let drafts = await draftPosts(profile, research, need, avoid);
  // One rewrite pass for anything using banned phrasing.
  if (drafts.some((d) => bannedPhrasesIn(d.content).length)) {
    const retry = await draftPosts(profile, research, need, avoid);
    drafts = drafts.map((d, i) => (bannedPhrasesIn(d.content).length && retry[i] && !bannedPhrasesIn(retry[i].content).length ? retry[i] : d));
  }
  const rows = drafts.slice(0, need).map((d) => ({
    user_id: userId, run_date: runDate, angle: d.angle?.slice(0, 120) ?? "", content: d.content.trim(), hashtags: cleanTags(d.hashtags),
  }));
  const { error } = await db.from("posts").insert(rows);
  if (error) throw new Error(`Saving posts failed: ${error.message}`);
  return { created: rows.length };
}

/** Rewrites one draft with a fresh angle, optionally following the user's instruction. */
export async function regeneratePost(userId: string, profile: Profile, postId: string, instruction?: string) {
  const db = adminClient();
  const { data: post } = await db.from("posts").select("*").eq("id", postId).eq("user_id", userId).single();
  if (!post) throw new Error("Post not found");
  const { research } = await recentContext(userId);
  const { data } = await generateJson<Draft>(
    `${STYLE}
${HONESTY_RULES}
Author: ${profile.full_name}. ${profile.summary}
Projects: ${profile.projects.map((p) => p.name).join(", ")}
Research: ${research.slice(0, 8).map((r) => r.title).join(" | ")}

Here is the current draft:
"""${post.content}"""
${instruction ? `Rewrite it following this instruction: ${instruction}` : "Write a new version with a stronger hook and a more specific insight."}
Return JSON: {"angle":"","content":"","hashtags":[]}`,
    { temperature: 0.85 },
  );
  const { error } = await db.from("posts").update({
    content: data.content.trim(), angle: data.angle ?? post.angle, hashtags: cleanTags(data.hashtags),
    status: "draft", error: null, updated_at: new Date().toISOString(),
  }).eq("id", postId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
