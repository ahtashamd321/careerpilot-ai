import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { fetchAllSources } from "../src/lib/jobs/sources";
import { dedupeKey, enrich } from "../src/lib/jobs/pipeline";
import { readFeed } from "../src/lib/research";
import { toLittleText, composerUrl } from "../src/lib/linkedin";
import { reportToCsv, reportToPdf, type ReportContent } from "../src/lib/reports";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "../src/lib/defaults";
import { bannedPhrasesIn } from "../src/lib/posts";
import { encrypt, decrypt } from "../src/lib/crypto";

const profile = { user_id: "t", ...DEFAULT_PROFILE };
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });

// ---- mock the public APIs with realistic payload shapes
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input);
  if (url.includes("boards-api.greenhouse.io/v1/boards/acme")) return json({ jobs: [
    { id: 1, title: "Junior Data Analyst", absolute_url: "https://boards.greenhouse.io/acme/jobs/1", first_published: new Date().toISOString(), location: { name: "Gurugram, India" }, content: "&lt;p&gt;0-1 years. SQL, Excel, Power BI.&lt;/p&gt;" },
    { id: 2, title: "Senior Backend Engineer", absolute_url: "https://boards.greenhouse.io/acme/jobs/2", location: { name: "Pune" }, content: "Go, Kafka" },
  ]});
  if (url.includes("boards-api.greenhouse.io/v1/boards/nope")) return new Response("not found", { status: 404 });
  if (url.includes("api.lever.co/v0/postings/beta")) return json([
    { id: "a1", text: "MIS Analyst", hostedUrl: "https://jobs.lever.co/beta/a1", createdAt: Date.now(), descriptionPlain: "1-2 years in MIS reporting with Excel and SQL.", categories: { location: "Noida" }, workplaceType: "onsite" },
    // same job as acme's but posted by another board -> different company, not a dup
  ]);
  if (url.includes("remotive.com")) return json({ jobs: [
    { id: 9, url: "https://remotive.com/x", title: "Data Analyst", company_name: "Gamma", candidate_required_location: "India", salary: "", description: "<p>Freshers welcome. SQL, Tableau.</p>", publication_date: new Date().toISOString() },
    { id: 10, url: "https://remotive.com/y", title: "Data Analyst", company_name: "Gamma", candidate_required_location: "India", salary: "", description: "<p>Longer duplicate description of the same job with SQL and Tableau.</p>", publication_date: new Date().toISOString() },
    { id: 11, url: "https://remotive.com/z", title: "Product Designer", company_name: "Delta", candidate_required_location: "Worldwide", salary: "", description: "Figma", publication_date: new Date().toISOString() },
  ]});
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

async function main() {
  const settings = { user_id: "t", ...DEFAULT_SETTINGS, sources: { greenhouse: ["acme", "nope"], lever: ["beta"], ashby: [], remotive: true, adzuna: false, jooble: false } };
  const results = await fetchAllSources(settings);
  const byName = Object.fromEntries(results.map((r) => [r.source, r]));
  assert.equal(byName["Greenhouse/acme"].jobs.length, 1, "irrelevant engineering job filtered out");
  assert.ok(byName["Greenhouse/nope"].error?.includes("404"), "bad board reports an error without breaking others");
  assert.equal(byName["Lever/beta"].jobs.length, 1);
  assert.equal(byName["Remotive"].jobs.length, 2, "designer filtered out");
  const gh = byName["Greenhouse/acme"].jobs[0];
  assert.ok(gh.description.includes("SQL") && !gh.description.includes("<p>"), "html stripped");

  // dedupe: the two Remotive Gamma postings collapse to one key
  const [a, b] = byName["Remotive"].jobs;
  assert.equal(dedupeKey(a), dedupeKey(b));
  assert.notEqual(dedupeKey(a), dedupeKey(gh));

  const e = enrich(gh, profile);
  assert.equal(e.exp_min, 0);
  assert.ok(e.score >= 80, `junior DA scored ${e.score}`);
  console.log("sources + dedupe + enrich OK:", e.title, e.score, e.skills.join("/"));

  // RSS parsing
  globalThis.fetch = (async () => new Response(`<?xml version="1.0"?><rss><channel>
    <item><title>Microsoft adds Copilot to Power BI reports - The Verge</title><link>https://news.example/a</link><pubDate>${new Date().toUTCString()}</pubDate><description>&lt;a href="x"&gt;Copilot&lt;/a&gt; now writes DAX</description><source url="https://theverge.com">The Verge</source></item>
    <item><title>Only item two</title><link>https://news.example/b</link></item>
  </channel></rss>`)) as typeof fetch;
  const items = await readFeed("https://news.google.com/rss/search?q=x", "Power BI update");
  assert.equal(items.length, 2);
  assert.equal(items[0].source, "The Verge");
  assert.ok(items[0].published_at);
  console.log("RSS OK:", items[0].title);

  // LinkedIn formatting
  const lt = toLittleText("SQL (window functions) are *great* @team", ["#DataAnalytics", "PowerBI"]);
  assert.ok(lt.includes("\\(window functions\\)") && lt.includes("\\*great\\*") && lt.includes("\\@team"));
  assert.ok(lt.includes("{hashtag|\\#|DataAnalytics}") && lt.includes("{hashtag|\\#|PowerBI}"));
  assert.ok(composerUrl("hi", ["#a"]).startsWith("https://www.linkedin.com/feed/?shareActive=true&text=hi"));
  console.log("LinkedIn little-text OK");

  assert.deepEqual(bannedPhrasesIn("In today's fast-paced world, let's delve in"), ["in today's fast-paced", "delve"]);

  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const enc = encrypt("secret-token");
  assert.notEqual(enc, "secret-token");
  assert.equal(decrypt(enc), "secret-token");
  console.log("token encryption OK");

  // Report exports
  const report: ReportContent = {
    date: "2026-11-17", digest: "- Power BI added Copilot features\n- Analyst hiring steady in NCR", research: [{ title: "Copilot in Power BI — what's new", url: "https://x", source: "Blog", summary: "Summary with ₹ and “quotes”" }],
    newJobs: 12, topMatches: [{ id: "1", title: "Junior Data Analyst", company: "Acme", location: "Gurugram", score: 96, recommendation: "Apply.", url: "https://boards.greenhouse.io/acme/jobs/1" }],
    recruiters: [{ name: "Priya S", designation: "Talent Acquisition", company: "Acme", source_url: "https://x" }],
    posts: [{ angle: "SQL tip", content: "Line one,\nline \"two\"", hashtags: ["#SQL"] }],
    pendingApplications: [{ company: "Acme", position: "MIS Analyst", status: "applied", follow_up_at: "2026-11-20" }], actions: ["Apply to Acme."],
  };
  const csv = reportToCsv(report);
  assert.ok(csv.includes('"Line one,\nline ""two"""'), "CSV escaping");
  const pdf = await reportToPdf(report);
  assert.ok(pdf.length > 1000 && Buffer.from(pdf.slice(0, 5)).toString() === "%PDF-");
  writeFileSync("/tmp/sample-report.pdf", pdf);
  console.log("CSV + PDF OK, pdf bytes:", pdf.length);
  console.log("ALL PIPELINE TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
