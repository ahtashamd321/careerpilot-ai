import { requireUser } from "@/lib/supabase/server";
import { loadProfileAndSettings } from "@/lib/data";
import { getStatus } from "@/lib/linkedin";
import { aiProvider } from "@/lib/ai";
import { optionalEnv } from "@/lib/env";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/actions-ui";
import { BoardManager } from "@/components/board-manager";
import { disconnectLinkedIn, saveSettings, testTelegram } from "@/app/actions";
import { fmtDate } from "@/lib/util";

const LI_MESSAGES: Record<string, string> = {
  connected: "LinkedIn connected.",
  not_configured: "LinkedIn isn't set up on the server yet. Add LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY.",
  state_mismatch: "The LinkedIn sign-in couldn't be verified (security check failed). Try connecting again.",
  missing_code: "LinkedIn didn't return an authorisation code. Try again.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ linkedin?: string }> }) {
  const { linkedin } = await searchParams;
  const { supabase, user } = await requireUser();
  const { settings } = await loadProfileAndSettings(supabase, user.id);
  const li = await getStatus(user.id);
  const env = {
    ai: aiProvider(),
    adzuna: Boolean(optionalEnv("ADZUNA_APP_ID") && optionalEnv("ADZUNA_APP_KEY")),
    jooble: Boolean(optionalEnv("JOOBLE_API_KEY")),
    telegram: Boolean(optionalEnv("TELEGRAM_BOT_TOKEN")),
  };
  const liMsg = linkedin ? LI_MESSAGES[linkedin] ?? `LinkedIn: ${decodeURIComponent(linkedin)}` : null;

  return (
    <>
      <PageHeader title="Settings" description="Schedule, alerts, job sources and connected accounts." />
      <div className="space-y-6">
        <Panel title="LinkedIn" className="scroll-mt-24" >
          <div id="linkedin" />
          {liMsg && <p className={linkedin === "connected" ? "mb-4 text-sm text-good" : "mb-4 text-sm text-warn"}>{liMsg}</p>}
          {li.connected ? (
            <div className="flex flex-wrap items-center gap-4">
              {li.picture && <img src={li.picture} alt="" className="h-12 w-12 rounded-full" />}
              <div className="text-sm">
                <div className="text-paper">{li.name} {li.email && <span className="text-mist">({li.email})</span>}</div>
                <div className="text-mist">Access {li.expired ? "expired" : "valid until"} {fmtDate(li.expiresAt)}. {li.canPost ? "Posting allowed." : "Posting permission not granted."}</div>
              </div>
              <div className="ml-auto flex gap-2">
                <a href="/api/linkedin/connect" className="btn-ghost">Reconnect</a>
                <ActionButton action={disconnectLinkedIn} className="btn-danger" confirm="Disconnect LinkedIn and delete the stored token?">Disconnect</ActionButton>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-mist">
              <p>Connect through LinkedIn&apos;s official sign-in. CareerPilot receives a revocable access token (stored encrypted), never your password. It can read your basic profile and publish posts you approve.</p>
              {li.configured ? <a href="/api/linkedin/connect" className="btn-primary">Connect LinkedIn</a> : <p className="text-warn">{LI_MESSAGES.not_configured}</p>}
            </div>
          )}
          <p className="mt-4 text-xs text-mist">LinkedIn tokens last about 60 days and can&apos;t be refreshed on self-serve apps, so you&apos;ll reconnect every two months. LinkedIn gives individual developers no API for job search or reading other people&apos;s profiles; jobs come from the sources below and recruiter info from public web pages.</p>
        </Panel>

        <ActionForm action={saveSettings} className="space-y-6">
          <Panel title="Daily automation">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="automation_enabled" defaultChecked={settings.automation_enabled} className="accent-cyan" /> Run automatically every day</label>
              <label className="label">Run at (IST)
                <select name="run_hour_ist" defaultValue={settings.run_hour_ist} className="field mt-1">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              </label>
              <label className="label">LinkedIn drafts per day<input type="number" name="posts_per_day" min={1} max={5} defaultValue={settings.posts_per_day} className="field mt-1" /></label>
            </div>
            <p className="mt-3 text-xs text-mist">The scheduler checks every hour, so runs start within about an hour of the time you pick (GitHub can delay scheduled jobs at busy times).</p>
          </Panel>

          <Panel title="Job alerts">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="label">Alert me at this match score or higher<input type="number" name="match_threshold" min={40} max={100} defaultValue={settings.match_threshold} className="field mt-1" /></label>
              <label className="label">Ignore jobs older than (days)<input type="number" name="max_job_age_days" min={3} max={90} defaultValue={settings.max_job_age_days} className="field mt-1" /></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="notify_in_app" defaultChecked={settings.notify_in_app} className="accent-cyan" /> In-app pop-ups</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="notify_browser" defaultChecked={settings.notify_browser} className="accent-cyan" /> Desktop alerts when the tab is open</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="notify_telegram" defaultChecked={settings.notify_telegram} disabled={!env.telegram} className="accent-cyan" /> Telegram {env.telegram ? "" : "(add TELEGRAM_BOT_TOKEN)"}</label>
            </div>
            <label className="label mt-4 max-w-sm">Telegram chat ID<input name="telegram_chat_id" defaultValue={settings.telegram_chat_id ?? ""} className="field mt-1" placeholder="Send /start to your bot, then get the ID from @userinfobot" /></label>
            <p className="mt-2 text-xs text-mist">Telegram alerts reach your phone even when no browser is open, at no cost.</p>
          </Panel>

          <Panel title="Research and job search">
            <label className="label">Research topics (one per line)<textarea name="research_topics" rows={5} defaultValue={settings.research_topics.join("\n")} className="field mt-1" /></label>
            <label className="label mt-4">Job search terms for Adzuna and Jooble (one per line)<textarea name="job_queries" rows={4} defaultValue={settings.job_queries.join("\n")} className="field mt-1" /></label>
            <div className="mt-4 flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="src_remotive" defaultChecked={settings.sources.remotive} className="accent-cyan" /> Remotive (remote jobs)</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="src_adzuna" defaultChecked={settings.sources.adzuna} className="accent-cyan" /> Adzuna India {env.adzuna ? "" : "(add API key)"}</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="src_jooble" defaultChecked={settings.sources.jooble} className="accent-cyan" /> Jooble {env.jooble ? "" : "(add API key)"}</label>
            </div>
          </Panel>
          <button className="btn-primary">Save settings</button>
        </ActionForm>

        <Panel title="Company job boards">
          <BoardManager boards={{ greenhouse: settings.sources.greenhouse, lever: settings.sources.lever, ashby: settings.sources.ashby }} />
        </Panel>

        <Panel title="Connections">
          <ul className="grid gap-2 text-sm md:grid-cols-2">
            <li className="flex justify-between"><span>AI provider</span>{env.ai ? <Badge tone="good">{env.ai}</Badge> : <Badge tone="warn">Not set</Badge>}</li>
            <li className="flex justify-between"><span>Adzuna</span>{env.adzuna ? <Badge tone="good">Ready</Badge> : <Badge>Optional</Badge>}</li>
            <li className="flex justify-between"><span>Jooble</span>{env.jooble ? <Badge tone="good">Ready</Badge> : <Badge>Optional</Badge>}</li>
            <li className="flex justify-between items-center"><span>Telegram</span><span className="flex items-center gap-2">{env.telegram && settings.telegram_chat_id && <ActionButton action={testTelegram} className="text-xs text-cyan hover:underline">Send test</ActionButton>}{env.telegram ? <Badge tone="good">Ready</Badge> : <Badge>Optional</Badge>}</span></li>
          </ul>
          <p className="mt-3 text-xs text-mist">Keys are read from server environment variables and are never sent to the browser.</p>
        </Panel>
      </div>
    </>
  );
}
