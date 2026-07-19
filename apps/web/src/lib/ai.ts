import "server-only";
import { OpenRouterClient, type ChatMessage, type ToolDefinition } from "@1pacent/agents";

/**
 * The app's one chat client (v8 R8): Hermes-first, OpenRouter fallback.
 * With HERMES_URL + HERMES_API_KEY set, every completion routes through the
 * DEDICATED hermes-1pacent gateway (Felix's runtime — an OpenAI-compatible
 * /v1/chat/completions); any Hermes failure falls back to direct OpenRouter
 * in the same call, so the degraded ladder holds. Embeddings always go
 * direct (Hermes doesn't serve /embeddings).
 */

class HermesFirstClient extends OpenRouterClient {
  constructor(
    private readonly hermes: OpenRouterClient,
    directOpts: ConstructorParameters<typeof OpenRouterClient>[0],
  ) {
    super(directOpts);
  }

  override async chatCompletion(
    ...args: Parameters<OpenRouterClient["chatCompletion"]>
  ): ReturnType<OpenRouterClient["chatCompletion"]> {
    try {
      return await this.hermes.chatCompletion(...args);
    } catch (e) {
      console.warn("[ai] hermes-1pacent unavailable, falling back to OpenRouter:", e);
      return super.chatCompletion(...args);
    }
  }

  override async chatWithTools(
    ...args: Parameters<OpenRouterClient["chatWithTools"]>
  ): ReturnType<OpenRouterClient["chatWithTools"]> {
    try {
      return await this.hermes.chatWithTools(...args);
    } catch (e) {
      console.warn("[ai] hermes-1pacent unavailable (tools), falling back to OpenRouter:", e);
      return super.chatWithTools(...args);
    }
  }
}

/** The client every server-side AI call should use. Throws without an
 * OPENROUTER_API_KEY — same contract as before. */
export function aiClient(): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  const hermesUrl = process.env.HERMES_URL;
  const hermesKey = process.env.HERMES_API_KEY;
  if (hermesUrl && hermesKey) {
    const hermes = new OpenRouterClient({
      apiKey: hermesKey,
      baseUrl: `${hermesUrl.replace(/\/$/, "")}/v1`,
    });
    return new HermesFirstClient(hermes, { apiKey });
  }
  return new OpenRouterClient({ apiKey });
}

export type { ChatMessage, ToolDefinition };
