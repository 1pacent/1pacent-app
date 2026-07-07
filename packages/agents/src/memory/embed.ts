import { OpenRouterClient } from "../openrouter-client";

/**
 * Provider-swappable embedding function. OpenRouter's embeddings-endpoint
 * support was unconfirmed at design time (see docs/SALLY_MEMORY.md) — this
 * indirection means swapping providers doesn't ripple through callers.
 */
export type EmbedFn = (text: string) => Promise<number[]>;

export function createOpenRouterEmbedder(client: OpenRouterClient, model: string): EmbedFn {
  return (text: string) => client.embed(text, model);
}

/** Fallback if OpenRouter's embeddings endpoint doesn't pan out — a direct,
 * OpenAI-compatible embeddings call. Same shape, so callers don't change. */
export function createOpenAiCompatibleEmbedder(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}): EmbedFn {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async (text: string) => {
    const res = await fetchImpl(`${opts.baseUrl}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: opts.model, input: text }),
    });
    const body: unknown = await res.json();
    if (!res.ok) {
      throw new Error(`Embedding request failed (${res.status}): ${JSON.stringify(body)}`);
    }
    const embedding = (body as { data?: Array<{ embedding?: number[] }> }).data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error("Embedding response had no vector");
    }
    return embedding;
  };
}
