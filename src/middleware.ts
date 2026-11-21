import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/auth/callback"];

/** Explains a configuration problem instead of crashing with MIDDLEWARE_INVOCATION_FAILED. */
function configError(problem: string) {
  const html = `<!doctype html><html><body style="background:#000;color:#E6F1F4;font-family:system-ui;padding:48px;max-width:640px;margin:auto">
<h1 style="color:#22D3EE">CareerPilot isn't configured yet</h1>
<p>${problem}</p>
<p>In Vercel: Settings → Environment Variables. Fix the value, then Deployments → ⋯ → Redeploy and <b>untick "Use existing Build Cache"</b>. Variables starting with NEXT_PUBLIC_ are only picked up by a fresh build.</p>
</body></html>`;
  return new NextResponse(html, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url) return configError("NEXT_PUBLIC_SUPABASE_URL is missing.");
  if (!key) return configError("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url.replace(/\/$/, ""))) {
    return configError(
      `NEXT_PUBLIC_SUPABASE_URL doesn't look right. It should look like https://abcdefgh.supabase.co, with no quotes, spaces, or extra path such as /rest/v1.`,
    );
  }

  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path.startsWith(p));

  try {
    const supabase = createServerClient(url.replace(/\/$/, ""), key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user && !isPublic && !path.startsWith("/api/")) {
      const to = request.nextUrl.clone();
      to.pathname = "/login";
      return NextResponse.redirect(to);
    }
    if (user && path === "/login") {
      const to = request.nextUrl.clone();
      to.pathname = "/dashboard";
      return NextResponse.redirect(to);
    }
    return response;
  } catch (e) {
    // Never take the whole site down: log it and let the page handle auth itself.
    console.error("middleware auth check failed:", e);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
