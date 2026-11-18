import { optionalEnv } from "./env";
import { HttpError, withRetry } from "./util";

export type AiOptions = {
  system?: string;
  json?: boolean;
  temperature?: number;
  /** Use Gemini's Google Search grounding (Gemini only; ignored for Ollama). */
  grounded?: boolean;
};
export type AiResult = { text: string; sources: { title: string; url: string }[] };

export function aiProvider(): "gemini" | "ollama" | null {
  const p = (optionalEnv("AI_PROVIDER") ?? "gemini").toLowerCase();
  if (p === "ollama") return "ollama";
  return optionalEnv("GEMINI_API_KEY") ? "gemini" : null;
}

export function aiAvailable(): boolean {
  return aiProvider() !== null;
}

export class AiUnavailableError extends Error {
  retryable = false;
  constructor() {
    super("No AI provider configured. Set GEMINI_API_KEY (free at aistudio.google.com) or AI_PROVIDER=ollama.");
  }
}

async function gemini(prompt: string, o: AiOptions): Promise<AiResult> {
  const model = optionalEnv("GEMINI_MODEL") ?? "gemini-2.5-flash";
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: o.temperature ?? 0.7,
      // JSON mode cannot be combined with tools, so grounded calls parse JSON from text.
      ...(o.json && !o.grounded ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
  if (o.grounded) body.tools = [{ google_search: {} }];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": optionalEnv("GEMINI_API_KEY")! },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new HttpError(res.status, `Gemini ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
    }[];
  };
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new HttpError(502, "Gemini returned an empty response");
  const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => ({ title: c.web?.title ?? "", url: c.web?.uri ?? "" }))
    .filter((s) => s.url);
  return { text, sources };
}

async function ollama(prompt: string, o: AiOptions): Promise<AiResult> {
  const base = (optionalEnv("OLLAMA_BASE_URL") ?? "http://localhost:11434").replace(/\/$/, "");
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: optionalEnv("OLLAMA_MODEL") ?? "llama3.1:8b",
      stream: false,
      ...(o.json ? { format: "json" } : {}),
      options: { temperature: o.temperature ?? 0.7 },
      messages: [
        ...(o.system ? [{ role: "system", content: o.system }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new HttpError(res.status, `Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return { text: data.message?.content ?? "", sources: [] };
}

export async function generate(prompt: string, o: AiOptions = {}): Promise<AiResult> {
  const p = aiProvider();
  if (!p) throw new AiUnavailableError();
  return withRetry(() => (p === "gemini" ? gemini(prompt, o) : ollama(prompt, o)), 3, 2000);
}

/** Extracts the first JSON object/array from model text (handles ``` fences). */
export function parseJsonLoose<T>(text: string): T {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const open = cleaned[start];
    const close = open === "[" ? "]" : "}";
    const end = cleaned.lastIndexOf(close);
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error("AI response was not valid JSON");
  }
}

export async function generateJson<T>(prompt: string, o: AiOptions = {}): Promise<{ data: T; sources: AiResult["sources"] }> {
  // One extra attempt if the model returns malformed JSON.
  for (let i = 0; i < 2; i++) {
    const r = await generate(prompt, { ...o, json: true });
    try {
      return { data: parseJsonLoose<T>(r.text), sources: r.sources };
    } catch (e) {
      if (i === 1) throw e;
    }
  }
  throw new Error("unreachable");
}

/** Shared honesty rules injected into every career-related prompt. */
export const HONESTY_RULES = `Hard rules:
- Never claim or imply professional Data Analyst experience. The candidate's only job so far was 1 year as a Customer Relationship Manager at Piramal Finance, which is NOT an analytics role. Analytics skills come from a certification and portfolio projects.
- You may describe transferable strengths from the CRM role (customer data handling, stakeholder communication, working with targets and reports) without relabelling the role.
- Never invent metrics, employers, promotions, certificates, results or testimonials.
- Never fabricate people, quotes or statistics. If unsure, leave it out.`;
