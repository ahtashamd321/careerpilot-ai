"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { loadProfileAndSettings } from "@/lib/data";
import { enrich, rescoreAll } from "@/lib/jobs/pipeline";
import { testBoard } from "@/lib/jobs/sources";
import { generateMaterial, type MaterialKind } from "@/lib/materials";
import { regeneratePost, runPostsStep } from "@/lib/posts";
import { disconnect } from "@/lib/linkedin";
import { sendTelegram } from "@/lib/notify";
import { aiAvailable, generateJson } from "@/lib/ai";
import { APPLICATION_STATUSES, type ApplicationStatus, type ExperienceEntry, type Project, type Sources } from "@/lib/types";
import { errorMessage, istDate } from "@/lib/util";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const ok = (message?: string, id?: string): ActionResult => ({ ok: true, message, id });
const fail = (e: unknown): ActionResult => ({ ok: false, error: errorMessage(e) });
const list = (v: FormDataEntryValue | null) => String(v ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------------ profile & settings
export async function saveProfile(input: {
  full_name: string; location: string; education: string; education_level: string; summary: string;
  certifications: string[]; skills: string[]; target_roles: string[]; preferred_locations: string[];
  experience: ExperienceEntry[]; projects: Project[];
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("profiles").update({ ...input, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (error) throw error;
    const { profile } = await loadProfileAndSettings(supabase, user.id);
    const n = await rescoreAll(user.id, profile);
    revalidatePath("/", "layout");
    return ok(`Profile saved. Re-scored ${n} jobs.`);
  } catch (e) { return fail(e); }
}

export async function saveSettings(form: FormData): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { settings } = await loadProfileAndSettings(supabase, user.id);
    const sources: Sources = {
      ...settings.sources,
      remotive: form.get("src_remotive") === "on",
      adzuna: form.get("src_adzuna") === "on",
      jooble: form.get("src_jooble") === "on",
    };
    const threshold = Math.min(100, Math.max(40, Number(form.get("match_threshold")) || 80));
    const { error } = await supabase.from("settings").update({
      automation_enabled: form.get("automation_enabled") === "on",
      run_hour_ist: Math.min(23, Math.max(0, Number(form.get("run_hour_ist")) || 8)),
      match_threshold: threshold,
      posts_per_day: Math.min(5, Math.max(1, Number(form.get("posts_per_day")) || 3)),
      notify_in_app: form.get("notify_in_app") === "on",
      notify_browser: form.get("notify_browser") === "on",
      notify_telegram: form.get("notify_telegram") === "on",
      telegram_chat_id: String(form.get("telegram_chat_id") ?? "").trim() || null,
      research_topics: list(form.get("research_topics")),
      job_queries: list(form.get("job_queries")),
      max_job_age_days: Math.min(90, Math.max(3, Number(form.get("max_job_age_days")) || 30)),
      sources,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok("Settings saved.");
  } catch (e) { return fail(e); }
}

export async function addBoard(kind: "greenhouse" | "lever" | "ashby", nameRaw: string): Promise<ActionResult> {
  try {
    const name = nameRaw.trim().toLowerCase().replace(/^https?:\/\/[^/]+\//, "").split(/[/?#]/)[0];
    if (!/^[a-z0-9-_.]+$/.test(name)) throw new Error("Use the board name from the careers URL, e.g. jobs.lever.co/NAME");
    const { supabase, user } = await requireUser();
    const t = await testBoard(kind, name); // throws if the board doesn't exist
    const { settings } = await loadProfileAndSettings(supabase, user.id);
    const sources = { ...settings.sources, [kind]: [...new Set([...(settings.sources[kind] ?? []), name])] };
    const { error } = await supabase.from("settings").update({ sources }).eq("user_id", user.id);
    if (error) throw error;
    revalidatePath("/settings");
    return ok(`Added ${name}: ${t.total} open roles, ${t.relevant} relevant to you right now.`);
  } catch (e) { return fail(e); }
}

export async function removeBoard(kind: "greenhouse" | "lever" | "ashby", name: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { settings } = await loadProfileAndSettings(supabase, user.id);
    const sources = { ...settings.sources, [kind]: (settings.sources[kind] ?? []).filter((b) => b !== name) };
    await supabase.from("settings").update({ sources }).eq("user_id", user.id);
    revalidatePath("/settings");
    return ok(`Removed ${name}.`);
  } catch (e) { return fail(e); }
}

export async function testTelegram(): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { settings } = await loadProfileAndSettings(supabase, user.id);
    if (!settings.telegram_chat_id) throw new Error("Save your Telegram chat ID first.");
    const r = await sendTelegram(settings.telegram_chat_id, "CareerPilot AI: Telegram alerts are working.");
    if (!r.ok) throw new Error(r.error);
    return ok("Test message sent.");
  } catch (e) { return fail(e); }
}

export async function disconnectLinkedIn(): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    await disconnect(user.id);
    revalidatePath("/", "layout");
    return ok("LinkedIn disconnected. The stored token was deleted.");
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------ jobs
export async function setJobStatus(jobId: string, status: "active" | "dismissed"): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("jobs").update({ status }).eq("id", jobId).eq("user_id", user.id);
    if (error) throw error;
    revalidatePath("/jobs");
    return ok(status === "dismissed" ? "Job hidden. It won't be recommended again." : "Job restored.");
  } catch (e) { return fail(e); }
}

export async function importJob(form: FormData): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { profile, settings } = await loadProfileAndSettings(supabase, user.id);
    let title = String(form.get("title") ?? "").trim();
    let company = String(form.get("company") ?? "").trim();
    let location = String(form.get("location") ?? "").trim();
    const url = String(form.get("url") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    if (!description) throw new Error("Paste the job description so it can be scored.");
    if (!/^https?:\/\//.test(url)) throw new Error("Add the job's link so you can apply from here.");
    if ((!title || !company) && aiAvailable()) {
      const { data } = await generateJson<{ title: string; company: string; location: string }>(
        `Extract the job title, company and location from this posting. Use "" if absent. JSON: {"title":"","company":"","location":""}\n\n${description.slice(0, 4000)}`,
        { temperature: 0 },
      );
      title ||= data.title; company ||= data.company; location ||= data.location;
    }
    if (!title || !company) throw new Error("Add the job title and company.");
    const host = new URL(url).hostname.replace(/^www\./, "");
    const e = enrich({ title, company, location, is_remote: /remote|work from home/i.test(`${location} ${description}`), description, apply_url: url, source: `Imported (${host})` }, profile);
    const { data, error } = await supabase.from("jobs").upsert({ ...e, user_id: user.id, status: "active", last_seen_at: new Date().toISOString() }, { onConflict: "user_id,dedupe_key" }).select("id,score").single();
    if (error) throw error;
    revalidatePath("/jobs");
    return ok(`Imported and scored ${data.score}%. ${data.score >= settings.match_threshold ? "That's above your alert threshold." : ""}`, data.id);
  } catch (e) { return fail(e); }
}

export async function createMaterial(jobId: string, kind: MaterialKind): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { profile } = await loadProfileAndSettings(supabase, user.id);
    await generateMaterial(user.id, profile, jobId, kind);
    revalidatePath(`/jobs/${jobId}`);
    return ok("Generated.");
  } catch (e) { return fail(e); }
}

export async function trackJob(jobId: string, status: ApplicationStatus = "saved"): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).eq("user_id", user.id).single();
    if (!job) throw new Error("Job not found");
    const { data: rec } = await supabase.from("recruiters").select("name").eq("user_id", user.id).ilike("company", job.company).limit(1);
    const { data, error } = await supabase.from("applications").upsert({
      user_id: user.id, job_id: jobId, company: job.company, position: job.title, match_score: job.score,
      status, apply_url: job.apply_url, recruiter: rec?.[0]?.name ?? null,
    }, { onConflict: "user_id,job_id", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    revalidatePath("/applications");
    revalidatePath(`/jobs/${jobId}`);
    return ok(data?.length ? "Added to your tracker." : "Already in your tracker.");
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------ applications
export async function saveApplication(form: FormData): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const id = String(form.get("id") ?? "");
    const status = String(form.get("status")) as ApplicationStatus;
    if (!APPLICATION_STATUSES.includes(status)) throw new Error("Unknown status");
    const date = (k: string) => String(form.get(k) ?? "").trim() || null;
    const row = {
      company: String(form.get("company") ?? "").trim(),
      position: String(form.get("position") ?? "").trim(),
      status,
      match_score: form.get("match_score") ? Number(form.get("match_score")) : null,
      applied_at: date("applied_at") ?? (status === "applied" ? new Date().toISOString().slice(0, 10) : null),
      recruiter: date("recruiter"),
      follow_up_at: date("follow_up_at"),
      interview_at: date("interview_at") ? new Date(String(form.get("interview_at"))).toISOString() : null,
      notes: String(form.get("notes") ?? ""),
      apply_url: date("apply_url"),
      updated_at: new Date().toISOString(),
    };
    if (!row.company || !row.position) throw new Error("Company and position are required.");
    const q = id
      ? supabase.from("applications").update(row).eq("id", id).eq("user_id", user.id)
      : supabase.from("applications").insert({ ...row, user_id: user.id });
    const { error } = await q;
    if (error) throw error;
    revalidatePath("/applications");
    return ok(id ? "Application updated." : "Application added.");
  } catch (e) { return fail(e); }
}

export async function moveApplication(id: string, status: ApplicationStatus): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === "applied") {
      const { data } = await supabase.from("applications").select("applied_at").eq("id", id).single();
      if (!data?.applied_at) patch.applied_at = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase.from("applications").update(patch).eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    revalidatePath("/applications");
    return ok();
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------ posts
export async function updatePost(id: string, content: string, hashtags: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const tags = hashtags.split(/[\s,]+/).filter(Boolean).map((h) => `#${h.replace(/^#+/, "")}`);
    const { error } = await supabase.from("posts").update({ content: content.trim(), hashtags: tags, updated_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", user.id).in("status", ["draft", "approved", "failed", "scheduled"]);
    if (error) throw error;
    revalidatePath("/posts");
    return ok("Saved.");
  } catch (e) { return fail(e); }
}

export async function setPostStatus(id: string, status: "draft" | "approved" | "discarded"): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("posts").update({ status, scheduled_at: null, updated_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", user.id).neq("status", "published");
    if (error) throw error;
    revalidatePath("/posts");
    return ok(status === "approved" ? "Approved." : status === "discarded" ? "Discarded." : "Moved back to drafts.");
  } catch (e) { return fail(e); }
}

export async function schedulePost(id: string, isoTime: string): Promise<ActionResult> {
  try {
    const when = new Date(isoTime);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) throw new Error("Pick a time at least a minute from now.");
    const { supabase, user } = await requireUser();
    const { data: post } = await supabase.from("posts").select("status").eq("id", id).eq("user_id", user.id).single();
    if (!post || !["approved", "scheduled", "failed"].includes(post.status)) throw new Error("Approve the post before scheduling it.");
    const { error } = await supabase.from("posts").update({ status: "scheduled", scheduled_at: when.toISOString(), error: null }).eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    revalidatePath("/posts");
    return ok("Scheduled. It publishes within the hour after that time.");
  } catch (e) { return fail(e); }
}

export async function regenerate(id: string, instruction?: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { profile } = await loadProfileAndSettings(supabase, user.id);
    await regeneratePost(user.id, profile, id, instruction);
    revalidatePath("/posts");
    return ok("Rewritten.");
  } catch (e) { return fail(e); }
}

export async function generateMorePosts(): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { profile, settings } = await loadProfileAndSettings(supabase, user.id);
    const { count } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", user.id)
      .eq("run_date", istDate()).neq("status", "discarded");
    const r = await runPostsStep(user.id, profile, (count ?? 0) + settings.posts_per_day);
    revalidatePath("/posts");
    return ok(`Created ${r.created} new drafts.`);
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------ recruiters
export async function saveRecruiter(form: FormData): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const id = String(form.get("id") ?? "");
    const url = (k: string) => { const v = String(form.get(k) ?? "").trim(); return /^https?:\/\//.test(v) ? v : null; };
    const row = {
      name: String(form.get("name") ?? "").trim(),
      designation: String(form.get("designation") ?? "").trim(),
      company: String(form.get("company") ?? "").trim(),
      profile_url: url("profile_url"),
      source_url: url("source_url"),
      hiring_interests: String(form.get("hiring_interests") ?? ""),
      notes: String(form.get("notes") ?? ""),
      verified: form.get("verified") === "on",
    };
    if (!row.name || !row.company) throw new Error("Name and company are required.");
    const { error } = id
      ? await supabase.from("recruiters").update(row).eq("id", id).eq("user_id", user.id)
      : await supabase.from("recruiters").insert({ ...row, user_id: user.id, origin: "manual" });
    if (error) throw error;
    revalidatePath("/recruiters");
    return ok("Saved.");
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------ notifications
export async function markNotifications(ids: string[] | "all"): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    let q = supabase.from("notifications").update({ read: true }).eq("user_id", user.id);
    if (ids !== "all") q = q.in("id", ids);
    const { error } = await q;
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok();
  } catch (e) { return fail(e); }
}

export async function snoozeNotification(id: string, hours = 4): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("notifications").update({ snoozed_until: new Date(Date.now() + hours * 3600_000).toISOString(), read: false })
      .eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    return ok(`We'll remind you in ${hours} hours.`);
  } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------ memory
export async function saveNote(form: FormData): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const id = String(form.get("id") ?? "");
    const row = {
      category: String(form.get("category") ?? "other"),
      title: String(form.get("title") ?? "").trim(),
      content: String(form.get("content") ?? ""),
      tags: list(form.get("tags")),
      updated_at: new Date().toISOString(),
    };
    if (!row.title) throw new Error("Give the note a title.");
    const { error } = id
      ? await supabase.from("memory_notes").update(row).eq("id", id).eq("user_id", user.id)
      : await supabase.from("memory_notes").insert({ ...row, user_id: user.id });
    if (error) throw error;
    revalidatePath("/memory");
    return ok("Saved.");
  } catch (e) { return fail(e); }
}

const DELETABLE = ["jobs", "applications", "recruiters", "posts", "research_items", "memory_notes", "reports", "notifications", "application_materials"] as const;
export async function deleteRow(table: (typeof DELETABLE)[number], id: string): Promise<ActionResult> {
  try {
    if (!DELETABLE.includes(table)) throw new Error("Not allowed");
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from(table).delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok("Deleted.");
  } catch (e) { return fail(e); }
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
