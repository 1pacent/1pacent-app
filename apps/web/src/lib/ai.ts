import "server-only";
import { OpenRouterClient } from "@1pacent/agents";

/**
 * The app's AI seam. `aiClient()` — the raw model, direct OpenRouter. Sally,
 * triage, and every extraction pipeline use this: they run structured prompts
 * with Zod-parsed outputs, which must hit the bare model.
 *
 * (The in-app "Ask Felix" concierge widget + /api/felix were removed to avoid
 * an unauthenticated, token-burning surface. Felix the agent still lives on
 * the hermes-1pacent gateway via email + Telegram, which have their own access
 * controls.)
 */

export function aiClient(): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  return new OpenRouterClient({ apiKey });
}
