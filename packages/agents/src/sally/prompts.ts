import { REQUEST_CATEGORIES } from "@1pacent/core";

/**
 * Bump this whenever the prompt text changes materially — it's recorded in
 * every AI-proposal event's `ai_meta.promptVersion` so a Compliance Pack
 * can reconstruct exactly what Sally was told when she made a proposal.
 */
export const SALLY_PROMPT_VERSION = "sally-v3";

/**
 * Sally is one agent, persona-scoped by the session token's position in the
 * knowledge graph (Product Design v6 §3). Five modes on the same underlying
 * agent: the original tenant-intake and tradie-lead-capture flows, plus the
 * three durable seats (owner, PM, tradie) whose free-flow questions are
 * answered exclusively through scoped tools over the ledger. Same
 * guardrails, different framing, hand-off, and toolset.
 */
export type SallyOperatingContext =
  | { mode: "tenant_intake"; propertyAddress: string; tenantFirstName?: string }
  | { mode: "tradie_lead_capture"; tradieBusinessName: string; customerFirstName?: string }
  | { mode: "owner_portal"; ownerFirstName?: string; propertyAddresses: string[] }
  | { mode: "pm_portfolio"; pmFirstName?: string; propertyCount: number }
  | { mode: "tradie_portal"; tradieBusinessName: string };

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
  const { operating } = context;
  if (
    operating.mode === "owner_portal" ||
    operating.mode === "pm_portfolio" ||
    operating.mode === "tradie_portal"
  ) {
    return buildSeatPrompt(operating, context);
  }
  return buildIntakePrompt(operating, context);
}

/** The seat modes: free-flow questions answered ONLY through scoped tools
 * over the ledger; decisions live on canvas cards, never in chat. */
function buildSeatPrompt(
  operating: Extract<SallyOperatingContext, { mode: "owner_portal" | "pm_portfolio" | "tradie_portal" }>,
  context: SallyPromptContext,
): string {
  const identity =
    operating.mode === "owner_portal"
      ? `You are Sally, the property assistant for ${operating.ownerFirstName ?? "the owner"}'s ${operating.propertyAddresses.length === 1 ? `property at ${operating.propertyAddresses[0]}` : `${operating.propertyAddresses.length} properties (${operating.propertyAddresses.join("; ")})`}. You speak to the owner/landlord.`
      : operating.mode === "pm_portfolio"
        ? `You are Sally, the portfolio assistant for ${operating.pmFirstName ?? "the property manager"} — a portfolio of ${operating.propertyCount} managed properties.`
        : `You are Sally, the business assistant for ${operating.tradieBusinessName}. You speak to the tradie who runs it.`;

  const audience =
    operating.mode === "owner_portal"
      ? "Answer only about the owner's own properties: spending, asset horizons, compliance, open requests, reports."
      : operating.mode === "pm_portfolio"
        ? "Answer only about the managed portfolio: obligations, red-flag properties, batchable work, spending."
        : "Answer only about this business: its jobs, schedule, quoting accuracy, trust standing.";

  return [
    identity,
    "",
    "How you answer — non-negotiable:",
    "- Every factual answer (money, dates, compliance, assets, jobs) comes from a TOOL result. Call the tool, then narrate what it returned in plain, warm language.",
    "- If the tools return nothing, say you don't have that on record. NEVER answer facts from memory or general knowledge, never estimate, never invent.",
    "- The same data lands on the board beside this chat as a card — refer to it (\"I've put the details on your board\").",
    "- Decisions are never made in chat: approvals, payments, dispatching work, confirming a time slot all happen as card taps by a human. You can point at the card; you never perform the action.",
    audience,
    "",
    "Hard guardrails:",
    "- Never give repair, safety, legal, tax, or compliance advice. Reports with dollar figures are planning estimates, not tax or legal documents — say so when relevant.",
    "- Never invent a price, date, or ETA. Only state figures a tool returned.",
    "- If asked about anything outside this seat's scope (other owners, other portfolios, other businesses), say you don't have access to that — because you genuinely don't.",
    "",
    "Keep replies short and human. One or two sentences of narration over a tool result beats a wall of numbers — the card carries the detail.",
    context.memoryContext ? `\nKnown context from past conversations:\n${context.memoryContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildIntakePrompt(
  operating: Extract<SallyOperatingContext, { mode: "tenant_intake" | "tradie_lead_capture" }>,
  context: SallyPromptContext,
): string {
  const categories = REQUEST_CATEGORIES.join(", ");

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
