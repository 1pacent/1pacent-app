import { z } from "zod";
import type { OpenRouterClient } from "../openrouter-client";

/**
 * End-of-conversation only (never per-turn) — cheapest, avoids embedding
 * churn on partial/abandoned chats. Extracts curated, PII-minimized facts
 * worth remembering long-term, NOT a transcript dump: raw transcript stays
 * in sally_messages for audit and is never embedded. A curated fact list
 * can't leak unrelated PII into a similarity search the way raw transcript
 * chunks could.
 */

const memoryFactSchema = z.object({
  scopeLevel: z.enum(["contact", "property"]),
  chunkType: z.enum(["fact", "preference", "summary"]),
  content: z.string().min(1).max(400),
});
export type MemoryFactDraft = z.infer<typeof memoryFactSchema>;

const summarySchema = z.object({ facts: z.array(memoryFactSchema).max(10) });

const SUMMARIZE_INSTRUCTIONS =
  "Review this completed intake conversation between Sally and a tenant. Extract up to 10 durable " +
  "facts worth remembering for FUTURE conversations with this tenant or about this property — " +
  "recurring issues, access preferences, communication style. Do NOT include one-off details " +
  "already fully captured by the maintenance request itself (e.g. the specific fault just reported). " +
  "Do NOT include raw PII like phone numbers or emails. Each fact must be a short, standalone " +
  'sentence. Output ONLY JSON matching {"facts":[{"scopeLevel":"contact"|"property",' +
  '"chunkType":"fact"|"preference"|"summary","content":"..."}]}. If nothing durable is worth ' +
  "remembering, output an empty facts array.";

export interface SummarizeConversationParams {
  client: OpenRouterClient;
  model: string;
  transcript: Array<{ role: "tenant" | "sally"; content: string }>;
}

export async function summarizeConversationForMemory(
  params: SummarizeConversationParams,
): Promise<MemoryFactDraft[]> {
  const { client, model, transcript } = params;
  const transcriptText = transcript.map((m) => `${m.role}: ${m.content}`).join("\n");

  const { content } = await client.chatCompletion({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: SUMMARIZE_INSTRUCTIONS },
      { role: "user", content: transcriptText },
    ],
  });

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const parsed = JSON.parse((fenced ? fenced[1]! : content).trim());
  return summarySchema.parse(parsed).facts;
}
