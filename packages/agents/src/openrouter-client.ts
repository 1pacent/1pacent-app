/**
 * Thin OpenRouter (OpenAI-compatible) client. `fetchImpl` is injectable so
 * every caller in this package can be tested offline against a stub,
 * matching the mocked-client testing convention used across the workspace.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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
