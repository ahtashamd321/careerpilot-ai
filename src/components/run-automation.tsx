"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

const STEPS = [
  { id: "research", label: "Research trends and news" },
  { id: "jobs", label: "Find and score jobs" },
  { id: "recruiters", label: "Look up hiring contacts" },
  { id: "posts", label: "Write LinkedIn drafts" },
  { id: "report", label: "Build the daily report" },
] as const;

type State = "idle" | "running" | "success" | "skipped" | "failed";

export function RunAutomation() {
  const [states, setStates] = useState<Record<string, { s: State; note?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setStates({});
    for (const step of STEPS) {
      setStates((p) => ({ ...p, [step.id]: { s: "running" } }));
      try {
        const res = await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: step.id, force }) });
        const data = await res.json();
        const note = data.error ?? (data.stats ? summarize(data.stats) : undefined);
        setStates((p) => ({ ...p, [step.id]: { s: data.status ?? (res.ok ? "success" : "failed"), note } }));
      } catch (e) {
        setStates((p) => ({ ...p, [step.id]: { s: "failed", note: String(e) } }));
      }
      router.refresh();
    }
    setBusy(false);
  }

  const started = Object.keys(states).length > 0;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={run}>{busy ? "Running…" : "Run today's automation now"}</button>
        <label className="flex items-center gap-2 text-sm text-mist">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="accent-cyan" />
          Re-run steps already done today
        </label>
      </div>
      {started && (
        <ol className="mt-4 space-y-2">
          {STEPS.map((s) => {
            const st = states[s.id]?.s ?? "idle";
            return (
              <li key={s.id} className="flex items-start gap-3 text-sm">
                <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  st === "success" && "bg-good", st === "failed" && "bg-bad", st === "running" && "animate-pulse bg-cyan",
                  st === "skipped" && "bg-mist", st === "idle" && "bg-line")} />
                <div>
                  <span className={st === "idle" ? "text-mist" : "text-paper"}>{s.label}</span>
                  {states[s.id]?.note && <span className={clsx("block text-xs", st === "failed" ? "text-bad" : "text-mist")}>{states[s.id]?.note}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function summarize(stats: Record<string, unknown>): string {
  if (stats.reason) return String(stats.reason);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v === "number") parts.push(`${k}: ${v}`);
    else if (typeof v === "string" && k !== "created") parts.push(v);
    else if (Array.isArray(v) && v.length) parts.push(`${v.length} source warning${v.length > 1 ? "s" : ""}`);
  }
  return parts.join(", ");
}
