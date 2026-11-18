import { requireUser } from "@/lib/supabase/server";
import { loadProfileAndSettings } from "@/lib/data";
import { Nav } from "@/components/nav";
import { BrowserAlertPrompt, NotificationCenter, type Notif } from "@/components/notifications";
import { signOut } from "@/app/actions";

export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const { profile, settings } = await loadProfileAndSettings(supabase, user.id); // seeds defaults on first visit
  const now = new Date().toISOString();
  const { data: notes } = await supabase.from("notifications").select("*").eq("user_id", user.id)
    .or(`snoozed_until.is.null,snoozed_until.lte.${now}`).order("created_at", { ascending: false }).limit(30);
  const reminders = (notes ?? []).filter((n) => !n.read && n.kind === "job_match" && n.snoozed_until && n.snoozed_until <= now);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="border-b border-line px-3 py-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="mb-4 px-3">
          <div className="font-display text-xl font-semibold text-paper">CareerPilot</div>
          <div className="text-xs text-mist">{profile.full_name}</div>
        </div>
        <Nav />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-end gap-3 border-b border-line bg-black/85 px-4 py-3 backdrop-blur sm:px-8">
          {settings.notify_browser && <BrowserAlertPrompt />}
          <NotificationCenter userId={user.id} initial={(notes ?? []) as Notif[]} reminders={reminders as Notif[]} browserAlerts={settings.notify_browser} />
          <form action={signOut}><button className="text-sm text-mist hover:text-paper">Sign out</button></form>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
