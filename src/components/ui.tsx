import clsx from "clsx";
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold text-paper">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-mist">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("panel p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold text-paper">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-mist">{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "cyan" | "good" | "warn" | "bad" }) {
  const tones = {
    neutral: "border-line text-mist",
    cyan: "border-cyan/40 text-cyan",
    good: "border-good/40 text-good",
    warn: "border-warn/40 text-warn",
    bad: "border-bad/40 text-bad",
  };
  return <span className={clsx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", tones[tone])}>{children}</span>;
}

export function scoreTone(score: number | null | undefined, threshold = 80): "good" | "cyan" | "warn" | "bad" {
  const s = score ?? 0;
  if (s >= threshold) return "good";
  if (s >= 65) return "cyan";
  if (s >= 50) return "warn";
  return "bad";
}

const TONE_HEX = { good: "#4ADE9B", cyan: "#22D3EE", warn: "#F5B94A", bad: "#F26D6D" };

/** The signature element: a ring showing the match score. */
export function ScoreRing({ score, size = 56, threshold = 80 }: { score: number; size?: number; threshold?: number }) {
  const stroke = Math.max(4, size / 12);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = TONE_HEX[scoreTone(score, threshold)];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Match score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(34,211,238,0.12)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="font-display absolute inset-0 flex items-center justify-center font-semibold text-paper" style={{ fontSize: size * 0.3 }}>
        {score}
      </span>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="text-sm text-mist">{label}</div>
      <div className="font-display mt-1 text-3xl font-semibold text-paper">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-mist">{hint}</div>}
    </div>
  );
}
