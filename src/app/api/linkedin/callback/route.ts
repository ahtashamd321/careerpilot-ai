import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserOrNull } from "@/lib/supabase/server";
import { exchangeCode, saveConnection } from "@/lib/linkedin";
import { appUrl } from "@/lib/env";
import { errorMessage } from "@/lib/util";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(`${appUrl()}/settings?linkedin=${q}`);
  const store = await cookies();
  const saved = store.get("li_oauth_state")?.value;
  store.delete("li_oauth_state");

  const auth = await getUserOrNull();
  if (!auth) return NextResponse.redirect(`${appUrl()}/login`);
  if (url.searchParams.get("error")) return back(encodeURIComponent(url.searchParams.get("error_description") ?? "denied"));

  const [state, uid] = (saved ?? "").split(".");
  if (!state || state !== url.searchParams.get("state") || uid !== auth.user.id) return back("state_mismatch");
  const code = url.searchParams.get("code");
  if (!code) return back("missing_code");
  try {
    const token = await exchangeCode(code);
    await saveConnection(auth.user.id, token);
    return back("connected");
  } catch (e) {
    return back(encodeURIComponent(errorMessage(e).slice(0, 200)));
  }
}
