export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries with exponential backoff. Non-retryable errors can set `retryable = false`. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, attempts = 3, baseMs = 1500): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (e) {
      last = e;
      if ((e as { retryable?: boolean })?.retryable === false || i === attempts) break;
      await sleep(baseMs * 2 ** (i - 1));
    }
  }
  throw last;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public retryable = status >= 500 || status === 429) {
    super(message);
  }
}

export async function fetchJson<T = unknown>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new HttpError(res.status, `${res.status} from ${new URL(url).host}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "CareerPilotAI/1.0 (personal job research)" },
    });
    if (!res.ok) throw new HttpError(res.status, `${res.status} from ${new URL(url).host}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Today's date in IST as YYYY-MM-DD. */
export function istDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}
export function istHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(d)) % 24;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function fmtDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
