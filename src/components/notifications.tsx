"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import clsx from "clsx";
import { browserClient } from "@/lib/supabase/browser";
import { markNotifications, snoozeNotification } from "@/app/actions";

export type Notif = {
  id: string; kind: string; title: string; body: string; read: boolean; created_at: string;
  snoozed_until: string | null;
  data: { job_id?: string; apply_url?: string; score?: number; company?: string; location?: string; title?: string; why?: string; url?: string; post_id?: string };
};

export function NotificationCenter({ userId, initial, reminders, browserAlerts }: {
  userId: string; initial: Notif[]; reminders: Notif[]; browserAlerts: boolean;
}) {
  const [items, setItems] = useState<Notif[]>(initial);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Notif[]>(reminders.slice(0, 3));
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setItems(initial), [initial]);

  // Live pop-ups: Supabase Realtime pushes new rows the moment the scheduler inserts them.
  useEffect(() => {
    const supabase = browserClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as Notif;
        setItems((prev) => [n, ...prev].slice(0, 30));
        if (n.kind === "job_match" || n.kind === "error") setToasts((t) => [n, ...t].slice(0, 3));
        if (browserAlerts && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          new Notification(n.title, { body: n.body.slice(0, 180) });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, browserAlerts]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  const unread = items.filter((i) => !i.read).length;
  const dismissToast = (id: string) => setToasts((t) => t.filter((x) => x.id !== id));
  const markRead = async (id: string) => {
    setItems((p) => p.map((x) => (x.id === id ? { ...x, read: true } : x)));
    await markNotifications([id]);
  };

  return (
    <>
      <div className="relative" ref={panelRef}>
        <button type="button" aria-label={`Notifications, ${unread} unread`} aria-expanded={open}
          className="relative rounded-lg border border-line p-2 text-mist hover:text-cyan" onClick={() => setOpen((o) => !o)}>
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-cyan px-1 text-center text-[11px] font-semibold leading-5 text-black">{unread > 99 ? "99+" : unread}</span>
          )}
        </button>
        {open && (
          <div className="panel absolute right-0 z-40 mt-2 w-[min(92vw,380px)] overflow-hidden shadow-2xl shadow-cyan/5">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="font-display font-semibold">Notifications</span>
              {unread > 0 && (
                <button className="text-sm text-cyan hover:underline" onClick={async () => {
                  setItems((p) => p.map((x) => ({ ...x, read: true })));
                  await markNotifications("all");
                }}>Mark all read</button>
              )}
            </div>
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-mist">Nothing yet. Matches above your threshold show up here.</li>}
              {items.map((n) => (
                <li key={n.id} className={clsx("border-b border-line/60 px-4 py-3 text-sm", !n.read && "bg-cyan/[0.04]")}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={clsx("font-medium", n.kind === "error" ? "text-bad" : "text-paper")}>{n.title}</span>
                    {!n.read && <button className="shrink-0 text-xs text-mist hover:text-cyan" onClick={() => markRead(n.id)}>Mark read</button>}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-mist">{n.body.slice(0, 220)}</p>
                  <div className="mt-2 flex gap-3 text-xs text-mist/80">
                    <span>{new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                    {n.data?.job_id && <Link className="link" href={`/jobs/${n.data.job_id}`} onClick={() => { setOpen(false); markRead(n.id); }}>Review match</Link>}
                    {n.kind === "report" && <Link className="link" href="/reports" onClick={() => setOpen(false)}>Open report</Link>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Pop-ups */}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex w-[min(94vw,380px)] flex-col gap-3">
        {toasts.map((t) => (
          <div key={t.id} className={clsx("toast-in panel border-l-4 p-4 shadow-2xl shadow-black", t.kind === "error" ? "border-l-bad" : "border-l-cyan")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                {t.kind === "job_match" ? (
                  <>
                    <div className="font-display text-lg font-semibold text-paper">{t.data.title}</div>
                    <div className="text-sm text-mist">{t.data.company}, {t.data.location}</div>
                  </>
                ) : (
                  <div className="font-medium text-bad">{t.title}</div>
                )}
              </div>
              {t.kind === "job_match" && <span className="font-display text-2xl font-semibold text-good">{t.data.score}%</span>}
              <button aria-label="Dismiss" className="text-mist hover:text-paper" onClick={() => dismissToast(t.id)}><X size={16} /></button>
            </div>
            <p className="mt-2 text-sm text-paper/90">{(t.data.why ?? t.body).slice(0, 240)}</p>
            {t.kind === "job_match" && t.data.job_id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="btn-primary" href={t.data.apply_url ?? `/jobs/${t.data.job_id}`} target="_blank" rel="noopener noreferrer" onClick={() => { markRead(t.id); dismissToast(t.id); }}>View job</a>
                <Link className="btn-ghost" href={`/jobs/${t.data.job_id}`} onClick={() => { markRead(t.id); dismissToast(t.id); }}>Review match</Link>
                <button className="btn-ghost" onClick={async () => { dismissToast(t.id); await snoozeNotification(t.id, 4); router.refresh(); }}>Remind me later</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export function BrowserAlertPrompt() {
  const [state, setState] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => setState(typeof Notification === "undefined" ? "unsupported" : Notification.permission), []);
  if (state !== "default") return null;
  return (
    <button type="button" className="text-xs text-cyan hover:underline" onClick={async () => setState(await Notification.requestPermission())}>
      Allow desktop alerts
    </button>
  );
}
