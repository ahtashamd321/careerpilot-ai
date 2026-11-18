import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { Empty, PageHeader, Panel } from "@/components/ui";
import type { ReportContent } from "@/lib/reports";
import { fmtDate } from "@/lib/util";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: list } = await supabase.from("reports").select("id,report_date").eq("user_id", user.id).order("report_date", { ascending: false }).limit(60);
  const selectedId = id ?? list?.[0]?.id;
  const { data: report } = selectedId
    ? await supabase.from("reports").select("*").eq("id", selectedId).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const r = report?.content as ReportContent | undefined;

  return (
    <>
      <PageHeader title="Daily reports" description="One summary each morning: what's new, what to apply to and what to do next."
        actions={report ? (<>
          <a className="btn-ghost" href={`/api/reports/${report.id}?format=pdf`}>Download PDF</a>
          <a className="btn-ghost" href={`/api/reports/${report.id}?format=csv`}>Download CSV</a>
        </>) : undefined} />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Report dates" className="flex gap-1 overflow-x-auto lg:flex-col">
          {(list ?? []).map((x) => (
            <Link key={x.id} href={`/reports?id=${x.id}`} className={x.id === selectedId ? "btn shrink-0 justify-start bg-cyan/10 text-cyan" : "btn shrink-0 justify-start text-mist hover:text-paper"}>{fmtDate(x.report_date)}</Link>
          ))}
        </nav>
        {!r ? <Empty>No reports yet. The first one is built at the end of the daily automation.</Empty> : (
          <div className="space-y-6">
            <Panel title="Recommended actions">
              {r.actions.length ? <ul className="space-y-2 text-paper/90">{r.actions.map((a, i) => <li key={i}>{a}</li>)}</ul> : <p className="text-mist">Nothing urgent.</p>}
            </Panel>
            <Panel title={`Top matches (${r.newJobs} new jobs found)`}>
              <ul className="divide-y divide-line">
                {r.topMatches.map((j) => (
                  <li key={j.id} className="flex items-center gap-4 py-3">
                    <span className="font-display w-12 text-xl font-semibold text-cyan">{j.score}%</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/jobs/${j.id}`} className="font-medium text-paper hover:text-cyan">{j.title}</Link>
                      <div className="text-sm text-mist">{j.company}, {j.location}</div>
                      <div className="text-sm text-paper/80">{j.recommendation}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
            {r.digest && <Panel title="What matters today"><p className="whitespace-pre-line text-sm text-paper/90">{r.digest}</p></Panel>}
            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title="Research">
                {r.research.length ? <ul className="space-y-3 text-sm">{r.research.map((x, i) => <li key={i}><a className="text-paper hover:text-cyan" href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a><div className="text-mist">{x.source}</div></li>)}</ul> : <p className="text-sm text-mist">None stored this day.</p>}
              </Panel>
              <Panel title="Recruiters found">
                {r.recruiters.length ? <ul className="space-y-2 text-sm">{r.recruiters.map((x, i) => <li key={i}><span className="text-paper">{x.name}</span><span className="text-mist">, {x.designation}, {x.company}</span></li>)}</ul> : <p className="text-sm text-mist">None new.</p>}
              </Panel>
            </div>
            <Panel title="LinkedIn drafts" action={<Link href="/posts" className="link text-sm">Edit drafts</Link>}>
              <div className="grid gap-4 xl:grid-cols-3">{r.posts.map((p, i) => <div key={i} className="rounded-lg border border-line p-3 text-sm"><div className="mb-1 font-medium">{p.angle}</div><p className="line-clamp-6 whitespace-pre-line text-paper/80">{p.content}</p></div>)}</div>
            </Panel>
            <Panel title="Pending applications">
              {r.pendingApplications.length ? <ul className="space-y-1 text-sm">{r.pendingApplications.map((a, i) => <li key={i}>{a.position}, {a.company}: <span className="text-cyan">{a.status.replace("_", " ")}</span>{a.follow_up_at ? <span className="text-mist">, follow up {a.follow_up_at}</span> : null}</li>)}</ul> : <p className="text-sm text-mist">None.</p>}
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
