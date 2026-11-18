"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { ActionResult } from "@/app/actions";

/** Button that runs a server action and shows its real result. */
export function ActionButton({
  action, children, className = "btn-ghost", confirm, onDone, title,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  onDone?: (r: ActionResult) => void;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        title={title}
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
            onDone?.(r);
            router.refresh();
          });
        }}
      >
        {pending ? "Working…" : children}
      </button>
      {msg && <span role="status" className={clsx("mt-1 max-w-xs text-xs", msg.ok ? "text-good" : "text-bad")}>{msg.text}</span>}
    </span>
  );
}

/** Form that posts FormData to a server action and shows the result. */
export function ActionForm({
  action, children, className, resetOnSuccess = false, onDone,
}: {
  action: (f: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onDone?: (r: ActionResult) => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await action(fd);
          setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
          if (r.ok && resetOnSuccess) ref.current?.reset();
          onDone?.(r);
          router.refresh();
        });
      }}
    >
      <fieldset disabled={pending} className="contents">{children}</fieldset>
      {pending && <p className="mt-2 text-sm text-mist">Working…</p>}
      {msg && !pending && <p role="status" className={clsx("mt-2 text-sm", msg.ok ? "text-good" : "text-bad")}>{msg.text}</p>}
    </form>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
