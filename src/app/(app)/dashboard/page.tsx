import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { loadProfileAndSettings } from "@/lib/data";
import { getStatus } from "@/lib/linkedin";
import { aiAvailable } from "@/lib/ai";
import { Badge, Empty, PageHeader, Panel, ScoreRing, Stat } from "@/components/ui";
import { RunAutomation } from "@/components/run-automation";
import { APPLICATION_STATUSES, STATUS_LABEL } from "@/lib/types";
import { fmtDate, istDate } from "@/lib/util";

export default async function Dashboard() {
  const { supabase, user } = await requireUser();
  const { profile, settings } = await loadProfileAndSettings(supabase, user.id);
  const today = istDate();
  const uid = user.id;

  const [active, strong, apps, drafts, recruiters, researchToday, top, runs, digest, li] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "active"),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "active").gte("score", settings.match_threshold),
    supabase.from("applications").select("status,follow_up_at,company,position").eq("user_id", uid),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "draft"),
    supabase.from("recruiters").select("id", { count: "exact", head: true }).eq("user_id", uid),
    supabase.from("research_items").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("run_date", today),
    supabase.from("jobs").select("id,title,company,location,score,match,posted_at").eq("user_id", uid).eq("status", "active").order("score", { ascending: false }).limit(5),
    supabase.from("automation_runs").select("step,status,error,finished_at,trigger").eq("user_id", uid).eq("run_date", today),
    supabase.from("research_digests").select("digest,run_date").eq("user_id", uid).order("run_date", { ascending: false }).limit(1).maybeSingle(),
    getStatus(uid),
  ]);

  const appRows = apps.data ?? [];
  const inProgress = appRows.filter((a) => ["applied", "assessment", "interview"].includes(a.status)).length;
  const followUps = appRows.filter((a) => a.follow_up_at && a.follow_up_at <= today && !["offer", "rejected"].includes(a.status));
  const runByStep = new Map((runs.data ?? []).map((r) => [r.step, r]));
  const firstName = profile.full_name.split(" ")[0] || "there";

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} description={`Here's where your search stands on ${fmtDate(new Date().toISOString())}. Automation runs daily at ${String(settings.run_hour_ist).padStart(2, "0")}:00 IST.`} />

      {!aiAvailable() && (
        <div className="mb-6 rounded-panel border border-warn/40 bg-warn/5 p-4 text-sm text-warn">
          No AI provider is set, so job scoring and research still work but post drafts, summaries, recruiter search and cover letters are off.
          Add a free <code>GEMINI_API_KEY</code> from Google AI Studio, or set <code>AI_PROVIDER=ollama</code>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active jobs" value={active.count ?? 0} />
        <Stat label="Strong matches" value={strong.count ?? 0} hint={`${settings.match_threshold}% and above`} />
        <Stat label="In progress" value={inProgress} hint="Applied to interview" />
        <Stat label="Follow-ups due" value={followUps.length} />
        <Stat label="Drafts to review" value={drafts.count ?? 0} />
        <Stat label="Research today" value={researchToday.count ?? 0} hint={`${recruiters.count ?? 0} recruiters saved`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Best matches right now" action={<Link href="/jobs" className="link text-sm">All jobs</Link>}>
          {(top.data ?? []).length === 0 ? (
            <Empty>No jobs yet. Run the automation, or add company job boards in Settings for more sources.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {(top.data ?? []).map((j) => (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="flex items-center gap-4 py-3 hover:bg-raised/40">
                    <ScoreRing score={j.score ?? 0} size={48} threshold={settings.match_threshold} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-paper">{j.title}</div>
                      <div className="truncate text-sm text-mist">{j.company}, {j.location || "Location not listed"}</div>
                      <div className="truncate text-xs text-mist/80">{(j.match as { recommendationText?: string })?.recommendationText}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="LinkedIn">
            {li.connected ? (
              <div className="flex items-center gap-3">
                {li.picture && <img src={li.picture} alt="" className="h-10 w-10 rounded-full" />}
                <div className="text-sm">
                  <div className="text-paper">{li.name}</div>
                  <div className="text-mist">{li.expired ? "Access expired. Reconnect in Settings." : li.canPost ? `Can publish posts until ${fmtDate(li.expiresAt)}` : "Connected without posting permission"}</div>
                </div>
                <span className="ml-auto"><Badge tone={li.expired ? "bad" : "good"}>{li.expired ? "Expired" : "Connected"}</Badge></span>
              </div>
            ) : (
              <div className="text-sm text-mist">
                Not connected. Drafts can still be copied or opened in LinkedIn&apos;s composer. <Link href="/settings#linkedin" className="link">Connect LinkedIn</Link>
              </div>
            )}
          </Panel>

          <Panel title="Today's automation">
            <ul className="mb-4 space-y-1.5 text-sm">
              {(["research", "jobs", "recruiters", "posts", "report"] as const).map((s) => {
                const r = runByStep.get(s);
                return (
                  <li key={s} className="flex items-center justify-between gap-3">
                    <span className="capitalize text-paper">{s}</span>
                    {r ? <Badge tone={r.status === "success" ? "good" : r.status === "failed" ? "bad" : "cyan"}>{r.status}</Badge> : <Badge>not run</Badge>}
                  </li>
                );
              })}
            </ul>
            <RunAutomation />
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Applications" action={<Link href="/applications" className="link text-sm">Open tracker</Link>}>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {APPLICATION_STATUSES.map((s) => (
              <div key={s} className="rounded-lg border border-line px-2 py-2 text-center">
                <div className="font-display text-xl font-semibold">{appRows.filter((a) => a.status === s).length}</div>
                <div className="text-[11px] text-mist">{STATUS_LABEL[s]}</div>
              </div>
            ))}
          </div>
          {followUps.length > 0 && (
            <p className="mt-4 text-sm text-warn">Follow up today: {followUps.map((f) => `${f.position} at ${f.company}`).join("; ")}</p>
          )}
        </Panel>
        <Panel title="What matters today" action={<Link href="/research" className="link text-sm">Research</Link>}>
          {digest.data ? <p className="whitespace-pre-line text-sm leading-relaxed text-paper/90">{digest.data.digest}</p> : <Empty>The daily digest appears after the research step runs.</Empty>}
        </Panel>
      </div>
    </>
  );
}
