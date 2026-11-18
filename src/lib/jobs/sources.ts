import { optionalEnv } from "../env";
import type { RawJob, Settings } from "../types";
import { fetchJson, stripHtml } from "../util";

// Every source here is a documented public API or public ATS job-board feed.
// LinkedIn Jobs and Wellfound offer no API for individuals, so they are
// covered by the "Add a job" import (paste a link or the posting text).

const ANALYST_TITLE_RE = /\b(analyst|analytics|mis|reporting|business intelligence|\bbi\b|power ?bi|insights|data associate)\b/i;
const INDIA_OR_REMOTE_RE = /\b(india|remote|anywhere|delhi|ncr|noida|gurugram|gurgaon|bengaluru|bangalore|hyderabad|pune|mumbai|chennai|kolkata|patna|bihar|apac|asia)\b/i;

export type SourceResult = { source: string; jobs: RawJob[]; error?: string };

function relevant(j: RawJob): boolean {
  return ANALYST_TITLE_RE.test(j.title) && (j.is_remote || INDIA_OR_REMOTE_RE.test(j.location) || !j.location);
}

// ------------------------------------------------------------ Greenhouse
type GhJob = { id: number; title: string; absolute_url: string; updated_at?: string; first_published?: string; location?: { name?: string }; content?: string };
export async function greenhouse(board: string): Promise<RawJob[]> {
  const data = await fetchJson<{ jobs: GhJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`,
  );
  return data.jobs.map((j) => {
    const location = j.location?.name ?? "";
    return {
      title: j.title,
      company: board,
      location,
      is_remote: /remote/i.test(location),
      description: stripHtml(decodeEntities(j.content ?? "")),
      posted_at: j.first_published ?? j.updated_at ?? null,
      apply_url: j.absolute_url,
      source: "Greenhouse",
      source_ref: `gh:${board}:${j.id}`,
    };
  });
}
function decodeEntities(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

// ------------------------------------------------------------ Lever
type LeverJob = {
  id: string; text: string; hostedUrl: string; createdAt?: number; descriptionPlain?: string;
  additionalPlain?: string; lists?: { text: string; content: string }[];
  categories?: { location?: string; allLocations?: string[] }; workplaceType?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
};
export async function lever(company: string): Promise<RawJob[]> {
  const data = await fetchJson<LeverJob[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`);
  return data.map((j) => {
    const location = j.categories?.allLocations?.join(", ") || j.categories?.location || "";
    const lists = (j.lists ?? []).map((l) => `${l.text}\n${stripHtml(l.content)}`).join("\n\n");
    const sr = j.salaryRange;
    return {
      title: j.text,
      company,
      location,
      is_remote: j.workplaceType === "remote" || /remote/i.test(location),
      description: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n\n"),
      salary: sr?.min ? `${sr.currency ?? ""} ${sr.min}${sr.max ? `–${sr.max}` : ""} ${sr.interval ?? ""}`.trim() : null,
      posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      apply_url: j.hostedUrl,
      source: "Lever",
      source_ref: `lever:${company}:${j.id}`,
    };
  });
}

// ------------------------------------------------------------ Ashby
type AshbyJob = {
  id?: string; title: string; location?: string; isRemote?: boolean; workplaceType?: string;
  descriptionPlain?: string; publishedAt?: string; jobUrl: string; applyUrl?: string;
  compensation?: { compensationTierSummary?: string };
};
export async function ashby(org: string): Promise<RawJob[]> {
  const data = await fetchJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`,
  );
  return data.jobs.map((j) => ({
    title: j.title,
    company: org,
    location: j.location ?? "",
    is_remote: Boolean(j.isRemote) || j.workplaceType === "Remote",
    description: j.descriptionPlain ?? "",
    salary: j.compensation?.compensationTierSummary ?? null,
    posted_at: j.publishedAt ?? null,
    apply_url: j.applyUrl ?? j.jobUrl,
    source: "Ashby",
    source_ref: `ashby:${org}:${j.id ?? j.jobUrl}`,
  }));
}

// ------------------------------------------------------------ Remotive (remote jobs, free, link back required)
type RemotiveJob = {
  id: number; url: string; title: string; company_name: string; candidate_required_location: string;
  salary: string; description: string; publication_date: string;
};
export async function remotive(): Promise<RawJob[]> {
  const data = await fetchJson<{ jobs: RemotiveJob[] }>("https://remotive.com/api/remote-jobs?category=data&limit=100");
  return data.jobs.map((j) => ({
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || "Remote",
    is_remote: true,
    description: stripHtml(j.description),
    salary: j.salary || null,
    posted_at: j.publication_date,
    apply_url: j.url,
    source: "Remotive",
    source_ref: `remotive:${j.id}`,
  }));
}

// ------------------------------------------------------------ Adzuna (free developer key, India index)
type AdzunaJob = {
  id: string; title: string; description: string; created: string; redirect_url: string;
  company?: { display_name?: string }; location?: { display_name?: string };
  salary_min?: number; salary_max?: number; salary_is_predicted?: string;
};
export async function adzuna(query: string): Promise<RawJob[]> {
  const id = optionalEnv("ADZUNA_APP_ID");
  const key = optionalEnv("ADZUNA_APP_KEY");
  if (!id || !key) return [];
  const u = new URL("https://api.adzuna.com/v1/api/jobs/in/search/1");
  u.searchParams.set("app_id", id);
  u.searchParams.set("app_key", key);
  u.searchParams.set("what", query);
  u.searchParams.set("results_per_page", "50");
  u.searchParams.set("max_days_old", "14");
  u.searchParams.set("sort_by", "date");
  const data = await fetchJson<{ results: AdzunaJob[] }>(u.toString());
  return data.results.map((j) => {
    const location = j.location?.display_name ?? "India";
    const hasSalary = j.salary_min && j.salary_is_predicted !== "1";
    return {
      title: stripHtml(j.title),
      company: j.company?.display_name ?? "Unknown company",
      location,
      is_remote: /remote|work from home/i.test(`${j.title} ${j.description}`),
      // Adzuna returns a snippet; the full text is on the employer page.
      description: stripHtml(j.description),
      salary: hasSalary ? `₹${Math.round(j.salary_min!).toLocaleString("en-IN")}${j.salary_max ? `–₹${Math.round(j.salary_max).toLocaleString("en-IN")}` : ""} per year` : null,
      posted_at: j.created,
      apply_url: j.redirect_url,
      source: "Adzuna",
      source_ref: `adzuna:${j.id}`,
    };
  });
}

// ------------------------------------------------------------ Jooble (free key on request)
type JoobleJob = { id: number | string; title: string; location: string; snippet: string; salary: string; source: string; type: string; link: string; company: string; updated: string };
export async function jooble(query: string): Promise<RawJob[]> {
  const key = optionalEnv("JOOBLE_API_KEY");
  if (!key) return [];
  const data = await fetchJson<{ jobs: JoobleJob[] }>(`https://jooble.org/api/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords: query, location: "India", page: 1 }),
  });
  return (data.jobs ?? []).map((j) => ({
    title: stripHtml(j.title),
    company: j.company || "Unknown company",
    location: j.location || "India",
    is_remote: /remote|work from home/i.test(`${j.title} ${j.location} ${j.type}`),
    description: stripHtml(j.snippet),
    salary: j.salary || null,
    posted_at: j.updated || null,
    apply_url: j.link,
    source: "Jooble",
    source_ref: `jooble:${j.id}`,
  }));
}

/** Fetches every enabled source. One failing source never stops the others. */
export async function fetchAllSources(settings: Settings): Promise<SourceResult[]> {
  const s = settings.sources;
  const tasks: [string, () => Promise<RawJob[]>][] = [];
  for (const b of s.greenhouse ?? []) tasks.push([`Greenhouse/${b}`, () => greenhouse(b)]);
  for (const c of s.lever ?? []) tasks.push([`Lever/${c}`, () => lever(c)]);
  for (const o of s.ashby ?? []) tasks.push([`Ashby/${o}`, () => ashby(o)]);
  if (s.remotive) tasks.push(["Remotive", remotive]);
  const queries = settings.job_queries.slice(0, 8);
  if (s.adzuna && optionalEnv("ADZUNA_APP_ID")) for (const q of queries) tasks.push([`Adzuna/${q}`, () => adzuna(q)]);
  if (s.jooble && optionalEnv("JOOBLE_API_KEY")) for (const q of queries.slice(0, 4)) tasks.push([`Jooble/${q}`, () => jooble(q)]);

  const results: SourceResult[] = [];
  // Small concurrency to stay polite with free APIs.
  for (let i = 0; i < tasks.length; i += 4) {
    const batch = tasks.slice(i, i + 4);
    const settled = await Promise.allSettled(batch.map(([, fn]) => fn()));
    settled.forEach((r, k) => {
      const name = batch[k][0];
      if (r.status === "fulfilled") results.push({ source: name, jobs: r.value.filter(relevant) });
      else results.push({ source: name, jobs: [], error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    });
  }
  return results;
}

/** Used by Settings to check a board name before saving it. */
export async function testBoard(kind: "greenhouse" | "lever" | "ashby", name: string) {
  const fn = kind === "greenhouse" ? greenhouse : kind === "lever" ? lever : ashby;
  const jobs = await fn(name);
  return { total: jobs.length, relevant: jobs.filter(relevant).length };
}
