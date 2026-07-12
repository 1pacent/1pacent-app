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

/** Talk / See / Do (Developer Brief v6) — the canvas read model. Cards are
 * deterministic projections of database state per token scope; NO table backs
 * them, which is why the canvas keeps working with the AI off. */

export type CanvasCardKind =
  | "ticket_status"
  | "approval"
  | "warranty_catch"
  | "slot_confirm"
  | "confirm_fixed"
  | "obligations"
  | "batch_offer"
  | "report"
  | "insight"
  | "crew_activity";

export type CanvasCardState = "needs_you" | "live" | "done" | "info";

export interface RankedQuoteOption {
  quoteId: string;
  tradieName: string;
  totalCents: number;
  trustScore: number;
  recommended: boolean;
}

export interface SlotOption {
  startAt: string;
  endAt: string;
  label: string;
}

export type CanvasCardData =
  | { kind: "ticket_status"; requestId: string; state: RequestState; category: RequestCategory; isWarrantyClaim: boolean }
  | { kind: "approval"; requestId: string; estimateCents: number | null; quotes: RankedQuoteOption[] }
  | { kind: "warranty_catch"; requestId: string; tradieName: string; savedApproxCents: number | null }
  | { kind: "slot_confirm"; requestId: string; workOrderId: string; tradieName: string; options: SlotOption[] }
  | { kind: "confirm_fixed"; requestId: string }
  | { kind: "obligations"; totalObligations: number; months: Array<{ month: string; count: number; lines: string[] }> }
  | { kind: "batch_offer"; requirementKey: string; requirementName: string; suburb: string; propertyAddresses: string[]; windowStart: string; windowEnd: string }
  | { kind: "report"; reportId: string; reportKind: ReportKind }
  | { kind: "insight"; insightKind: "spending" | "asset_horizon" | "accuracy" | "day" | "red_list" | "compliance"; lines: string[] }
  | { kind: "crew_activity"; lines: string[] };

export interface CanvasCard {
  id: string;
  kind: CanvasCardKind;
  title: string;
  body: string;
  /** ISO timestamp the card's underlying state last changed. */
  at: string;
  state: CanvasCardState;
  data: CanvasCardData;
  workspaceHref: string;
}

/** Reports & analytics (v6 §4) */

export type ReportKind =
  | "property_data_pack"
  | "spending_summary"
  | "obligations_calendar"
  | "pm_quarterly"
  | "compliance_pack"
  | "accuracy_report";

export interface SpendingSummaryView {
  periodMonths: number;
  totalCents: number;
  jobCount: number;
  byCategory: Array<{
    category: RequestCategory;
    totalCents: number;
    jobCount: number;
    networkMedianCents: number | null;
    vsMedianPct: number | null;
  }>;
}

export interface AssetHorizonView {
  propertyAddress: string;
  assetLabel: string;
  category: RequestCategory;
  ageYears: number;
  effectiveLifeYears: number;
  remainingLifeYears: number;
  status: "healthy" | "plan_soon" | "due_now";
  /** Median replacement cost from comparables, when known. */
  plannedReplacementCents: number | null;
  disclaimer: "planning_estimate";
}

export interface ObligationsCalendarView {
  horizonDays: number;
  totalObligations: number;
  months: Array<{
    month: string;
    items: Array<{
      propertyAddress: string;
      requirementName: string;
      dueAt: string;
      daysUntilDue: number;
      status: "amber" | "red";
    }>;
  }>;
  batchable: BatchableComplianceGroup[];
}

export interface GeneratedReportView {
  id: string;
  kind: ReportKind;
  createdAt: string;
  payload: Record<string, unknown>;
}

/** Owner seat (v6 §4.2) — the landlord's own tokenised graph position. */
export interface OwnerPortalContext {
  ownerContactId: string;
  ownerName: string;
  properties: PropertyDetail[];
}

/** Tradie accuracy (v6 §4.4) — estimate-vs-actual and its trust effect. */
export interface TradieAccuracyView {
  completedJobs: number;
  avgAbsVariancePct: number | null;
  trustScore: number;
  recentJobs: Array<{ requestTitle: string; quoteCents: number; invoiceCents: number; variancePct: number }>;
}

/** Compliance status narrow view — tenant mode gets status only, no cost fields. */
export interface ComplianceStatusView {
  propertyAddress: string;
  overall: "green" | "amber" | "red";
  requirements: Array<{
    name: string;
    status: "green" | "amber" | "red";
    lastCompletedAt: string | null;
    dueAt: string | null;
  }>;
}

export interface AutoQuoteSettingsView {
  enabled: boolean;
  maxTotalCents: number | null;
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

  // ——— Talk / See / Do (Developer Brief v6) ———

  /** THE central v6 read model: deterministic cards per token scope.
   * Accepts tenant_intake, owner_portal, pm_portfolio and tradie_portal tokens. */
  getCanvasCards(token: string): Promise<CanvasCard[]>;

  // Reports & analytics (owner_portal or pm_portfolio scope)
  getSpendingSummary(scopeToken: string, periodMonths: number): Promise<SpendingSummaryView | null>;
  getAssetHorizon(scopeToken: string): Promise<AssetHorizonView[]>;
  getObligationsCalendar(scopeToken: string, horizonDays: number): Promise<ObligationsCalendarView | null>;
  generateReport(
    scopeToken: string,
    kind: ReportKind,
    subjectId?: string,
  ): Promise<{ ok: boolean; reportId?: string; error?: string }>;
  getReport(scopeToken: string, reportId: string): Promise<GeneratedReportView | null>;

  /** Compliance narrow view — works for tenant_intake (status only by design),
   * owner_portal and pm_portfolio scopes. */
  getComplianceStatus(scopeToken: string): Promise<ComplianceStatusView[]>;

  // Owner seat
  getOwnerPortalContext(token: string): Promise<OwnerPortalContext | null>;
  mintOwnerPortalLink(ownerContactId: string): Promise<MintLinkResult>;

  // George's slot confirmation — a card action with a human actor, never a tool.
  confirmSlot(
    token: string,
    workOrderId: string,
    slotIndex: number,
  ): Promise<{ ok: boolean; error?: string }>;

  // PM batch dispatch (v5 §3.1): compliance batch -> approval by the PM (human)
  // -> quote round per property; certificates file on job completion.
  dispatchComplianceBatch(
    pmPortfolioToken: string,
    input: { requirementKey: string; suburb: string },
  ): Promise<{ ok: boolean; dispatched?: number; error?: string }>;

  // Tradie auto-quote (Nelly) — opt-in, bounded, revocable
  getAutoQuoteSettings(tradiePortalToken: string): Promise<AutoQuoteSettingsView | null>;
  setAutoQuote(
    tradiePortalToken: string,
    input: { enabled: boolean; maxTotalCents: number | null },
  ): Promise<{ ok: boolean; error?: string }>;

  // Tradie accuracy (feeds the Accuracy card and the get_my_accuracy tool)
  getTradieAccuracy(tradiePortalToken: string): Promise<TradieAccuracyView | null>;
}

export type MintLinkResult = { ok: true; path: string } | { ok: false; error: string };

export interface TestLinkTargets {
  properties: Array<{ id: string; address: string }>;
  propertyManagers: Array<{ id: string; name: string }>;
  tradies: Array<{ id: string; name: string }>;
  owners: Array<{ id: string; name: string }>;
}
