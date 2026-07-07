import { z } from "zod";
import { ACTOR_TYPES, REQUEST_EVENTS } from "../requests/state-machine";

/**
 * Append-only event log envelope (data-model fix #2 from the brief).
 * Events are never updated or deleted; current status columns are
 * projections. AI-proposed events carry model/prompt metadata so every
 * AI-influenced decision is reconstructable — that's what makes the
 * Compliance Pack audit-grade.
 */

export const AGGREGATE_TYPES = [
  "maintenance_request",
  "work_order",
  "property",
  "compliance_item",
  "quote",
] as const;

export type AggregateType = (typeof AGGREGATE_TYPES)[number];

export const eventEnvelopeSchema = z.object({
  orgId: z.string().uuid(),
  aggregateType: z.enum(AGGREGATE_TYPES),
  aggregateId: z.string().uuid(),
  eventType: z.string().min(1),
  actorType: z.enum(ACTOR_TYPES),
  /** User id, contact id, token id, or model identifier — depending on actorType. */
  actorId: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  /** Present when an AI proposal influenced this event. */
  aiMeta: z
    .object({
      model: z.string(),
      promptVersion: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const requestEventTypeSchema = z.enum(REQUEST_EVENTS);
