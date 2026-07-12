/**
 * Thin OpenRouter (OpenAI-compatible) client. `fetchImpl` is injectable so
 * every caller in this package can be tested offline against a stub,
 * matching the mocked-client testing convention used across the workspace.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** OpenAI function-calling tool definition (OpenRouter passes it through). */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON schema for the arguments, strict mode (all fields required/nullable). */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Messages inside a tool loop: plain chat turns, the assistant turn that
 * requested tools, and the tool results fed back. */
export type ToolLoopMessage =
  | ChatMessage
  | {
      role: "assistant";
      content: string | null;
      tool_calls: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolTurn {
  reply?: string;
  toolCalls?: ToolCall[];
  /** Raw assistant message to append to the transcript before tool results. */
  assistantMessage?: ToolLoopMessage;
}

export interface JsonSchemaResponseFormat {
  type: "json_schema";
  json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: JsonSchemaResponseFormat;
}

export interface OpenRouterClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export class OpenRouterClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenRouterClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async chatCompletion(params: ChatCompletionParams): Promise<{ content: string }> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.4,
        max_tokens: params.maxTokens ?? 600,
        ...(params.responseFormat ? { response_format: params.responseFormat } : {}),
      }),
    });
    const body: unknown = await res.json();
    if (!res.ok) {
      throw new OpenRouterError(`OpenRouter chat completion failed (${res.status})`, res.status, body);
    }
    const content = (body as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]
      ?.message?.content;
    if (typeof content !== "string") {
      throw new OpenRouterError("OpenRouter response had no message content", res.status, body);
    }
    return { content };
  }

  /**
   * One turn of an OpenAI-format tool loop (Developer Brief v6 §2.1 — the one
   * genuinely new AI capability). The caller owns executing tool calls and
   * feeding results back via `messages`; this method never executes anything.
   */
  async chatWithTools(params: {
    model: string;
    messages: ToolLoopMessage[];
    tools: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<ToolTurn> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.4,
        max_tokens: params.maxTokens ?? 700,
        // Omit `tools` entirely when empty — some providers reject [].
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
    const body: unknown = await res.json();
    if (!res.ok) {
      throw new OpenRouterError(`OpenRouter tool completion failed (${res.status})`, res.status, body);
    }
    const message = (
      body as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      }
    ).choices?.[0]?.message;
    if (!message) {
      throw new OpenRouterError("OpenRouter tool response had no message", res.status, body);
    }

    const rawCalls = message.tool_calls ?? [];
    if (rawCalls.length > 0) {
      const toolCalls: ToolCall[] = rawCalls.map((c, i) => {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = c.function?.arguments ? (JSON.parse(c.function.arguments) as Record<string, unknown>) : {};
        } catch {
          parsed = {};
        }
        return { id: c.id ?? `call_${i}`, name: c.function?.name ?? "", arguments: parsed };
      });
      return {
        toolCalls,
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

    if (typeof message.content !== "string") {
      throw new OpenRouterError("OpenRouter tool response had neither content nor tool calls", res.status, body);
    }
    return { reply: message.content };
  }

  async embed(input: string, model: string): Promise<number[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input }),
    });
    const body: unknown = await res.json();
    if (!res.ok) {
      throw new OpenRouterError(`OpenRouter embedding failed (${res.status})`, res.status, body);
    }
    const embedding = (body as { data?: Array<{ embedding?: number[] }> }).data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new OpenRouterError("OpenRouter embedding response had no vector", res.status, body);
    }
    return embedding;
  }
}
