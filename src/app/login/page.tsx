"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = browserClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ ok: false, text: error.message });
      else router.replace("/dashboard");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setMsg({ ok: false, text: error.message });
      else if (data.session) router.replace("/dashboard");
      else setMsg({ ok: true, text: "Check your inbox to confirm your email, then sign in." });
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-semibold text-paper">CareerPilot AI</h1>
        <p className="mt-2 text-mist">Your daily job matches, LinkedIn drafts and application tracker in one place.</p>
        <form onSubmit={submit} className="panel mt-8 space-y-4 p-6">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</button>
          {msg && <p role="status" className={msg.ok ? "text-sm text-good" : "text-sm text-bad"}>{msg.text}</p>}
        </form>
        <button type="button" className="mt-4 text-sm text-mist hover:text-cyan" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
        <p className="mt-6 text-xs text-mist/70">This signs you into CareerPilot. LinkedIn is connected separately from Settings, through LinkedIn&apos;s own sign-in. Your LinkedIn password is never asked for or stored.</p>
      </div>
    </main>
  );
}
