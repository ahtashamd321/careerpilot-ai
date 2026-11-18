"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { regenerate, schedulePost, setPostStatus, updatePost } from "@/app/actions";
import { CopyButton } from "./actions-ui";
import { Badge } from "./ui";

export type PostRow = {
  id: string; angle: string; content: string; hashtags: string[]; status: string; scheduled_at: string | null;
  published_at: string | null; linkedin_post_id: string | null; error: string | null; run_date: string;
};

const TONE: Record<string, "neutral" | "cyan" | "good" | "warn" | "bad"> = {
  draft: "neutral", approved: "cyan", scheduled: "cyan", publishing: "warn", published: "good", failed: "bad", discarded: "neutral",
};

export function PostEditor({ post, canPublish }: { post: PostRow; canPublish: boolean }) {
  const [content, setContent] = useState(post.content);
  const [tags, setTags] = useState(post.hashtags.join(" "));
  const [instruction, setInstruction] = useState("");
  const [when, setWhen] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = content !== post.content || tags !== post.hashtags.join(" ");
  const locked = post.status === "published" || post.status === "publishing";
  const fullText = `${content}\n\n${tags}`.trim();
  const words = content.trim().split(/\s+/).filter(Boolean).length;

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Failed" });
      router.refresh();
    });

  const publishNow = () =>
    start(async () => {
      if (dirty) { const r = await updatePost(post.id, content, tags); if (!r.ok) { setMsg({ ok: false, text: r.error }); return; } }
      const res = await fetch("/api/linkedin/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: post.id }) });
      const data = await res.json();
      setMsg(res.ok ? { ok: true, text: "Published on LinkedIn." } : { ok: false, text: data.error });
      router.refresh();
    });

  return (
    <article className="panel p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-paper">{post.angle || "LinkedIn draft"}</h3>
        <div className="flex items-center gap-2">
          <span className={clsx("text-xs", words > 220 ? "text-warn" : "text-mist")}>{words} words</span>
          <Badge tone={TONE[post.status]}>{post.status}</Badge>
        </div>
      </div>

      <textarea aria-label="Post text" value={content} onChange={(e) => setContent(e.target.value)} disabled={locked} rows={10}
        className="field font-sans leading-relaxed" />
      <input aria-label="Hashtags" value={tags} onChange={(e) => setTags(e.target.value)} disabled={locked} className="field mt-2 text-cyan" />

      {post.status === "scheduled" && post.scheduled_at && <p className="mt-2 text-sm text-cyan">Scheduled for {new Date(post.scheduled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>}
      {post.status === "published" && (
        <p className="mt-2 text-sm text-good">
          Published {post.published_at ? new Date(post.published_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}.
          {post.linkedin_post_id?.startsWith("urn:") && <> <a className="link" target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/feed/update/${post.linkedin_post_id}/`}>View on LinkedIn</a></>}
        </p>
      )}
      {post.error && post.status === "failed" && <p className="mt-2 text-sm text-bad">{post.error}</p>}

      {!locked && (
        <div className="mt-4 flex flex-wrap gap-2">
          {dirty && <button className="btn-primary" disabled={pending} onClick={() => run(() => updatePost(post.id, content, tags))}>Save edits</button>}
          {post.status === "draft" && <button className="btn-primary" disabled={pending || dirty} onClick={() => run(() => setPostStatus(post.id, "approved"))}>Approve</button>}
          {["approved", "scheduled", "failed"].includes(post.status) && <button className="btn-ghost" disabled={pending} onClick={() => run(() => setPostStatus(post.id, "draft"))}>Back to draft</button>}
          <CopyButton text={fullText} label="Copy text" />
          <a className="btn-ghost" target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(fullText)}`}>Open in LinkedIn composer</a>
          <button className="btn text-mist hover:text-bad" disabled={pending} onClick={() => run(() => setPostStatus(post.id, "discarded"))}>Discard</button>
        </div>
      )}

      {!locked && ["approved", "scheduled", "failed"].includes(post.status) && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          {canPublish ? (
            <>
              <button className="btn-primary" disabled={pending} onClick={publishNow}>Publish now</button>
              <label className="text-xs text-mist">Or schedule for
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="field mt-1 py-1.5" />
              </label>
              <button className="btn-ghost" disabled={pending || !when} onClick={() => run(() => schedulePost(post.id, new Date(when).toISOString()))}>Schedule</button>
            </>
          ) : (
            <p className="text-sm text-mist">Connect LinkedIn with posting permission in Settings to publish or schedule from here. Until then, copy the text or use the composer link.</p>
          )}
        </div>
      )}

      {!locked && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-mist hover:text-cyan">Rewrite with AI</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Optional: e.g. shorter, mention my Loan Risk project" className="field min-w-[240px] flex-1" aria-label="Rewrite instruction" />
            <button className="btn-ghost" disabled={pending} onClick={() => run(() => regenerate(post.id, instruction || undefined))}>Rewrite</button>
          </div>
        </details>
      )}
      {pending && <p className="mt-2 text-sm text-mist">Working…</p>}
      {msg && !pending && <p role="status" className={clsx("mt-2 text-sm", msg.ok ? "text-good" : "text-bad")}>{msg.text}</p>}
    </article>
  );
}
