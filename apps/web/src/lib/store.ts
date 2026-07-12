import {
  assessAssetHorizon,
  buildObligationsCalendar,
  computeBatchableCompliance,
  decideApproval,
  earliestSlotStart,
  estimateDepreciation,
  evaluateApprovalPolicy,
  evaluateProperty,
  findWarrantyMatch,
  formatSlot,
  isUrgentCategory,
  projectState,
  proposeSlots,
  rankQuotes,
  scoreAvailability,
  scoreTrust,
  summariseSpending,
  transition,
  validateQuoteSubmission,
  type ActorType,
  type ApprovalPolicyRule,
  type EvidenceRecord,
  type PropertyComplianceProfile,
  type PropertyComplianceStatus,
  type RequestCategory,
  type RequestEvent,
  type RequestState,
  type WarrantyCandidate,
} from "@1pacent/core";
import type {
  AcceptQuoteResult,
  ApprovalPolicyRuleInput,
  ApprovalPolicyRuleView,
  AssetHorizonView,
  AutoQuoteSettingsView,
  CanvasCard,
  ComplianceStatusView,
  DataSource,
  GeneratedReportView,
  ObligationsCalendarView,
  OwnerPortalContext,
  RankedQuoteOption,
  ReportKind,
  SlotOption,
  SpendingSummaryView,
  TradieAccuracyView,
  DispatchQuotesResult,
  InvoiceJobInput,
  MintLinkResult,
  OccupancyStatus,
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
  TenantRequestStatus,
  TestLinkTargets,
  TradieJobSummary,
  TradieLeadConversationContext,
  TradieLeadExtractionInput,
  TradieLeadSummary,
  TradiePortalContext,
} from "./data-types";
import {
  buildOwnerCanvas,
  buildPmCanvas,
  buildTenantCanvas,
  buildTradieCanvas,
  type CanvasSlotInfo,
  type QuotePickInfo,
} from "./canvas";

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
  occupancyStatus?: OccupancyStatus;
  ownerContactId?: string;
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
  warrantyClaimOfWorkOrderId?: string;
  /** Set on PM compliance-batch requests — invoicing the job files the certificate. */
  complianceRequirementKey?: string;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const properties: DemoProperty[] = [
  {
    id: "prop-fitzroy",
    address: "12 Rose Street",
    suburb: "Fitzroy VIC 3065",
    profile: { jurisdiction: "VIC", hasGas: true, hasPool: false },
    autoApproveCapCents: 50_000,
    ownerContactId: "contact-owner-mark",
    pmContactId: "contact-pm-jordan",
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
    ownerContactId: "contact-owner-mark",
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
    ownerContactId: "contact-owner-mark",
    pmContactId: "contact-pm-jordan",
    evidence: [], // brand new — everything red
  },
  {
    id: "prop-fitzroy-north",
    address: "27 Scotchmer Street",
    suburb: "Fitzroy VIC 3065",
    profile: { jurisdiction: "VIC", hasGas: true, hasPool: false },
    autoApproveCapCents: 40_000,
    pmContactId: "contact-pm-jordan",
    evidence: [
      { requirementKey: "vic_smoke_alarm_check", completedAt: daysAgo(300) }, // due soon → amber
      { requirementKey: "vic_gas_safety_check", completedAt: daysAgo(790) }, // overdue → red, batchable with Rose St (same window)
      { requirementKey: "vic_electrical_safety_check", completedAt: daysAgo(200) },
      { requirementKey: "vic_switchboard_rcd", completedAt: daysAgo(200) },
      { requirementKey: "vic_minimum_standards", completedAt: daysAgo(200) },
    ],
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
    id: "req-hws-richmond",
    propertyId: "prop-richmond",
    title: "Hot water system replacement",
    description: "HWS failed at 14 years; replaced with a new heat-pump unit.",
    category: "failure_of_essential_service_hot_water",
    estimateCents: 250_000,
    reportedAt: daysAgo(210).toISOString(),
    events: [
      { eventType: "triage", actorType: "system", actorId: "triage-rules", at: daysAgo(210).toISOString() },
      { eventType: "auto_approve", actorType: "system", actorId: "approval-rules", at: daysAgo(210).toISOString(), note: "Urgent bypass (VIC essential service)" },
      { eventType: "schedule", actorType: "tradie", actorId: "contact-tradie-leo", at: daysAgo(209).toISOString() },
      { eventType: "start_work", actorType: "tradie", actorId: "contact-tradie-leo", at: daysAgo(208).toISOString() },
      { eventType: "submit_evidence", actorType: "tradie", actorId: "contact-tradie-leo", at: daysAgo(208).toISOString() },
      { eventType: "verify", actorType: "tenant", actorId: "token-tenant-1", at: daysAgo(207).toISOString() },
      { eventType: "invoice", actorType: "tradie", actorId: "contact-tradie-leo", at: daysAgo(206).toISOString() },
      { eventType: "record_payment", actorType: "system", actorId: "auto-payment", at: daysAgo(206).toISOString() },
      { eventType: "close", actorType: "system", actorId: "auto-payment", at: daysAgo(206).toISOString() },
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
  { id: "contact-owner-mark", kind: "owner", fullName: "Mark McNamara", email: "mac@1pacent.com" },
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
  autoQuoteEnabled: boolean;
  autoQuoteMaxTotalCents: number | null;
}
const rateCards: DemoRateCard[] = [
  {
    tradieContactId: "contact-tradie-john",
    callOutFeeCents: 8_000,
    hourlyRateCents: 12_000,
    items: [
      { category: "electrical_general", flatPriceCents: 18_000, typicalMinutes: 90 },
      { category: "plumbing_general", flatPriceCents: 16_000, typicalMinutes: 60 },
    ],
    autoQuoteEnabled: false,
    autoQuoteMaxTotalCents: null,
  },
];

/** George's slot proposals draw on these recurring weekly windows. */
interface DemoAvailabilityWindow {
  tradieContactId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}
const availabilityWindows: DemoAvailabilityWindow[] = [
  { tradieContactId: "contact-tradie-john", dayOfWeek: 1, startTime: "08:00", endTime: "16:00" },
  { tradieContactId: "contact-tradie-john", dayOfWeek: 2, startTime: "08:00", endTime: "16:00" },
  { tradieContactId: "contact-tradie-john", dayOfWeek: 4, startTime: "08:00", endTime: "12:00" },
  { tradieContactId: "contact-tradie-leo", dayOfWeek: 3, startTime: "07:00", endTime: "15:00" },
  { tradieContactId: "contact-tradie-sarah", dayOfWeek: 5, startTime: "09:00", endTime: "17:00" },
];

interface DemoGeneratedReport {
  id: string;
  kind: ReportKind;
  subjectId: string | null;
  audienceContactId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}
const generatedReports: DemoGeneratedReport[] = [];
let demoReportSeq = 0;

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

interface DemoWorkOrder {
  id: string;
  requestId: string;
  tradieContactId: string;
  status: RequestState; // projection only, mirrors the request's state
  quoteCents: number | null;
  callOutFeeCents: number | null;
  invoiceCents: number | null;
  assetId: string | null;
  warrantyExpiresAt: string | null;
  completionNote: string | null;
  invoicedAt?: string | null;
  proposedSlots?: Array<{ startAt: string; endAt: string }> | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
}
const workOrders: DemoWorkOrder[] = [
  // A completed HWS replacement — gives the Cost Index a real median for hot
  // water systems, which powers the horizon card's planned-replacement figure
  // and the data pack's depreciation planning estimates.
  {
    id: "wo-seed-hws",
    requestId: "req-hws-richmond",
    tradieContactId: "contact-tradie-leo",
    status: "closed",
    quoteCents: 250_000,
    callOutFeeCents: 8_000,
    invoiceCents: 240_000,
    assetId: "asset-seed-hws-richmond",
    warrantyExpiresAt: null,
    completionNote: "Replaced with heat-pump HWS",
    invoicedAt: daysAgo(206).toISOString(),
  },
  // The March tap repair — completed, invoiced, under warranty. Feeds the
  // owner's spending card, John's accuracy card, and the warranty-catch path.
  {
    id: "wo-seed-tap",
    requestId: "req-tap",
    tradieContactId: "contact-tradie-john",
    status: "closed",
    quoteCents: 18_000,
    callOutFeeCents: 8_000,
    invoiceCents: 16_500,
    assetId: "asset-seed-tap",
    warrantyExpiresAt: new Date(Date.now() + 80 * 86_400_000).toISOString(),
    completionNote: "Replaced mixer cartridge",
    invoicedAt: daysAgo(5).toISOString(),
  },
];
let demoWorkOrderSeq = 0;

interface DemoPropertyAsset {
  id: string;
  propertyId: string;
  category: RequestCategory;
  label: string;
  installedAt: string | null;
}
const propertyAssets: DemoPropertyAsset[] = [
  {
    id: "asset-seed-tap",
    propertyId: "prop-richmond",
    category: "plumbing_general",
    label: "Kitchen mixer tap",
    installedAt: daysAgo(5).toISOString(),
  },
  {
    id: "asset-seed-hws-richmond",
    propertyId: "prop-richmond",
    category: "failure_of_essential_service_hot_water",
    label: "Heat-pump hot water system",
    installedAt: daysAgo(206).toISOString(),
  },
  {
    // HWS at year ~10 of 12 — the Asset Horizon card's flagship line.
    id: "asset-seed-hws",
    propertyId: "prop-fitzroy",
    category: "failure_of_essential_service_hot_water",
    label: "Hot water system (Rheem Stellar 360)",
    installedAt: daysAgo(3_680).toISOString(),
  },
];
let demoAssetSeq = 0;

interface DemoApprovalPolicyRule {
  id: string;
  propertyId: string;
  priority: number;
  maxTotalCents: number | null;
  minTrustScore: number | null;
  excludeCategories: RequestCategory[];
  enabled: boolean;
}
const approvalPolicyRules: DemoApprovalPolicyRule[] = [];
let demoPolicyRuleSeq = 0;

/** Demo stand-ins for hashed access_tokens rows. Tradie-job tokens are issued
 * dynamically by dispatchQuotesForRequest, so this map is mutable. */
type DemoTokenScope =
  | "tenant_intake"
  | "landlord_approval"
  | "tradie_job"
  | "tradie_portal"
  | "pm_portfolio"
  | "tradie_lead_intake"
  | "owner_portal";
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
  "demo-owner-portal": {
    scope: "owner_portal",
    aggregateId: "contact-owner-mark",
    contactId: "contact-owner-mark",
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

/** Shared by the landlord's manual accept click and the approval-policy
 * auto-accept path — mirrors supabase-data.ts's acceptQuoteTx. */
function acceptQuoteInternal(
  request: DemoRequest,
  quoteId: string,
  actorType: ActorType,
  actorId: string,
): AcceptQuoteResult {
  const current = requestState(request);
  const result = transition(current, "accept_quote", actorType);
  if (!result.ok) return { ok: false, error: `Cannot accept a quote from state "${current}".` };

  const requestQuotes = quotes.filter((q) => q.requestId === request.id);
  const accepted = requestQuotes.find((q) => q.id === quoteId);
  if (!accepted) return { ok: false, error: "Quote not found for this request." };
  if (accepted.status !== "submitted") return { ok: false, error: "Only a submitted quote can be accepted." };

  request.events.push({ eventType: "accept_quote", actorType, actorId, at: new Date().toISOString() });
  accepted.status = "accepted";
  const declined = requestQuotes.filter((q) => q.id !== quoteId);
  declined.forEach((q) => (q.status = "not_selected"));

  // George's slot proposal (v7 §3): computed here, confirmed by a human on a card.
  const windows = availabilityWindows
    .filter((w) => w.tradieContactId === accepted.tradieContactId)
    .map((w) => ({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime }));
  const slots = proposeSlots(windows, {
    from: earliestSlotStart(new Date(), isUrgentCategory(request.category)),
  });

  workOrders.push({
    id: `wo-${++demoWorkOrderSeq}`,
    requestId: request.id,
    tradieContactId: accepted.tradieContactId,
    status: "scheduled",
    quoteCents: accepted.quoteCents,
    callOutFeeCents: accepted.callOutFeeCents,
    invoiceCents: null,
    assetId: null,
    warrantyExpiresAt: null,
    completionNote: null,
    proposedSlots: slots.map((s) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() })),
    scheduledStartAt: null,
    scheduledEndAt: null,
  });

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
    const owner = p.ownerContactId ? contacts.find((c) => c.id === p.ownerContactId) : null;
    const now = new Date();
    return {
      id: p.id,
      address: p.address,
      suburb: p.suburb,
      autoApproveCapCents: p.autoApproveCapCents,
      compliance: p.compliance,
      occupancyStatus: p.occupancyStatus ?? "tenanted",
      ownerContactId: p.ownerContactId ?? null,
      ownerName: owner?.fullName ?? null,
      availableOwners: contacts.filter((c) => c.kind === "owner").map((c) => ({ id: c.id, name: c.fullName })),
      openWarranties: workOrders
        .filter((w) => w.warrantyExpiresAt && new Date(w.warrantyExpiresAt) > now)
        .map((w) => {
          const asset = propertyAssets.find((a) => a.id === w.assetId);
          if (!asset || asset.propertyId !== p.id) return null;
          const tradie = contacts.find((c) => c.id === w.tradieContactId);
          return {
            assetLabel: asset.label,
            category: asset.category,
            tradieName: tradie?.fullName ?? "Unknown",
            expiresAt: w.warrantyExpiresAt!,
          };
        })
        .filter((w): w is NonNullable<typeof w> => w !== null),
      openRequests: p.requests.filter((r) => !["closed", "cancelled"].includes(r.state)).length,
      requests: p.requests.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        estimateCents: r.estimateCents,
        state: r.state,
        isWarrantyClaim: Boolean(r.warrantyClaimOfWorkOrderId),
        events: r.events.map((e) => ({ eventType: e.eventType, actorType: e.actorType, note: e.note, at: e.at })),
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

    // Warranty-aware routing (Developer Brief v4 §2): skip the intake gate and
    // the 3-quote marketplace entirely when an open warranty matches.
    const candidates: WarrantyCandidate[] = workOrders
      .filter((w) => w.warrantyExpiresAt && w.assetId)
      .map((w) => {
        const asset = propertyAssets.find((a) => a.id === w.assetId && a.propertyId === property.id);
        return asset
          ? {
              workOrderId: w.id,
              tradieContactId: w.tradieContactId,
              assetId: asset.id,
              category: asset.category,
              warrantyExpiresAt: new Date(w.warrantyExpiresAt!),
            }
          : null;
      })
      .filter((c): c is WarrantyCandidate => c !== null);
    const warrantyMatch = findWarrantyMatch(candidates, extraction.category, new Date());

    if (warrantyMatch) {
      const now = new Date().toISOString();
      const request: DemoRequest = {
        id: `req-${Math.random().toString(36).slice(2, 8)}`,
        propertyId: property.id,
        title: extraction.title,
        description: extraction.description,
        category: extraction.category,
        estimateCents: null,
        reportedAt: now,
        warrantyClaimOfWorkOrderId: warrantyMatch.workOrderId,
        events: [
          { eventType: "triage", actorType: "system", actorId: "sally", at: now },
          {
            eventType: "auto_approve",
            actorType: "system",
            actorId: "warranty-routing",
            at: now,
            note: "Warranty claim — routed to the original tradie, no marketplace round.",
          },
          {
            eventType: "schedule",
            actorType: "system",
            actorId: "warranty-routing",
            at: now,
            note: "Dispatched directly under an open warranty.",
          },
        ],
      };
      requests.push(request);
      workOrders.push({
        id: `wo-${++demoWorkOrderSeq}`,
        requestId: request.id,
        tradieContactId: warrantyMatch.tradieContactId,
        status: "scheduled",
        quoteCents: 0,
        callOutFeeCents: 0,
        invoiceCents: null,
        assetId: warrantyMatch.assetId,
        warrantyExpiresAt: null,
        completionNote: null,
      });
      convo.status = "completed";
      convo.requestId = request.id;
      return { ok: true as const, requestId: request.id, state: requestState(request), urgent: false };
    }

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

    // Nelly's auto-quote (v6 §4): opt-in, bounded, revocable — submits the
    // tradie's own rate-card price the moment the invite lands, attributed.
    for (const invite of invites) {
      const card = rateCards.find((c) => c.tradieContactId === invite.tradieContactId);
      if (!card?.autoQuoteEnabled) continue;
      const suggestion = suggestFromRateCard(card, request.category);
      if (suggestion === null) continue;
      const total = suggestion + card.callOutFeeCents;
      if (card.autoQuoteMaxTotalCents !== null && total > card.autoQuoteMaxTotalCents) continue;
      await demoData.submitQuoteByToken(invite.token, {
        quoteCents: suggestion,
        callOutFeeCents: card.callOutFeeCents,
        note: `Auto-submitted by Nelly from ${invite.tradieName}'s rate card (opt-in, within set bounds).`,
      });
    }

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

    // Approval policy (Developer Brief v4 §3): once every invited quote for this
    // request has resolved, rank them and check whether the property's policy
    // pre-approves the winner — evaluated against a real price.
    const request = requests.find((r) => r.id === quote.requestId);
    if (!request || requestState(request) !== "quoting") return { ok: true as const };
    const siblingQuotes = quotes.filter((q) => q.requestId === quote.requestId);
    if (siblingQuotes.some((q) => q.status === "invited")) return { ok: true as const };

    const submitted = siblingQuotes.filter((q) => q.status === "submitted");
    if (submitted.length === 0) return { ok: true as const };
    const trustIds = [...new Set(submitted.map((q) => q.tradieContactId))];
    const trust = await demoData.getTradieTrustSummaries(trustIds);
    const rankable = submitted
      .filter((q) => q.quoteCents !== null && q.callOutFeeCents !== null)
      .map((q) => ({
        quoteId: q.id,
        totalCents: q.quoteCents! + q.callOutFeeCents!,
        trustScore: scoreTrust(trust[q.tradieContactId] ?? { completedJobs: 0, avgAbsVariancePct: null }),
        availabilityScore: scoreAvailability({
          tradieRespondedWithinMinutes: q.submittedAt
            ? (new Date(q.submittedAt).getTime() - new Date(q.createdAt).getTime()) / 60_000
            : null,
          matchesTenantPreferredWindow: false,
          currentOpenJobCount: 0,
        }),
      }));
    if (rankable.length === 0) return { ok: true as const };
    const winner = rankQuotes(rankable)[0]!;

    const rules: ApprovalPolicyRule[] = approvalPolicyRules
      .filter((r) => r.propertyId === request.propertyId && r.enabled)
      .sort((a, b) => a.priority - b.priority)
      .map((r) => ({
        maxTotalCents: r.maxTotalCents,
        minTrustScore: r.minTrustScore,
        excludeCategories: r.excludeCategories,
      }));
    const policyResult = evaluateApprovalPolicy(rules, {
      category: request.category,
      totalCents: winner.totalCents,
      trustScore: winner.trustScore,
    });
    if (!policyResult.autoApprove) return { ok: true as const };

    const acceptResult = acceptQuoteInternal(request, winner.quoteId, "system", "approval-policy");
    if (!acceptResult.ok || !acceptResult.accepted || !acceptResult.declined) return { ok: true as const };
    return {
      ok: true as const,
      autoAccepted: { requestId: request.id, accepted: acceptResult.accepted, declined: acceptResult.declined },
    };
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
    return acceptQuoteInternal(request, quoteId, "landlord", "dashboard");
  },

  async getComparableJobs(propertyId: string, category: RequestCategory): Promise<Array<{ finalInvoiceCents: number }>> {
    const requestIdsForCategory = requests.filter((r) => r.category === category).map((r) => r.id);
    void propertyId; // demo store is single-org; comparables pool across the whole demo org, like a small network would
    return workOrders
      .filter((w) => w.invoiceCents !== null && requestIdsForCategory.includes(w.requestId))
      .map((w) => ({ finalInvoiceCents: w.invoiceCents! }));
  },

  async getTypicalResponseMinutes(): Promise<number | null> {
    return null;
  },

  async getTradieTrustSummaries(tradieContactIds: string[]) {
    const summaries: Record<string, { completedJobs: number; avgAbsVariancePct: number | null }> = {};
    for (const id of tradieContactIds) {
      const completed = workOrders.filter((w) => w.tradieContactId === id && w.invoiceCents !== null);
      if (completed.length === 0) {
        summaries[id] = { completedJobs: 0, avgAbsVariancePct: null };
        continue;
      }
      const variances = completed
        .filter((w) => w.quoteCents !== null && w.quoteCents! > 0)
        .map((w) => Math.abs(w.invoiceCents! - w.quoteCents!) / w.quoteCents!);
      const avgAbsVariancePct =
        variances.length > 0 ? (variances.reduce((a, b) => a + b, 0) / variances.length) * 100 : null;
      summaries[id] = { completedJobs: completed.length, avgAbsVariancePct };
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
        autoQuoteEnabled: false,
        autoQuoteMaxTotalCents: null,
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
    const batches = computeBatchableCompliance(
      propertyDetails.map((p) => ({ address: p.address, suburb: p.suburb, compliance: p.compliance })),
    );
    return {
      pmName: pm.fullName,
      properties: propertyDetails,
      batchableCompliance: batches.map((b) => ({
        requirementKey: b.requirementKey,
        requirementName: b.requirementName,
        suburb: b.suburb,
        propertyAddresses: b.propertyAddresses,
        windowStart: b.windowStart.toISOString(),
        windowEnd: b.windowEnd.toISOString(),
      })),
    };
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
      owners: contacts.filter((c) => c.kind === "owner").map((c) => ({ id: c.id, name: c.fullName })),
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

  async listTradieJobs(tradiePortalToken: string): Promise<TradieJobSummary[]> {
    const resolved = demoTokens[tradiePortalToken];
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return [];
    const ACTIVE: RequestState[] = ["scheduled", "in_progress", "evidence_pending", "verified"];
    return workOrders
      .filter((w) => w.tradieContactId === resolved.contactId)
      .map((w) => {
        const request = requests.find((r) => r.id === w.requestId);
        if (!request) return null;
        const state = requestState(request);
        if (!ACTIVE.includes(state)) return null;
        const property = properties.find((p) => p.id === request.propertyId);
        return {
          workOrderId: w.id,
          requestId: request.id,
          requestTitle: request.title,
          propertyAddress: property ? `${property.address}, ${property.suburb}` : "",
          category: request.category,
          state,
          quoteCents: w.quoteCents,
          callOutFeeCents: w.callOutFeeCents,
        };
      })
      .filter((j): j is TradieJobSummary => j !== null);
  },

  async startJob(tradiePortalToken: string, workOrderId: string) {
    const resolved = demoTokens[tradiePortalToken];
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) {
      return { ok: false as const, error: "This portal link isn't active." };
    }
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === resolved.contactId);
    if (!wo) return { ok: false as const, error: "Job not found." };
    const request = requests.find((r) => r.id === wo.requestId);
    if (!request) return { ok: false as const, error: "Request not found." };
    const current = requestState(request);
    const result = transition(current, "start_work", "tradie");
    if (!result.ok) return { ok: false as const, error: `Cannot start a job from state "${current}".` };
    request.events.push({ eventType: "start_work", actorType: "tradie", actorId: `token:${tradiePortalToken}`, at: new Date().toISOString() });
    wo.status = result.state;
    return { ok: true as const };
  },

  async markJobDone(tradiePortalToken: string, workOrderId: string, note: string) {
    const resolved = demoTokens[tradiePortalToken];
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) {
      return { ok: false as const, error: "This portal link isn't active." };
    }
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === resolved.contactId);
    if (!wo) return { ok: false as const, error: "Job not found." };
    const request = requests.find((r) => r.id === wo.requestId);
    if (!request) return { ok: false as const, error: "Request not found." };
    const current = requestState(request);
    const result = transition(current, "submit_evidence", "tradie");
    if (!result.ok) return { ok: false as const, error: `Cannot mark this done from state "${current}".` };
    request.events.push({
      eventType: "submit_evidence",
      actorType: "tradie",
      actorId: `token:${tradiePortalToken}`,
      at: new Date().toISOString(),
      note,
    });
    wo.status = result.state;
    wo.completionNote = note;
    return { ok: true as const };
  },

  async confirmFixed(tenantIntakeToken: string, requestId: string) {
    const resolved = demoTokens[tenantIntakeToken];
    if (resolved?.scope !== "tenant_intake") return { ok: false as const, error: "This link isn't active." };
    const request = requests.find((r) => r.id === requestId && r.propertyId === resolved.aggregateId);
    if (!request) return { ok: false as const, error: "Request not found." };
    const current = requestState(request);
    const result = transition(current, "verify", "tenant");
    if (!result.ok) return { ok: false as const, error: `Cannot confirm from state "${current}".` };
    request.events.push({ eventType: "verify", actorType: "tenant", actorId: `token:${tenantIntakeToken}`, at: new Date().toISOString() });
    const wo = workOrders.find((w) => w.requestId === request.id);
    if (wo) wo.status = result.state;
    return { ok: true as const };
  },

  async invoiceJob(tradiePortalToken: string, workOrderId: string, input: InvoiceJobInput) {
    const resolved = demoTokens[tradiePortalToken];
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) {
      return { ok: false as const, error: "This portal link isn't active." };
    }
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === resolved.contactId);
    if (!wo) return { ok: false as const, error: "Job not found." };
    const request = requests.find((r) => r.id === wo.requestId);
    if (!request) return { ok: false as const, error: "Request not found." };
    const current = requestState(request);
    const invoiceResult = transition(current, "invoice", "tradie");
    if (!invoiceResult.ok) return { ok: false as const, error: `Cannot invoice from state "${current}".` };

    let asset = propertyAssets.find((a) => a.propertyId === request.propertyId && a.category === input.assetCategory);
    if (asset) {
      if (input.assetInstalledAt) {
        asset.label = input.assetLabel;
        asset.installedAt = input.assetInstalledAt;
      }
    } else {
      asset = {
        id: `asset-${++demoAssetSeq}`,
        propertyId: request.propertyId,
        category: input.assetCategory,
        label: input.assetLabel,
        installedAt: input.assetInstalledAt,
      };
      propertyAssets.push(asset);
    }

    const warrantyExpiresAt =
      input.warrantyMonths > 0 ? new Date(Date.now() + input.warrantyMonths * 30 * 86_400_000).toISOString() : null;

    wo.invoiceCents = input.invoiceCents;
    wo.callOutFeeCents = input.callOutFeeCents;
    wo.assetId = asset.id;
    wo.warrantyExpiresAt = warrantyExpiresAt;
    wo.invoicedAt = new Date().toISOString();

    // PM compliance batch (v5 §3.1): completing the batch-created job files
    // the certificate — the traffic light goes green from real work, not admin.
    if (request.complianceRequirementKey) {
      const property = properties.find((p) => p.id === request.propertyId);
      property?.evidence.push({
        requirementKey: request.complianceRequirementKey,
        completedAt: new Date(),
      });
    }

    const now = new Date().toISOString();
    request.events.push({
      eventType: "invoice",
      actorType: "tradie",
      actorId: `token:${tradiePortalToken}`,
      at: now,
      note: `Invoiced ${(input.invoiceCents / 100).toFixed(2)}, warranty ${input.warrantyMonths}mo`,
    });

    // No payment provider exists yet (documented non-goal) — auto-record and
    // close immediately rather than leaving the job in limbo.
    const paidResult = transition(invoiceResult.state, "record_payment", "system");
    const closedResult = paidResult.ok ? transition(paidResult.state, "close", "system") : null;
    if (paidResult.ok) {
      request.events.push({ eventType: "record_payment", actorType: "system", actorId: "auto-payment", at: now });
    }
    if (closedResult?.ok) {
      request.events.push({ eventType: "close", actorType: "system", actorId: "auto-payment", at: now });
    }
    wo.status = closedResult?.ok ? closedResult.state : invoiceResult.state;

    return { ok: true as const };
  },

  async getRequestStatusForContact(tenantIntakeToken: string): Promise<TenantRequestStatus[]> {
    const resolved = demoTokens[tenantIntakeToken];
    if (resolved?.scope !== "tenant_intake") return [];
    return requests
      .filter((r) => r.propertyId === resolved.aggregateId)
      .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
      .map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        estimateCents: r.estimateCents,
        state: requestState(r),
        isWarrantyClaim: Boolean(r.warrantyClaimOfWorkOrderId),
        events: r.events.map((e) => ({ eventType: e.eventType, actorType: e.actorType, note: e.note, at: e.at })),
      }));
  },

  async updatePropertyOwnership(propertyId: string, input: { occupancyStatus: OccupancyStatus; ownerContactId: string | null }) {
    const property = properties.find((p) => p.id === propertyId);
    if (!property) return { ok: false as const, error: "Property not found." };
    property.occupancyStatus = input.occupancyStatus;
    property.ownerContactId = input.ownerContactId ?? undefined;
    return { ok: true as const };
  },

  async getApprovalPolicy(propertyId: string): Promise<ApprovalPolicyRuleView[]> {
    return approvalPolicyRules
      .filter((r) => r.propertyId === propertyId)
      .sort((a, b) => a.priority - b.priority)
      .map((r) => ({
        id: r.id,
        priority: r.priority,
        maxTotalCents: r.maxTotalCents,
        minTrustScore: r.minTrustScore,
        excludeCategories: r.excludeCategories,
        enabled: r.enabled,
      }));
  },

  async saveApprovalPolicy(propertyId: string, rules: ApprovalPolicyRuleInput[]) {
    const property = properties.find((p) => p.id === propertyId);
    if (!property) return { ok: false as const, error: "Property not found." };
    for (let i = approvalPolicyRules.length - 1; i >= 0; i--) {
      if (approvalPolicyRules[i]!.propertyId === propertyId) approvalPolicyRules.splice(i, 1);
    }
    for (const r of rules) {
      approvalPolicyRules.push({
        id: `policy-${++demoPolicyRuleSeq}`,
        propertyId,
        priority: r.priority,
        maxTotalCents: r.maxTotalCents,
        minTrustScore: r.minTrustScore,
        excludeCategories: r.excludeCategories,
        enabled: r.enabled,
      });
    }
    return { ok: true as const };
  },

  // ——— Talk / See / Do (Developer Brief v6) ———

  async getCanvasCards(token: string): Promise<CanvasCard[]> {
    const resolved = resolveDemoToken(token);
    if (!resolved) return [];
    switch (resolved.scope) {
      case "tenant_intake":
        return tenantCanvasCards(token, resolved.aggregateId);
      case "owner_portal":
        return ownerCanvasCards(token, resolved.aggregateId);
      case "pm_portfolio":
        return pmCanvasCards(resolved.aggregateId);
      case "tradie_portal":
        return tradieCanvasCards(token, resolved.aggregateId);
      default:
        return [];
    }
  },

  async getSpendingSummary(scopeToken: string, periodMonths: number): Promise<SpendingSummaryView | null> {
    const propertyIds = scopedPropertyIds(scopeToken);
    if (propertyIds === null) return null;
    return spendingForProperties(propertyIds, periodMonths);
  },

  async getAssetHorizon(scopeToken: string): Promise<AssetHorizonView[]> {
    const propertyIds = scopedPropertyIds(scopeToken);
    if (propertyIds === null) return [];
    return assetHorizonForProperties(propertyIds);
  },

  async getObligationsCalendar(scopeToken: string, horizonDays: number): Promise<ObligationsCalendarView | null> {
    const propertyIds = scopedPropertyIds(scopeToken);
    if (propertyIds === null) return null;
    return obligationsForProperties(propertyIds, horizonDays);
  },

  async generateReport(scopeToken: string, kind: ReportKind, subjectId?: string) {
    const resolved = resolveDemoToken(scopeToken);
    const propertyIds = scopedPropertyIds(scopeToken);
    if (!resolved || propertyIds === null) return { ok: false, error: "This link isn't active." };
    const subject = subjectId && propertyIds.includes(subjectId) ? subjectId : propertyIds[0];
    if (!subject) return { ok: false, error: "No property in scope for this report." };

    let payload: Record<string, unknown>;
    if (kind === "property_data_pack") {
      payload = buildDataPackPayload(subject);
    } else if (kind === "spending_summary") {
      payload = { ...spendingForProperties(propertyIds, 12) };
    } else if (kind === "obligations_calendar") {
      payload = { ...obligationsForProperties(propertyIds, 120) };
    } else {
      return { ok: false, error: `Report kind "${kind}" isn't available yet.` };
    }

    const id = `report-${++demoReportSeq}`;
    generatedReports.push({
      id,
      kind,
      subjectId: subject,
      audienceContactId: resolved.contactId ?? null,
      payload,
      createdAt: new Date().toISOString(),
    });
    return { ok: true, reportId: id };
  },

  async getReport(scopeToken: string, reportId: string): Promise<GeneratedReportView | null> {
    const resolved = resolveDemoToken(scopeToken);
    if (!resolved || !["owner_portal", "pm_portfolio", "tradie_portal"].includes(resolved.scope)) return null;
    const report = generatedReports.find((r) => r.id === reportId);
    if (!report) return null;
    return { id: report.id, kind: report.kind, createdAt: report.createdAt, payload: report.payload };
  },

  async getComplianceStatus(scopeToken: string): Promise<ComplianceStatusView[]> {
    const resolved = resolveDemoToken(scopeToken);
    if (!resolved) return [];
    const propertyIds =
      resolved.scope === "tenant_intake" ? [resolved.aggregateId] : scopedPropertyIds(scopeToken);
    if (propertyIds === null) return [];
    const today = new Date();
    return properties
      .filter((p) => propertyIds.includes(p.id))
      .map((p) => {
        const compliance = evaluateProperty(p.profile, p.evidence, today);
        return {
          propertyAddress: `${p.address}, ${p.suburb}`,
          overall: compliance.overall,
          requirements: compliance.requirements.map((r) => ({
            name: r.requirement.name,
            status: r.status,
            lastCompletedAt: r.lastCompletedAt?.toISOString() ?? null,
            dueAt: r.dueAt?.toISOString() ?? null,
          })),
        };
      });
  },

  async getOwnerPortalContext(token: string): Promise<OwnerPortalContext | null> {
    const resolved = resolveDemoToken(token);
    if (resolved?.scope !== "owner_portal") return null;
    const owner = contacts.find((c) => c.id === resolved.aggregateId);
    if (!owner) return null;
    const ownedIds = properties.filter((p) => p.ownerContactId === owner.id).map((p) => p.id);
    const details = (await Promise.all(ownedIds.map((id) => demoData.getProperty(id)))).filter(
      (p): p is PropertyDetail => p !== null,
    );
    return { ownerContactId: owner.id, ownerName: owner.fullName, properties: details };
  },

  async mintOwnerPortalLink(ownerContactId: string): Promise<MintLinkResult> {
    const owner = contacts.find((c) => c.id === ownerContactId && c.kind === "owner");
    if (!owner) return { ok: false, error: "Owner not found." };
    const token = issueDemoToken("owner_portal", owner.id, owner.id);
    return { ok: true, path: `/o/${token}` };
  },

  async confirmSlot(token: string, workOrderId: string, slotIndex: number) {
    const resolved = resolveDemoToken(token);
    if (!resolved || !["tenant_intake", "owner_portal"].includes(resolved.scope)) {
      return { ok: false as const, error: "This link isn't active." };
    }
    const wo = workOrders.find((w) => w.id === workOrderId);
    if (!wo?.proposedSlots) return { ok: false as const, error: "No proposed slots for this job." };
    const slot = wo.proposedSlots[slotIndex];
    if (!slot) return { ok: false as const, error: "That slot is no longer available." };
    const request = requests.find((r) => r.id === wo.requestId);
    if (!request) return { ok: false as const, error: "Request not found." };
    // Scope check: the job must belong to a property this token can see.
    const inScope =
      resolved.scope === "tenant_intake"
        ? request.propertyId === resolved.aggregateId
        : properties.some((p) => p.id === request.propertyId && p.ownerContactId === resolved.aggregateId);
    if (!inScope) return { ok: false as const, error: "Job not found." };

    // Recorded on the work-order aggregate (the request is already
    // "scheduled"; replaying a second schedule event would corrupt the
    // stream). The human actor is the audit point.
    wo.scheduledStartAt = slot.startAt;
    wo.scheduledEndAt = slot.endAt;
    wo.proposedSlots = null;
    wo.completionNote = wo.completionNote ?? null;
    return { ok: true as const };
  },

  async dispatchComplianceBatch(pmPortfolioToken: string, input: { requirementKey: string; suburb: string }) {
    const resolved = resolveDemoToken(pmPortfolioToken);
    if (resolved?.scope !== "pm_portfolio" || !resolved.contactId) {
      return { ok: false as const, error: "This link isn't active." };
    }
    const managed = properties.filter((p) => p.pmContactId === resolved.contactId);
    const today = new Date();
    const targets = managed.filter((p) => {
      if (p.suburb !== input.suburb) return false;
      const compliance = evaluateProperty(p.profile, p.evidence, today);
      return compliance.requirements.some(
        (r) => r.requirement.key === input.requirementKey && r.status !== "green" && r.dueAt,
      );
    });
    if (targets.length === 0) return { ok: false as const, error: "No batchable properties for that requirement." };

    const requirementName =
      evaluateProperty(targets[0]!.profile, targets[0]!.evidence, today).requirements.find(
        (r) => r.requirement.key === input.requirementKey,
      )?.requirement.name ?? input.requirementKey;
    const category = complianceCategoryFor(input.requirementKey);

    let dispatched = 0;
    for (const property of targets) {
      // Skip if an open batch request already exists for this requirement.
      const existing = requests.find(
        (r) =>
          r.propertyId === property.id &&
          r.complianceRequirementKey === input.requirementKey &&
          !["closed", "cancelled", "declined"].includes(requestState(r)),
      );
      if (existing) continue;
      const now = new Date().toISOString();
      const request: DemoRequest = {
        id: `req-${Math.random().toString(36).slice(2, 8)}`,
        propertyId: property.id,
        title: `${requirementName} (compliance batch)`,
        description: `Scheduled ${requirementName.toLowerCase()} — batched across ${targets.length} ${input.suburb} properties for a negotiated rate.`,
        category,
        estimateCents: null,
        reportedAt: now,
        complianceRequirementKey: input.requirementKey,
        events: [
          { eventType: "triage", actorType: "system", actorId: "compliance-batch", at: now },
          { eventType: "request_approval", actorType: "system", actorId: "compliance-batch", at: now },
          // The PM's tap is the human approval — attributed to their contact id.
          { eventType: "approve", actorType: "agency_user", actorId: resolved.contactId, at: now, note: "PM batch dispatch" },
        ],
      };
      requests.push(request);
      await demoData.dispatchQuotesForRequest(request.id);
      dispatched += 1;
    }
    return { ok: true as const, dispatched };
  },

  async getAutoQuoteSettings(tradiePortalToken: string): Promise<AutoQuoteSettingsView | null> {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return null;
    const card = rateCards.find((c) => c.tradieContactId === resolved.contactId);
    if (!card) return { enabled: false, maxTotalCents: null };
    return { enabled: card.autoQuoteEnabled, maxTotalCents: card.autoQuoteMaxTotalCents };
  },

  async setAutoQuote(tradiePortalToken: string, input: { enabled: boolean; maxTotalCents: number | null }) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) {
      return { ok: false as const, error: "This link isn't active." };
    }
    const card = rateCards.find((c) => c.tradieContactId === resolved.contactId);
    if (!card) return { ok: false as const, error: "Set up your rate card first — auto-quote submits from it." };
    card.autoQuoteEnabled = input.enabled;
    card.autoQuoteMaxTotalCents = input.maxTotalCents;
    return { ok: true as const };
  },

  async getTradieAccuracy(tradiePortalToken: string): Promise<TradieAccuracyView | null> {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return null;
    return tradieAccuracyFor(resolved.contactId);
  },
};

// ——— Talk / See / Do helpers (v6): deterministic projections, no LLM ———

/** The property set a seat token may read — the data-layer security boundary. */
function scopedPropertyIds(scopeToken: string): string[] | null {
  const resolved = resolveDemoToken(scopeToken);
  if (!resolved) return null;
  if (resolved.scope === "owner_portal") {
    return properties.filter((p) => p.ownerContactId === resolved.aggregateId).map((p) => p.id);
  }
  if (resolved.scope === "pm_portfolio") {
    return properties.filter((p) => p.pmContactId === resolved.contactId).map((p) => p.id);
  }
  return null;
}

/** Median invoice per category across the whole (demo) network — the Cost Index. */
function networkMedians(): Partial<Record<RequestCategory, number>> {
  const byCategory = new Map<RequestCategory, number[]>();
  for (const wo of workOrders) {
    if (wo.invoiceCents === null) continue;
    const request = requests.find((r) => r.id === wo.requestId);
    if (!request) continue;
    if (!byCategory.has(request.category)) byCategory.set(request.category, []);
    byCategory.get(request.category)!.push(wo.invoiceCents);
  }
  const medians: Partial<Record<RequestCategory, number>> = {};
  for (const [category, values] of byCategory) {
    const sorted = [...values].sort((a, b) => a - b);
    medians[category] = sorted[Math.floor(sorted.length / 2)]!;
  }
  return medians;
}

function spendingForProperties(propertyIds: string[], periodMonths: number): SpendingSummaryView {
  const jobs = workOrders
    .map((wo) => {
      if (wo.invoiceCents === null) return null;
      const request = requests.find((r) => r.id === wo.requestId);
      if (!request || !propertyIds.includes(request.propertyId)) return null;
      return {
        category: request.category,
        invoiceCents: wo.invoiceCents,
        invoicedAt: new Date(wo.invoicedAt ?? request.reportedAt),
        propertyId: request.propertyId,
      };
    })
    .filter((j): j is NonNullable<typeof j> => j !== null);
  const summary = summariseSpending(jobs, {
    periodMonths,
    today: new Date(),
    networkMediansCents: networkMedians(),
  });
  return {
    periodMonths: summary.periodMonths,
    totalCents: summary.totalCents,
    jobCount: summary.jobCount,
    byCategory: summary.byCategory,
  };
}

function assetHorizonForProperties(propertyIds: string[]): AssetHorizonView[] {
  const today = new Date();
  const medians = networkMedians();
  return propertyAssets
    .filter((a) => propertyIds.includes(a.propertyId) && a.installedAt)
    .map((a) => {
      const property = properties.find((p) => p.id === a.propertyId);
      const horizon = assessAssetHorizon({
        category: a.category,
        installedAt: new Date(a.installedAt!),
        today,
      });
      return {
        propertyAddress: property ? `${property.address}, ${property.suburb}` : "",
        assetLabel: a.label,
        category: a.category,
        ageYears: horizon.ageYears,
        effectiveLifeYears: horizon.effectiveLifeYears,
        remainingLifeYears: horizon.remainingLifeYears,
        status: horizon.status,
        plannedReplacementCents: medians[a.category] ?? null,
        disclaimer: horizon.disclaimer,
      };
    })
    .sort((a, b) => a.remainingLifeYears - b.remainingLifeYears);
}

function obligationsForProperties(propertyIds: string[], horizonDays: number): ObligationsCalendarView {
  const today = new Date();
  const inputs = properties
    .filter((p) => propertyIds.includes(p.id))
    .map((p) => ({
      propertyId: p.id,
      address: p.address,
      suburb: p.suburb,
      compliance: evaluateProperty(p.profile, p.evidence, today),
    }));
  const calendar = buildObligationsCalendar(inputs, { horizonDays, today });
  return {
    horizonDays: calendar.horizonDays,
    totalObligations: calendar.totalObligations,
    months: calendar.months.map((m) => ({
      month: m.month,
      items: m.items.map((i) => ({
        propertyAddress: `${i.address}, ${i.suburb}`,
        requirementName: i.requirementName,
        dueAt: i.dueAt.toISOString(),
        daysUntilDue: i.daysUntilDue,
        status: i.status,
      })),
    })),
    batchable: calendar.batchable.map((b) => ({
      requirementKey: b.requirementKey,
      requirementName: b.requirementName,
      suburb: b.suburb,
      propertyAddresses: b.propertyAddresses,
      windowStart: b.windowStart.toISOString(),
      windowEnd: b.windowEnd.toISOString(),
    })),
  };
}

/** Which trade does a compliance requirement need? Routine categories only —
 * a scheduled check is never an "urgent repair". */
function complianceCategoryFor(requirementKey: string): RequestCategory {
  if (requirementKey.includes("gas")) return "plumbing_general";
  if (requirementKey.includes("electrical") || requirementKey.includes("rcd") || requirementKey.includes("smoke"))
    return "electrical_general";
  if (requirementKey.includes("pool")) return "garden_external";
  return "other";
}

function buildDataPackPayload(propertyId: string): Record<string, unknown> {
  const property = properties.find((p) => p.id === propertyId);
  if (!property) return {};
  const today = new Date();
  const medians = networkMedians();
  const compliance = evaluateProperty(property.profile, property.evidence, today);
  const propertyRequests = requests.filter((r) => r.propertyId === propertyId);
  const history = workOrders
    .map((wo) => {
      const request = propertyRequests.find((r) => r.id === wo.requestId);
      if (!request || wo.invoiceCents === null) return null;
      const tradie = contacts.find((c) => c.id === wo.tradieContactId);
      return {
        title: request.title,
        category: request.category,
        invoiceCents: wo.invoiceCents,
        tradieName: tradie?.fullName ?? "Unknown",
        invoicedAt: wo.invoicedAt ?? null,
      };
    })
    .filter((h): h is NonNullable<typeof h> => h !== null);
  const assets = propertyAssets
    .filter((a) => a.propertyId === propertyId)
    .map((a) => {
      const depreciation =
        a.installedAt && medians[a.category]
          ? estimateDepreciation({
              category: a.category,
              installedAt: new Date(a.installedAt),
              replacementCostCents: medians[a.category]!,
              today,
            })
          : null;
      return { label: a.label, category: a.category, installedAt: a.installedAt, depreciation };
    });
  const openWarranties = workOrders
    .filter((wo) => wo.warrantyExpiresAt && new Date(wo.warrantyExpiresAt) > today)
    .map((wo) => {
      const asset = propertyAssets.find((a) => a.id === wo.assetId && a.propertyId === propertyId);
      if (!asset) return null;
      return { assetLabel: asset.label, category: asset.category, expiresAt: wo.warrantyExpiresAt };
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);

  return {
    // The honesty constraint (Product Design v6 §1.1), carried in the payload
    // itself so every rendering of this pack states it.
    disclaimer: "planning_estimate",
    disclaimerText:
      "Depreciation figures are planning estimates from a curated effective-life table. An ATO-defensible capital-works schedule requires a registered quantity surveyor. This pack is the verified data feed that makes that job trivial — it is not a tax schedule.",
    property: { address: property.address, suburb: property.suburb },
    generatedAt: today.toISOString(),
    assets,
    maintenanceHistory: history,
    openWarranties,
    compliance: {
      overall: compliance.overall,
      requirements: compliance.requirements.map((r) => ({
        name: r.requirement.name,
        status: r.status,
        lastCompletedAt: r.lastCompletedAt?.toISOString() ?? null,
        dueAt: r.dueAt?.toISOString() ?? null,
      })),
    },
    spending: spendingForProperties([propertyId], 12),
  };
}

function tradieAccuracyFor(tradieContactId: string): TradieAccuracyView {
  const completed = workOrders.filter(
    (w) => w.tradieContactId === tradieContactId && w.invoiceCents !== null && w.quoteCents !== null && w.quoteCents > 0,
  );
  const recentJobs = completed.slice(-5).map((w) => {
    const request = requests.find((r) => r.id === w.requestId);
    return {
      requestTitle: request?.title ?? "Job",
      quoteCents: w.quoteCents!,
      invoiceCents: w.invoiceCents!,
      variancePct: Math.round(((w.invoiceCents! - w.quoteCents!) / w.quoteCents!) * 100),
    };
  });
  const variances = completed.map((w) => Math.abs(w.invoiceCents! - w.quoteCents!) / w.quoteCents!);
  const avgAbsVariancePct =
    variances.length > 0 ? (variances.reduce((a, b) => a + b, 0) / variances.length) * 100 : null;
  return {
    completedJobs: completed.length,
    avgAbsVariancePct,
    trustScore: scoreTrust({ completedJobs: completed.length, avgAbsVariancePct }),
    recentJobs,
  };
}

// ——— Canvas gathering per scope (v6 §4): the demo store collects normalized
// inputs and hands them to the SHARED builders in canvas.ts — parity with the
// Supabase store is structural, not a convention. ———

function slotInfosFor(requestIds: string[]): CanvasSlotInfo[] {
  return workOrders
    .filter((w) => requestIds.includes(w.requestId) && w.proposedSlots?.length)
    .map((w) => {
      const tradie = contacts.find((c) => c.id === w.tradieContactId);
      return {
        requestId: w.requestId,
        workOrderId: w.id,
        tradieName: tradie?.fullName ?? "the tradie",
        options: w.proposedSlots!.map((s) => ({
          startAt: s.startAt,
          endAt: s.endAt,
          label: formatSlot({ startAt: new Date(s.startAt), endAt: new Date(s.endAt) }),
        })),
      };
    });
}

async function tenantCanvasCards(token: string, _propertyId: string): Promise<CanvasCard[]> {
  const reqs = await demoData.getRequestStatusForContact(token);
  const compliance = await demoData.getComplianceStatus(token);
  return buildTenantCanvas({
    token,
    requests: reqs,
    slots: slotInfosFor(reqs.map((r) => r.id)),
    compliance,
  });
}

async function ownerCanvasCards(token: string, ownerContactId: string): Promise<CanvasCard[]> {
  const ctx = await demoData.getOwnerPortalContext(token);
  if (!ctx) return [];
  const allReqs = ctx.properties.flatMap((p) => p.requests);
  const nowIso = new Date().toISOString();

  const quotePicks: QuotePickInfo[] = [];
  for (const r of allReqs.filter((x) => x.state === "quoting")) {
    const requestQuotes = quotes.filter((q) => q.requestId === r.id);
    if (requestQuotes.some((q) => q.status === "invited")) continue;
    const submitted = requestQuotes.filter((q) => q.status === "submitted");
    if (submitted.length === 0) continue;
    quotePicks.push({
      requestId: r.id,
      title: r.title,
      estimateCents: r.estimateCents,
      quotes: rankQuotesForCard(submitted),
      at: r.events[r.events.length - 1]?.at ?? nowIso,
    });
  }

  const warrantyCatches = allReqs
    .filter((r) => r.isWarrantyClaim)
    .map((r) => {
      const demoReq = requests.find((x) => x.id === r.id);
      const original = workOrders.find((w) => w.id === demoReq?.warrantyClaimOfWorkOrderId);
      const tradie = contacts.find((c) => c.id === original?.tradieContactId);
      return {
        requestId: r.id,
        title: r.title,
        tradieName: tradie?.fullName ?? "the original tradie",
        savedApproxCents: networkMedians()[r.category] ?? null,
        at: r.events[r.events.length - 1]?.at ?? nowIso,
      };
    });

  const ownedIds = ctx.properties.map((p) => p.id);
  return buildOwnerCanvas({
    token,
    ctx,
    quotePicks,
    slots: slotInfosFor(allReqs.map((r) => r.id)),
    warrantyCatches,
    horizon: assetHorizonForProperties(ownedIds),
    spending: spendingForProperties(ownedIds, 12),
    reports: generatedReports
      .filter((r) => r.audienceContactId === ownerContactId)
      .map((r) => ({ id: r.id, kind: r.kind, createdAt: r.createdAt })),
  });
}

async function pmCanvasCards(pmContactId: string): Promise<CanvasCard[]> {
  const managed = properties.filter((p) => p.pmContactId === pmContactId);
  const details = (await Promise.all(managed.map((p) => demoData.getProperty(p.id)))).filter(
    (p): p is PropertyDetail => p !== null,
  );
  return buildPmCanvas({
    properties: details.map((p) => ({
      id: p.id,
      address: p.address,
      suburb: p.suburb,
      overall: p.compliance.overall,
      requests: p.requests,
    })),
    obligations: obligationsForProperties(managed.map((p) => p.id), 120),
  });
}

async function tradieCanvasCards(token: string, tradieContactId: string): Promise<CanvasCard[]> {
  const jobs = await demoData.listTradieJobs(token);
  const jobsWith = jobs.map((j) => {
    const wo = workOrders.find((w) => w.id === j.workOrderId);
    const request = requests.find((r) => r.id === j.requestId);
    const briefing = request
      ? propertyAssets
          .filter((a) => a.propertyId === request.propertyId)
          .map((a) => `${a.label}${a.installedAt ? ` (installed ${new Date(a.installedAt).getFullYear()})` : ""}`)
      : [];
    return {
      ...j,
      scheduledLabel: wo?.scheduledStartAt
        ? formatSlot({ startAt: new Date(wo.scheduledStartAt), endAt: new Date(wo.scheduledEndAt ?? wo.scheduledStartAt) })
        : null,
      briefing,
    };
  });
  return buildTradieCanvas({
    token,
    jobs: jobsWith,
    accuracy: tradieAccuracyFor(tradieContactId),
    autoQuote: await demoData.getAutoQuoteSettings(token),
  });
}

function rankQuotesForCard(submitted: DemoQuote[]): RankedQuoteOption[] {
  const rankable = submitted
    .filter((q) => q.quoteCents !== null && q.callOutFeeCents !== null)
    .map((q) => ({
      quoteId: q.id,
      totalCents: q.quoteCents! + q.callOutFeeCents!,
      trustScore: tradieAccuracyFor(q.tradieContactId).trustScore,
      availabilityScore: scoreAvailability({
        tradieRespondedWithinMinutes: q.submittedAt
          ? (new Date(q.submittedAt).getTime() - new Date(q.createdAt).getTime()) / 60_000
          : null,
        matchesTenantPreferredWindow: false,
        currentOpenJobCount: 0,
      }),
    }));
  if (rankable.length === 0) return [];
  return rankQuotes(rankable).map((rq, i) => {
    const q = submitted.find((x) => x.id === rq.quoteId)!;
    const tradie = contacts.find((c) => c.id === q.tradieContactId);
    return {
      quoteId: rq.quoteId,
      tradieName: tradie?.fullName ?? "Unknown",
      totalCents: rq.totalCents,
      trustScore: rq.trustScore,
      recommended: i === 0,
    };
  });
}

/** The tradie's own rate-card price for a category — never AI-invented. */
function suggestFromRateCard(
  card: Pick<DemoRateCard, "hourlyRateCents" | "items">,
  category: RequestCategory,
): number | null {
  const item = card.items.find((i) => i.category === category);
  if (item?.flatPriceCents != null) return item.flatPriceCents;
  if (item?.typicalMinutes != null) return Math.round((card.hourlyRateCents * item.typicalMinutes) / 60);
  return null;
}

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
