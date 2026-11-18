import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { loadProfileAndSettings } from "@/lib/data";
import { WEIGHTS } from "@/lib/matching";
import { aiAvailable } from "@/lib/ai";
import { Badge, Empty, Panel, ScoreRing } from "@/components/ui";
import { ActionButton, CopyButton } from "@/components/actions-ui";
import { createMaterial, deleteRow, setJobStatus, trackJob } from "@/app/actions";
import type { MatchResult, ScoreBreakdown } from "@/lib/types";
import { fmtDate } from "@/lib/util";

const FACTORS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: "skills", label: "Skills" },
  { key: "experience", label: "Experience" },
  { key: "role", label: "Role relevance" },
  { key: "education", label: "Education" },
  { key: "location", label: "Location" },
  { key: "entry", label: "Entry-level fit" },
];
const KIND_LABEL = { resume_tips: "Resume suggestions", cover_letter: "Cover letter", prep: "Application prep" } as const;

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { settings } = await loadProfileAndSettings(supabase, user.id);
  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!job) notFound();
  const m = job.match as MatchResult;
  const [{ data: materials }, { data: app }, { data: recruiters }] = await Promise.all([
    supabase.from("application_materials").select("*").eq("job_id", id).eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("applications").select("id,status").eq("job_id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("recruiters").select("*").eq("user_id", user.id).ilike("company", job.company),
  ]);
  const latest = (k: string) => (materials ?? []).find((x) => x.kind === k);

  return (
    <>
      <Link href="/jobs" className="text-sm text-mist hover:text-cyan">Back to jobs</Link>
      <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <header>
            <h1 className="text-3xl font-semibold text-paper">{job.title}</h1>
            <p className="mt-1 text-lg text-mist">{job.company}, {job.location || "Location not listed"}{job.is_remote ? " (remote)" : ""}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge>{job.source}</Badge>
              {job.experience_text && <Badge>Experience: {job.experience_text}</Badge>}
              {job.salary ? <Badge tone="cyan">{job.salary}</Badge> : <Badge>Salary not listed</Badge>}
              <Badge>{job.posted_at ? `Posted ${fmtDate(job.posted_at)}` : `Found ${fmtDate(job.first_seen_at)}`}</Badge>
              {job.status !== "active" && <Badge tone="warn">{job.status}</Badge>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={job.apply_url} target="_blank" rel="noopener noreferrer" className="btn-primary">Open job posting</a>
              {app ? <Link href="/applications" className="btn-ghost">In tracker: {app.status.replace("_", " ")}</Link>
                : <ActionButton action={trackJob.bind(null, id, "to_apply")}>Add to tracker as To apply</ActionButton>}
              {job.status === "active" && <ActionButton action={setJobStatus.bind(null, id, "dismissed")} className="btn text-mist hover:text-bad">Hide job</ActionButton>}
            </div>
            <p className="mt-3 text-xs text-mist">CareerPilot never submits applications. You apply on the employer&apos;s site.</p>
          </header>

          <Panel title="Application assistant">
            {!aiAvailable() ? <Empty>Add an AI provider key to generate resume suggestions, cover letters and prep.</Empty> : (
              <div className="space-y-5">
                {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => {
                  const mat = latest(k);
                  return (
                    <div key={k} className="border-b border-line pb-5 last:border-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold">{KIND_LABEL[k]}</h3>
                        <div className="flex gap-2">
                          {mat && <CopyButton text={mat.content} />}
                          <ActionButton action={createMaterial.bind(null, id, k)} className={mat ? "btn-ghost" : "btn-primary"}>{mat ? "Regenerate" : "Generate"}</ActionButton>
                        </div>
                      </div>
                      {mat && (
                        <>
                          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-black p-4 font-sans text-sm leading-relaxed text-paper/90">{mat.content}</pre>
                          <div className="mt-1 flex items-center gap-3 text-xs text-mist">
                            Generated {fmtDate(mat.created_at)}. Review every line before using it.
                            <ActionButton action={deleteRow.bind(null, "application_materials", mat.id)} className="text-xs text-mist hover:text-bad" confirm="Delete this version?">Delete</ActionButton>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Job description">
            <div className="max-h-[32rem] overflow-auto whitespace-pre-line text-sm leading-relaxed text-paper/85">{job.description || "The source only provided a short summary. Open the posting for full details."}</div>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel>
            <div className="flex items-center gap-4">
              <ScoreRing score={job.score ?? 0} size={96} threshold={settings.match_threshold} />
              <div>
                <div className="font-display text-lg font-semibold">{m.recommendation === "apply_now" ? "Apply" : m.recommendation === "apply_tailored" ? "Apply, tailored" : m.recommendation === "stretch" ? "Stretch" : "Skip"}</div>
                <p className="text-sm text-mist">{m.recommendationText}</p>
              </div>
            </div>
            {m.capNote && <p className="mt-3 text-xs text-warn">{m.capNote}</p>}
            <dl className="mt-5 space-y-3">
              {FACTORS.map((f) => {
                const v = m.breakdown[f.key];
                const max = WEIGHTS[f.key];
                return (
                  <div key={f.key}>
                    <div className="flex justify-between text-sm"><dt className="text-mist">{f.label}</dt><dd className="text-paper">{v} / {max}</dd></div>
                    <div className="mt-1 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-cyan" style={{ width: `${(v / max) * 100}%` }} /></div>
                  </div>
                );
              })}
            </dl>
          </Panel>

          <Panel title="Why it fits">
            {job.ai_summary && <p className="mb-3 text-sm text-paper">{job.ai_summary}</p>}
            <ul className="space-y-2 text-sm text-paper/90">{m.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            <h3 className="mt-4 text-sm font-semibold text-paper">Eligibility</h3>
            <p className="text-sm text-mist">{m.eligibilityNote}</p>
            {m.gaps.length > 0 && (<><h3 className="mt-4 text-sm font-semibold text-paper">Gaps</h3><ul className="space-y-1 text-sm text-warn">{m.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></>)}
            {m.missingSkills.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{m.missingSkills.map((s) => <Badge key={s} tone="warn">{s}</Badge>)}</div>}
          </Panel>

          <Panel title="People hiring here">
            {(recruiters ?? []).length === 0 ? <p className="text-sm text-mist">None saved for {job.company} yet.</p> : (
              <ul className="space-y-3 text-sm">
                {(recruiters ?? []).map((r) => (
                  <li key={r.id}>
                    <div className="text-paper">{r.name}</div>
                    <div className="text-mist">{r.designation}</div>
                    <div className="flex gap-3">
                      {r.profile_url && <a className="link" href={r.profile_url} target="_blank" rel="noopener noreferrer">Profile</a>}
                      {r.source_url && <a className="link" href={r.source_url} target="_blank" rel="noopener noreferrer">Source</a>}
                      {!r.verified && <span className="text-xs text-warn">Unverified</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/recruiters" className="link mt-3 inline-block text-sm">Manage recruiters</Link>
          </Panel>
        </aside>
      </div>
    </>
  );
}
