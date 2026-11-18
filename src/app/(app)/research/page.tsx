import { requireUser } from "@/lib/supabase/server";
import { Badge, Empty, PageHeader, Panel } from "@/components/ui";
import { ActionButton } from "@/components/actions-ui";
import { deleteRow } from "@/app/actions";
import { fmtDate } from "@/lib/util";

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ topic?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  let q = supabase.from("research_items").select("*").eq("user_id", user.id).order("run_date", { ascending: false }).order("published_at", { ascending: false, nullsFirst: false });
  if (sp.topic) q = q.eq("topic", sp.topic);
  if (sp.q) q = q.or(`title.ilike.%${sp.q.replace(/[%,()]/g, "")}%,summary.ilike.%${sp.q.replace(/[%,()]/g, "")}%`);
  const [{ data: items }, { data: digests }] = await Promise.all([
    q.limit(120),
    supabase.from("research_digests").select("*").eq("user_id", user.id).order("run_date", { ascending: false }).limit(7),
  ]);
  const topics = [...new Set((items ?? []).map((i) => i.topic))];

  return (
    <>
      <PageHeader title="Research" description="Daily news on analytics tools, hiring and companies recruiting analysts, with every source linked and dated." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <form className="mb-4 flex flex-wrap gap-2">
            <input name="q" defaultValue={sp.q} placeholder="Search research" className="field max-w-xs" aria-label="Search research" />
            <select name="topic" defaultValue={sp.topic ?? ""} className="field max-w-xs" aria-label="Topic">
              <option value="">All topics</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn-ghost">Filter</button>
          </form>
          {(items ?? []).length === 0 ? <Empty>No research stored yet. It runs every morning, or start it from the Dashboard.</Empty> : (
            <ul className="space-y-3">
              {(items ?? []).map((r) => (
                <li key={r.id} className="panel p-4">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-paper hover:text-cyan">{r.title}</a>
                  <p className="mt-1 text-sm text-paper/80">{r.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mist">
                    <Badge tone="cyan">{r.topic}</Badge>
                    <span>{r.source}</span>
                    <span>{r.published_at ? fmtDate(r.published_at) : `Saved ${fmtDate(r.created_at)}`}</span>
                    <ActionButton action={deleteRow.bind(null, "research_items", r.id)} className="ml-auto text-xs text-mist hover:text-bad">Delete</ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-4">
          {(digests ?? []).map((d) => (
            <Panel key={d.id} title={fmtDate(d.run_date)}>
              <p className="whitespace-pre-line text-sm leading-relaxed text-paper/90">{d.digest}</p>
            </Panel>
          ))}
        </div>
      </div>
    </>
  );
}
