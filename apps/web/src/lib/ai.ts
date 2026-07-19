import "server-only";
import { OpenRouterClient } from "@1pacent/agents";

/**
 * v8 R8: the app's AI seams, and why there are two.
 *
 * `aiClient()` — the raw model, direct OpenRouter. Sally, triage, and every
 * extraction pipeline use this: they run structured prompts with Zod-parsed
 * outputs, which MUST hit the bare model. (We tried routing them through the
 * hermes-1pacent gateway; the agent's persona/context contaminated the
 * structured outputs — e.g. "plumbing" instead of the enum
 * "plumbing_general" — so pipelines stay direct by design.)
 *
 * `askFelix()` — the agent. The hermes-1pacent gateway runs Felix (SOUL.md,
 * honcho memory, read-only ledger access) behind an OpenAI-compatible
 * endpoint; this is the concierge/support surface, not a model proxy.
 */

export function aiClient(): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  return new OpenRouterClient({ apiKey });
}

export interface FelixMessage {
  role: "user" | "assistant";
  content: string;
}

export function felixConfigured(): boolean {
  return Boolean(process.env.HERMES_URL && process.env.HERMES_API_KEY);
}

/** One Felix turn via the dedicated hermes-1pacent gateway. Throws when the
 * gateway is unreachable or unconfigured — callers decide the fallback copy. */
export async function askFelix(messages: FelixMessage[]): Promise<string> {
  const url = process.env.HERMES_URL;
  const apiKey = process.env.HERMES_API_KEY;
  if (!url || !apiKey) throw new Error("Felix (HERMES_URL/HERMES_API_KEY) not configured");
  const res = await fetch(`${url.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.HERMES_AGENT || "felix", messages }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Felix gateway ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const reply = json.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("Felix gateway returned no content");
  return reply;
}
