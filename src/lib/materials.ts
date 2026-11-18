import { adminClient } from "./supabase/admin";
import { generate, HONESTY_RULES } from "./ai";
import type { Profile } from "./types";

export type MaterialKind = "resume_tips" | "cover_letter" | "prep";

const INSTRUCTIONS: Record<MaterialKind, string> = {
  resume_tips: `Give tailored resume improvements for this job, as plain text with short sections:
1. Headline/summary line to use (one line, honest: certification + projects + 1 yr CRM).
2. Which 2-3 projects to list first and one rewritten bullet for each that mirrors this job's language (no invented numbers; use placeholders like [X%] where the candidate must fill in a real figure).
3. How to describe the Piramal Finance CRM role honestly with transferable points relevant to this job.
4. Keywords from the posting to include, only if the candidate genuinely has them.
5. Missing skills and a realistic way to close each one quickly.`,
  cover_letter: `Write a cover letter (180-250 words) for this job. Plain, specific, confident without exaggeration.
Open with why this role and company, not "I am writing to apply". Mention 1-2 relevant projects concretely and the CRM role honestly as customer-facing finance experience. End with a simple call to talk. Sign with the candidate's name.`,
  prep: `Prepare the candidate for this application, plain text with short sections:
1. What this team likely needs (inferred only from the posting).
2. Five likely interview questions with a short note on how to answer each using their real projects.
3. Two SQL or Excel exercises typical for this level, with the key concept to revise.
4. Questions the candidate should ask the interviewer.
5. A one-paragraph honest answer to "Tell me about your experience" that doesn't overstate the CRM role.`,
};

export async function generateMaterial(userId: string, profile: Profile, jobId: string, kind: MaterialKind) {
  const db = adminClient();
  const { data: job } = await db.from("jobs").select("*").eq("id", jobId).eq("user_id", userId).single();
  if (!job) throw new Error("Job not found");
  const { data: recruiters } = await db.from("recruiters").select("name,designation").eq("user_id", userId).ilike("company", job.company).limit(3);

  const r = await generate(
    `${INSTRUCTIONS[kind]}
${HONESTY_RULES}

Candidate profile:
Name: ${profile.full_name}
Education: ${profile.education}
Certifications: ${profile.certifications.join(", ")}
Experience: ${profile.experience.map((e) => `${e.role} at ${e.company}, ${e.years} yr (${e.kind === "analytics" ? "analytics role" : "NOT an analytics role"})`).join("; ")}
Skills: ${profile.skills.join(", ")}
Projects: ${profile.projects.map((p) => `${p.name}: ${p.description} [${p.tools.join(", ")}]`).join("; ")}

Job: ${job.title} at ${job.company} (${job.location})
Experience asked: ${job.experience_text ?? "not stated"}
Match analysis: ${JSON.stringify(job.match).slice(0, 1500)}
${recruiters?.length ? `Known hiring contacts (public): ${recruiters.map((x) => `${x.name}, ${x.designation}`).join("; ")}` : ""}
Posting:
${String(job.description).slice(0, 6000)}`,
    { temperature: kind === "cover_letter" ? 0.6 : 0.4 },
  );
  const { data, error } = await db.from("application_materials").insert({ user_id: userId, job_id: jobId, kind, content: r.text.trim() }).select().single();
  if (error) throw new Error(error.message);
  return data;
}
