import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/supabase/server";
import { publishToLinkedIn } from "@/lib/linkedin";
import { errorMessage } from "@/lib/util";

// Publishes one APPROVED post right now. Drafts can't be published without approval.
export async function POST(request: Request) {
  const auth = await getUserOrNull();
  if (!auth) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { postId } = (await request.json().catch(() => ({}))) as { postId?: string };
  if (!postId) return NextResponse.json({ error: "postId is required" }, { status: 400 });

  const { supabase, user } = auth;
  const { data: post } = await supabase.from("posts").select("*").eq("id", postId).eq("user_id", user.id).maybeSingle();
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (!["approved", "failed", "scheduled"].includes(post.status)) {
    return NextResponse.json({ error: "Approve the post before publishing it." }, { status: 400 });
  }
  const { data: claimed } = await supabase.from("posts").update({ status: "publishing" }).eq("id", postId).eq("status", post.status).select("id");
  if (!claimed?.length) return NextResponse.json({ error: "This post is already being published." }, { status: 409 });
  try {
    const urn = await publishToLinkedIn(user.id, post.content, post.hashtags);
    await supabase.from("posts").update({ status: "published", published_at: new Date().toISOString(), linkedin_post_id: urn, error: null, scheduled_at: null }).eq("id", postId);
    return NextResponse.json({ ok: true, urn });
  } catch (e) {
    const msg = errorMessage(e);
    await supabase.from("posts").update({ status: "failed", error: msg }).eq("id", postId);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
