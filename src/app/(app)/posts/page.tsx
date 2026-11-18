import { requireUser } from "@/lib/supabase/server";
import { getStatus } from "@/lib/linkedin";
import { aiAvailable } from "@/lib/ai";
import { Empty, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/actions-ui";
import { PostEditor, type PostRow } from "@/components/post-editor";
import { generateMorePosts } from "@/app/actions";
import { fmtDate } from "@/lib/util";

type Search = { view?: string };

export default async function PostsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { view = "open" } = await searchParams;
  const { supabase, user } = await requireUser();
  const li = await getStatus(user.id);
  const canPublish = li.connected && li.canPost;
  let q = supabase.from("posts").select("*").eq("user_id", user.id).order("run_date", { ascending: false }).order("created_at", { ascending: true });
  q = view === "published" ? q.eq("status", "published") : view === "discarded" ? q.eq("status", "discarded") : q.in("status", ["draft", "approved", "scheduled", "publishing", "failed"]);
  const { data } = await q.limit(60);
  const posts = (data ?? []) as PostRow[];
  const byDate = new Map<string, PostRow[]>();
  posts.forEach((p) => byDate.set(p.run_date, [...(byDate.get(p.run_date) ?? []), p]));

  return (
    <>
      <PageHeader
        title="LinkedIn posts"
        description="Fresh drafts every morning, based on the day's research and your real projects. Nothing is published until you approve it."
        actions={aiAvailable() ? <ActionButton action={generateMorePosts} className="btn-primary">Write more drafts</ActionButton> : undefined}
      />
      <nav className="mb-6 flex gap-2" aria-label="Post filter">
        {[["open", "Drafts and scheduled"], ["published", "Published"], ["discarded", "Discarded"]].map(([v, l]) => (
          <a key={v} href={`/posts?view=${v}`} className={view === v ? "btn bg-cyan/10 text-cyan" : "btn text-mist hover:text-paper"}>{l}</a>
        ))}
      </nav>
      {posts.length === 0 ? (
        <Empty>{view === "open" ? "No drafts yet. They're written each morning, or press Write more drafts." : "Nothing here yet."}</Empty>
      ) : (
        <div className="space-y-10">
          {[...byDate.entries()].map(([date, list]) => (
            <section key={date}>
              <h2 className="mb-3 text-lg font-semibold text-mist">{fmtDate(date)}</h2>
              <div className="grid gap-4 xl:grid-cols-2">{list.map((p) => <PostEditor key={`${p.id}-${p.content.length}-${p.status}`} post={p} canPublish={canPublish} />)}</div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
