import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { adminClient } from "./supabase/admin";
import { istDate } from "./util";

export type ReportContent = {
  date: string;
  digest: string;
  research: { title: string; url: string; source: string; summary: string }[];
  newJobs: number;
  topMatches: { id: string; title: string; company: string; location: string; score: number; recommendation: string; url: string }[];
  recruiters: { name: string; designation: string; company: string; source_url: string | null }[];
  posts: { angle: string; content: string; hashtags: string[] }[];
  pendingApplications: { company: string; position: string; status: string; follow_up_at: string | null }[];
  actions: string[];
};

export async function runReportStep(userId: string): Promise<{ created: true; topMatches: number }> {
  const db = adminClient();
  const date = istDate();
  const since = new Date(Date.now() - 26 * 3600 * 1000).toISOString();

  const [digest, research, newJobs, top, recruiters, posts, apps] = await Promise.all([
    db.from("research_digests").select("digest").eq("user_id", userId).eq("run_date", date).maybeSingle(),
    db.from("research_items").select("title,url,source,summary").eq("user_id", userId).eq("run_date", date).limit(10),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("first_seen_at", since),
    db.from("jobs").select("id,title,company,location,score,match,apply_url").eq("user_id", userId).eq("status", "active")
      .order("score", { ascending: false }).order("first_seen_at", { ascending: false }).limit(5),
    db.from("recruiters").select("name,designation,company,source_url").eq("user_id", userId).gte("created_at", since).limit(10),
    db.from("posts").select("angle,content,hashtags").eq("user_id", userId).eq("run_date", date).neq("status", "discarded").limit(5),
    db.from("applications").select("company,position,status,follow_up_at").eq("user_id", userId)
      .in("status", ["saved", "to_apply", "applied", "assessment", "interview"]).order("follow_up_at", { ascending: true, nullsFirst: false }).limit(15),
  ]);

  const actions: string[] = [];
  const strong = (top.data ?? []).filter((j) => (j.score ?? 0) >= 80);
  if (strong.length) actions.push(`Review and apply to ${strong.length} strong match${strong.length > 1 ? "es" : ""}, starting with ${strong[0].title} at ${strong[0].company}.`);
  const today = date;
  const overdue = (apps.data ?? []).filter((a) => a.follow_up_at && a.follow_up_at <= today);
  if (overdue.length) actions.push(`Follow up on ${overdue.length} application${overdue.length > 1 ? "s" : ""}: ${overdue.map((a) => a.company).join(", ")}.`);
  const toApply = (apps.data ?? []).filter((a) => a.status === "to_apply");
  if (toApply.length) actions.push(`${toApply.length} application${toApply.length > 1 ? "s" : ""} marked "To apply" are waiting.`);
  if ((posts.data ?? []).length) actions.push("Pick one LinkedIn draft, edit it in your own words, and publish it.");
  const missing = new Map<string, number>();
  for (const j of top.data ?? []) for (const s of ((j.match as { missingSkills?: string[] })?.missingSkills ?? [])) missing.set(s, (missing.get(s) ?? 0) + 1);
  const gap = [...missing.entries()].sort((a, b) => b[1] - a[1])[0];
  if (gap) actions.push(`${gap[0]} appears in ${gap[1]} of your top matches but isn't on your profile. Consider a short project to cover it.`);

  const content: ReportContent = {
    date,
    digest: digest.data?.digest ?? "",
    research: research.data ?? [],
    newJobs: newJobs.count ?? 0,
    topMatches: (top.data ?? []).map((j) => ({
      id: j.id, title: j.title, company: j.company, location: j.location, score: j.score ?? 0,
      recommendation: (j.match as { recommendationText?: string })?.recommendationText ?? "", url: j.apply_url,
    })),
    recruiters: recruiters.data ?? [],
    posts: posts.data ?? [],
    pendingApplications: apps.data ?? [],
    actions,
  };
  const { error } = await db.from("reports").upsert({ user_id: userId, report_date: date, content }, { onConflict: "user_id,report_date" });
  if (error) throw new Error(`Saving report failed: ${error.message}`);
  return { created: true, topMatches: content.topMatches.length };
}

// ------------------------------------------------------------ exports
const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function reportToCsv(r: ReportContent): string {
  const rows: unknown[][] = [["section", "title", "detail", "extra", "link"]];
  r.topMatches.forEach((j) => rows.push(["top_match", `${j.title} at ${j.company}`, `${j.score}%`, j.recommendation, j.url]));
  r.research.forEach((x) => rows.push(["research", x.title, x.summary, x.source, x.url]));
  r.recruiters.forEach((x) => rows.push(["recruiter", x.name, x.designation, x.company, x.source_url]));
  r.posts.forEach((p) => rows.push(["linkedin_draft", p.angle, p.content, p.hashtags.join(" "), ""]));
  r.pendingApplications.forEach((a) => rows.push(["application", `${a.position} at ${a.company}`, a.status, a.follow_up_at ?? "", ""]));
  r.actions.forEach((a) => rows.push(["action", a, "", "", ""]));
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

// Standard PDF fonts only cover Latin-1, so other characters are transliterated or dropped.
const latin = (s: string) => s.replace(/₹/g, "Rs ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

export async function reportToPdf(r: ReportContent): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 50, LH = 14;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const cyan = rgb(0.03, 0.45, 0.56);

  const newPageIfNeeded = (need = LH) => { if (y - need < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const wrap = (text: string, f = font, size = 10) => {
    const out: string[] = [];
    for (const para of latin(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) > W - 2 * M && line) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    return out;
  };
  const write = (text: string, opts: { f?: typeof font; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    for (const l of wrap(text, opts.f ?? font, size)) {
      newPageIfNeeded(size + 4);
      page.drawText(l, { x: M, y, size, font: opts.f ?? font, color: opts.color ?? rgb(0.1, 0.1, 0.12) });
      y -= size + 4;
    }
    y -= opts.gap ?? 2;
  };
  const heading = (t: string) => { y -= 8; write(t, { f: bold, size: 13, color: cyan, gap: 4 }); };

  write("CareerPilot AI daily report", { f: bold, size: 20, gap: 2 });
  write(r.date, { size: 11, color: rgb(0.4, 0.4, 0.45), gap: 8 });
  heading("Recommended actions");
  r.actions.length ? r.actions.forEach((a) => write(`- ${a}`)) : write("Nothing urgent today.");
  heading(`Top matches (${r.newJobs} new jobs found)`);
  r.topMatches.forEach((j) => { write(`${j.score}%  ${j.title}, ${j.company} (${j.location})`, { f: bold }); write(j.recommendation); write(j.url, { size: 8, color: cyan, gap: 6 }); });
  if (r.digest) { heading("What matters today"); write(r.digest); }
  heading("Research");
  r.research.forEach((x) => { write(x.title, { f: bold }); write(x.summary); write(`${x.source}: ${x.url}`, { size: 8, color: cyan, gap: 6 }); });
  heading("Recruiters found");
  r.recruiters.length ? r.recruiters.forEach((x) => write(`${x.name}, ${x.designation}, ${x.company}${x.source_url ? ` (source: ${x.source_url})` : ""}`)) : write("None new today.");
  heading("LinkedIn drafts");
  r.posts.forEach((p, i) => { write(`Draft ${i + 1}: ${p.angle}`, { f: bold }); write(p.content); write(p.hashtags.join(" "), { color: cyan, gap: 8 }); });
  heading("Pending applications");
  r.pendingApplications.length ? r.pendingApplications.forEach((a) => write(`${a.position}, ${a.company}: ${a.status}${a.follow_up_at ? `, follow up ${a.follow_up_at}` : ""}`)) : write("None.");
  return pdf.save();
}
