import {
  decideApproval,
  evaluateProperty,
  isUrgentCategory,
  projectState,
  transition,
  validateQuoteSubmission,
  type ActorType,
  type EvidenceRecord,
  type PropertyComplianceProfile,
  type PropertyComplianceStatus,
  type RequestCategory,
  type RequestEvent,
  type RequestState,
} from "@1pacent/core";
import type {
  AcceptQuoteResult,
  DataSource,
  DispatchQuotesResult,
  MintLinkResult,
  PmPortfolioContext,
  PropertyDetail,
  PropertySummary,
  QuoteContext,
  QuoteInvite,
  QuoteSummary,
  RateCard,
  RateCardItem,
  SallyConversationContext,
  SallyExtractionInput,
  SallyMemoryChunkView,
  SallyMessageView,
  TestLinkTargets,
  TradieLeadConversationContext,
  TradieLeadExtractionInput,
  TradieLeadSummary,
  TradiePortalContext,
} from "./data-types";

/**
 * In-memory demo repository. This is the seam where the Supabase-backed
 * repository plugs in (same function surface, rows instead of arrays);
 * until credentials are configured the app runs on this seeded org so
 * every flow is demonstrable end-to-end.
 *
 * All state transitions still go through @1pacent/core — the client never
 * computes approvals or statuses itself (api_contracts rule).
 */

export interface DemoProperty {
  id: string;
  address: string;
  suburb: string;
  profile: PropertyComplianceProfile;
  autoApproveCapCents: number;
  evidence: EvidenceRecord[];
  pmContactId?: string;
}

export interface DemoRequestEventRow {
  eventType: RequestEvent;
  actorType: ActorType;
  actorId: string;
  at: string;
  note?: string;
}

export interface DemoRequest {
  id: string;
  propertyId: string;
  title: string;
  description: string;
  category: RequestCategory;
  estimateCents: number | null;
  reportedAt: string;
  events: DemoRequestEventRow[];
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const properties: DemoProperty[] = [
  {
    id: "prop-fitzroy",
    address: "12 Rose Street",
    suburb: "Fitzroy VIC 3065",
    profile: { jurisdiction: "VIC", hasGas: true, hasPool: false },
    autoApproveCapCents: 50_000,
    evidence: [
      { requirementKey: "vic_smoke_alarm_check", completedAt: daysAgo(90) },
      { requirementKey: "vic_gas_safety_check", completedAt: daysAgo(800) }, // overdue → red
      { requirementKey: "vic_electrical_safety_check", completedAt: daysAgo(680) }, // due soon → amber
      { requirementKey: "vic_switchboard_rcd", completedAt: daysAgo(400) },
      { requirementKey: "vic_minimum_standards", completedAt: daysAgo(400) },
    ],
  },
  {
    id: "prop-richmond",
    address: "8/44 Swan Street",
    suburb: "Richmond VIC 3121",
    profile: { jurisdiction: "VIC", hasGas: false, hasPool: false },
    autoApproveCapCents: 30_000,
    pmContactId: "contact-pm-jordan",
    evidence: [
      { requirementKey: "vic_smoke_alarm_check", completedAt: daysAgo(30) },
      { requirementKey: "vic_electrical_safety_check", completedAt: daysAgo(100) },
      { requirementKey: "vic_switchboard_rcd", completedAt: daysAgo(100) },
      { requirementKey: "vic_minimum_standards", completedAt: daysAgo(100) },
    ],
  },
  {
    id: "prop-brunswick",
    address: "3 Sydney Road",
    suburb: "Brunswick VIC 3056",
    profile: { jurisdiction: "VIC", hasGas: true, hasPool: true },
    autoApproveCapCents: 0,
    evidence: [], // brand new — everything red
  },
];

const requests: DemoRequest[] = [
  {
    id: "req-hotwater",
    propertyId: "prop-fitzroy",
    title: "No hot water",
    description: "Hot water system stopped working last night. Cold showers only.",
    category: "failure_of_essential_service_hot_water",
    estimateCents: 68_000,
    reportedAt: daysAgo(1).toISOString(),
    events: [
      { eventType: "triage", actorType: "system", actorId: "triage-rules", at: daysAgo(1).toISOString() },
      { eventType: "auto_approve", actorType: "system", actorId: "approval-rules", at: daysAgo(1).toISOString(), note: "Urgent bypass (VIC essential service), under $2,500 cap" },
      { eventType: "schedule", actorType: "tradie", actorId: "contact-plumberpete", at: daysAgo(0).toISOString() },
    ],
  },
  {
    id: "req-fence",
    propertyId: "prop-richmond",
    title: "Back fence leaning",
    description: "Rear fence palings loose after the storm, leaning into the laneway.",
    category: "garden_external",
    estimateCents: 145_000,
    reportedAt: daysAgo(3).toISOString(),
    events: [
      { eventType: "triage", actorType: "agency_user", actorId: "user-demo-pm", at: daysAgo(2).toISOString() },
      { eventType: "request_approval", actorType: "agency_user", actorId: "user-demo-pm", at: daysAgo(2).toISOString() },
    ],
  },
  {
    id: "req-tap",
    propertyId: "prop-richmond",
    title: "Dripping kitchen tap",
    description: "Kitchen mixer tap drips constantly.",
    category: "plumbing_general",
    estimateCents: 18_000,
    reportedAt: daysAgo(10).toISOString(),
    events: [
      { eventType: "triage", actorType: "system", actorId: "triage-rules", at: daysAgo(10).toISOString() },
      { eventType: "auto_approve", actorType: "system", actorId: "approval-rules", at: daysAgo(10).toISOString(), note: "Under $300 auto-approve cap" },
      { eventType: "schedule", actorType: "tradie", actorId: "contact-plumberpete", at: daysAgo(8).toISOString() },
      { eventType: "start_work", actorType: "tradie", actorId: "contact-plumberpete", at: daysAgo(7).toISOString() },
      { eventType: "submit_evidence", actorType: "tradie", actorId: "contact-plumberpete", at: daysAgo(7).toISOString() },
      { eventType: "verify", actorType: "tenant", actorId: "token-tenant-1", at: daysAgo(6).toISOString() },
      { eventType: "invoice", actorType: "tradie", actorId: "contact-plumberpete", at: daysAgo(5).toISOString() },
    ],
  },
];

/** Demo contacts: 3 seeded tradies, the demo tenant Sally talks to, and a property manager. */
interface DemoContact {
  id: string;
  kind: "tenant" | "tradie" | "owner" | "property_manager" | "customer";
  fullName: string;
  email: string;
}

const contacts: DemoContact[] = [
  { id: "contact-tenant-1", kind: "tenant", fullName: "Priya Nair", email: "mac@1pacent.com" },
  { id: "contact-pm-jordan", kind: "property_manager", fullName: "Jordan Blake", email: "mac@1pacent.com" },
  { id: "contact-tradie-john", kind: "tradie", fullName: "John Snow", email: "mac@1pacent.com" },
  { id: "contact-tradie-leo", kind: "tradie", fullName: "Leo Baker", email: "mac@1pacent.com" },
  { id: "contact-tradie-sarah", kind: "tradie", fullName: "Sarah Mannis", email: "mac@1pacent.com" },
];
let demoContactSeq = 0;

interface DemoSallyConversation {
  id: string;
  contactId: string;
  propertyId?: string;
  tradieContactId?: string;
  status: "active" | "completed" | "abandoned";
  requestId?: string;
  tradieLeadId?: string;
}
const sallyConversations: DemoSallyConversation[] = [];

interface DemoSallyMessage {
  conversationId: string;
  role: "tenant" | "sally";
  content: string;
}
const sallyMessages: DemoSallyMessage[] = [];

interface DemoMemoryChunk {
  contactId: string;
  propertyId: string | null;
  scopeLevel: "contact" | "property";
  chunkType: "fact" | "preference" | "summary";
  content: string;
  embedding: number[];
}
const sallyMemoryChunks: DemoMemoryChunk[] = [];

interface DemoQuote {
  id: string;
  requestId: string;
  tradieContactId: string;
  status: "invited" | "submitted" | "declined" | "expired" | "accepted" | "not_selected";
  quoteCents: number | null;
  callOutFeeCents: number | null;
  note: string | null;
  createdAt: string;
  submittedAt: string | null;
}
const quotes: DemoQuote[] = [];

interface DemoRateCard {
  tradieContactId: string;
  callOutFeeCents: number;
  hourlyRateCents: number;
  items: Array<{ category: RequestCategory; flatPriceCents: number | null; typicalMinutes: number | null }>;
}
const rateCards: DemoRateCard[] = [
  {
    tradieContactId: "contact-tradie-john",
    callOutFeeCents: 8_000,
    hourlyRateCents: 12_000,
    items: [{ category: "electrical_general", flatPriceCents: 18_000, typicalMinutes: 90 }],
  },
];

interface DemoTradieLead {
  id: string;
  tradieContactId: string;
  customerContactId: string;
  title: string;
  description: string;
  category: RequestCategory;
  status: "new" | "quoted" | "accepted" | "closed";
  suggestedQuoteCents: number | null;
  suggestedCallOutFeeCents: number | null;
  createdAt: string;
}
const tradieLeads: DemoTradieLead[] = [];

/** Demo stand-ins for hashed access_tokens rows. Tradie-job tokens are issued
 * dynamically by dispatchQuotesForRequest, so this map is mutable. */
type DemoTokenScope =
  | "tenant_intake"
  | "landlord_approval"
  | "tradie_job"
  | "tradie_portal"
  | "pm_portfolio"
  | "tradie_lead_intake";
const demoTokens: Record<string, { scope: DemoTokenScope; aggregateId: string; contactId?: string }> = {
  "demo-intake": { scope: "tenant_intake", aggregateId: "prop-fitzroy", contactId: "contact-tenant-1" },
  "demo-approval": { scope: "landlord_approval", aggregateId: "req-fence" },
  "demo-tradie-portal": {
    scope: "tradie_portal",
    aggregateId: "contact-tradie-john",
    contactId: "contact-tradie-john",
  },
  "demo-pm-portfolio": {
    scope: "pm_portfolio",
    aggregateId: "contact-pm-jordan",
    contactId: "contact-pm-jordan",
  },
  "demo-tradie-lead-intake": {
    scope: "tradie_lead_intake",
    aggregateId: "contact-tradie-john",
  },
};
let demoTokenSeq = 0;
function issueDemoToken(scope: DemoTokenScope, aggregateId: string, contactId?: string): string {
  const token = `demo-${scope}-${++demoTokenSeq}`;
  demoTokens[token] = { scope, aggregateId, contactId };
  return token;
}

export function listProperties(): Array<
  DemoProperty & { compliance: PropertyComplianceStatus; openRequests: number }
> {
  const today = new Date();
  return properties.map((p) => ({
    ...p,
    compliance: evaluateProperty(p.profile, p.evidence, today),
    openRequests: requests.filter(
      (r) => r.propertyId === p.id && !["closed", "cancelled"].includes(requestState(r)),
    ).length,
  }));
}

export function getProperty(id: string) {
  const p = properties.find((x) => x.id === id);
  if (!p) return null;
  return {
    ...p,
    compliance: evaluateProperty(p.profile, p.evidence, new Date()),
    requests: requests
      .filter((r) => r.propertyId === p.id)
      .map((r) => ({ ...r, state: requestState(r) })),
  };
}

export function requestState(r: DemoRequest): RequestState {
  return projectState(r.events);
}

export function getRequest(id: string) {
  const r = requests.find((x) => x.id === id);
  if (!r) return null;
  return { ...r, state: requestState(r), property: properties.find((p) => p.id === r.propertyId) ?? null };
}

export function resolveDemoToken(token: string) {
  return demoTokens[token] ?? null;
}

export interface IntakeInput {
  propertyId: string;
  title: string;
  description: string;
  category: RequestCategory;
}

/** Tenant intake: creates the request, triages, and applies approval rules. */
export function submitIntake(input: IntakeInput): { requestId: string; state: RequestState; urgent: boolean } {
  const property = properties.find((p) => p.id === input.propertyId);
  if (!property) throw new Error("Unknown property");

  const urgent = isUrgentCategory(input.category);
  const now = new Date().toISOString();
  const events: DemoRequestEventRow[] = [
    { eventType: "triage", actorType: "system", actorId: "triage-rules", at: now },
  ];

  // No estimate yet at intake: only the urgent bypass can auto-approve here.
  const decision = decideApproval({
    category: input.category,
    estimateCents: 0,
    policy: { autoApproveCapCents: property.autoApproveCapCents },
  });
  if (urgent && decision.outcome === "auto_approved") {
    events.push({
      eventType: "auto_approve",
      actorType: "system",
      actorId: "approval-rules",
      at: now,
      note: "Urgent bypass (VIC urgent repairs list)",
    });
  } else if (decision.outcome === "requires_landlord_approval" || !urgent) {
    events.push({
      eventType: "request_approval",
      actorType: "system",
      actorId: "approval-rules",
      at: now,
    });
  }

  const request: DemoRequest = {
    id: `req-${Math.random().toString(36).slice(2, 8)}`,
    propertyId: input.propertyId,
    title: input.title,
    description: input.description,
    category: input.category,
    estimateCents: null,
    reportedAt: now,
    events,
  };
  requests.push(request);
  return { requestId: request.id, state: requestState(request), urgent };
}

function decideByTokenInternal(
  token: string,
  decision: "approve" | "decline",
): { ok: true; state: RequestState } | { ok: false; error: string } {
  const resolved = resolveDemoToken(token);
  if (!resolved || resolved.scope !== "landlord_approval") {
    return { ok: false, error: "This approval link is invalid or has expired." };
  }
  const request = requests.find((r) => r.id === resolved.aggregateId);
  if (!request) return { ok: false, error: "Request not found." };

  const current = requestState(request);
  const result = transition(current, decision, "landlord");
  if (!result.ok) {
    return { ok: false, error: `This request is ${current.replace(/_/g, " ")} — no decision is pending.` };
  }
  request.events.push({
    eventType: decision,
    actorType: "landlord",
    actorId: `token:${token}`,
    at: new Date().toISOString(),
  });
  return { ok: true, state: result.state };
}

function decideByRequestIdInternal(
  requestId: string,
  decision: "approve" | "decline",
): { ok: true; state: RequestState } | { ok: false; error: string } {
  const request = requests.find((r) => r.id === requestId);
  if (!request) return { ok: false, error: "Request not found." };

  const current = requestState(request);
  const result = transition(current, decision, "landlord");
  if (!result.ok) {
    return { ok: false, error: `This request is ${current.replace(/_/g, " ")} — no decision is pending.` };
  }
  request.events.push({
    eventType: decision,
    actorType: "landlord",
    actorId: "dashboard",
    at: new Date().toISOString(),
  });
  return { ok: true, state: result.state };
}

/** Demo store exposed through the shared DataSource surface (see data.ts). */
export const demoData: DataSource = {
  async listProperties(): Promise<PropertySummary[]> {
    return listProperties().map((p) => ({
      id: p.id,
      address: p.address,
      suburb: p.suburb,
      autoApproveCapCents: p.autoApproveCapCents,
      compliance: p.compliance,
      openRequests: p.openRequests,
    }));
  },

  async getProperty(id: string): Promise<PropertyDetail | null> {
    const p = getProperty(id);
    if (!p) return null;
    return {
      id: p.id,
      address: p.address,
      suburb: p.suburb,
      autoApproveCapCents: p.autoApproveCapCents,
      compliance: p.compliance,
      openRequests: p.requests.filter((r) => !["closed", "cancelled"].includes(r.state)).length,
      requests: p.requests.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        estimateCents: r.estimateCents,
        state: r.state,
        events: r.events.map((e) => ({ eventType: e.eventType, actorType: e.actorType, note: e.note })),
      })),
    };
  },

  async getIntakeContext(token: string) {
    const resolved = resolveDemoToken(token);
    if (resolved?.scope !== "tenant_intake") return null;
    const p = getProperty(resolved.aggregateId);
    if (!p) return null;
    return { property: { id: p.id, address: p.address, suburb: p.suburb } };
  },

  async lodgeIntake(token: string, input) {
    const resolved = resolveDemoToken(token);
    if (resolved?.scope !== "tenant_intake") {
      return { ok: false as const, error: "This link is invalid or has expired. Ask your rental provider for a new one." };
    }
    const result = submitIntake({ propertyId: resolved.aggregateId, ...input });
    return { ok: true as const, ...result };
  },

  async getApprovalContext(token: string) {
    const resolved = resolveDemoToken(token);
    if (resolved?.scope !== "landlord_approval") return null;
    const r = getRequest(resolved.aggregateId);
    if (!r || !r.property) return null;
    return {
      request: {
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        estimateCents: r.estimateCents,
        address: `${r.property.address}, ${r.property.suburb}`,
      },
    };
  },

  async decideApprovalByToken(token: string, decision: "approve" | "decline") {
    return decideByTokenInternal(token, decision);
  },

  async decideApprovalByRequestId(requestId: string, decision: "approve" | "decline") {
    return decideByRequestIdInternal(requestId, decision);
  },

  async startSallyConversation(token: string): Promise<SallyConversationContext | null> {
    const resolved = demoTokens[token];
    if (resolved?.scope !== "tenant_intake" || !resolved.contactId) return null;
    const property = properties.find((p) => p.id === resolved.aggregateId);
    const contact = contacts.find((c) => c.id === resolved.contactId);
    if (!property || !contact) return null;

    let convo = sallyConversations.find((c) => c.contactId === contact.id && c.status === "active");
    if (!convo) {
      convo = {
        id: `convo-${Math.random().toString(36).slice(2, 8)}`,
        contactId: contact.id,
        propertyId: property.id,
        status: "active",
      };
      sallyConversations.push(convo);
    }

    return {
      conversationId: convo.id,
      contactId: contact.id,
      propertyId: property.id,
      propertyAddress: property.address,
      propertySuburb: property.suburb,
      tenantFirstName: contact.fullName.split(" ")[0],
    };
  },

  async appendSallyMessage(conversationId: string, role: "tenant" | "sally", content: string): Promise<void> {
    sallyMessages.push({ conversationId, role, content });
  },

  async getSallyMessages(conversationId: string): Promise<SallyMessageView[]> {
    return sallyMessages.filter((m) => m.conversationId === conversationId).map((m) => ({ role: m.role, content: m.content }));
  },

  async retrieveSallyMemory(contactId: string, queryEmbedding: number[]): Promise<SallyMemoryChunkView[]> {
    // Demo store: plain cosine similarity in JS (no pgvector to lean on).
    const candidates = sallyMemoryChunks.filter((c) => c.contactId === contactId);
    if (candidates.length === 0 || queryEmbedding.length === 0) return [];
    const scored = candidates
      .map((c) => ({ chunk: c, score: cosineSimilarity(c.embedding, queryEmbedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return scored.map((s) => ({ content: s.chunk.content }));
  },

  async writeSallyMemory(params): Promise<void> {
    const { contactId, propertyId, chunks } = params;
    for (const c of chunks) {
      sallyMemoryChunks.push({
        contactId,
        propertyId: c.scopeLevel === "property" ? (propertyId ?? null) : null,
        scopeLevel: c.scopeLevel,
        chunkType: c.chunkType,
        content: c.content,
        embedding: c.embedding,
      });
    }
  },

  async completeSallyConversation(conversationId: string, extraction: SallyExtractionInput) {
    const convo = sallyConversations.find((c) => c.id === conversationId);
    if (!convo) return { ok: false as const, error: "Conversation not found." };
    if (convo.status === "completed") {
      return { ok: false as const, error: "This conversation has already been completed." };
    }
    const property = properties.find((p) => p.id === convo.propertyId);
    if (!property) return { ok: false as const, error: "Property not found." };

    const result = submitIntake({
      propertyId: property.id,
      title: extraction.title,
      description: extraction.description,
      category: extraction.category,
    });
    const request = requests.find((r) => r.id === result.requestId);
    if (request) {
      request.events[0] = { ...request.events[0]!, actorId: "sally" };
    }
    convo.status = "completed";
    convo.requestId = result.requestId;
    return { ok: true as const, ...result };
  },

  async dispatchQuotesForRequest(requestId: string): Promise<DispatchQuotesResult | { ok: false; error: string }> {
    const request = requests.find((r) => r.id === requestId);
    if (!request) return { ok: false, error: "Request not found." };
    const current = requestState(request);
    const result = transition(current, "request_quotes", "system");
    if (!result.ok) return { ok: false, error: `Cannot request quotes from state "${current}".` };

    const property = properties.find((p) => p.id === request.propertyId);
    const tradies = contacts.filter((c) => c.kind === "tradie").slice(0, 3);
    if (tradies.length === 0) return { ok: false, error: "No tradie contacts configured for this org." };

    request.events.push({
      eventType: "request_quotes",
      actorType: "system",
      actorId: "quote-dispatch",
      at: new Date().toISOString(),
    });

    const invites: QuoteInvite[] = tradies.map((tradie) => {
      const quoteId = `quote-${Math.random().toString(36).slice(2, 8)}`;
      quotes.push({
        id: quoteId,
        requestId: request.id,
        tradieContactId: tradie.id,
        status: "invited",
        quoteCents: null,
        callOutFeeCents: null,
        note: null,
        createdAt: new Date().toISOString(),
        submittedAt: null,
      });
      const token = issueDemoToken("tradie_job", quoteId, tradie.id);
      return { quoteId, tradieContactId: tradie.id, tradieName: tradie.fullName, tradieEmail: tradie.email, token };
    });

    return {
      ok: true,
      invites,
      requestTitle: request.title,
      requestDescription: request.description,
      propertyAddress: property ? `${property.address}, ${property.suburb}` : "",
    };
  },

  async getQuoteContext(token: string): Promise<QuoteContext | null> {
    const resolved = demoTokens[token];
    if (resolved?.scope !== "tradie_job") return null;
    const quote = quotes.find((q) => q.id === resolved.aggregateId);
    if (!quote) return null;
    const request = requests.find((r) => r.id === quote.requestId);
    if (!request) return null;
    const property = properties.find((p) => p.id === request.propertyId);
    const tradie = contacts.find((c) => c.id === quote.tradieContactId);

    let suggestedQuoteCents: number | undefined;
    let suggestedCallOutFeeCents: number | undefined;
    const rateCard = rateCards.find((c) => c.tradieContactId === quote.tradieContactId);
    if (rateCard) {
      suggestedCallOutFeeCents = rateCard.callOutFeeCents;
      const item = rateCard.items.find((i) => i.category === request.category);
      if (item?.flatPriceCents != null) {
        suggestedQuoteCents = item.flatPriceCents;
      } else if (item?.typicalMinutes != null) {
        suggestedQuoteCents = Math.round((rateCard.hourlyRateCents * item.typicalMinutes) / 60);
      }
    }

    return {
      quoteId: quote.id,
      requestTitle: request.title,
      requestDescription: request.description,
      propertyAddress: property ? `${property.address}, ${property.suburb}` : "",
      tradieName: tradie?.fullName ?? "there",
      suggestedQuoteCents,
      suggestedCallOutFeeCents,
    };
  },

  async submitQuoteByToken(token: string, input: { quoteCents: number; callOutFeeCents: number; note?: string }) {
    const resolved = demoTokens[token];
    if (resolved?.scope !== "tradie_job") {
      return { ok: false as const, error: "This quote link is invalid or has expired." };
    }
    try {
      validateQuoteSubmission({
        quoteCents: input.quoteCents,
        callOutFeeCents: input.callOutFeeCents,
        note: input.note,
      });
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Invalid quote amount." };
    }
    const quote = quotes.find((q) => q.id === resolved.aggregateId);
    if (!quote) return { ok: false as const, error: "Quote not found." };
    if (quote.status !== "invited") {
      return { ok: false as const, error: "This quote has already been submitted or is no longer open." };
    }
    quote.status = "submitted";
    quote.quoteCents = input.quoteCents;
    quote.callOutFeeCents = input.callOutFeeCents;
    quote.note = input.note ?? null;
    quote.submittedAt = new Date().toISOString();
    return { ok: true as const };
  },

  async listQuotesForRequest(requestId: string): Promise<QuoteSummary[]> {
    return quotes
      .filter((q) => q.requestId === requestId)
      .map((q) => {
        const tradie = contacts.find((c) => c.id === q.tradieContactId);
        return {
          quoteId: q.id,
          tradieContactId: q.tradieContactId,
          tradieName: tradie?.fullName ?? "Unknown",
          tradieEmail: tradie?.email ?? "",
          status: q.status,
          quoteCents: q.quoteCents,
          callOutFeeCents: q.callOutFeeCents,
          note: q.note,
          respondedWithinMinutes: q.submittedAt
            ? (new Date(q.submittedAt).getTime() - new Date(q.createdAt).getTime()) / 60_000
            : null,
        };
      });
  },

  async acceptQuote(requestId: string, quoteId: string): Promise<AcceptQuoteResult> {
    const request = requests.find((r) => r.id === requestId);
    if (!request) return { ok: false, error: "Request not found." };
    const current = requestState(request);
    const result = transition(current, "accept_quote", "landlord");
    if (!result.ok) return { ok: false, error: `Cannot accept a quote from state "${current}".` };

    const requestQuotes = quotes.filter((q) => q.requestId === requestId);
    const accepted = requestQuotes.find((q) => q.id === quoteId);
    if (!accepted) return { ok: false, error: "Quote not found for this request." };
    if (accepted.status !== "submitted") return { ok: false, error: "Only a submitted quote can be accepted." };

    request.events.push({
      eventType: "accept_quote",
      actorType: "landlord",
      actorId: "dashboard",
      at: new Date().toISOString(),
    });
    accepted.status = "accepted";
    const declined = requestQuotes.filter((q) => q.id !== quoteId);
    declined.forEach((q) => (q.status = "not_selected"));

    const acceptedContact = contacts.find((c) => c.id === accepted.tradieContactId);
    return {
      ok: true,
      state: result.state,
      accepted: {
        tradieName: acceptedContact?.fullName ?? "",
        tradieEmail: acceptedContact?.email ?? "",
        quoteCents: accepted.quoteCents ?? 0,
        callOutFeeCents: accepted.callOutFeeCents ?? 0,
      },
      declined: declined.map((q) => {
        const c = contacts.find((x) => x.id === q.tradieContactId);
        return { tradieName: c?.fullName ?? "", tradieEmail: c?.email ?? "" };
      }),
    };
  },

  async getComparableJobs(): Promise<Array<{ finalInvoiceCents: number }>> {
    // Demo store tracks no completed-job invoice history — honest cold-start
    // behaviour, same as getTradieTrustSummaries below.
    return [];
  },

  async getTypicalResponseMinutes(): Promise<number | null> {
    return null;
  },

  async getTradieTrustSummaries(tradieContactIds: string[]) {
    // Demo store seeds no completed job history — every tradie reads as
    // "unproven" until real work_orders with invoice_cents exist.
    const summaries: Record<string, { completedJobs: number; avgAbsVariancePct: number | null }> = {};
    for (const id of tradieContactIds) {
      summaries[id] = { completedJobs: 0, avgAbsVariancePct: null };
    }
    return summaries;
  },

  async getTradiePortalContext(token: string): Promise<TradiePortalContext | null> {
    const resolved = demoTokens[token];
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return null;
    const tradie = contacts.find((c) => c.id === resolved.contactId);
    if (!tradie) return null;
    const card = rateCards.find((c) => c.tradieContactId === resolved.contactId);
    const rateCard: RateCard | null = card
      ? { callOutFeeCents: card.callOutFeeCents, hourlyRateCents: card.hourlyRateCents, items: card.items }
      : null;
    return { tradieContactId: tradie.id, tradieName: tradie.fullName, rateCard };
  },

  async saveRateCard(
    token: string,
    input: { callOutFeeCents: number; hourlyRateCents: number; items: RateCardItem[] },
  ) {
    const resolved = demoTokens[token];
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) {
      return { ok: false as const, error: "This link is invalid or has expired." };
    }
    const existing = rateCards.find((c) => c.tradieContactId === resolved.contactId);
    if (existing) {
      existing.callOutFeeCents = input.callOutFeeCents;
      existing.hourlyRateCents = input.hourlyRateCents;
      existing.items = input.items;
    } else {
      rateCards.push({
        tradieContactId: resolved.contactId,
        callOutFeeCents: input.callOutFeeCents,
        hourlyRateCents: input.hourlyRateCents,
        items: input.items,
      });
    }
    return { ok: true as const };
  },

  async getPmPortfolioContext(token: string): Promise<PmPortfolioContext | null> {
    const resolved = demoTokens[token];
    if (resolved?.scope !== "pm_portfolio" || !resolved.contactId) return null;
    const pm = contacts.find((c) => c.id === resolved.contactId);
    if (!pm) return null;
    const managedIds = properties.filter((p) => p.pmContactId === resolved.contactId).map((p) => p.id);
    const propertyDetails = (
      await Promise.all(managedIds.map((id) => this.getProperty(id)))
    ).filter((p): p is PropertyDetail => p !== null);
    return { pmName: pm.fullName, properties: propertyDetails };
  },

  async getTradieLeadIntakeInfo(token: string) {
    const resolved = demoTokens[token];
    if (resolved?.scope !== "tradie_lead_intake") return null;
    const tradie = contacts.find((c) => c.id === resolved.aggregateId);
    if (!tradie) return null;
    return { tradieBusinessName: tradie.fullName };
  },

  async startTradieLeadConversation(
    token: string,
    existingConversationId?: string,
  ): Promise<TradieLeadConversationContext | null> {
    const resolved = demoTokens[token];
    if (resolved?.scope !== "tradie_lead_intake") return null;
    const tradie = contacts.find((c) => c.id === resolved.aggregateId);
    if (!tradie) return null;

    if (existingConversationId) {
      const convo = sallyConversations.find(
        (c) => c.id === existingConversationId && c.tradieContactId === tradie.id,
      );
      if (convo) {
        return {
          conversationId: convo.id,
          contactId: convo.contactId,
          tradieContactId: tradie.id,
          tradieBusinessName: tradie.fullName,
        };
      }
    }

    const customerId = `contact-customer-${++demoContactSeq}`;
    contacts.push({ id: customerId, kind: "customer", fullName: "New enquiry", email: "" });
    const conversationId = `convo-${Math.random().toString(36).slice(2, 8)}`;
    sallyConversations.push({
      id: conversationId,
      contactId: customerId,
      tradieContactId: tradie.id,
      status: "active",
    });
    return { conversationId, contactId: customerId, tradieContactId: tradie.id, tradieBusinessName: tradie.fullName };
  },

  async completeTradieLead(conversationId: string, extraction: TradieLeadExtractionInput) {
    const convo = sallyConversations.find((c) => c.id === conversationId);
    if (!convo || !convo.tradieContactId) return { ok: false as const, error: "Conversation not found." };
    if (convo.status === "completed") {
      return { ok: false as const, error: "This lead has already been logged." };
    }

    if (extraction.customerName) {
      const customer = contacts.find((c) => c.id === convo.contactId);
      if (customer) customer.fullName = extraction.customerName;
    }

    let suggestedQuoteCents: number | null = null;
    let suggestedCallOutFeeCents: number | null = null;
    const rateCard = rateCards.find((c) => c.tradieContactId === convo.tradieContactId);
    if (rateCard) {
      suggestedCallOutFeeCents = rateCard.callOutFeeCents;
      const item = rateCard.items.find((i) => i.category === extraction.category);
      if (item?.flatPriceCents != null) {
        suggestedQuoteCents = item.flatPriceCents;
      } else if (item?.typicalMinutes != null) {
        suggestedQuoteCents = Math.round((rateCard.hourlyRateCents * item.typicalMinutes) / 60);
      }
    }

    const leadId = `lead-${Math.random().toString(36).slice(2, 8)}`;
    tradieLeads.push({
      id: leadId,
      tradieContactId: convo.tradieContactId,
      customerContactId: convo.contactId,
      title: extraction.title,
      description: extraction.description,
      category: extraction.category,
      status: "new",
      suggestedQuoteCents,
      suggestedCallOutFeeCents,
      createdAt: new Date().toISOString(),
    });
    convo.status = "completed";
    convo.tradieLeadId = leadId;

    return { ok: true as const, leadId };
  },

  async listTradieLeads(tradiePortalToken: string): Promise<TradieLeadSummary[]> {
    const resolved = demoTokens[tradiePortalToken];
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return [];
    return tradieLeads
      .filter((l) => l.tradieContactId === resolved.contactId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((l) => {
        const customer = contacts.find((c) => c.id === l.customerContactId);
        return {
          leadId: l.id,
          customerName: customer?.fullName ?? "Unknown",
          title: l.title,
          description: l.description,
          category: l.category,
          status: l.status,
          suggestedQuoteCents: l.suggestedQuoteCents,
          suggestedCallOutFeeCents: l.suggestedCallOutFeeCents,
          createdAt: l.createdAt,
        };
      });
  },

  async getTestLinkTargets(): Promise<TestLinkTargets> {
    return {
      properties: properties.map((p) => ({ id: p.id, address: `${p.address}, ${p.suburb}` })),
      propertyManagers: contacts
        .filter((c) => c.kind === "property_manager")
        .map((c) => ({ id: c.id, name: c.fullName })),
      tradies: contacts.filter((c) => c.kind === "tradie").map((c) => ({ id: c.id, name: c.fullName })),
    };
  },

  async mintTenantIntakeLink(propertyId: string): Promise<MintLinkResult> {
    const property = properties.find((p) => p.id === propertyId);
    if (!property) return { ok: false, error: "Property not found." };
    let tenant = contacts.find((c) => c.kind === "tenant");
    if (!tenant) {
      tenant = {
        id: `contact-tenant-${Math.random().toString(36).slice(2, 8)}`,
        kind: "tenant",
        fullName: "Test Renter",
        email: "mac@1pacent.com",
      };
      contacts.push(tenant);
    }
    const token = issueDemoToken("tenant_intake", property.id, tenant.id);
    return { ok: true, path: `/r/${token}` };
  },

  async mintPmPortfolioLink(pmContactId: string): Promise<MintLinkResult> {
    const pm = contacts.find((c) => c.id === pmContactId);
    if (!pm) return { ok: false, error: "Property manager not found." };
    const token = issueDemoToken("pm_portfolio", pm.id, pm.id);
    return { ok: true, path: `/pm/${token}` };
  },

  async mintTradiePortalLink(tradieContactId: string): Promise<MintLinkResult> {
    const tradie = contacts.find((c) => c.id === tradieContactId);
    if (!tradie) return { ok: false, error: "Tradie not found." };
    const token = issueDemoToken("tradie_portal", tradie.id, tradie.id);
    return { ok: true, path: `/t/${token}` };
  },

  async mintTradieLeadIntakeLink(tradieContactId: string): Promise<MintLinkResult> {
    const tradie = contacts.find((c) => c.id === tradieContactId);
    if (!tradie) return { ok: false, error: "Tradie not found." };
    const token = issueDemoToken("tradie_lead_intake", tradie.id);
    return { ok: true, path: `/l/${token}` };
  },
};

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
