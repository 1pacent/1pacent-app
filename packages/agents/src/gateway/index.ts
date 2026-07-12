import {
  OpenRouterClient,
  type ChatMessage,
  type ToolDefinition,
  type ToolLoopMessage,
  type ToolTurn,
} from "../openrouter-client";

/**
 * The AI gateway (Product Brief v7 §1): all model access flows through one
 * seam so reasoning can be re-homed onto the owned Hermes runtime by setting
 * env vars — no code change, no redeploy. Degraded-rung behaviour: Hermes
 * transport failure falls back to the direct provider with a console.warn,
 * never a user-facing error.
 */

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AiGateway {
  /** Which provider actually answers — surfaced for logging/ai_meta. */
  readonly providerName: "hermes" | "openrouter";
  chat(params: ChatParams): Promise<string>;
  chatWithTools(params: {
    model: string;
    messages: ToolLoopMessage[];
    tools: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<ToolTurn>;
}

export class OpenRouterProvider implements AiGateway {
  readonly providerName = "openrouter" as const;
  constructor(private readonly client: OpenRouterClient) {}

  async chat(params: ChatParams): Promise<string> {
    const { content } = await this.client.chatCompletion(params);
    return content;
  }

  chatWithTools(params: {
    model: string;
    messages: ToolLoopMessage[];
    tools: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<ToolTurn> {
    return this.client.chatWithTools(params);
  }
}

export interface HermesProviderOptions {
  url: string;
  apiKey?: string;
  /** Named Hermes agent for the invoke API. */
  agent?: string;
  /** When true, Hermes exposes an OpenAI-compatible /v1/chat/completions —
   * the full tool loop runs through Hermes-managed models. */
  openAiCompat?: boolean;
  /** Direct provider used for tool turns in invoke mode (logged, honest) and
   * as the transport-failure fallback. */
  fallback: AiGateway;
  fetchImpl?: typeof fetch;
}

export class HermesProvider implements AiGateway {
  readonly providerName = "hermes" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: HermesProviderOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
    };
  }

  private async withFallback<T>(op: () => Promise<T>, fallbackOp: () => Promise<T>): Promise<T> {
    // One retry, then the degraded rung — never a user-facing error.
    try {
      return await op();
    } catch {
      try {
        return await op();
      } catch (err) {
        console.warn(
          `[ai-gateway] Hermes transport failed twice; falling back to direct provider: ${err instanceof Error ? err.message : String(err)}`,
        );
        return fallbackOp();
      }
    }
  }

  async chat(params: ChatParams): Promise<string> {
    return this.withFallback(
      async () => {
        if (this.opts.openAiCompat) {
          const res = await this.fetchImpl(`${this.opts.url.replace(/\/$/, "")}/v1/chat/completions`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
              model: params.model,
              messages: params.messages,
              temperature: params.temperature ?? 0.4,
              max_tokens: params.maxTokens ?? 600,
            }),
          });
          if (!res.ok) throw new Error(`Hermes chat completions ${res.status}`);
          const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const content = body.choices?.[0]?.message?.content;
          if (typeof content !== "string") throw new Error("Hermes response had no content");
          return content;
        }
        // Invoke API (the shape n8n already uses): plain chat only.
        const agent = this.opts.agent ?? "sally";
        const res = await this.fetchImpl(`${this.opts.url.replace(/\/$/, "")}/agents/${agent}/invoke`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ messages: params.messages }),
        });
        if (!res.ok) throw new Error(`Hermes invoke ${res.status}`);
        const body = (await res.json()) as { reply?: string; content?: string; output?: string };
        const content = body.reply ?? body.content ?? body.output;
        if (typeof content !== "string") throw new Error("Hermes invoke response had no reply");
        return content;
      },
      () => this.opts.fallback.chat(params),
    );
  }

  async chatWithTools(params: {
    model: string;
    messages: ToolLoopMessage[];
    tools: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<ToolTurn> {
    if (!this.opts.openAiCompat) {
      // Invoke mode can't run a tool loop — hand tool turns to the direct
      // provider, honestly logged (Developer Brief v7 §1).
      console.warn("[ai-gateway] Hermes invoke mode has no tool loop; using direct provider for this turn");
      return this.opts.fallback.chatWithTools(params);
    }
    return this.withFallback(
      async () => {
        const res = await this.fetchImpl(`${this.opts.url.replace(/\/$/, "")}/v1/chat/completions`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            model: params.model,
            messages: params.messages,
            temperature: params.temperature ?? 0.4,
            max_tokens: params.maxTokens ?? 700,
            ...(params.tools.length > 0
              ? {
                  tools: params.tools.map((t) => ({
                    type: "function",
                    function: { name: t.name, description: t.description, parameters: t.parameters },
                  })),
                }
              : {}),
          }),
        });
        if (!res.ok) throw new Error(`Hermes tool completions ${res.status}`);
        const body = (await res.json()) as {
          choices?: Array<{
            message?: {
              content?: string | null;
              tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
            };
          }>;
        };
        const message = body.choices?.[0]?.message;
        if (!message) throw new Error("Hermes tool response had no message");
        const rawCalls = message.tool_calls ?? [];
        if (rawCalls.length > 0) {
          return {
            toolCalls: rawCalls.map((c, i) => {
              let parsed: Record<string, unknown> = {};
              try {
                parsed = c.function?.arguments
                  ? (JSON.parse(c.function.arguments) as Record<string, unknown>)
                  : {};
              } catch {
                parsed = {};
              }
              return { id: c.id ?? `call_${i}`, name: c.function?.name ?? "", arguments: parsed };
            }),
            assistantMessage: {
              role: "assistant",
              content: message.content ?? null,
              tool_calls: rawCalls.map((c, i) => ({
                id: c.id ?? `call_${i}`,
                type: "function" as const,
                function: { name: c.function?.name ?? "", arguments: c.function?.arguments ?? "{}" },
              })),
            },
          };
        }
        if (typeof message.content !== "string") throw new Error("Hermes tool response empty");
        return { reply: message.content };
      },
      () => this.opts.fallback.chatWithTools(params),
    );
  }
}

export interface ResolveGatewayEnv {
  HERMES_URL?: string;
  HERMES_API_KEY?: string;
  HERMES_AGENT?: string;
  HERMES_OPENAI_COMPAT?: string;
  OPENROUTER_API_KEY?: string;
}

/** Hermes if configured, else direct OpenRouter — identical behaviour
 * (Product Brief v7 §3: an adapter seam, not a mock). */
export function resolveGateway(
  env: ResolveGatewayEnv,
  fetchImpl?: typeof fetch,
): AiGateway | null {
  if (!env.OPENROUTER_API_KEY) return null;
  const direct = new OpenRouterProvider(
    new OpenRouterClient({ apiKey: env.OPENROUTER_API_KEY, fetchImpl }),
  );
  if (env.HERMES_URL) {
    return new HermesProvider({
      url: env.HERMES_URL,
      apiKey: env.HERMES_API_KEY,
      agent: env.HERMES_AGENT,
      openAiCompat: env.HERMES_OPENAI_COMPAT === "1",
      fallback: direct,
      fetchImpl,
    });
  }
  return direct;
}
