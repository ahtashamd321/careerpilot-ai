import type { MatchResult, Profile, ScoreBreakdown } from "./types";

// Weights from the brief. Sum = 100.
export const WEIGHTS = { skills: 35, experience: 25, education: 10, role: 15, location: 10, entry: 5 } as const;

/** Canonical skill -> patterns found in job text. */
const SKILL_PATTERNS: Record<string, RegExp> = {
  Excel: /\b(ms[- ]?excel|advanced excel|excel|vlookup|xlookup|pivot tables?)\b/i,
  SQL: /\b(sql|mysql|postgres(ql)?|t-sql|pl\/sql|sql server)\b/i,
  "Power BI": /\b(power ?bi|dax|power query)\b/i,
  Tableau: /\btableau\b/i,
  Python: /\b(python|pandas|numpy)\b/i,
  "Data Cleaning": /\b(data cleaning|data cleansing|data wrangling|data preparation)\b/i,
  "Data Visualization": /\b(data visuali[sz]ation|visuali[sz]e data|charts?)\b/i,
  Dashboards: /\bdashboards?\b/i,
  Reporting: /\b(reporting|reports?|mis)\b/i,
  "Google Sheets": /\bgoogle sheets\b/i,
  Statistics: /\b(statistics|statistical|hypothesis testing|regression)\b/i,
  R: /\b(r programming|rstudio|\bR\b(?= ?(,|\/|and|or) ?(python|sql)))/,
  Looker: /\blooker( studio)?\b/i,
  "Google Analytics": /\bgoogle analytics|\bga4\b/i,
  SAS: /\bsas\b/i,
  Spark: /\b(spark|pyspark|databricks)\b/i,
  "Cloud (AWS/Azure/GCP)": /\b(aws|azure|gcp|google cloud|bigquery|redshift|snowflake)\b/i,
  ETL: /\b(etl|elt|data pipelines?|ssis|informatica)\b/i,
  VBA: /\b(vba|macros?)\b/i,
  "Machine Learning": /\b(machine learning|ml models?|scikit|predictive model)/i,
  "A/B Testing": /\b(a\/b test|ab test|experimentation)\b/i,
  JIRA: /\bjira\b/i,
};

/** Map a free-text user skill to canonical skills it covers. */
const USER_SKILL_MAP: [RegExp, string[]][] = [
  [/excel/i, ["Excel"]],
  [/sql/i, ["SQL"]],
  [/power ?bi/i, ["Power BI"]],
  [/tableau/i, ["Tableau"]],
  [/python/i, ["Python"]],
  [/clean/i, ["Data Cleaning"]],
  [/dashboard/i, ["Dashboards", "Data Visualization"]],
  [/report/i, ["Reporting"]],
  [/visuali/i, ["Data Visualization"]],
  [/sheets/i, ["Google Sheets"]],
  [/statistic/i, ["Statistics"]],
  [/looker/i, ["Looker"]],
  [/vba|macro/i, ["VBA"]],
  [/etl/i, ["ETL"]],
];

export function extractSkills(text: string): string[] {
  return Object.entries(SKILL_PATTERNS)
    .filter(([, re]) => re.test(text))
    .map(([k]) => k);
}

export function userCanonicalSkills(skills: string[]): Set<string> {
  const out = new Set<string>();
  for (const s of skills) for (const [re, canon] of USER_SKILL_MAP) if (re.test(s)) canon.forEach((c) => out.add(c));
  return out;
}

/** Parses "2-4 years", "0-1 yrs", "3+ years", "fresher" etc. */
export function parseExperience(text: string): { min: number | null; max: number | null; text: string | null } {
  const t = text.replace(/\s+/g, " ");
  if (/\b(fresher|freshers|no experience required|entry[- ]level|graduate trainee|0 years?)\b/i.test(t)) {
    const m = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?)/i);
    if (m) return { min: Number(m[1]), max: Number(m[2]), text: m[0] };
    return { min: 0, max: 1, text: "Fresher / entry level" };
  }
  const range = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?)/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]), text: range[0] };
  const plus = t.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:'s)?\s*(?:of\s+)?(?:\w+\s+){0,4}?(?:experience|exp)/i)
    ?? t.match(/(?:minimum|min\.?|at least)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i);
  if (plus) {
    const n = Number(plus[1]);
    if (n <= 20) return { min: n, max: null, text: plus[0] };
  }
  return { min: null, max: null, text: null };
}

const SENIOR_RE = /\b(senior|sr\.?|lead|principal|manager|head|director|architect|staff|vp)\b/i;
const ENTRY_RE = /\b(junior|jr\.?|associate|trainee|intern(ship)?|entry|fresher|graduate|analyst i\b|level 1|l1)\b/i;
const CORE_ROLE_RE = /\b(data analyst|mis analyst|mis executive|reporting analyst|business analyst|bi analyst|business intelligence analyst|power ?bi (analyst|developer)|operations analyst|analytics associate|data analytics associate|reporting associate|mis associate)\b/i;
const ADJACENT_ROLE_RE = /\b(analyst|analytics|insights|mis|reporting|business intelligence|bi developer|dashboard)\b/i;
const FAR_DATA_RE = /\b(data engineer|data scientist|ml engineer|machine learning|software engineer|developer)\b/i;

function analyticsYears(p: Profile): number {
  return p.experience.filter((e) => e.kind === "analytics").reduce((a, e) => a + (Number(e.years) || 0), 0);
}
function totalYears(p: Profile): number {
  return p.experience.reduce((a, e) => a + (Number(e.years) || 0), 0);
}

const INDIA_RE = /\b(india|delhi|ncr|noida|gurugram|gurgaon|bengaluru|bangalore|hyderabad|pune|mumbai|chennai|kolkata|patna|bihar|ahmedabad|jaipur|chandigarh|indore|kochi|coimbatore|lucknow|bhubaneswar|thane|navi mumbai)\b/i;

export type JobForMatch = {
  title: string;
  description: string;
  location: string;
  is_remote: boolean;
  exp_min: number | null;
  exp_max: number | null;
  skills: string[];
};

export function scoreJob(job: JobForMatch, profile: Profile): MatchResult {
  const text = `${job.title}\n${job.description}`;
  const strengths: string[] = [];
  const gaps: string[] = [];

  // ---------- skills (35)
  const jobSkills = job.skills.length ? job.skills : extractSkills(text);
  const mine = userCanonicalSkills(profile.skills);
  const matched = jobSkills.filter((s) => mine.has(s));
  const missing = jobSkills.filter((s) => !mine.has(s));
  let skillsRatio: number;
  if (jobSkills.length === 0) skillsRatio = 0.5; // description lists no tools: neutral
  else {
    skillsRatio = matched.length / jobSkills.length;
    // The core analyst stack counts double: Excel/SQL/BI tools are what screens look for.
    const core = ["Excel", "SQL", "Power BI", "Tableau"];
    const coreAsked = jobSkills.filter((s) => core.includes(s));
    if (coreAsked.length) {
      const coreHit = coreAsked.filter((s) => mine.has(s)).length / coreAsked.length;
      skillsRatio = 0.5 * skillsRatio + 0.5 * coreHit;
    }
  }
  const skills = Math.round(WEIGHTS.skills * skillsRatio);
  if (matched.length) strengths.push(`You already use ${matched.join(", ")}.`);
  if (missing.length) gaps.push(`Not on your profile yet: ${missing.join(", ")}.`);

  // ---------- experience (25): only analytics years count as analyst experience
  const aYears = analyticsYears(profile);
  const tYears = totalYears(profile);
  const min = job.exp_min;
  let expPts: number;
  let eligibility: MatchResult["eligibility"] = "eligible";
  let eligibilityNote: string;
  if (min === null) {
    expPts = SENIOR_RE.test(job.title) ? 5 : 18;
    eligibilityNote = SENIOR_RE.test(job.title)
      ? "No experience figure given, but the title suggests a senior role."
      : "No experience figure given; the title reads as open to early-career applicants.";
    if (SENIOR_RE.test(job.title)) eligibility = "likely_ineligible";
  } else if (min <= aYears) {
    expPts = 25;
    eligibilityNote = `Asks for ${min}+ years; you meet it.`;
  } else if (min <= 1) {
    // e.g. "0-1" or "1 year": a fresher with 1 yr of non-analytics work is a fair fit.
    expPts = min === 0 ? 25 : 17;
    eligibilityNote =
      min === 0
        ? "Open to freshers."
        : `Asks for about 1 year. You have 1 year of work experience, but in a CRM role, not analytics. Say so plainly and lead with your projects.`;
  } else if (min <= 2) {
    expPts = 10;
    eligibility = "stretch";
    eligibilityNote = `Asks for ${min}+ years of experience. You have 1 year of non-analytics work, so this is a stretch.`;
  } else {
    expPts = min <= 3 ? 4 : 0;
    eligibility = "likely_ineligible";
    eligibilityNote = `Asks for ${min}+ years. You likely don't meet the stated minimum yet.`;
  }
  if (tYears > 0 && aYears === 0 && min !== null && min > 0 && min <= 1) {
    strengths.push("Your year in a customer-facing finance role shows you can work with targets, reports and stakeholders.");
  }

  // ---------- education (10)
  let education = 9;
  if (/\b(master'?s|mba|m\.?tech|post[- ]?graduate|pgdm)\b.{0,40}\b(required|mandatory|must)\b/i.test(text)) {
    education = profile.education_level === "master" ? 10 : 5;
    if (education < 10) gaps.push("The posting asks for a postgraduate degree.");
  } else if (/\b(b\.?tech|b\.?e\.?|computer science|engineering degree)\b.{0,40}\b(required|mandatory|must|only)\b/i.test(text)) {
    education = 6;
    gaps.push("The posting prefers an engineering or CS degree.");
  } else if (/\b(bachelor'?s|graduate|graduation|degree|b\.?com|bba|any graduate)\b/i.test(text)) {
    education = 10;
  }

  // ---------- role relevance (15)
  let role = 0;
  const targets = profile.target_roles.map((r) => r.toLowerCase());
  const titleL = job.title.toLowerCase();
  if (targets.some((t) => titleL.includes(t)) || CORE_ROLE_RE.test(job.title)) role = 15;
  else if (ADJACENT_ROLE_RE.test(job.title)) role = 10;
  else if (FAR_DATA_RE.test(job.title)) role = 4;
  else if (CORE_ROLE_RE.test(job.description.slice(0, 1500))) role = 6;
  if (role >= 10) strengths.push(`The role lines up with your target: ${job.title}.`);

  // ---------- location (10)
  const loc = `${job.location} ${job.is_remote ? "remote" : ""}`;
  const prefs = profile.preferred_locations.map((p) => p.toLowerCase().replace("remote india", "").trim()).filter(Boolean);
  let location: number;
  const isIndia = INDIA_RE.test(loc);
  if (job.is_remote && (isIndia || /\b(anywhere|worldwide|global|apac|asia)\b/i.test(loc) || !job.location)) location = 10;
  else if (prefs.some((p) => loc.toLowerCase().includes(p))) location = 10;
  else if (isIndia) location = 6;
  else if (job.is_remote) location = 4; // remote but tied to another region
  else if (!job.location.trim()) location = 5;
  else location = 0;
  if (location === 0) gaps.push(`Located in ${job.location}, outside your preferred regions.`);

  // ---------- entry-level suitability (5)
  let entry = 2;
  if (ENTRY_RE.test(job.title) || (min !== null && min <= 1)) entry = 5;
  if (SENIOR_RE.test(job.title)) entry = 0;

  const breakdown: ScoreBreakdown = { skills, experience: expPts, education, role, location, entry };
  const raw = Math.max(0, Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0)));
  // Realism cap: a job you likely can't get shouldn't outrank one you can, however well the skills overlap.
  const outOfRegion = location === 0;
  const cap = eligibility === "likely_ineligible" || outOfRegion ? 49 : 100;
  const score = Math.min(raw, cap);
  const capNote = score < raw
    ? `Capped at ${cap} (raw ${raw}) because ${eligibility === "likely_ineligible" ? "the experience bar is above your level" : "the location is outside your regions"}.`
    : null;

  let recommendation: MatchResult["recommendation"];
  let recommendationText: string;
  if (eligibility === "likely_ineligible") {
    recommendation = "skip";
    recommendationText = "Skip for now. The experience bar is above where you are; save it if the company interests you.";
  } else if (score >= 80) {
    recommendation = "apply_now";
    recommendationText = "Apply. This is a realistic fit for your skills and level.";
  } else if (score >= 65) {
    recommendation = "apply_tailored";
    recommendationText = "Apply with a tailored resume that puts the matching projects first.";
  } else if (score >= 50) {
    recommendation = "stretch";
    recommendationText = "A stretch. Apply only if the company matters to you, and close one missing skill first.";
  } else {
    recommendation = "skip";
    recommendationText = "Skip. Too many gaps for this one.";
  }

  return {
    score, rawScore: raw, capNote, breakdown, matchedSkills: matched, missingSkills: missing,
    strengths, gaps, eligibility, eligibilityNote, recommendation, recommendationText,
  };
}
