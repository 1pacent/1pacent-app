import type { ChatMessage, OpenRouterClient } from "../openrouter-client";
import { buildSallySystemPrompt, type SallyPromptContext } from "./prompts";

export interface SallyChatParams {
  client: OpenRouterClient;
  model: string;
  context: SallyPromptContext;
  /** Prior turns, oldest first — user (tenant) / assistant (Sally) only, no system message. */
  history: ChatMessage[];
  userMessage: string;
}

export interface SallyChatResult {
  reply: string;
}

/** One conversational turn. Extraction is a separate call (see extract.ts) — kept apart so a
 * plain chat reply is fast and doesn't need every turn to hit strict JSON mode. */
export async function runSallyTurn(params: SallyChatParams): Promise<SallyChatResult> {
  const { content } = await params.client.chatCompletion({
    model: params.model,
    messages: [
      { role: "system", content: buildSallySystemPrompt(params.context) },
      ...params.history,
      { role: "user", content: params.userMessage },
    ],
  });
  return { reply: content };
}
