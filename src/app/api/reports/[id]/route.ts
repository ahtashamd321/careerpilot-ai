import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/supabase/server";
import { reportToCsv, reportToPdf, type ReportContent } from "@/lib/reports";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getUserOrNull();
  if (!auth) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const { data } = await auth.supabase.from("reports").select("report_date,content").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const content = data.content as ReportContent;
  const name = `careerpilot-report-${data.report_date}.${format}`;
  if (format === "pdf") {
    const bytes = await reportToPdf(content);
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"` } });
  }
  return new NextResponse(reportToCsv(content), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
