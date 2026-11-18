import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserOrNull } from "@/lib/supabase/server";
import { authorizeUrl } from "@/lib/linkedin";
import { appUrl, optionalEnv } from "@/lib/env";

export async function GET() {
  const auth = await getUserOrNull();
  if (!auth) return NextResponse.redirect(`${appUrl()}/login`);
  if (!optionalEnv("LINKEDIN_CLIENT_ID") || !optionalEnv("LINKEDIN_CLIENT_SECRET") || !optionalEnv("TOKEN_ENCRYPTION_KEY")) {
    return NextResponse.redirect(`${appUrl()}/settings?linkedin=not_configured`);
  }
  // CSRF protection: random state bound to this browser and user.
  const state = randomBytes(24).toString("hex");
  (await cookies()).set("li_oauth_state", `${state}.${auth.user.id}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/",
  });
  return NextResponse.redirect(authorizeUrl(state));
}
