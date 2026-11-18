import { NextResponse } from "next/server";
import { getUserOrNull } from "@/lib/supabase/server";
import { runStep } from "@/lib/automation";
import { STEPS, type Step } from "@/lib/types";

// Manual "Run now" from the dashboard. The browser calls one step per request
// so each fits inside Vercel's free-tier function time limit.
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await getUserOrNull();
  if (!auth) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { step, force } = (await request.json().catch(() => ({}))) as { step?: Step; force?: boolean };
  if (!step || !STEPS.includes(step)) return NextResponse.json({ error: `step must be one of ${STEPS.join(", ")}` }, { status: 400 });
  const result = await runStep(auth.user.id, step, { force: Boolean(force), trigger: "manual" });
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}
