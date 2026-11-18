import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/supabase/server";

const TABLES = ["profiles", "settings", "jobs", "applications", "application_materials", "recruiters", "posts", "research_items", "research_digests", "reports", "memory_notes", "notifications", "automation_runs"];

// Exports everything the user owns as one JSON file (RLS-scoped; tokens excluded).
export async function GET() {
  const auth = await getUserOrNull();
  if (!auth) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const t of TABLES) {
    const { data, error } = await auth.supabase.from(t).select("*").eq("user_id", auth.user.id);
    out[t] = error ? { error: error.message } : data;
  }
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="careerpilot-memory-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
