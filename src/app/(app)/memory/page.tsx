import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { Badge, Empty, PageHeader, Panel } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/actions-ui";
import { deleteRow, saveNote } from "@/app/actions";
import { fmtDate } from "@/lib/util";

type Note = { id: string; category: string; title: string; content: string; tags: string[]; updated_at: string };
const CATS: Record<string, string> = { interview: "Interview notes", learning: "Learning progress", preference: "Preferences", other: "Other" };

function NoteFields({ n }: { n?: Note }) {
  return (
    <div className="space-y-2">
      {n && <input type="hidden" name="id" value={n.id} />}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input name="title" defaultValue={n?.title} placeholder="Title" required className="field" aria-label="Title" />
        <select name="category" defaultValue={n?.category ?? "learning"} className="field" aria-label="Category">
          {Object.entries(CATS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <textarea name="content" defaultValue={n?.content} rows={5} placeholder="What happened, what you learned, what to do next" className="field" aria-label="Content" />
      <input name="tags" defaultValue={n?.tags.join(", ")} placeholder="Tags, comma separated" className="field" aria-label="Tags" />
    </div>
  );
}

export default async function MemoryPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { q, cat } = await searchParams;
  const { supabase, user } = await requireUser();
  const term = (q ?? "").replace(/[%,()]/g, "").trim();
  const like = `%${term}%`;

  let notesQ = supabase.from("memory_notes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
  if (cat) notesQ = notesQ.eq("category", cat);
  if (term) notesQ = notesQ.or(`title.ilike.${like},content.ilike.${like}`);
  const { data: notes } = await notesQ.limit(100);

  const results = term ? await Promise.all([
    supabase.from("jobs").select("id,title,company,score").eq("user_id", user.id).or(`title.ilike.${like},company.ilike.${like}`).limit(10),
    supabase.from("applications").select("id,position,company,status").eq("user_id", user.id).or(`position.ilike.${like},company.ilike.${like},notes.ilike.${like}`).limit(10),
    supabase.from("recruiters").select("id,name,company").eq("user_id", user.id).or(`name.ilike.${like},company.ilike.${like}`).limit(10),
    supabase.from("posts").select("id,angle,content,status").eq("user_id", user.id).ilike("content", like).limit(10),
    supabase.from("research_items").select("id,title,url").eq("user_id", user.id).or(`title.ilike.${like},summary.ilike.${like}`).limit(10),
  ]) : null;

  const counts = await Promise.all(["jobs", "applications", "recruiters", "posts", "research_items", "reports", "memory_notes"].map(async (t) => {
    const { count } = await supabase.from(t).select("id", { count: "exact", head: true }).eq("user_id", user.id);
    return [t, count ?? 0] as const;
  }));

  return (
    <>
      <PageHeader title="Memory" description="Everything CareerPilot knows about your search, in one place. It's used for future recommendations and never shared."
        actions={<a href="/api/memory/export" className="btn-ghost">Export all as JSON</a>} />

      <div className="mb-6 flex flex-wrap gap-2">
        {counts.map(([t, c]) => <Badge key={t}>{t.replace("_", " ")}: {c}</Badge>)}
      </div>

      <form className="mb-6 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search jobs, applications, contacts, posts, research and notes" className="field max-w-xl" aria-label="Search memory" />
        <select name="cat" defaultValue={cat ?? ""} className="field max-w-[200px]" aria-label="Note category"><option value="">All notes</option>{Object.entries(CATS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="btn-primary">Search</button>
      </form>

      {results && (
        <Panel title={`Results for "${term}"`} className="mb-6">
          <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-3">
            <div><h3 className="mb-1 font-semibold">Jobs</h3>{results[0].data?.length ? results[0].data.map((j) => <Link key={j.id} href={`/jobs/${j.id}`} className="block text-paper/90 hover:text-cyan">{j.score}% {j.title}, {j.company}</Link>) : <p className="text-mist">None</p>}</div>
            <div><h3 className="mb-1 font-semibold">Applications</h3>{results[1].data?.length ? results[1].data.map((a) => <Link key={a.id} href="/applications" className="block text-paper/90 hover:text-cyan">{a.position}, {a.company} ({a.status})</Link>) : <p className="text-mist">None</p>}</div>
            <div><h3 className="mb-1 font-semibold">Recruiters</h3>{results[2].data?.length ? results[2].data.map((r) => <Link key={r.id} href={`/recruiters?q=${encodeURIComponent(r.name)}`} className="block text-paper/90 hover:text-cyan">{r.name}, {r.company}</Link>) : <p className="text-mist">None</p>}</div>
            <div><h3 className="mb-1 font-semibold">Posts</h3>{results[3].data?.length ? results[3].data.map((p) => <Link key={p.id} href="/posts" className="block truncate text-paper/90 hover:text-cyan">{p.angle || p.content.slice(0, 60)} ({p.status})</Link>) : <p className="text-mist">None</p>}</div>
            <div><h3 className="mb-1 font-semibold">Research</h3>{results[4].data?.length ? results[4].data.map((r) => <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-paper/90 hover:text-cyan">{r.title}</a>) : <p className="text-mist">None</p>}</div>
          </div>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          {(notes ?? []).length === 0 ? <Empty>No notes yet. Log interview feedback and what you&apos;re learning, so recommendations can account for it.</Empty> : (
            <ul className="space-y-3">
              {(notes as Note[]).map((n) => (
                <li key={n.id} className="panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium text-paper">{n.title}</h3>
                    <div className="flex gap-1.5"><Badge tone="cyan">{CATS[n.category]}</Badge><Badge>{fmtDate(n.updated_at)}</Badge></div>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-paper/85">{n.content}</p>
                  {n.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{n.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-mist hover:text-cyan">Edit</summary>
                    <ActionForm action={saveNote} className="mt-2 space-y-2">
                      <NoteFields n={n} />
                      <div className="flex items-center justify-between">
                        <button className="btn-primary">Save changes</button>
                        <ActionButton action={deleteRow.bind(null, "memory_notes", n.id)} confirm="Delete this note?" className="text-sm text-mist hover:text-bad">Delete</ActionButton>
                      </div>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Panel title="Add a note" className="h-fit">
          <ActionForm action={saveNote} resetOnSuccess className="space-y-3">
            <NoteFields />
            <button className="btn-primary">Save note</button>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
