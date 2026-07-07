import { z } from "zod";
import { REQUEST_CATEGORIES } from "@1pacent/core";
import type { ChatMessage, OpenRouterClient } from "../openrouter-client";
import { SALLY_PROMPT_VERSION } from "./prompts";

/**
 * Sally's structured PROPOSAL — never the decision. Callers write this as
 * an event with `ai_meta` (model/promptVersion/confidence); packages/core's
 * `isUrgentCategory`/`decideApproval` make the actual urgency/approval call.
 */
export const sallyExtractionSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  category: z.enum(REQUEST_CATEGORIES),
  tenantStatedUrgency: z.enum(["emergency", "soon", "flexible"]),
  callOutFeeEstimateCents: z
    .object({ low: z.number().int().nonnegative(), high: z.number().int().nonnegative() })
    .nullable(),
  readyToDispatch: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type SallyExtraction = z.infer<typeof sallyExtractionSchema>;

export interface SallyProposal {
  extraction: SallyExtraction;
  aiMeta: { model: string; promptVersion: string; confidence: number };
}

// OpenAI's strict structured-output mode requires every object — including
// nested ones — to list ALL of its properties in `required`, even ones
// that are conceptually optional. Optionality is expressed via a nullable
// type instead of omission (confirmed against a live 400: "'required' is
// required to be supplied and to be an array including every key in
// properties" when callOutFeeEstimateCents.required was missing).
const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "category",
    "tenantStatedUrgency",
    "callOutFeeEstimateCents",
    "readyToDispatch",
    "confidence",
  ],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    category: { type: "string", enum: [...REQUEST_CATEGORIES] },
    tenantStatedUrgency: { type: "string", enum: ["emergency", "soon", "flexible"] },
    callOutFeeEstimateCents: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["low", "high"],
      properties: { low: { type: "integer" }, high: { type: "integer" } },
    },
    readyToDispatch: { type: "boolean" },
    confidence: { type: "number" },
  },
} as const;

const EXTRACTION_INSTRUCTIONS =
  "Given the conversation so far between Sally (intake assistant) and a tenant, extract the job " +
  "details as JSON matching the schema exactly. Set readyToDispatch=true only once title, " +
  "description, category, and urgency are all known with reasonable confidence. Set " +
  "callOutFeeEstimateCents to null if you haven't proposed a rough range yet. Output ONLY the " +
  "JSON object, no prose, no markdown fences.";

export interface ExtractSallyProposalParams {
  client: OpenRouterClient;
  model: string;
  transcript: Array<{ role: "tenant" | "sally"; content: string }>;
}

export async function extractSallyProposal(params: ExtractSallyProposalParams): Promise<SallyProposal> {
  const { client, model, transcript } = params;
  const messages: ChatMessage[] = [
    { role: "system", content: EXTRACTION_INSTRUCTIONS },
    ...transcript.map((m): ChatMessage => ({
      role: m.role === "tenant" ? "user" : "assistant",
      content: m.content,
    })),
    { role: "user", content: "Extract the JSON now." },
  ];

  const { content } = await client.chatCompletion({
    model,
    messages,
    temperature: 0,
    responseFormat: {
      type: "json_schema",
      json_schema: { name: "sally_extraction", strict: true, schema: EXTRACTION_JSON_SCHEMA },
    },
  });

  const extraction = sallyExtractionSchema.parse(parseJsonLoose(content));
  return {
    extraction,
    aiMeta: { model, promptVersion: SALLY_PROMPT_VERSION, confidence: extraction.confidence },
  };
}

/** Some models wrap JSON output in markdown fences even when asked not to. */
function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1]! : text;
  return JSON.parse(raw.trim());
}
