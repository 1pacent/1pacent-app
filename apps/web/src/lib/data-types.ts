import type {
  ActorType,
  PropertyComplianceStatus,
  RequestCategory,
  RequestEvent,
  RequestState,
} from "@1pacent/core";

/** Shared surface both data sources (demo, Supabase) implement. */

export interface PropertySummary {
  id: string;
  address: string;
  suburb: string;
  autoApproveCapCents: number;
  compliance: PropertyComplianceStatus;
  openRequests: number;
}

export interface RequestView {
  id: string;
  title: string;
  description: string;
  category: RequestCategory;
  estimateCents: number | null;
  state: RequestState;
  events: Array<{ eventType: RequestEvent; actorType: ActorType; note?: string; at?: string }>;
  /** Set when this request was routed straight to the original tradie under an open warranty,
   * bypassing the 3-quote marketplace and the landlord approval gate entirely. */
  isWarrantyClaim: boolean;
}

export type OccupancyStatus = "owner_occupied" | "tenanted" | "vacant";

export interface PropertyDetail extends PropertySummary {
  requests: RequestView[];
  occupancyStatus: OccupancyStatus;
  ownerContactId: string | null;
  ownerName: string | null;
  /** Org's owner-kind contacts, for the ownership editor's picker. */
  availableOwners: Array<{ id: string; name: string }>;
  openWarranties: Array<{ assetLabel: string; category: RequestCategory; tradieName: string; expiresAt: string }>;
}

export interface IntakeContext {
  property: { id: string; address: string; suburb: string };
}

export interface ApprovalContext {
  request: {
    id: string;
    title: string;
    description: string;
    category: RequestCategory;
    estimateCents: number | null;
    address: string;
  };
}

export interface IntakeInput {
  title: string;
  description: string;
  category: RequestCategory;
}

export type IntakeOutcome =
  | { ok: true; requestId: string; state: RequestState; urgent: boolean }
  | { ok: false; error: string };

export type DecisionOutcome = { ok: true; state: RequestState } | { ok: false; error: string };

/** Sally (conversational intake) */

export interface SallyConversationContext {
  conversationId: string;
  contactId: string;
  propertyId: string;
  propertyAddress: string;
  propertySuburb: string;
  tenantFirstName?: string;
}

export interface SallyMessageView {
  role: "tenant" | "sally";
  content: string;
}

export interface SallyMemoryChunkView {
  content: string;
}

export type SallyMemoryScope = "contact" | "property";
export type SallyMemoryChunkType = "fact" | "preference" | "summary";

export interface SallyMemoryChunkInput {
  scopeLevel: SallyMemoryScope;
  chunkType: SallyMemoryChunkType;
  content: string;
  embedding: number[];
}

export interface SallyExtractionInput {
  title: string;
  description: string;
  category: RequestCategory;
  aiMeta: { model: string; promptVersion: string; confidence: number };
}

/** Tradie's own AI receptionist — a lead for THEIR business, not a property maintenance request. */

export interface TradieLeadConversationContext {
  conversationId: string;
  contactId: string;
  tradieContactId: string;
  tradieBusinessName: string;
}

export interface TradieLeadExtractionInput {
  title: string;
  description: string;
  category: RequestCategory;
  customerName: string | null;
  aiMeta: { model: string; promptVersion: string; confidence: number };
}

export interface TradieLeadSummary {
  leadId: string;
  customerName: string;
  title: string;
  description: string;
  category: RequestCategory;
  status: string;
  suggestedQuoteCents: number | null;
  suggestedCallOutFeeCents: number | null;
  createdAt: string;
}

/** 3-tradie quote marketplace */

export interface QuoteInvite {
  quoteId: string;
  tradieContactId: string;
  tradieName: string;
  tradieEmail: string;
  /** Raw (unhashed) token for the /q/[token] link — only ever returned once, at issuance. */
  token: string;
}

export interface DispatchQuotesResult {
  ok: true;
  invites: QuoteInvite[];
  requestTitle: string;
  requestDescription: string;
  propertyAddress: string;
}

export interface QuoteContext {
  quoteId: string;
  requestTitle: string;
  requestDescription: string;
  propertyAddress: string;
  tradieName: string;
  /** Pre-filled from the tradie's own rate card — never AI-invented. Absent if no rate card is configured. */
  suggestedQuoteCents?: number;
  suggestedCallOutFeeCents?: number;
}

/** Tradie rate card — drives quote auto-population, never AI-set. */

export interface RateCardItem {
  category: RequestCategory;
  flatPriceCents: number | null;
  typicalMinutes: number | null;
}

export interface RateCard {
  callOutFeeCents: number;
  hourlyRateCents: number;
  items: RateCardItem[];
}

export interface TradiePortalContext {
  tradieContactId: string;
  tradieName: string;
  rateCard: RateCard | null;
}

/** Property manager — informed of decisions across their managed properties, not gating by default. */
export interface PmPortfolioContext {
  pmName: string;
  properties: PropertyDetail[];
  batchableCompliance: BatchableComplianceGroup[];
}

export interface QuoteSummary {
  quoteId: string;
  tradieContactId: string;
  tradieName: string;
  tradieEmail: string;
  status: string;
  quoteCents: number | null;
  callOutFeeCents: number | null;
  note: string | null;
  /** Minutes from invite to quote submission — feeds the availability score. Null until submitted. */
  respondedWithinMinutes: number | null;
}

export interface AcceptQuoteResult {
  ok: boolean;
  error?: string;
  state?: RequestState;
  accepted?: { tradieName: string; tradieEmail: string; quoteCents: number; callOutFeeCents: number };
  declined?: Array<{ tradieName: string; tradieEmail: string }>;
}

export type SubmitQuoteResult =
  | {
      ok: true;
      /** Set when this submission completed the invite round and the ranked #1 quote
       * satisfied the property's approval policy — auto-accepted with no landlord action. */
      autoAccepted?: {
        requestId: string;
        accepted: { tradieName: string; tradieEmail: string; quoteCents: number; callOutFeeCents: number };
        declined: Array<{ tradieName: string; tradieEmail: string }>;
      };
    }
  | { ok: false; error: string };

/** Job completion & invoicing (Developer Brief v4 §1) — the tail of the state
 * machine (scheduled -> in_progress -> evidence_pending -> verified -> invoiced
 * -> paid -> closed) that nothing wired up until this pass. */

export interface TradieJobSummary {
  workOrderId: string;
  requestId: string;
  requestTitle: string;
  propertyAddress: string;
  category: RequestCategory;
  state: RequestState;
  quoteCents: number | null;
  callOutFeeCents: number | null;
}

export interface InvoiceJobInput {
  invoiceCents: number;
  callOutFeeCents: number;
  /** 0 = no warranty offered on this job. */
  warrantyMonths: number;
  assetLabel: string;
  assetCategory: RequestCategory;
  assetInstalledAt: string | null;
}

/** Renter-facing live status tracker (Developer Brief v4 §5). */
export type TenantRequestStatus = RequestView;

/** Approval policy engine (Developer Brief v4 §3) — evaluated once real quotes
 * exist, not the intake-time $0-estimate gate that `decideApproval` still governs. */

export interface ApprovalPolicyRuleView {
  id: string;
  priority: number;
  maxTotalCents: number | null;
  minTrustScore: number | null;
  excludeCategories: RequestCategory[];
  enabled: boolean;
}

export interface ApprovalPolicyRuleInput {
  priority: number;
  maxTotalCents: number | null;
  minTrustScore: number | null;
  excludeCategories: RequestCategory[];
  enabled: boolean;
}

/** PM portfolio compliance batching (Developer Brief v4 §6). */
export interface BatchableComplianceGroup {
  requirementKey: string;
  requirementName: string;
  suburb: string;
  propertyAddresses: string[];
  windowStart: string;
  windowEnd: string;
}

export interface DataSource {
  listProperties(): Promise<PropertySummary[]>;
  getProperty(id: string): Promise<PropertyDetail | null>;
  getIntakeContext(token: string): Promise<IntakeContext | null>;
  lodgeIntake(token: string, input: IntakeInput): Promise<IntakeOutcome>;
  getApprovalContext(token: string): Promise<ApprovalContext | null>;
  decideApprovalByToken(token: string, decision: "approve" | "decline"): Promise<DecisionOutcome>;
  /** Same decision, taken directly from the internal dashboard (no landlord auth exists yet, so
   * the dashboard itself is the internal test/ops surface — this skips the token detour). */
  decideApprovalByRequestId(requestId: string, decision: "approve" | "decline"): Promise<DecisionOutcome>;

  // Sally
  startSallyConversation(token: string): Promise<SallyConversationContext | null>;
  appendSallyMessage(conversationId: string, role: "tenant" | "sally", content: string): Promise<void>;
  getSallyMessages(conversationId: string): Promise<SallyMessageView[]>;
  retrieveSallyMemory(contactId: string, queryEmbedding: number[]): Promise<SallyMemoryChunkView[]>;
  writeSallyMemory(params: {
    conversationId: string;
    contactId: string;
    /** Absent for a tradie's own lead-capture conversation, which has no property. */
    propertyId?: string;
    chunks: SallyMemoryChunkInput[];
  }): Promise<void>;
  completeSallyConversation(conversationId: string, extraction: SallyExtractionInput): Promise<IntakeOutcome>;

  // Quotes
  dispatchQuotesForRequest(requestId: string): Promise<DispatchQuotesResult | { ok: false; error: string }>;
  getQuoteContext(token: string): Promise<QuoteContext | null>;
  submitQuoteByToken(
    token: string,
    input: { quoteCents: number; callOutFeeCents: number; note?: string },
  ): Promise<SubmitQuoteResult>;
  listQuotesForRequest(requestId: string): Promise<QuoteSummary[]>;
  acceptQuote(requestId: string, quoteId: string): Promise<AcceptQuoteResult>;

  /** Quote-vs-actual trending per tradie (the trust signal). Keyed by tradieContactId. */
  getTradieTrustSummaries(
    tradieContactIds: string[],
  ): Promise<Record<string, { completedJobs: number; avgAbsVariancePct: number | null }>>;

  /** Comparable completed jobs for the pricing engine — org-scoped via the property. */
  getComparableJobs(propertyId: string, category: RequestCategory): Promise<Array<{ finalInvoiceCents: number }>>;

  /** Historical invite-to-quote response times for this category/urgency — feeds Sally's stated ETA band. */
  getTypicalResponseMinutes(propertyId: string, category: RequestCategory): Promise<number | null>;

  // Tradie portal (rate card)
  getTradiePortalContext(token: string): Promise<TradiePortalContext | null>;
  saveRateCard(
    token: string,
    input: { callOutFeeCents: number; hourlyRateCents: number; items: RateCardItem[] },
  ): Promise<{ ok: boolean; error?: string }>;

  // Property manager — informed portfolio view
  getPmPortfolioContext(token: string): Promise<PmPortfolioContext | null>;

  // Tradie's own AI receptionist (leads for their own business)
  /** Read-only preview — does NOT create a conversation (unlike startTradieLeadConversation, which does). */
  getTradieLeadIntakeInfo(token: string): Promise<{ tradieBusinessName: string } | null>;
  startTradieLeadConversation(
    token: string,
    existingConversationId?: string,
  ): Promise<TradieLeadConversationContext | null>;
  completeTradieLead(
    conversationId: string,
    extraction: TradieLeadExtractionInput,
  ): Promise<{ ok: true; leadId: string } | { ok: false; error: string }>;
  listTradieLeads(tradiePortalToken: string): Promise<TradieLeadSummary[]>;

  // Internal testing hub — no landlord/PM/tradie auth exists yet, so the dashboard
  // IS the internal test surface; these mint fresh, real persona links on demand
  // so every persona's actual experience can be walked through as a real user.
  getTestLinkTargets(): Promise<TestLinkTargets>;
  mintTenantIntakeLink(propertyId: string): Promise<MintLinkResult>;
  mintPmPortfolioLink(pmContactId: string): Promise<MintLinkResult>;
  mintTradiePortalLink(tradieContactId: string): Promise<MintLinkResult>;
  mintTradieLeadIntakeLink(tradieContactId: string): Promise<MintLinkResult>;

  // Job completion & invoicing — the tail of the state machine, wired up for the first time.
  listTradieJobs(tradiePortalToken: string): Promise<TradieJobSummary[]>;
  startJob(tradiePortalToken: string, workOrderId: string): Promise<{ ok: boolean; error?: string }>;
  markJobDone(
    tradiePortalToken: string,
    workOrderId: string,
    note: string,
  ): Promise<{ ok: boolean; error?: string }>;
  confirmFixed(tenantIntakeToken: string, requestId: string): Promise<{ ok: boolean; error?: string }>;
  invoiceJob(
    tradiePortalToken: string,
    workOrderId: string,
    input: InvoiceJobInput,
  ): Promise<{ ok: boolean; error?: string }>;

  // Renter live status tracker
  getRequestStatusForContact(tenantIntakeToken: string): Promise<TenantRequestStatus[]>;

  // Ownership & occupancy graph
  updatePropertyOwnership(
    propertyId: string,
    input: { occupancyStatus: OccupancyStatus; ownerContactId: string | null },
  ): Promise<{ ok: boolean; error?: string }>;

  // Approval policy — dashboard-managed, per property
  getApprovalPolicy(propertyId: string): Promise<ApprovalPolicyRuleView[]>;
  saveApprovalPolicy(
    propertyId: string,
    rules: ApprovalPolicyRuleInput[],
  ): Promise<{ ok: boolean; error?: string }>;
}

export type MintLinkResult = { ok: true; path: string } | { ok: false; error: string };

export interface TestLinkTargets {
  properties: Array<{ id: string; address: string }>;
  propertyManagers: Array<{ id: string; name: string }>;
  tradies: Array<{ id: string; name: string }>;
}
