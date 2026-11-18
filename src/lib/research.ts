import { XMLParser } from "fast-xml-parser";
import { adminClient } from "./supabase/admin";
import { aiAvailable, generateJson } from "./ai";
import type { Settings } from "./types";
import { fetchText, istDate, stripHtml } from "./util";

// Research uses public RSS feeds: Google News search RSS (free, no key) plus
// official product blogs. Each item keeps its source link and publish date.
const OFFICIAL_FEEDS: { topic: string; url: string }[] = [
  { topic: "Power BI updates", url: "https://powerbi.microsoft.com/en-us/blog/feed/" },
  { topic: "Python releases", url: "https://blog.python.org/feeds/posts/default?alt=rss" },
];

type Item = { topic: string; title: string; url: string; source: string; published_at: string | null; snippet: string };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

function asArray<T>(x: T | T[] | undefined): T[] {
  return x === undefined ? [] : Array.isArray(x) ? x : [x];
}
function text(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "string" || typeof x === "number") return String(x);
  if (typeof x === "object" && "#text" in (x as Record<string, unknown>)) return String((x as Record<string, unknown>)["#text"]);
  return "";
}

export async function readFeed(url: string, topic: string): Promise<Item[]> {
  const xml = await fetchText(url);
  const doc = parser.parse(xml);
  const items = asArray(doc?.rss?.channel?.item);
  return items.map((it: Record<string, unknown>) => {
    const title = stripHtml(text(it.title));
    // Google News titles end with " - Publisher".
    const src = text(it.source) || title.split(" - ").pop() || new URL(url).host;
    return {
      topic,
      title,
      url: text(it.link),
      source: src,
      published_at: it.pubDate ? new Date(text(it.pubDate)).toISOString() : null,
      snippet: stripHtml(text(it.description)).slice(0, 400),
    };
  }).filter((i) => i.url && i.title);
}

function googleNews(query: string) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:3d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

export async function runResearchStep(userId: string, settings: Settings) {
  const db = adminClient();
  const runDate = istDate();
  const feeds = [
    ...settings.research_topics.map((t) => ({ topic: t, url: googleNews(t) })),
    ...OFFICIAL_FEEDS,
  ];
  const errors: string[] = [];
  const all: Item[] = [];
  const settled = await Promise.allSettled(feeds.map((f) => readFeed(f.url, f.topic)));
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const fresh = r.value.filter((x) => !x.published_at || Date.now() - new Date(x.published_at).getTime() < 7 * 86400000);
      all.push(...fresh.slice(0, 6));
    } else errors.push(`${feeds[i].topic}: ${r.reason}`);
  });

  // Skip anything already stored (unique on user_id + url).
  const { data: seen } = await db.from("research_items").select("url").eq("user_id", userId).in("url", all.map((a) => a.url).slice(0, 500));
  const seenSet = new Set((seen ?? []).map((s) => s.url));
  const fresh = all.filter((a, i) => !seenSet.has(a.url) && all.findIndex((b) => b.url === a.url) === i).slice(0, 40);

  let summaries: Record<string, string> = {};
  let digest = "";
  if (aiAvailable() && fresh.length) {
    try {
      const { data } = await generateJson<{ items: { i: number; summary: string }[]; digest: string }>(
        `You are a research assistant for an entry-level data analyst in India.
For each news item below, write a one or two sentence factual summary based ONLY on its title and snippet. Do not add facts that aren't there.
Then write "digest": 4-6 short bullet lines (plain text, each starting with "- ") on what matters today for someone job-hunting as a data analyst. Only use the items given.
Return JSON: {"items":[{"i":0,"summary":"..."}],"digest":"..."}

Items:
${fresh.map((f, i) => `[${i}] (${f.topic}) ${f.title}\n${f.snippet}`).join("\n\n")}`,
        { temperature: 0.3 },
      );
      for (const s of data.items ?? []) if (fresh[s.i]) summaries[fresh[s.i].url] = s.summary;
      digest = data.digest ?? "";
    } catch (e) {
      errors.push(`AI summary: ${e instanceof Error ? e.message : e}`);
      summaries = {};
    }
  }

  if (fresh.length) {
    const { error } = await db.from("research_items").upsert(
      fresh.map((f) => ({
        user_id: userId, run_date: runDate, topic: f.topic, title: f.title, url: f.url, source: f.source,
        published_at: f.published_at, summary: summaries[f.url] ?? f.snippet,
      })),
      { onConflict: "user_id,url", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Saving research failed: ${error.message}`);
  }
  if (digest) {
    await db.from("research_digests").upsert({ user_id: userId, run_date: runDate, digest }, { onConflict: "user_id,run_date" });
  }
  return { stored: fresh.length, feeds: feeds.length, errors };
}
