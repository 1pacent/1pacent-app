import type {
  ActorType,
  JobArcStep,
  PaymentState,
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
  /** Present when the caller can act on the asset (receipt upload). */
  assetId?: string;
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
  /** v8 R4b — warranty identity: what was fitted (tradie's id-plate entry)
   * and proof of purchase (payer's receipt). */
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  receiptOnFile?: boolean;
  manufacturerWarrantyUntil?: string | null;
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

/** Tradie accuracy (v6 §4.4) — estimate-vs-actual and its trust effect.
 * v8 R3.5 adds the time signal (the learning loop): the trust score is now
 * blended 70% money / 30% time accuracy. */
export interface TradieAccuracyView {
  completedJobs: number;
  avgAbsVariancePct: number | null;
  /** Estimated-vs-actual on-site minutes, averaged. Null until history. */
  avgAbsTimeVariancePct: number | null;
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

/** ——— v8 R1: The Uber Slice (Developer Brief v8) ——— */

export interface BookingPreview {
  playbookKey: string;
  playbookTitle: string;
  category: RequestCategory;
  pricing: "fixed_band" | "rate_card" | "quote_race";
  bandLowCents: number | null;
  bandHighCents: number | null;
  /** The amount authorized at booking for fixed-band jobs (band midpoint). */
  bookAmountCents: number | null;
  evidenceGates: string[];
  warrantyMonths: number;
  urgent: boolean;
  /** Cold-start honesty: how many real completed jobs back this band, and
   * the engine's stated confidence. Zero = introductory rate, and the UI
   * must say so. */
  evidenceCount: number;
  confidence: "low" | "medium" | "high";
  /** Slot PROPOSALS — confirmed only when a tradie accepts (offer-don't-assume). */
  slots: SlotOption[];
  tradiesOnline: number;
  propertyId: string;
  propertyAddress: string;
}

export interface BookJobInput {
  title: string;
  description: string;
  category: RequestCategory;
  playbookKey: string;
  /** Owner scope must name the property; tenant scope derives it. */
  propertyId?: string;
  slot: { startAt: string; endAt: string } | null;
  photoDataUrl?: string | null;
  aiMeta?: { model: string; promptVersion: string; confidence: number } | null;
}

export type BookJobResult =
  | { ok: true; requestId: string; offered: number; amountAuthorizedCents: number | null }
  | { ok: false; error: string };

export interface JobOfferView {
  quoteId: string;
  requestId: string;
  title: string;
  playbookTitle: string;
  propertyAddress: string;
  /** Tradie take-home after the platform fee. Null for quote-race offers. */
  payoutCents: number | null;
  slot: { startAt: string; endAt: string; label: string } | null;
  briefing: string[];
  urgent: boolean;
}

export interface JobEvidenceView {
  gate: string;
  dataUrl: string | null;
  note: string | null;
  at: string;
}

export type JobViewer = "payer" | "occupant" | "tradie" | "pm";

export type JobAction =
  | "on_my_way"
  | "start"
  | "add_evidence"
  | "add_part"
  | "mark_done"
  | "verify"
  | "propose_variance"
  | "decide_variance";

/** v8 R3.5: a part booked to the job by the tradie (archive: Nelly's
 * materials_cost). Rides the same variance/no-surprises money rules. */
export interface JobPartView {
  id: string;
  label: string;
  /** Hidden (null) for occupant viewers — money is the payer's business. */
  costCents: number | null;
  status: "active" | "pending_approval" | "declined";
}

/** v8 R3.5: estimated vs actual on-site time — the learning loop. */
export interface OnSiteTimeView {
  estimatedMinutes: number | null;
  actualMinutes: number | null;
}

/** v8 R3: an on-site scope change, tracked as a first-class record. */
export interface VarianceView {
  id: string;
  bookedCents: number;
  newTotalCents: number;
  reason: string;
  status: "pending" | "approved" | "declined" | "auto_applied";
  /** The claim's evidence — protects the tradie (documented cause) and the
   * payer (reviewable claim) alike. */
  photoDataUrl: string | null;
}

export interface JobProjection {
  requestId: string;
  workOrderId: string | null;
  title: string;
  playbookKey: string | null;
  playbookTitle: string;
  category: RequestCategory;
  state: RequestState;
  viewer: JobViewer;
  propertyAddress: string;
  arcStep: JobArcStep;
  arc: Array<{ key: JobArcStep; label: string; done: boolean; active: boolean }>;
  parties: Array<{ role: "customer" | "owner" | "pm" | "tradie"; name: string; verified: boolean }>;
  money: {
    visible: boolean;
    amountCents: number | null;
    payoutCents: number | null;
    status: PaymentState | "none";
    label: string;
    /** How this price was set — the payer's best-deal transparency line. */
    basis: string | null;
    /** v8 R6: trust balance was short — the owner can pay now (one tap). */
    awaitingFunding: boolean;
  };
  slot: { startAt: string; endAt: string; label: string } | null;
  onTheWayAt: string | null;
  evidence: JobEvidenceView[];
  gatesRemaining: string[];
  timeline: Array<{ label: string; at: string | null }>;
  actions: JobAction[];
  /** Money-bearing — structurally hidden from occupant viewers. */
  variance: VarianceView | null;
  /** Parts booked to the job (costs hidden from occupants). */
  parts: JobPartView[];
  /** The learning loop, on the glass. */
  onSite: OnSiteTimeView;
}

export interface AddressRecordView {
  propertyId: string;
  address: string;
  suburb: string;
  compliance: ComplianceStatusView;
  assets: AssetHorizonView[];
  history: Array<{
    title: string;
    category: RequestCategory;
    invoiceCents: number | null;
    tradieName: string;
    at: string | null;
  }>;
  warranties: Array<{ assetLabel: string; tradieName: string; expiresAt: string }>;
  /** Hidden for occupant viewers — money is the payer's business. */
  spend12moCents: number | null;
  eventsCount: number;
}

export interface DeckTile {
  requestId: string;
  title: string;
  address: string;
  state: RequestState;
  arcStep: JobArcStep;
  needsHuman: boolean;
  at: string;
}

/** ——— v8 R2: Autopilot & the Deck ——— */

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** The subscriber's app path (their token page) — push deep-links are built
   * relative to it. Same capability class as the link they were sent. */
  homePath: string;
}

export interface PushTarget {
  contactId: string;
  name: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  homePath: string | null;
}

/** Who a moment about this request should reach. */
export type MomentRole = "payer" | "occupant" | "assigned_tradie" | "tradie_offered" | "pm";

/** The decisions a one-tap signed action can carry. The token names exactly
 * one decision for one human; it burns on use. */
export type MomentActionKind = "approve_request" | "verify_job" | "decide_variance" | "fund_job";

export interface AutopilotView {
  enabled: boolean;
  maxTotalCents: number;
  minTrustScore: number;
  /** Safety switch — these categories always come to a human. */
  safetyCategories: RequestCategory[];
  propertiesCovered: number;
}

export interface AutopilotInput {
  enabled: boolean;
  maxTotalCents: number;
  minTrustScore: number;
  safetyOn: boolean;
}

export interface TradieRunView {
  legs: Array<{
    workOrderId: string;
    requestId: string;
    title: string;
    address: string;
    suburb: string;
    travelMinutes: number;
    arriveAt: string;
    departAt: string;
    conflict: boolean;
    slotLabel: string | null;
    state: RequestState;
  }>;
  totalTravelMinutes: number;
  totalOnSiteMinutes: number;
  /** Read-busy overlay from the tradie's external calendar (opt-in; empty
   * without a grant — the ledger plans the day either way). */
  calendarBusy: Array<{ startAt: string; endAt: string }>;
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

  // ——— v8 R1: The Uber Slice ———

  /** The Button's confirmation sheet: playbook, price band, slot proposals. */
  previewBooking(
    token: string,
    input: { category: RequestCategory; playbookKey?: string; propertyId?: string },
  ): Promise<BookingPreview | null>;

  /** Book: create the request pre-approved under the playbook, authorize the
   * payment (simulated PSP hold — no custody), offer to Online tradies. */
  bookJob(token: string, input: BookJobInput): Promise<BookJobResult>;

  /** The tradie's pings — open offers on fixed-band jobs. First accept wins. */
  getOpenOffers(tradiePortalToken: string): Promise<JobOfferView[]>;
  acceptJobOffer(
    tradiePortalToken: string,
    quoteId: string,
  ): Promise<{ ok: boolean; requestId?: string; error?: string }>;

  // Go Online / presence
  setTradiePresence(
    tradiePortalToken: string,
    online: boolean,
    geo?: { lat: number; lng: number } | null,
  ): Promise<{ ok: boolean; online: boolean }>;
  getTradiePresence(tradiePortalToken: string): Promise<{ online: boolean }>;

  // The live arc
  markOnMyWay(
    tradiePortalToken: string,
    workOrderId: string,
  ): Promise<{ ok: boolean; etaMinutes?: number | null; error?: string }>;
  addJobEvidence(
    tradiePortalToken: string,
    workOrderId: string,
    input: { gate: string; dataUrl: string | null; note?: string },
  ): Promise<{ ok: boolean; gatesRemaining?: string[]; error?: string }>;
  /** Gate-checked completion — core refuses until the playbook's evidence gates pass. */
  completeJob(
    tradiePortalToken: string,
    workOrderId: string,
    note: string,
  ): Promise<{ ok: boolean; gatesRemaining?: string[]; error?: string }>;
  /** The payer/occupant verifies → capture + transfer (simulated PSP) + the
   * Address Record write (asset, warranty, certificate). One human tap. */
  verifyAndSettle(
    token: string,
    requestId: string,
  ): Promise<{ ok: boolean; error?: string; funding?: "payer_card" | "pm_trust" | "owner_handoff" }>;

  /** The shared Job Screen, projected for the viewer the token implies. */
  getJobProjection(token: string, requestId: string): Promise<JobProjection | null>;

  /** The address's medical file. Occupants see it without money fields. */
  getAddressRecord(token: string, propertyId?: string): Promise<AddressRecordView | null>;

  /** The PM Deck: every live job as a tile. */
  getDeckTiles(pmPortfolioToken: string): Promise<DeckTile[]>;

  // ——— v8 R2: Autopilot & the Deck ———

  /** Register this device for Moments. Any persona token may subscribe. */
  savePushSubscription(token: string, input: PushSubscriptionInput): Promise<{ ok: boolean; error?: string }>;

  /** Subscriptions of the humans a moment about this request should reach. */
  getPushTargets(requestId: string, role: MomentRole): Promise<PushTarget[]>;

  /** Mint a single-use signed action for one human's one decision (the
   * lock-screen tap). Returns the /api/act path carrying the raw token. */
  mintMomentAction(
    requestId: string,
    input: { kind: MomentActionKind; contactId: string | null; meta?: Record<string, unknown> },
  ): Promise<{ ok: boolean; path?: string; error?: string }>;

  /** Resolve + burn a moment-action token and execute its decision as the
   * human it was minted for. The ledger records a human actor, as ever. */
  executeMomentAction(
    rawToken: string,
    choice: string,
  ): Promise<{ ok: boolean; label?: string; requestId?: string; error?: string }>;

  /** Owner Autopilot — the v4 policy engine as three sliders. */
  getAutopilot(ownerToken: string): Promise<AutopilotView | null>;
  setAutopilot(ownerToken: string, input: AutopilotInput): Promise<{ ok: boolean; error?: string }>;

  /** George's plan for the tradie's day: booked slots anchored, travel legs
   * estimated, conflicts flagged (never silently re-booked). */
  getTradieRun(tradiePortalToken: string): Promise<TradieRunView | null>;

  // ——— v8 R5b: crews ———

  /** The business's field crew — each with their own link, presence and
   * location; the business keeps the rate card, trust score and payouts. */
  listCrew(tradiePortalToken: string): Promise<Array<{
    contactId: string;
    name: string;
    online: boolean;
  }> | null>;

  /** Add a staff member (business seat only): creates their contact and
   * mints their own portal link — the raw link is returned ONCE, share it. */
  addCrewMember(
    tradiePortalToken: string,
    input: { name: string; email?: string; phone?: string },
  ): Promise<{ ok: boolean; path?: string; error?: string }>;

  // ——— v8 R3: Real money & the second orbit ———

  /** The variance protocol: an on-site scope change. Inside the playbook's
   * threshold it auto-applies (logged); above it, work pauses on a payer
   * Moment. Returns whether a human decision is now pending. */
  proposeVariance(
    tradiePortalToken: string,
    workOrderId: string,
    input: { newTotalCents: number; reason: string; photoDataUrl?: string | null },
  ): Promise<{ ok: boolean; needsApproval?: boolean; varianceId?: string; error?: string }>;

  /** The payer's decision on a pending variance — a human actor, in-app or
   * via the one-tap moment token. Approval raises the authorization. */
  decideVariance(
    token: string,
    varianceId: string,
    decision: "approve" | "decline",
  ): Promise<{ ok: boolean; error?: string }>;

  /** Fast-Pay opt-in: money today, 2% factoring fee off the payout. */
  getFastPay(tradiePortalToken: string): Promise<{ enabled: boolean } | null>;
  setFastPay(tradiePortalToken: string, enabled: boolean): Promise<{ ok: boolean; error?: string }>;

  // ——— v8 R3.5: parts to job + the learning loop ———

  /** Book a part to the job. Within the playbook's variance threshold it
   * lands instantly (authorized slice); beyond it, work pauses on the same
   * payer Moment as any scope change — no surprise bills, ever. */
  addJobPart(
    tradiePortalToken: string,
    workOrderId: string,
    input: { label: string; costCents: number },
  ): Promise<{ ok: boolean; needsApproval?: boolean; varianceId?: string; error?: string }>;

  // ——— v8 R4b: warranty identity ———

  /** The tradie records what was actually fitted (id-plate truth) while on
   * site; settle copies it onto the Address Record's asset. */
  setAssetDetails(
    tradiePortalToken: string,
    workOrderId: string,
    input: {
      manufacturer: string;
      model: string;
      serial: string;
      /** When the TRADIE bought the unit: their receipt + the manufacturer
       * warranty it establishes. Any party may hold the proof of purchase. */
      receipt?: { dataUrl: string; purchasedAt: string; warrantyMonths: number } | null;
    },
  ): Promise<{ ok: boolean; error?: string }>;

  /** The payer attaches proof of purchase (e.g. the aircon THEY bought) to
   * an asset, with the manufacturer warranty it establishes. */
  attachAssetReceipt(
    ownerToken: string,
    assetId: string,
    input: { dataUrl: string; purchasedAt: string; warrantyMonths: number },
  ): Promise<{ ok: boolean; error?: string }>;

  // ——— v8 R6: feedback, performance, same-day funding ———

  /** One review per job, by the occupant or payer, after verification.
   * Feeds the 70/30 accuracy/feedback trust score. */
  submitReview(
    token: string,
    requestId: string,
    input: { rating: number; comment?: string },
  ): Promise<{ ok: boolean; error?: string }>;

  /** The business answers its feedback — once, on the record. */
  respondToReview(
    tradiePortalToken: string,
    reviewId: string,
    response: string,
  ): Promise<{ ok: boolean; error?: string }>;

  /** ONE performance shape, three persona projections (tradie business /
   * PM portfolio / owner) — the commonality is the read model. */
  getPerformance(token: string): Promise<PerformanceView | null>;

  /** The owner pays a trust-short job now (card, simulated) — the tradie
   * still gets same-day money. Also reachable as a one-tap fund_job Moment. */
  fundJobNow(ownerToken: string, requestId: string): Promise<{ ok: boolean; error?: string }>;

  // ——— v8 R7: PM subscription + house tradies ———

  /** The PM's PUM cohort subscription (HubSpot PRD-1P-004-* tiers). */
  getPmSubscription(pmPortfolioToken: string): Promise<PmSubscriptionView | null>;
  selectPmSubscription(pmPortfolioToken: string, sku: string): Promise<{ ok: boolean; error?: string }>;

  /** Up to 3 default tradies for small jobs (the PM's own handyman, an
   * onsite man, or a standing agreement) + the small-job ceiling. */
  getHouseTradies(pmPortfolioToken: string): Promise<HouseTradiesView | null>;
  setHouseTradies(
    pmPortfolioToken: string,
    input: { tradieContactIds: string[]; maxJobCents: number },
  ): Promise<{ ok: boolean; error?: string }>;
}

/** ——— v8 R7 views ——— */

export interface PmTierOption {
  sku: string;
  name: string;
  priceCents: number;
  propertyCap: number;
}

export interface PmSubscriptionView {
  current: (PmTierOption & { selectedAt: string }) | null;
  options: PmTierOption[];
  propertiesUnderManagement: number;
  /** PUM exceeds the chosen cap — nudge to the next cohort. */
  overCap: boolean;
}

export interface HouseTradiesView {
  tradies: Array<{ contactId: string; name: string; online: boolean; priority: number }>;
  maxJobCents: number;
  /** The org's tradie businesses, for the picker. */
  networkTradies: Array<{ contactId: string; name: string }>;
}

/** ——— v8 R6: the shared performance read model ——— */

export interface ReviewView {
  id: string;
  rating: number;
  comment: string | null;
  reviewerRole: "occupant" | "payer";
  at: string;
  response: string | null;
  jobTitle: string;
}

export interface PerformanceView {
  scope: "tradie" | "pm" | "owner";
  heading: string;
  tiles: Array<{ label: string; value: string; hint?: string }>;
  jobsByStatus: Array<{ state: RequestState; count: number }>;
  /** Who did what when — crew-attributed milestones, newest first. */
  activity: Array<{ at: string; who: string; what: string; job: string }>;
  partsUsed: Array<{ label: string; costCents: number | null; job: string; at: string }>;
  /** Obligations still running (workmanship for tradies; coverage for payers). */
  warranties: Array<{ assetLabel: string; until: string; property: string | null }>;
  money: { quotedCents: number; invoicedCents: number; collectedCents: number; awaitingFundsCents: number };
  /** Tradie scope only: the score, its inputs, and computed ways to move it. */
  score: {
    value: number;
    avgAbsMoneyVariancePct: number | null;
    avgAbsTimeVariancePct: number | null;
    avgRating: number | null;
    reviewCount: number;
    tips: string[];
  } | null;
  reviews: ReviewView[];
  /** PM/owner scopes: the consolidated view drills per property. */
  perProperty: Array<{
    propertyId: string;
    address: string;
    openJobs: number;
    spend12moCents: number;
    warranties: number;
    compliance: "green" | "amber" | "red";
    trustBalanceCents: number | null;
  }> | null;
}

export type MintLinkResult = { ok: true; path: string } | { ok: false; error: string };

export interface TestLinkTargets {
  properties: Array<{ id: string; address: string }>;
  propertyManagers: Array<{ id: string; name: string }>;
  tradies: Array<{ id: string; name: string }>;
  owners: Array<{ id: string; name: string }>;
}
