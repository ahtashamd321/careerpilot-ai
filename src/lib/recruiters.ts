import { adminClient } from "./supabase/admin";
import { aiAvailable, generate, parseJsonLoose } from "./ai";

// Recruiter intelligence from PUBLIC sources only, via Gemini's Google Search grounding.
// We store names, titles, companies and public links. We never store emails,
// phone numbers or anything personal, and every AI-found entry is marked
// "unverified" until the user checks the source link.

type Found = {
  name: string; designation: string; company: string; profile_url?: string;
  hiring_interests?: string; source_url?: string;
};

const PERSONAL_DATA_RE = /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s-]{8,}\d/g;

function cleanUrl(u?: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function runRecruitersStep(userId: string) {
  if (!aiAvailable()) return { skipped: "AI provider not configured", added: 0 };
  const db = adminClient();
  const { data: jobs } = await db.from("jobs").select("id,title,company,location").eq("user_id", userId)
    .eq("status", "active").gte("score", 65).order("score", { ascending: false }).limit(12);
  const companies = [...new Map((jobs ?? []).map((j) => [j.company.toLowerCase(), j])).values()].slice(0, 6);
  if (!companies.length) return { added: 0, note: "No well-matched jobs yet, so no companies to research." };

  const r = await generate(
    `Search the public web for people involved in hiring analysts at these companies in India:
${companies.map((c) => `- ${c.company} (role: ${c.title}, ${c.location})`).join("\n")}

Look for talent acquisition / recruiters, HR business partners, and analytics or BI managers who have PUBLICLY posted about hiring or are publicly listed on the company's site, press, or public professional profiles.
Rules:
- Only include a person if a search result you actually found names them. Never guess or invent names.
- Include the URL of the page where you found them as source_url.
- Do NOT include email addresses, phone numbers, home locations or any private details.
- If you find nobody for a company, skip it. An empty list is a fine answer.
Return ONLY JSON: {"people":[{"name":"","designation":"","company":"","profile_url":"","hiring_interests":"","source_url":""}]}`,
    { grounded: true, temperature: 0.2 },
  );

  let people: Found[] = [];
  try {
    people = parseJsonLoose<{ people: Found[] }>(r.text).people ?? [];
  } catch {
    return { added: 0, note: "Search returned no structured results today." };
  }
  const groundingUrls = r.sources.map((s) => s.url);

  const rows = people
    .filter((p) => p.name && p.company && p.name.split(" ").length <= 5)
    .map((p) => {
      const job = companies.find((c) => c.company.toLowerCase() === p.company.toLowerCase());
      const source = cleanUrl(p.source_url) ?? groundingUrls[0] ?? null;
      return {
        user_id: userId,
        name: p.name.replace(PERSONAL_DATA_RE, "").trim().slice(0, 120),
        designation: (p.designation ?? "").replace(PERSONAL_DATA_RE, "").slice(0, 160),
        company: p.company.slice(0, 160),
        profile_url: cleanUrl(p.profile_url),
        hiring_interests: (p.hiring_interests ?? "").replace(PERSONAL_DATA_RE, "").slice(0, 500),
        related_job_id: job?.id ?? null,
        source_url: source,
        origin: "ai_search",
        verified: false,
      };
    })
    .filter((p) => p.source_url); // no source, no entry

  if (!rows.length) return { added: 0, searched: companies.length };
  const { data, error } = await db.from("recruiters").upsert(rows, { onConflict: "user_id,name,company", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(`Saving recruiters failed: ${error.message}`);
  return { added: data?.length ?? 0, searched: companies.length };
}
