import { createHash } from "node:crypto";
import { adminClient } from "../supabase/admin";
import { extractSkills, parseExperience, scoreJob } from "../matching";
import { notify } from "../notify";
import type { Profile, RawJob, Settings } from "../types";
import { fetchAllSources } from "./sources";
import { appUrl } from "../env";
import { aiAvailable, generate, HONESTY_RULES } from "../ai";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function dedupeKey(j: Pick<RawJob, "title" | "company" | "location">) {
  // Same title at the same company in the same city = same job, whichever board listed it.
  const city = norm(j.location).split(" ").slice(0, 2).join(" ");
  return createHash("sha1").update(`${norm(j.company)}|${norm(j.title)}|${city}`).digest("hex").slice(0, 20);
}

export function enrich(raw: RawJob, profile: Profile) {
  const exp = parseExperience(raw.description);
  const skills = extractSkills(`${raw.title}\n${raw.description}`);
  const m = scoreJob({ ...raw, exp_min: exp.min, exp_max: exp.max, skills }, profile);
  return {
    dedupe_key: dedupeKey(raw),
    title: raw.title.slice(0, 300),
    company: raw.company.slice(0, 200),
    location: raw.location.slice(0, 300),
    is_remote: raw.is_remote,
    experience_text: exp.text,
    exp_min: exp.min,
    exp_max: exp.max,
    salary: raw.salary ?? null,
    skills,
    description: raw.description.slice(0, 20000),
    posted_at: raw.posted_at ? new Date(raw.posted_at).toISOString() : null,
    apply_url: raw.apply_url,
    source: raw.source,
    source_ref: raw.source_ref ?? null,
    score: m.score,
    score_breakdown: m.breakdown,
    match: m,
  };
}

export async function runJobsStep(userId: string, profile: Profile, settings: Settings) {
  const db = adminClient();
  const results = await fetchAllSources(settings);
  const sourceErrors = results.filter((r) => r.error).map((r) => `${r.source}: ${r.error}`);
  const now = new Date();
  const maxAgeMs = settings.max_job_age_days * 86400000;

  // Collapse duplicates within this fetch (the same job on several boards).
  const byKey = new Map<string, ReturnType<typeof enrich>>();
  for (const r of results) for (const raw of r.jobs) {
    if (raw.posted_at && now.getTime() - new Date(raw.posted_at).getTime() > maxAgeMs) continue;
    const e = enrich(raw, profile);
    const prev = byKey.get(e.dedupe_key);
    if (!prev || e.description.length > prev.description.length) byKey.set(e.dedupe_key, e);
  }

  // Which ones are new?
  const keys = [...byKey.keys()];
  const existing = new Map<string, { id: string; status: string; notified_at: string | null }>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await db.from("jobs").select("id,dedupe_key,status,notified_at").eq("user_id", userId).in("dedupe_key", keys.slice(i, i + 200));
    data?.forEach((d) => existing.set(d.dedupe_key, d));
  }

  const rows = [...byKey.values()].map((e) => {
    const ex = existing.get(e.dedupe_key);
    return {
      ...e,
      user_id: userId,
      last_seen_at: now.toISOString(),
      // Keep a user's "dismissed" decision; revive jobs that reappear after expiring.
      status: ex?.status === "dismissed" ? "dismissed" : "active",
    };
  });
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db.from("jobs").upsert(rows.slice(i, i + 100), { onConflict: "user_id,dedupe_key" });
    if (error) throw new Error(`Saving jobs failed: ${error.message}`);
  }
  const newCount = rows.filter((r) => !existing.has(r.dedupe_key)).length;

  // Expire: ATS boards are complete lists, so a job missing from a board that loaded fine is closed.
  const okBoards = results.filter((r) => !r.error && /^(Greenhouse|Lever|Ashby|Remotive)/.test(r.source)).map((r) => r.source.split("/")[0]);
  let expired = 0;
  const startOfRun = new Date(now.getTime() - 60_000).toISOString();
  for (const src of new Set(okBoards)) {
    const { count } = await db.from("jobs").update({ status: "expired" }, { count: "exact" })
      .eq("user_id", userId).eq("source", src).eq("status", "active").lt("last_seen_at", startOfRun);
    expired += count ?? 0;
  }
  // Aggregators: expire anything not seen for the max age window.
  const { count: aged } = await db.from("jobs").update({ status: "expired" }, { count: "exact" })
    .eq("user_id", userId).eq("status", "active").lt("last_seen_at", new Date(now.getTime() - maxAgeMs).toISOString());
  expired += aged ?? 0;

  const notified = await notifyMatches(userId, settings);
  return { fetched: rows.length, new: newCount, expired, notified, sourceErrors };
}

/** One notification per job, ever. AI writes a short "why" for the top few. */
export async function notifyMatches(userId: string, settings: Settings) {
  const db = adminClient();
  const { data: jobs } = await db.from("jobs").select("id,title,company,location,score,match,description,apply_url")
    .eq("user_id", userId).eq("status", "active").is("notified_at", null)
    .gte("score", settings.match_threshold).order("score", { ascending: false }).limit(15);
  let n = 0;
  for (const j of jobs ?? []) {
    const m = j.match as { strengths?: string[]; recommendationText?: string };
    let why = (m.strengths ?? []).slice(0, 2).join(" ") || m.recommendationText || "";
    if (aiAvailable() && n < 5) {
      try {
        const r = await generate(
          `In two short sentences, tell the candidate why this job suits them. Be specific and plain.\n${HONESTY_RULES}\n\nJob: ${j.title} at ${j.company} (${j.location})\n${String(j.description).slice(0, 2500)}\n\nMatch analysis: ${JSON.stringify(j.match).slice(0, 1500)}`,
          { temperature: 0.4 },
        );
        why = r.text.trim();
        await db.from("jobs").update({ ai_summary: why }).eq("id", j.id);
      } catch { /* fall back to rule-based reason */ }
    }
    await notify(userId, "job_match", `${j.score}% match: ${j.title}`, `${j.company}, ${j.location}\n${why}`,
      { job_id: j.id, apply_url: j.apply_url, score: j.score, company: j.company, location: j.location, title: j.title, why, url: `${appUrl()}/jobs/${j.id}` },
      settings);
    await db.from("jobs").update({ notified_at: new Date().toISOString() }).eq("id", j.id);
    n++;
  }
  return n;
}

/** Re-scores every stored job after the profile changes. */
export async function rescoreAll(userId: string, profile: Profile) {
  const db = adminClient();
  const { data } = await db.from("jobs").select("id,title,description,location,is_remote,exp_min,exp_max,skills").eq("user_id", userId).neq("status", "expired");
  for (const j of data ?? []) {
    const m = scoreJob({ ...j, exp_min: j.exp_min === null ? null : Number(j.exp_min), exp_max: j.exp_max === null ? null : Number(j.exp_max) }, profile);
    await db.from("jobs").update({ score: m.score, score_breakdown: m.breakdown, match: m }).eq("id", j.id);
  }
  return data?.length ?? 0;
}
