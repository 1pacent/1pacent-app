import { z } from "zod";
import { PLAYBOOK_KEYS, REQUEST_CATEGORIES } from "@1pacent/core";
import type { MessageContentPart, OpenRouterClient } from "../openrouter-client";
import { SALLY_PROMPT_VERSION } from "./prompts";

/**
 * The Button's one-shot triage (Developer Brief v8 §7): photo + a few words
 * → a structured PROPOSAL of category/playbook/title. Sally proposes; the
 * playbook table and the deterministic urgency list decide. Multimodal via
 * the gateway's vision-capable default model.
 */

export const intakeTriageSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  category: z.enum(REQUEST_CATEGORIES),
  suggestedPlaybook: z.enum(PLAYBOOK_KEYS),
  hazardWarning: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type IntakeTriage = z.infer<typeof intakeTriageSchema>;

const TRIAGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "category", "suggestedPlaybook", "hazardWarning", "confidence"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    category: { type: "string", enum: [...REQUEST_CATEGORIES] },
    suggestedPlaybook: { type: "string", enum: [...PLAYBOOK_KEYS] },
    hazardWarning: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
} as const;

const TRIAGE_INSTRUCTIONS =
  "You are Sally, triaging a home-repair request from a short description and (optionally) a photo. " +
  "Extract a concise title, a factual description of what is observably wrong (from the photo where it " +
  "helps — mention what you can see), the best-fit category, and the suggested playbook. Set " +
  "hazardWarning to a one-line instruction ONLY for genuine danger (gas smell, sparks, live water on " +
  "electrics) telling them to call 000 or their utility first; otherwise null. Never invent prices or " +
  "timings. Output ONLY the JSON object.";

export interface TriageParams {
  client: OpenRouterClient;
  model: string;
  description: string;
  /** Data-URL or https image, optional. */
  photoUrl?: string;
}

export interface TriageResult {
  triage: IntakeTriage;
  aiMeta: { model: string; promptVersion: string; confidence: number };
}

export async function triageIntake(params: TriageParams): Promise<TriageResult> {
  const parts: MessageContentPart[] = [{ type: "text", text: params.description || "(no text — photo only)" }];
  if (params.photoUrl) parts.push({ type: "image_url", image_url: { url: params.photoUrl } });

  const { content } = await params.client.chatCompletion({
    model: params.model,
    messages: [
      { role: "system", content: TRIAGE_INSTRUCTIONS },
      { role: "user", content: parts },
    ],
    temperature: 0,
    maxTokens: 500,
    responseFormat: {
      type: "json_schema",
      json_schema: { name: "intake_triage", strict: true, schema: TRIAGE_JSON_SCHEMA as unknown as Record<string, unknown> },
    },
  });

  const triage = intakeTriageSchema.parse(JSON.parse(content));
  return {
    triage,
    aiMeta: { model: params.model, promptVersion: SALLY_PROMPT_VERSION, confidence: triage.confidence },
  };
}
