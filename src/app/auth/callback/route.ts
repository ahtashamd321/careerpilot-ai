import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";

// Handles email confirmation / magic-link redirects from Supabase Auth.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await serverClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  return NextResponse.redirect(new URL("/dashboard", url.origin));
}
