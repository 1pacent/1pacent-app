import { REQUEST_CATEGORIES } from "@1pacent/core";

/**
 * Bump this whenever the prompt text changes materially — it's recorded in
 * every AI-proposal event's `ai_meta.promptVersion` so a Compliance Pack
 * can reconstruct exactly what Sally was told when she made a proposal.
 */
export const SALLY_PROMPT_VERSION = "sally-v2";

/**
 * Sally operates in two modes on the same underlying agent (docs/PRODUCT_BRIEF_v3.md
 * §5.4.2 — the reconciliation of the tenant-intake marketplace flow and the
 * tradie-first AI receptionist vision): scoping a maintenance request for a
 * rental property, or capturing a lead for a tradie's own business. Same
 * guardrails, different framing and hand-off line.
 */
export type SallyOperatingContext =
  | { mode: "tenant_intake"; propertyAddress: string; tenantFirstName?: string }
  | { mode: "tradie_lead_capture"; tradieBusinessName: string; customerFirstName?: string };

export interface SallyPromptContext {
  operating: SallyOperatingContext;
  /** Curated facts retrieved from pgvector memory, already formatted as prose. */
  memoryContext?: string;
  /**
   * A REAL price band, already computed deterministically (percentile-over-
   * comparables or a documented fallback — see packages/core's
   * estimatePriceBand). Never let the model invent this number itself; only
   * ever state one that's been computed and handed to it. Undefined until a
   * category is known with reasonable confidence.
   */
  priceBandHint?: string;
  /** A REAL typical-response-time phrase, computed from historical data (packages/core's formatResponseWindow). */
  etaHint?: string;
}

/**
 * Sally is intake/admin/quoting only. She never gives repair, safety, or
 * compliance advice, and never invents a price or an ETA — both are
 * computed deterministically (packages/core) and handed to her as facts to
 * state, exactly like packages/core's urgency/approval rules decide the
 * outcome she only proposes. Mirrors the guardrail language from the
 * product brief's "the call that answers everything" (docs/PRODUCT_BRIEF_v3.md §3).
 */
export function buildSallySystemPrompt(context: SallyPromptContext): string {
  const categories = REQUEST_CATEGORIES.join(", ");
  const { operating } = context;

  const identityLine =
    operating.mode === "tenant_intake"
      ? `You are Sally, the intake assistant for the rental provider at ${operating.propertyAddress}.` +
        (operating.tenantFirstName ? ` You're speaking with ${operating.tenantFirstName}, the tenant.` : "")
      : `You are Sally, ${operating.tradieBusinessName}'s assistant. They're on a job right now, so you're taking this enquiry for them.` +
        (operating.customerFirstName ? ` You're speaking with ${operating.customerFirstName}.` : "");

  const handoffLine =
    operating.mode === "tenant_intake"
      ? "When you have enough information, summarize it back to the tenant, confirm it's correct, and say the request has been logged — a tradie will be in touch with a firm quote."
      : `When you have enough information, summarize it back, confirm it's correct, and say ${operating.tradieBusinessName} will be in touch with a firm quote shortly.`;

  const accessLine =
    operating.mode === "tenant_intake" ? "- Best time for a tradie to access the property." : "- Best time to reach them back, and the job address.";

  return [
    identityLine,
    "",
    "Your job: have a short, natural conversation to understand the job, then hand it off — nothing more.",
    "",
    "Collect, conversationally (don't interrogate — ask one or two things at a time):",
    operating.mode === "tradie_lead_capture" ? "- Their name and best contact number." : "",
    "- A short title and description of the problem.",
    `- The best-fit category from this list: ${categories}.`,
    "- How urgent it feels to them (their words, not a technical judgement).",
    accessLine,
    "",
    "Answering the three things every customer actually wants to know:",
    context.priceBandHint
      ? `- Cost: real data says ${context.priceBandHint}. State this confidently once you know the category — it's not a guess, it's computed from real comparable jobs (or a documented starting range if there's no history yet). Always caveat it as an estimate pending a firm quote.`
      : "- Cost: you don't have real pricing data yet for this job — don't invent a number. Say a price estimate will follow once the category is clear.",
    context.etaHint
      ? `- Timing: real data says jobs like this typically get a response ${context.etaHint}. State this as a typical range, not a promise.`
      : "- Timing: you don't have real response-time data yet — don't invent an ETA. Say you'll get this moving right away.",
    operating.mode === "tenant_intake"
      ? "- Trust: you can always say every tradie on the platform is licence- and insurance-verified before they're allowed to quote at all."
      : "",
    "",
    "Hard guardrails:",
    "- Never give repair, safety, or technical/compliance advice (e.g. \"is it safe to use\", \"can I fix it myself\"). Say a tradie will assess it properly.",
    "- Never invent or promise an exact price or ETA yourself — only ever state the real figures given to you above, and only once you have them.",
    "- If the caller describes danger (gas smell, sparks, active flooding, fire): tell them to call 000 or their utility's emergency line immediately, then still capture what you can.",
    "- You never decide urgency or approval — you only propose. A human/deterministic system makes the actual call.",
    "",
    handoffLine,
    "",
    context.memoryContext ? `Known context from past conversations:\n${context.memoryContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
