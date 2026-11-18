import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { loadProfileAndSettings } from "@/lib/data";
import { Badge, Empty, PageHeader, Panel, ScoreRing } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/actions-ui";
import { importJob, setJobStatus, trackJob } from "@/app/actions";
import { fmtDate } from "@/lib/util";

type Search = { q?: string; min?: string; status?: string; source?: string; sort?: string };

export default async function JobsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const { settings } = await loadProfileAndSettings(supabase, user.id);
  const min = Number(sp.min ?? 0) || 0;
  const status = sp.status ?? "active";

  let q = supabase.from("jobs").select("id,title,company,location,is_remote,score,match,posted_at,source,salary,experience_text,status,apply_url,first_seen_at")
    .eq("user_id", user.id).eq("status", status).gte("score", min);
  if (sp.q) q = q.or(`title.ilike.%${sp.q.replace(/[%,()]/g, "")}%,company.ilike.%${sp.q.replace(/[%,()]/g, "")}%,location.ilike.%${sp.q.replace(/[%,()]/g, "")}%`);
  if (sp.source) q = q.ilike("source", `${sp.source}%`);
  q = sp.sort === "new" ? q.order("first_seen_at", { ascending: false }) : q.order("score", { ascending: false });
  const { data: jobs } = await q.limit(150);
  const { data: tracked } = await supabase.from("applications").select("job_id").eq("user_id", user.id).not("job_id", "is", null);
  const trackedSet = new Set((tracked ?? []).map((t) => t.job_id));

  return (
    <>
      <PageHeader title="Jobs" description="Fresh openings from company boards and job APIs, scored against your profile. Expired and duplicate listings are removed automatically." />

      <form className="panel mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <input name="q" defaultValue={sp.q} placeholder="Search title, company or city" className="field" aria-label="Search" />
        <select name="min" defaultValue={String(min)} className="field" aria-label="Minimum score">
          <option value="0">Any score</option>
          <option value="50">50%+</option>
          <option value="65">65%+</option>
          <option value={settings.match_threshold}>{settings.match_threshold}%+</option>
        </select>
        <select name="status" defaultValue={status} className="field" aria-label="Status">
          <option value="active">Active</option>
          <option value="dismissed">Hidden</option>
          <option value="expired">Expired</option>
        </select>
        <select name="sort" defaultValue={sp.sort ?? "score"} className="field" aria-label="Sort">
          <option value="score">Best match</option>
          <option value="new">Newest</option>
        </select>
        <button className="btn-primary">Apply filters</button>
      </form>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div>
          {(jobs ?? []).length === 0 ? (
            <Empty>No jobs match these filters. Try a lower score, or add company boards in Settings.</Empty>
          ) : (
            <ul className="space-y-3">
              {(jobs ?? []).map((j) => {
                const m = j.match as { recommendationText?: string; missingSkills?: string[]; eligibility?: string };
                return (
                  <li key={j.id} className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <ScoreRing score={j.score ?? 0} threshold={settings.match_threshold} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/jobs/${j.id}`} className="font-display text-lg font-semibold text-paper hover:text-cyan">{j.title}</Link>
                      <div className="text-sm text-mist">{j.company}, {j.location || "Location not listed"}{j.is_remote ? " (remote)" : ""}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {j.experience_text && <Badge>{j.experience_text}</Badge>}
                        {j.salary && <Badge tone="cyan">{j.salary}</Badge>}
                        {m?.eligibility === "likely_ineligible" && <Badge tone="bad">Experience bar too high</Badge>}
                        {m?.eligibility === "stretch" && <Badge tone="warn">Stretch</Badge>}
                        <Badge>{j.source}</Badge>
                        <Badge>{j.posted_at ? `Posted ${fmtDate(j.posted_at)}` : `Found ${fmtDate(j.first_seen_at)}`}</Badge>
                      </div>
                      <p className="mt-1.5 text-sm text-paper/80">{m?.recommendationText}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                      <Link href={`/jobs/${j.id}`} className="btn-ghost">Review match</Link>
                      {trackedSet.has(j.id) ? <Badge tone="good">In tracker</Badge> : <ActionButton action={trackJob.bind(null, j.id, "saved")}>Save</ActionButton>}
                      {j.status === "active"
                        ? <ActionButton action={setJobStatus.bind(null, j.id, "dismissed")} className="btn text-mist hover:text-bad">Hide</ActionButton>
                        : <ActionButton action={setJobStatus.bind(null, j.id, "active")}>Restore</ActionButton>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Panel title="Add a job" className="h-fit xl:sticky xl:top-20">
          <p className="mb-3 text-sm text-mist">Found something on LinkedIn, Wellfound or a company site? Those sites have no public job API, so paste it here and it&apos;s scored like the rest.</p>
          <ActionForm action={importJob} resetOnSuccess className="space-y-3">
            <div><label className="label" htmlFor="url">Job link</label><input id="url" name="url" type="url" required className="field" placeholder="https://…" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" className="field" /></div>
              <div><label className="label" htmlFor="company">Company</label><input id="company" name="company" className="field" /></div>
            </div>
            <div><label className="label" htmlFor="location">Location</label><input id="location" name="location" className="field" /></div>
            <div><label className="label" htmlFor="description">Job description</label><textarea id="description" name="description" required rows={7} className="field" /></div>
            <p className="text-xs text-mist">Leave title and company blank to have AI fill them from the description.</p>
            <button className="btn-primary w-full">Add and score</button>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
