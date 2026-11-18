import { adminClient } from "./supabase/admin";
import { optionalEnv } from "./env";
import type { Settings } from "./types";

type Kind = "job_match" | "error" | "report" | "info" | "linkedin";

export async function notify(
  userId: string,
  kind: Kind,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  settings?: Pick<Settings, "notify_in_app" | "notify_telegram" | "telegram_chat_id">,
) {
  const db = adminClient();
  // Errors are always recorded so failures are never silent.
  if (settings?.notify_in_app !== false || kind === "error") {
    const { error } = await db.from("notifications").insert({ user_id: userId, kind, title, body, data });
    if (error) console.error("notify insert failed", error.message);
  }
  if (settings?.notify_telegram && settings.telegram_chat_id) {
    await sendTelegram(settings.telegram_chat_id, `${title}\n\n${body}${data.url ? `\n${data.url}` : ""}`);
  }
}

export async function sendTelegram(chatId: string, text: string) {
  const token = optionalEnv("TELEGRAM_BOT_TOKEN");
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
    });
    if (!res.ok) return { ok: false, error: `Telegram ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
