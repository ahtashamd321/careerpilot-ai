import { adminClient } from "./supabase/admin";
import { loadProfileAndSettings } from "./data";
import { runResearchStep } from "./research";
import { runJobsStep } from "./jobs/pipeline";
import { runRecruitersStep } from "./recruiters";
import { runPostsStep } from "./posts";
import { runReportStep } from "./reports";
import { notify } from "./notify";
import { STEPS, type Step } from "./types";
import { errorMessage, istDate, istHour, withRetry } from "./util";

type StepResult = { step: Step; status: "success" | "failed" | "skipped"; stats?: unknown; error?: string };

/**
 * Runs one step for one user with duplicate prevention:
 * a (user, date, step) row is claimed before work starts, so a second trigger
 * the same day is skipped unless `force` is set. Retries 3x with backoff.
 */
export async function runStep(userId: string, step: Step, opts: { force?: boolean; trigger?: "schedule" | "manual" } = {}): Promise<StepResult> {
  const db = adminClient();
  const runDate = istDate();
  const { data: prev } = await db.from("automation_runs").select("id,status,started_at,attempts").eq("user_id", userId).eq("run_date", runDate).eq("step", step).maybeSingle();

  // A "running" row older than 10 minutes is treated as crashed and can be retried.
  const stale = prev?.status === "running" && Date.now() - new Date(prev.started_at).getTime() > 10 * 60_000;
  if (prev && !opts.force && !stale && prev.status !== "failed") {
    return { step, status: "skipped", stats: { reason: `Already ${prev.status} today` } };
  }
  // Scheduled retries of a failed step stop after two rounds (6 attempts) per day.
  const priorAttempts = prev?.status === "failed" && !opts.force ? prev.attempts ?? 0 : 0;
  if (prev?.status === "failed" && !opts.force && opts.trigger !== "manual" && priorAttempts >= 6) {
    return { step, status: "skipped", stats: { reason: "Failed twice today; waiting for a manual run" } };
  }
  const row = { user_id: userId, run_date: runDate, step, status: "running", attempts: priorAttempts, trigger: opts.trigger ?? "schedule", started_at: new Date().toISOString(), finished_at: null, error: null, stats: {} };
  const { error: claimErr } = await db.from("automation_runs").upsert(row, { onConflict: "user_id,run_date,step" });
  if (claimErr) throw new Error(`Could not record run: ${claimErr.message}`);

  const { profile, settings } = await loadProfileAndSettings(db, userId);
  let attempts = 0;
  try {
    const stats = await withRetry(async (a) => {
      attempts = priorAttempts + a;
      switch (step) {
        case "research": return runResearchStep(userId, settings);
        case "jobs": return runJobsStep(userId, profile, settings);
        case "recruiters": return runRecruitersStep(userId);
        case "posts": return runPostsStep(userId, profile, settings.posts_per_day);
        case "report": return runReportStep(userId);
      }
    }, 3, 3000);
    await db.from("automation_runs").update({ status: "success", attempts, stats, finished_at: new Date().toISOString() })
      .eq("user_id", userId).eq("run_date", runDate).eq("step", step);
    if (step === "report") {
      await notify(userId, "report", "Your daily career report is ready", "New jobs, top matches, research and LinkedIn drafts for today.", { url: "/reports" }, settings);
    }
    return { step, status: "success", stats };
  } catch (e) {
    const msg = errorMessage(e);
    await db.from("automation_runs").update({ status: "failed", attempts, error: msg.slice(0, 2000), finished_at: new Date().toISOString() })
      .eq("user_id", userId).eq("run_date", runDate).eq("step", step);
    await notify(userId, "error", `Daily ${step} step failed`, msg.slice(0, 500), { step }, settings);
    return { step, status: "failed", error: msg };
  }
}

export async function runAllSteps(userId: string, opts: { force?: boolean; trigger?: "schedule" | "manual" } = {}) {
  const out: StepResult[] = [];
  // Steps are independent: one failure doesn't stop the rest.
  for (const s of STEPS) out.push(await runStep(userId, s, opts));
  return out;
}

/** Users whose configured IST hour is now (or earlier today and not yet run). */
export async function dueUsers(now = new Date()): Promise<string[]> {
  const db = adminClient();
  const hour = istHour(now);
  const date = istDate(now);
  const { data: settings } = await db.from("settings").select("user_id,run_hour_ist").eq("automation_enabled", true).lte("run_hour_ist", hour);
  const ids = (settings ?? []).map((s) => s.user_id);
  if (!ids.length) return [];
  const { data: done } = await db.from("automation_runs").select("user_id").eq("run_date", date).eq("step", "report").eq("status", "success").in("user_id", ids);
  const doneSet = new Set((done ?? []).map((d) => d.user_id));
  return ids.filter((id) => !doneSet.has(id));
}
