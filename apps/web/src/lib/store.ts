import {
  arcStepFor,
  assessAssetHorizon,
  bookableAmountFromBand,
  buildObligationsCalendar,
  buildRun,
  checkPlaybookGate,
  computeBatchableCompliance,
  decideApproval,
  earliestSlotStart,
  estimateDepreciation,
  estimatePriceBand,
  evaluateApprovalPolicy,
  evaluateProperty,
  findWarrantyMatch,
  formatSlot,
  getPlaybook,
  isUrgentCategory,
  playbookForCategory,
  tradieMatchesJob,
  tradesForCategory,
  projectState,
  proposeSlots,
  rankQuotes,
  scoreAvailability,
  scoreTrust,
  splitPayment,
  summariseSpending,
  transition,
  unsatisfiedGates,
  validateQuoteSubmission,
  type ActorType,
  type ApprovalPolicyRule,
  type EvidenceRecord,
  type EvidenceItem as PlaybookEvidenceItem,
  type PaymentState,
  type Playbook,
  type PropertyComplianceProfile,
  type PropertyComplianceStatus,
  blendedAccuracyPct,
  computeTimeAccuracy,
  countsTowardQuoteAccuracy,
  countsTowardTimeAccuracy,
  decideFunding,
  etaMinutesFromDistance,
  haversineKm,
  scoreTips,
  scoreTrustWithFeedback,
  paymentScheduleFor,
  splitPaymentWithFastPay,
  varianceNeedsApproval,
  type PaymentKind,
  type RequestCategory,
  type RequestEvent,
  type RequestState,
  type RunJob,
  type WarrantyCandidate,
} from "@1pacent/core";
import type {
  AcceptQuoteResult,
  AddressRecordView,
  ApprovalPolicyRuleInput,
  ApprovalPolicyRuleView,
  AssetHorizonView,
  BookingPreview,
  BookJobInput,
  BookJobResult,
  DeckTile,
  JobEvidenceView,
  JobOfferView,
  JobProjection,
  JobViewer,
  AutopilotInput,
  AutopilotView,
  MomentActionKind,
  MomentRole,
  PushSubscriptionInput,
  PushTarget,
  PerformanceView,
  ReviewView,
  HouseTradiesView,
  PmSubscriptionView,
  TradieRunView,
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
import { projectJob, type JobSource } from "./job-projection";
import { DEFAULT_PM_TIERS } from "./pm-tiers";

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
  /** v8 R5a: coordinates (nearest verified address) — George's ETA fuel. */
  lat?: number;
  lng?: number;
  /** v8 R6: rent held by the PM — the same-day funding ladder reads it. */
  trustBalanceCents?: number;
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
  /** v8: which playbook this job runs, and the slot chosen at booking. */
  playbookKey?: string;
  bookedStartAt?: string | null;
  bookedEndAt?: string | null;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const properties: DemoProperty[] = [
  {
    id: "prop-fitzroy",
    trustBalanceCents: 120_000,
    lat: -37.795576,
    lng: 144.975952,
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
    trustBalanceCents: 5_000, // rent not landed — the handoff demo
    lat: -37.825027,
    lng: 144.990581,
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
    lat: -37.777634,
    lng: 144.959825,
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
    lat: -37.782937,
    lng: 144.978792,
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
  /** v8 R5b: staff belong to a business contact. */
  employerContactId?: string;
  phone?: string;
  /** v8 R8.1: drives trade matching at dispatch (core trade-match rules). */
  tradeType?: string;
}

const contacts: DemoContact[] = [
  { id: "contact-tenant-1", kind: "tenant", fullName: "Priya Nair", email: "mac@1pacent.com" },
  { id: "contact-owner-mark", kind: "owner", fullName: "Mark McNamara", email: "mac@1pacent.com" },
  { id: "contact-pm-jordan", kind: "property_manager", fullName: "Jordan Blake", email: "mac@1pacent.com" },
  { id: "contact-tradie-john", kind: "tradie", fullName: "John Snow", email: "mac@1pacent.com", tradeType: "electrical" },
  { id: "contact-tradie-leo", kind: "tradie", fullName: "Leo Baker", email: "mac@1pacent.com", tradeType: "plumbing" },
  { id: "contact-tradie-sarah", kind: "tradie", fullName: "Sarah Mannis", email: "mac@1pacent.com", tradeType: "general_maintenance" },
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
  onTheWayAt?: string | null;
  /** v8 R3.5: the learning loop. */
  onSiteStartedAt?: string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  /** v8 R4b: id-plate truth recorded on site. */
  assetManufacturer?: string | null;
  assetModel?: string | null;
  assetSerial?: string | null;
  /** v8 R4c: the tradie's proof of purchase (they bought the unit). */
  receiptDataUrl?: string | null;
  assetPurchasedAt?: string | null;
  assetWarrantyMonths?: number | null;
  /** v8 R5b: the crew member on the van (commercials stay with the business). */
  assignedStaffContactId?: string | null;
}

/** v8: payments mirror the (simulated) PSP — no custody, ever. */
interface DemoPayment {
  id: string;
  requestId: string;
  workOrderId: string | null;
  status: PaymentState;
  amountCents: number;
  platformFeeCents: number;
  payoutCents: number;
  /** v8 R3: which slice of the job's money this row is. */
  kind: PaymentKind;
  fastpayFeeCents?: number | null;
}
const payments: DemoPayment[] = [];
let demoPaymentSeq = 0;

/** v8 R3: the variance protocol's record — on-site scope changes. */
interface DemoVariance {
  id: string;
  requestId: string;
  workOrderId: string;
  bookedCents: number;
  newTotalCents: number;
  reason: string;
  status: "pending" | "approved" | "declined" | "auto_applied";
  decidedAt: string | null;
  photoDataUrl?: string | null;
}
const demoVariances: DemoVariance[] = [];
let demoVarianceSeq = 0;

/** v8 R3: Fast-Pay opt-in (parity home: tradie_rate_cards.fastpay_enabled). */
const fastPayByTradie: Record<string, boolean> = {};

interface DemoJobEvidence {
  id: string;
  workOrderId: string;
  gate: string;
  dataUrl: string | null;
  note: string | null;
  createdAt: string;
}
const jobEvidence: DemoJobEvidence[] = [];
let demoEvidenceSeq = 0;

/** The Go Online toggle. John starts online so the demo pings immediately. */
const tradiePresence: Record<string, { online: boolean; lat?: number; lng?: number }> = {
  "contact-tradie-john": { online: true },
  "contact-tradie-leo": { online: true },
};
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
  /** v8 R4b: warranty identity. */
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  receiptDataUrl?: string | null;
  purchasedAt?: string | null;
  manufacturerWarrantyMonths?: number | null;
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

/** v8 R2: web-push subscriptions (real browser endpoints — demo mode pushes
 * for real when VAPID keys are configured). */
interface DemoPushSubscription {
  contactId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  homePath: string | null;
}
const pushSubscriptions: DemoPushSubscription[] = [];

/** Parity with supabase-data: sliders write one rule per property here. */
const AUTOPILOT_RULE_PRIORITY = -100;
const AUTOPILOT_SAFETY_CATEGORIES: RequestCategory[] = [
  "gas_leak",
  "dangerous_electrical_fault",
  "safety_device_fault_smoke_alarm_or_pool_barrier",
];

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
  | "owner_portal"
  | "moment_action";
const demoTokens: Record<
  string,
  {
    scope: DemoTokenScope;
    aggregateId: string;
    contactId?: string;
    /** moment_action only: the one decision this token signs. */
    payload?: { kind: MomentActionKind; actorType?: "tenant" | "agency_user"; varianceId?: string };
    usedAt?: string;
  }
> = {
  "demo-intake": { scope: "tenant_intake", aggregateId: "prop-fitzroy", contactId: "contact-tenant-1" },
  "demo-approval": { scope: "landlord_approval", aggregateId: "req-fence" },
  "demo-tradie-portal": {
    scope: "tradie_portal",
    aggregateId: "contact-tradie-john",
    contactId: "contact-tradie-john",
  },
  "demo-tradie-leo": {
    scope: "tradie_portal",
    aggregateId: "contact-tradie-leo",
    contactId: "contact-tradie-leo",
  },
  "demo-tradie-sarah": {
    scope: "tradie_portal",
    aggregateId: "contact-tradie-sarah",
    contactId: "contact-tradie-sarah",
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

  // v8: a slot chosen at booking is confirmed by this acceptance — no proposal
  // round. Otherwise George proposes from availability (v7 §3) and a human
  // confirms on a card.
  const bookedSlot = request.bookedStartAt
    ? { startAt: request.bookedStartAt, endAt: request.bookedEndAt ?? request.bookedStartAt }
    : null;
  const windows = availabilityWindows
    .filter((w) => w.tradieContactId === accepted.tradieContactId)
    .map((w) => ({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime }));
  const slots = bookedSlot
    ? []
    : proposeSlots(windows, {
        from: earliestSlotStart(new Date(), isUrgentCategory(request.category)),
      });

  const woId = `wo-${++demoWorkOrderSeq}`;
  workOrders.push({
    id: woId,
    requestId: request.id,
    tradieContactId: accepted.tradieContactId,
    status: "scheduled",
    quoteCents: accepted.quoteCents,
    callOutFeeCents: accepted.callOutFeeCents,
    invoiceCents: null,
    assetId: null,
    warrantyExpiresAt: null,
    completionNote: null,
    proposedSlots: bookedSlot ? null : slots.map((s) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() })),
    scheduledStartAt: bookedSlot?.startAt ?? null,
    scheduledEndAt: bookedSlot?.endAt ?? null,
  });
  // Link the booking authorization to the work order it now backs.
  const payment = payments.find((p) => p.requestId === request.id && p.workOrderId === null);
  if (payment) payment.workOrderId = woId;

  // v8 R3: acceptance IS confirmation — the money plan exists from here.
  // Milestone playbooks settle their deposit slice on the spot.
  ensureDemoPaymentPlan(request, (accepted.quoteCents ?? 0) + (accepted.callOutFeeCents ?? 0), woId);

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
    // Trade-matched invites (v8 R8.1) — mirrors the supabase store: only
    // matching trades hear about the job (handyman rule in core), Online first.
    const playbook = (request.playbookKey ? getPlaybook(request.playbookKey) : null) ?? playbookForCategory(request.category);
    const inviteeTarget = playbook.pricing.model === "quote_race" ? playbook.pricing.invitees : 3;
    const online = new Set(onlineTradieIds());
    const tradies = contacts
      .filter((c) => c.kind === "tradie" && !c.employerContactId && tradieMatchesJob(c.tradeType, request.category, playbook))
      .sort((a, b) => (online.has(b.id) ? 1 : 0) - (online.has(a.id) ? 1 : 0))
      .slice(0, inviteeTarget);
    if (tradies.length === 0) {
      const wanted = tradesForCategory(request.category).join(" / ");
      return { ok: false, error: `No ${wanted} tradies in the network yet for this job — the operator has been flagged.` };
    }

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

  async submitOfferQuote(
    tradiePortalToken: string,
    quoteId: string,
    input: { quoteCents: number; callOutFeeCents: number; note?: string },
  ) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) {
      return { ok: false as const, error: "This link isn't active." };
    }
    const quote = quotes.find((q) => q.id === quoteId && q.tradieContactId === demoBizId(resolved.contactId!));
    if (!quote) return { ok: false as const, error: "Quote not found." };
    if (quote.status !== "invited") {
      return { ok: false as const, error: "This quote has already been submitted or is no longer open." };
    }
    // Reuse the token path's validation + approval-round logic verbatim.
    const jobToken = issueDemoToken("tradie_job", quote.id, quote.tradieContactId);
    const result = await demoData.submitQuoteByToken(jobToken, input);
    return result.ok ? { ...result, requestId: quote.requestId } : result;
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
        .filter((w) => {
          const request = requests.find((r) => r.id === w.requestId);
          const pb = request?.playbookKey ? getPlaybook(request.playbookKey) : null;
          return countsTowardQuoteAccuracy(pb?.pricing.model ?? "quote_race"); // no playbook = tradie priced
        })
        .map((w) => Math.abs(w.invoiceCents! - w.quoteCents!) / w.quoteCents!);
      const avgAbsVariancePct =
        variances.length > 0 ? (variances.reduce((a, b) => a + b, 0) / variances.length) * 100 : null;
      // v8 R3.5: blend the time signal (70% money / 30% time).
      const timeVariances = workOrders
        .filter((w) => w.tradieContactId === id && w.actualMinutes != null && (w.estimatedMinutes ?? 0) > 0)
        .map((w) => computeTimeAccuracy(w.estimatedMinutes!, w.actualMinutes!).absVariancePct);
      const avgAbsTimeVariancePct =
        timeVariances.length > 0 ? timeVariances.reduce((a, b) => a + b, 0) / timeVariances.length : null;
      summaries[id] = {
        completedJobs: completed.length,
        avgAbsVariancePct: blendedAccuracyPct(avgAbsVariancePct, avgAbsTimeVariancePct),
      };
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
      .filter((w) => w.tradieContactId === demoBizId(resolved.contactId!))
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
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === demoBizId(resolved.contactId!));
    if (!wo) return { ok: false as const, error: "Job not found." };
    const request = requests.find((r) => r.id === wo.requestId);
    if (!request) return { ok: false as const, error: "Request not found." };
    const current = requestState(request);
    const result = transition(current, "start_work", "tradie");
    if (!result.ok) return { ok: false as const, error: `Cannot start a job from state "${current}".` };
    request.events.push({ eventType: "start_work", actorType: "tradie", actorId: `token:${tradiePortalToken}`, at: new Date().toISOString() });
    wo.status = result.state;
    // The learning loop starts its clock (v8 R3.5).
    const playbook = (request.playbookKey ? getPlaybook(request.playbookKey) : null) ?? playbookForCategory(request.category);
    wo.onSiteStartedAt = new Date().toISOString();
    wo.estimatedMinutes = playbook.typicalMinutes;
    return { ok: true as const };
  },

  async markJobDone(tradiePortalToken: string, workOrderId: string, note: string) {
    const resolved = demoTokens[tradiePortalToken];
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) {
      return { ok: false as const, error: "This portal link isn't active." };
    }
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === demoBizId(resolved.contactId!));
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
    // The learning loop closes (archive: TRADIE-JOBS-046).
    if (wo.onSiteStartedAt) {
      wo.actualMinutes = Math.max(1, Math.round((Date.now() - new Date(wo.onSiteStartedAt).getTime()) / 60_000));
      if (wo.estimatedMinutes && wo.estimatedMinutes > 0) {
        const accuracy = computeTimeAccuracy(wo.estimatedMinutes, wo.actualMinutes);
        demoWorkOrderEvents.push({
          workOrderId: wo.id,
          eventType: "actuals_captured",
          at: new Date().toISOString(),
          note: `est ${wo.estimatedMinutes}m, actual ${wo.actualMinutes}m (${accuracy.rating})`,
        });
      }
    }
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
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === demoBizId(resolved.contactId!));
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

  // ——— v8 R1: The Uber Slice ———

  async previewBooking(token, input): Promise<BookingPreview | null> {
    const propertyId = bookablePropertyId(token, input.propertyId);
    if (!propertyId) return null;
    const property = properties.find((p) => p.id === propertyId);
    if (!property) return null;
    const playbook = (input.playbookKey ? getPlaybook(input.playbookKey) : null) ?? playbookForCategory(input.category);

    let bandLow: number | null = null;
    let bandHigh: number | null = null;
    let bookAmount: number | null = null;
    let evidenceCount = 0;
    let confidence: "low" | "medium" | "high" = "low";
    if (playbook.pricing.model === "fixed_band") {
      const band = estimatePriceBand(playbook.category, await demoData.getComparableJobs(propertyId, playbook.category));
      bandLow = band.lowCents;
      bandHigh = band.highCents;
      bookAmount = bookableAmountFromBand(band.lowCents, band.highCents);
      evidenceCount = band.evidenceCount;
      confidence = band.confidence;
    }

    const online = onlineTradieIds();
    const urgent = isUrgentCategory(playbook.category);
    const windows = availabilityWindows
      .filter((w) => online.includes(w.tradieContactId))
      .map((w) => ({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime }));
    const slots = proposeSlots(windows, { from: earliestSlotStart(new Date(), urgent), count: 3 });

    return {
      playbookKey: playbook.key,
      playbookTitle: playbook.title,
      category: playbook.category,
      pricing: playbook.pricing.model,
      bandLowCents: bandLow,
      bandHighCents: bandHigh,
      bookAmountCents: bookAmount,
      evidenceGates: [...playbook.evidenceGates],
      warrantyMonths: playbook.warrantyDefaultMonths,
      urgent,
      evidenceCount,
      confidence,
      slots: slots.map((s) => ({
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        label: formatSlot(s),
      })),
      tradiesOnline: online.length,
      propertyId,
      propertyAddress: `${property.address}, ${property.suburb}`,
    };
  },

  async bookJob(token, input): Promise<BookJobResult> {
    const propertyId = bookablePropertyId(token, input.propertyId);
    if (!propertyId) return { ok: false, error: "This link isn't active." };
    const playbook = (getPlaybook(input.playbookKey) ?? playbookForCategory(input.category)) as Playbook;
    const urgent = isUrgentCategory(playbook.category);
    const now = new Date().toISOString();

    const request: DemoRequest = {
      id: `req-${Math.random().toString(36).slice(2, 8)}`,
      propertyId,
      title: input.title,
      description: input.description,
      category: playbook.category,
      estimateCents: null,
      reportedAt: now,
      playbookKey: playbook.key,
      bookedStartAt: input.slot?.startAt ?? null,
      bookedEndAt: input.slot?.endAt ?? null,
      events: [
        { eventType: "triage", actorType: "system", actorId: "sally:triage", at: now },
        {
          eventType: "auto_approve",
          actorType: "system",
          actorId: "playbook:booking",
          at: now,
          note: urgent
            ? "Urgent bypass (VIC urgent repairs list)"
            : `Fixed-process playbook "${playbook.key}" — payer authorized at booking`,
        },
      ],
    };
    requests.push(request);

    if (playbook.pricing.model !== "fixed_band") {
      // Non-standard scope: the v7 quote race runs backstage.
      const dispatch = await demoData.dispatchQuotesForRequest(request.id);
      return dispatch.ok
        ? { ok: true, requestId: request.id, offered: dispatch.invites.length, amountAuthorizedCents: null }
        : { ok: false, error: dispatch.error };
    }

    // Fixed band: authorize (simulated PSP hold — no money moves) and offer.
    const band = estimatePriceBand(playbook.category, await demoData.getComparableJobs(propertyId, playbook.category));
    const amount = bookableAmountFromBand(band.lowCents, band.highCents);
    const split = splitPayment(amount);
    payments.push({
      id: `pay-${++demoPaymentSeq}`,
      requestId: request.id,
      workOrderId: null,
      status: "authorized",
      amountCents: amount,
      platformFeeCents: split.platformFeeCents,
      payoutCents: split.tradiePayoutCents,
      kind: "primary",
    });

    request.events.push({ eventType: "request_quotes", actorType: "system", actorId: "george:offer", at: now });
    // House dispatch (v8 R7): small jobs at a PM-managed property go to the
    // PM's chosen defaults first.
    const matchesTrade = (id: string) => {
      const c = contacts.find((cc) => cc.id === id);
      return tradieMatchesJob(c?.tradeType, playbook.category, playbook);
    };
    let online = onlineTradieIds().filter(matchesTrade).slice(0, 3);
    const bookProp = properties.find((pp) => pp.id === propertyId);
    if (bookProp?.pmContactId) {
      const house = demoHouseTradies[bookProp.pmContactId];
      const houseMatched = house ? house.tradieContactIds.filter(matchesTrade) : [];
      if (house && houseMatched.length > 0 && amount <= house.maxJobCents) {
        online = houseMatched.slice(0, 3);
        demoWorkOrderEvents.push({
          workOrderId: request.id,
          eventType: "house_dispatch",
          at: now,
          note: "Small job — dispatched to the manager's house tradies first.",
        });
      }
    }
    for (const tradieId of online) {
      quotes.push({
        id: `quote-${Math.random().toString(36).slice(2, 8)}`,
        requestId: request.id,
        tradieContactId: tradieId,
        status: "invited",
        quoteCents: amount,
        callOutFeeCents: 0,
        note: "Fixed-price offer — first accept wins.",
        createdAt: now,
        submittedAt: null,
      });
    }
    return { ok: true, requestId: request.id, offered: online.length, amountAuthorizedCents: amount };
  },

  async getOpenOffers(tradiePortalToken): Promise<JobOfferView[]> {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return [];
    return quotes
      .filter((q) => q.tradieContactId === demoBizId(resolved.contactId!) && q.status === "invited")
      .map((q) => {
        const request = requests.find((r) => r.id === q.requestId);
        if (!request || requestState(request) !== "quoting" || !request.playbookKey) return null;
        const playbook = getPlaybook(request.playbookKey);
        if (!playbook) return null;
        const kind = playbook.pricing.model === "fixed_band" ? ("fixed" as const) : ("quote_race" as const);
        const property = properties.find((p) => p.id === request.propertyId);
        const slot = request.bookedStartAt
          ? {
              startAt: request.bookedStartAt,
              endAt: request.bookedEndAt ?? request.bookedStartAt,
              label: formatSlot({
                startAt: new Date(request.bookedStartAt),
                endAt: new Date(request.bookedEndAt ?? request.bookedStartAt),
              }),
            }
          : null;
        return {
          quoteId: q.id,
          requestId: request.id,
          kind,
          title: request.title,
          playbookTitle: playbook.title,
          propertyAddress: property ? `${property.address}, ${property.suburb}` : "",
          payoutCents: q.quoteCents !== null ? splitPayment(q.quoteCents).tradiePayoutCents : null,
          slot,
          briefing: propertyAssets
            .filter((a) => a.propertyId === request.propertyId)
            .map((a) => `${a.label}${a.installedAt ? ` (installed ${new Date(a.installedAt).getFullYear()})` : ""}`),
          urgent: isUrgentCategory(request.category),
        };
      })
      .filter((o): o is JobOfferView => o !== null);
  },

  async acceptJobOffer(tradiePortalToken, quoteId) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) {
      return { ok: false as const, error: "This link isn't active." };
    }
    const quote = quotes.find((q) => q.id === quoteId && q.tradieContactId === demoBizId(resolved.contactId!));
    if (!quote || quote.status !== "invited") {
      return { ok: false as const, error: "That job's gone — another tradie got there first." };
    }
    const request = requests.find((r) => r.id === quote.requestId);
    if (!request || requestState(request) !== "quoting") {
      return { ok: false as const, error: "That job's gone — another tradie got there first." };
    }
    const offerPlaybook = request.playbookKey ? getPlaybook(request.playbookKey) : null;
    if (offerPlaybook && offerPlaybook.pricing.model !== "fixed_band") {
      return { ok: false as const, error: "This job runs a quote race — submit your price instead." };
    }
    // The tradie's tap is the human event on this side of the market.
    quote.status = "submitted";
    quote.submittedAt = new Date().toISOString();
    // Payer pre-authorized at booking; George settles the match deterministically.
    const result = acceptQuoteInternal(request, quote.id, "system", "george:dispatch");
    if (!result.ok) return { ok: false as const, error: result.error };
    // The human on the van (crew member or the owner themselves).
    const acceptedWo = workOrders.find((w) => w.requestId === request.id);
    if (acceptedWo) acceptedWo.assignedStaffContactId = resolved.contactId;
    return { ok: true as const, requestId: request.id };
  },

  async setTradiePresence(tradiePortalToken, online, geo) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return { ok: false, online: false };
    tradiePresence[resolved.contactId] = { online, ...(geo ? { lat: geo.lat, lng: geo.lng } : {}) };
    return { ok: true, online };
  },

  async getTradiePresence(tradiePortalToken) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return { online: false };
    return { online: tradiePresence[resolved.contactId]?.online ?? false };
  },

  async markOnMyWay(tradiePortalToken, workOrderId) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) {
      return { ok: false as const, error: "This link isn't active." };
    }
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === demoBizId(resolved.contactId!));
    if (!wo) return { ok: false as const, error: "Job not found." };
    wo.onTheWayAt = new Date().toISOString();
    // George's real ETA (parity with supabase).
    let etaMinutes: number | null = null;
    const presence = tradiePresence[resolved.contactId];
    const request = requests.find((r) => r.id === wo.requestId);
    const property = request ? properties.find((pp) => pp.id === request.propertyId) : null;
    if (presence?.lat != null && presence.lng != null && property?.lat != null && property.lng != null) {
      etaMinutes = etaMinutesFromDistance(haversineKm(presence.lat, presence.lng, property.lat, property.lng));
    }
    return { ok: true as const, etaMinutes };
  },

  async addJobEvidence(tradiePortalToken, workOrderId, input) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) {
      return { ok: false as const, error: "This link isn't active." };
    }
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === demoBizId(resolved.contactId!));
    if (!wo) return { ok: false as const, error: "Job not found." };
    jobEvidence.push({
      id: `ev-${++demoEvidenceSeq}`,
      workOrderId,
      gate: input.gate,
      dataUrl: input.dataUrl,
      note: input.note ?? null,
      createdAt: new Date().toISOString(),
    });
    const request = requests.find((r) => r.id === wo.requestId);
    const playbook = request?.playbookKey ? getPlaybook(request.playbookKey) : null;
    const remaining = playbook ? unsatisfiedGates(playbook, evidenceItemsFor(workOrderId)) : [];
    return { ok: true as const, gatesRemaining: remaining };
  },

  async completeJob(tradiePortalToken, workOrderId, note) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) {
      return { ok: false as const, error: "This link isn't active." };
    }
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === demoBizId(resolved.contactId!));
    if (!wo) return { ok: false as const, error: "Job not found." };
    const request = requests.find((r) => r.id === wo.requestId);
    if (!request) return { ok: false as const, error: "Request not found." };

    // Core rule, not UI hope: the playbook's gates block completion.
    const playbook = request.playbookKey ? getPlaybook(request.playbookKey) : null;
    if (playbook) {
      const gate = checkPlaybookGate(playbook, "submit_evidence", evidenceItemsFor(workOrderId));
      if (!gate.ok) return { ok: false as const, gatesRemaining: gate.missing, error: gate.message };
    }

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
    // The learning loop closes (archive: TRADIE-JOBS-046).
    if (wo.onSiteStartedAt) {
      wo.actualMinutes = Math.max(1, Math.round((Date.now() - new Date(wo.onSiteStartedAt).getTime()) / 60_000));
      if (wo.estimatedMinutes && wo.estimatedMinutes > 0) {
        const accuracy = computeTimeAccuracy(wo.estimatedMinutes, wo.actualMinutes);
        demoWorkOrderEvents.push({
          workOrderId: wo.id,
          eventType: "actuals_captured",
          at: new Date().toISOString(),
          note: `est ${wo.estimatedMinutes}m, actual ${wo.actualMinutes}m (${accuracy.rating})`,
        });
      }
    }
    return { ok: true as const };
  },

  async verifyAndSettle(token, requestId) {
    const resolved = resolveDemoToken(token);
    if (!resolved || !["tenant_intake", "owner_portal"].includes(resolved.scope)) {
      return { ok: false as const, error: "This link isn't active." };
    }
    const request = requests.find((r) => r.id === requestId);
    if (!request) return { ok: false as const, error: "Request not found." };
    const inScope =
      resolved.scope === "tenant_intake"
        ? request.propertyId === resolved.aggregateId
        : properties.some((p) => p.id === request.propertyId && p.ownerContactId === resolved.aggregateId);
    if (!inScope) return { ok: false as const, error: "Request not found." };

    return demoVerifySettle(request, {
      actorType: resolved.scope === "tenant_intake" ? "tenant" : "agency_user",
      actorId: `token:${token}`,
    });
  },

  async getJobProjection(token, requestId): Promise<JobProjection | null> {
    const resolved = resolveDemoToken(token);
    if (!resolved) return null;
    const request = requests.find((r) => r.id === requestId);
    if (!request) return null;

    let viewer: JobViewer;
    if (resolved.scope === "tenant_intake") {
      if (request.propertyId !== resolved.aggregateId) return null;
      viewer = "occupant";
    } else if (resolved.scope === "owner_portal") {
      if (!properties.some((p) => p.id === request.propertyId && p.ownerContactId === resolved.aggregateId)) return null;
      viewer = "payer";
    } else if (resolved.scope === "pm_portfolio") {
      if (!properties.some((p) => p.id === request.propertyId && p.pmContactId === resolved.contactId)) return null;
      viewer = "pm";
    } else if (resolved.scope === "tradie_portal") {
      const mine =
        workOrders.some((w) => w.requestId === request.id && w.tradieContactId === demoBizId(resolved.contactId!)) ||
        quotes.some((q) => q.requestId === request.id && q.tradieContactId === demoBizId(resolved.contactId!));
      if (!mine) return null;
      viewer = "tradie";
    } else return null;

    return projectJob(demoJobSource(request), viewer);
  },

  async getAddressRecord(token, propertyId): Promise<AddressRecordView | null> {
    const resolved = resolveDemoToken(token);
    if (!resolved) return null;
    let pid: string | null = null;
    let showMoney = true;
    if (resolved.scope === "tenant_intake") {
      pid = resolved.aggregateId;
      showMoney = false;
    } else if (resolved.scope === "owner_portal") {
      pid = propertyId && properties.some((p) => p.id === propertyId && p.ownerContactId === resolved.aggregateId)
        ? propertyId
        : (properties.find((p) => p.ownerContactId === resolved.aggregateId)?.id ?? null);
    } else if (resolved.scope === "pm_portfolio") {
      pid = propertyId && properties.some((p) => p.id === propertyId && p.pmContactId === resolved.contactId)
        ? propertyId
        : null;
    }
    if (!pid) return null;
    const property = properties.find((p) => p.id === pid);
    if (!property) return null;

    const compliance = evaluateProperty(property.profile, property.evidence, new Date());
    const propertyRequests = requests.filter((r) => r.propertyId === pid);
    const history = workOrders
      .filter((w) => w.invoiceCents !== null && propertyRequests.some((r) => r.id === w.requestId))
      .map((w) => {
        const r = propertyRequests.find((x) => x.id === w.requestId)!;
        const tradie = contacts.find((c) => c.id === w.tradieContactId);
        return {
          title: r.title,
          category: r.category,
          invoiceCents: showMoney ? w.invoiceCents : null,
          tradieName: tradie?.fullName ?? "Verified tradie",
          at: w.invoicedAt ?? null,
        };
      })
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    const warranties = workOrders
      .filter((w) => w.warrantyExpiresAt && new Date(w.warrantyExpiresAt) > new Date())
      .map((w) => {
        const asset = propertyAssets.find((a) => a.id === w.assetId && a.propertyId === pid);
        if (!asset) return null;
        const tradie = contacts.find((c) => c.id === w.tradieContactId);
        return { assetLabel: asset.label, tradieName: tradie?.fullName ?? "", expiresAt: w.warrantyExpiresAt! };
      })
      .filter((w): w is NonNullable<typeof w> => w !== null);

    return {
      propertyId: pid,
      address: property.address,
      suburb: property.suburb,
      compliance: {
        propertyAddress: `${property.address}, ${property.suburb}`,
        overall: compliance.overall,
        requirements: compliance.requirements.map((r) => ({
          name: r.requirement.name,
          status: r.status,
          lastCompletedAt: r.lastCompletedAt?.toISOString() ?? null,
          dueAt: r.dueAt?.toISOString() ?? null,
        })),
      },
      // Include assets without an install date (age unknown ≠ invisible).
      assets: propertyAssets
        .filter((a) => a.propertyId === pid)
        .map((a) => {
          const medians = networkMedians();
          const horizon = assessAssetHorizon({
            category: a.category,
            installedAt: a.installedAt ? new Date(a.installedAt) : new Date(),
            today: new Date(),
          });
          const mfrWarrantyUntil =
            a.purchasedAt && a.manufacturerWarrantyMonths
              ? new Date(new Date(a.purchasedAt).getTime() + a.manufacturerWarrantyMonths * 30 * 86_400_000).toISOString()
              : null;
          return {
            assetId: a.id,
            propertyAddress: `${property.address}, ${property.suburb}`,
            assetLabel: a.label,
            category: a.category,
            ageYears: a.installedAt ? horizon.ageYears : 0,
            effectiveLifeYears: horizon.effectiveLifeYears,
            remainingLifeYears: a.installedAt ? horizon.remainingLifeYears : horizon.effectiveLifeYears,
            status: a.installedAt ? horizon.status : ("healthy" as const),
            plannedReplacementCents: medians[a.category] ?? null,
            disclaimer: "planning_estimate" as const,
            manufacturer: a.manufacturer ?? null,
            model: a.model ?? null,
            serialNumber: a.serialNumber ?? null,
            receiptOnFile: Boolean(a.receiptDataUrl),
            manufacturerWarrantyUntil: mfrWarrantyUntil,
          };
        }),
      history,
      warranties,
      spend12moCents: showMoney ? spendingForProperties([pid], 12).totalCents : null,
      eventsCount: propertyRequests.reduce((n, r) => n + r.events.length, 0),
    };
  },

  async getDeckTiles(pmPortfolioToken): Promise<DeckTile[]> {
    const resolved = resolveDemoToken(pmPortfolioToken);
    if (resolved?.scope !== "pm_portfolio" || !resolved.contactId) return [];
    const managedIds = properties.filter((p) => p.pmContactId === resolved.contactId).map((p) => p.id);
    return requests
      .filter((r) => managedIds.includes(r.propertyId))
      .map((r) => {
        const state = requestState(r);
        const wo = workOrders.find((w) => w.requestId === r.id);
        const payment = payments.find((p) => p.requestId === r.id);
        const property = properties.find((p) => p.id === r.propertyId);
        return {
          requestId: r.id,
          title: r.title,
          address: property?.address ?? "",
          state,
          arcStep: arcStepFor(state, {
            onTheWay: Boolean(wo?.onTheWayAt),
            captured: payment?.status === "captured" || payment?.status === "transferred",
          }),
          needsHuman: ["pending_approval", "evidence_pending"].includes(state),
          at: r.events[r.events.length - 1]?.at ?? r.reportedAt,
        };
      })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  },

  // ——— v8 R2: Autopilot & the Deck ———

  async savePushSubscription(token: string, input: PushSubscriptionInput) {
    const resolved = resolveDemoToken(token);
    if (!resolved) return { ok: false, error: "This link isn't active." };
    const contactId = resolved.contactId ?? resolved.aggregateId;
    if (!contactId) return { ok: false, error: "This link has no person attached." };
    const existing = pushSubscriptions.find((s) => s.endpoint === input.endpoint);
    if (existing) {
      existing.contactId = contactId;
      existing.keys = input.keys;
      existing.homePath = input.homePath;
    } else {
      pushSubscriptions.push({ contactId, endpoint: input.endpoint, keys: input.keys, homePath: input.homePath });
    }
    return { ok: true };
  },

  async getPushTargets(requestId: string, role: MomentRole): Promise<PushTarget[]> {
    const request = requests.find((r) => r.id === requestId);
    if (!request) return [];
    const property = properties.find((p) => p.id === request.propertyId);
    const contactIds: string[] = [];
    if (role === "payer" && property?.ownerContactId) contactIds.push(property.ownerContactId);
    if (role === "occupant") {
      // The demo org's single tenancy: Priya at Fitzroy.
      if (request.propertyId === "prop-fitzroy") contactIds.push("contact-tenant-1");
    }
    if (role === "pm" && property?.pmContactId) contactIds.push(property.pmContactId);
    if (role === "assigned_tradie") {
      const wo = workOrders.find((w) => w.requestId === requestId);
      if (wo) contactIds.push(wo.tradieContactId);
    }
    if (role === "tradie_offered") {
      for (const q of quotes.filter((q) => q.requestId === requestId && q.status === "invited")) {
        contactIds.push(q.tradieContactId);
      }
    }
    return pushSubscriptions
      .filter((s) => contactIds.includes(s.contactId))
      .map((s) => ({
        contactId: s.contactId,
        name: contacts.find((c) => c.id === s.contactId)?.fullName ?? "",
        endpoint: s.endpoint,
        keys: s.keys,
        homePath: s.homePath,
      }));
  },

  async mintMomentAction(
    requestId: string,
    input: { kind: MomentActionKind; contactId: string | null; meta?: Record<string, unknown> },
  ) {
    if (!requests.some((r) => r.id === requestId)) return { ok: false, error: "Request not found." };
    const token = issueDemoToken("moment_action", requestId, input.contactId ?? undefined);
    demoTokens[token]!.payload = {
      kind: input.kind,
      actorType: (input.meta?.actorType as "tenant" | "agency_user" | undefined) ?? undefined,
      varianceId: (input.meta?.varianceId as string | undefined) ?? undefined,
    };
    return { ok: true, path: `/api/act/${token}` };
  },

  async executeMomentAction(rawToken: string, choice: string) {
    const resolved = demoTokens[rawToken];
    if (!resolved || resolved.scope !== "moment_action" || resolved.usedAt) {
      return { ok: false, error: "This decision link has expired or was already used." };
    }
    resolved.usedAt = new Date().toISOString(); // burn first — a raced second tap must lose
    const requestId = resolved.aggregateId;
    const kind = resolved.payload?.kind;

    if (kind === "approve_request") {
      if (choice !== "approve" && choice !== "decline") return { ok: false, error: "Unknown choice." };
      const result = decideByRequestIdInternal(requestId, choice);
      return result.ok
        ? { ok: true, label: choice === "approve" ? "Approved" : "Declined", requestId }
        : { ok: false, error: result.error };
    }

    if (kind === "verify_job") {
      const request = requests.find((r) => r.id === requestId);
      if (!request) return { ok: false, error: "Request not found." };
      const result = demoVerifySettle(request, {
        actorType: resolved.payload?.actorType ?? "agency_user",
        actorId: `moment:${rawToken.slice(0, 12)}`,
      });
      return result.ok ? { ok: true, label: "Verified — payment released", requestId } : { ok: false, error: result.error };
    }

    if (kind === "fund_job") {
      const request = requests.find((r) => r.id === requestId);
      if (!request) return { ok: false, error: "Request not found." };
      const result = demoFundJob(request, `moment:${rawToken.slice(0, 12)}`);
      return result.ok ? { ok: true, label: "Paid — tradie gets it today", requestId } : { ok: false, error: result.error };
    }

    if (kind === "decide_variance") {
      if (choice !== "approve" && choice !== "decline") return { ok: false, error: "Unknown choice." };
      const varianceId = resolved.payload?.varianceId;
      if (!varianceId) return { ok: false, error: "This decision link is malformed." };
      const result = demoDecideVariance(varianceId, choice);
      return result.ok
        ? { ok: true, label: choice === "approve" ? "Extra work approved" : "Kept to the booked scope", requestId }
        : { ok: false, error: result.error };
    }
    return { ok: false, error: "Unknown decision kind." };
  },

  async getAutopilot(ownerToken: string): Promise<AutopilotView | null> {
    const resolved = resolveDemoToken(ownerToken);
    if (resolved?.scope !== "owner_portal") return null;
    const owned = properties.filter((p) => p.ownerContactId === resolved.aggregateId);
    const rules = approvalPolicyRules.filter(
      (r) => r.priority === AUTOPILOT_RULE_PRIORITY && owned.some((p) => p.id === r.propertyId),
    );
    const active = rules.find((r) => r.enabled) ?? rules[0];
    return {
      enabled: Boolean(active?.enabled),
      maxTotalCents: active?.maxTotalCents ?? 50_000,
      minTrustScore: active?.minTrustScore ?? 60,
      safetyCategories: active && active.excludeCategories.length === 0 ? [] : AUTOPILOT_SAFETY_CATEGORIES,
      propertiesCovered: owned.length,
    };
  },

  async setAutopilot(ownerToken: string, input: AutopilotInput) {
    const resolved = resolveDemoToken(ownerToken);
    if (resolved?.scope !== "owner_portal") return { ok: false, error: "This link isn't active." };
    const owned = properties.filter((p) => p.ownerContactId === resolved.aggregateId);
    if (owned.length === 0) return { ok: false, error: "No properties on this seat." };
    for (const prop of owned) {
      const idx = approvalPolicyRules.findIndex(
        (r) => r.propertyId === prop.id && r.priority === AUTOPILOT_RULE_PRIORITY,
      );
      if (idx >= 0) approvalPolicyRules.splice(idx, 1);
      approvalPolicyRules.push({
        id: `rule-${++demoPolicyRuleSeq}`,
        propertyId: prop.id,
        priority: AUTOPILOT_RULE_PRIORITY,
        maxTotalCents: input.maxTotalCents,
        minTrustScore: input.minTrustScore,
        excludeCategories: input.safetyOn ? [...AUTOPILOT_SAFETY_CATEGORIES] : [],
        enabled: input.enabled,
      });
    }
    return { ok: true };
  },

  async getTradieRun(tradiePortalToken: string): Promise<TradieRunView | null> {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return null;
    const isStaff = demoBizId(resolved.contactId) !== resolved.contactId;
    const mine = workOrders.filter(
      (w) =>
        w.tradieContactId === demoBizId(resolved.contactId!) &&
        ["scheduled", "in_progress"].includes(w.status) &&
        (!isStaff || !w.assignedStaffContactId || w.assignedStaffContactId === resolved.contactId),
    );
    const jobs: RunJob[] = [];
    const meta = new Map<string, { address: string; state: RequestState; slotLabel: string | null }>();
    for (const wo of mine) {
      const request = requests.find((r) => r.id === wo.requestId);
      if (!request) continue;
      const property = properties.find((p) => p.id === request.propertyId);
      const playbook = request.playbookKey ? getPlaybook(request.playbookKey) : null;
      const startIso = wo.scheduledStartAt ?? request.bookedStartAt ?? null;
      const endIso = wo.scheduledEndAt ?? request.bookedEndAt ?? null;
      jobs.push({
        workOrderId: wo.id,
        requestId: request.id,
        title: request.title,
        address: property?.address ?? "",
        suburb: property?.suburb ?? "",
        slotStartAt: startIso ? new Date(startIso) : null,
        slotEndAt: endIso ? new Date(endIso) : null,
        typicalMinutes: playbook?.typicalMinutes ?? 90,
        urgent: isUrgentCategory(request.category),
      });
      meta.set(wo.id, {
        address: property ? `${property.address}, ${property.suburb}` : "",
        state: requestState(request),
        slotLabel: startIso ? formatSlot({ startAt: new Date(startIso), endAt: new Date(endIso ?? startIso) }) : null,
      });
    }
    const run = buildRun(jobs, { dayStart: new Date() });
    return {
      legs: run.legs.map((l) => ({
        workOrderId: l.job.workOrderId,
        requestId: l.job.requestId,
        title: l.job.title,
        address: meta.get(l.job.workOrderId)?.address ?? l.job.address,
        suburb: l.job.suburb,
        travelMinutes: l.travelMinutes,
        arriveAt: l.arriveAt.toISOString(),
        departAt: l.departAt.toISOString(),
        conflict: l.conflict,
        slotLabel: meta.get(l.job.workOrderId)?.slotLabel ?? null,
        state: meta.get(l.job.workOrderId)?.state ?? "scheduled",
      })),
      totalTravelMinutes: run.totalTravelMinutes,
      totalOnSiteMinutes: run.totalOnSiteMinutes,
      calendarBusy: [], // external calendars are a live-stack (Supabase) concern
    };
  },

  // ——— v8 R3: Real money & the second orbit ———

  async proposeVariance(tradiePortalToken, workOrderId, input) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return { ok: false, error: "This link isn't active." };
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === demoBizId(resolved.contactId!));
    if (!wo) return { ok: false, error: "Job not found." };
    const request = requests.find((r) => r.id === wo.requestId);
    if (!request) return { ok: false, error: "Request not found." };
    if (requestState(request) !== "in_progress") {
      return { ok: false, error: "Scope changes are raised on site, while the job is in progress." };
    }
    if (demoVariances.some((v) => v.workOrderId === wo.id && v.status === "pending")) {
      return { ok: false, error: "A scope change is already waiting on the payer." };
    }
    if (input.newTotalCents <= 0 || !input.reason.trim()) return { ok: false, error: "A new total and a reason are required." };

    const playbook = (request.playbookKey ? getPlaybook(request.playbookKey) : null) ?? playbookForCategory(request.category);
    const bookedCents =
      payments
        .filter((p) => p.requestId === request.id && p.status !== "voided")
        .reduce((s, p) => s + p.amountCents, 0) ||
      (wo.quoteCents ?? 0) + (wo.callOutFeeCents ?? 0);
    const needsApproval = varianceNeedsApproval(playbook, bookedCents, input.newTotalCents);
    const variance: DemoVariance = {
      id: `var-${++demoVarianceSeq}`,
      requestId: request.id,
      workOrderId: wo.id,
      bookedCents,
      newTotalCents: input.newTotalCents,
      reason: input.reason.trim(),
      status: needsApproval ? "pending" : "auto_applied",
      decidedAt: needsApproval ? null : new Date().toISOString(),
      photoDataUrl: input.photoDataUrl ?? null,
    };
    demoVariances.push(variance);
    demoWorkOrderEvents.push({
      workOrderId: wo.id,
      eventType: needsApproval ? "variance_proposed" : "variance_auto_applied",
      at: new Date().toISOString(),
      note: variance.reason,
    });
    if (!needsApproval) {
      const delta = input.newTotalCents - bookedCents;
      if (delta > 0) {
        const split = splitPayment(delta);
        payments.push({
          id: `pay-${++demoPaymentSeq}`,
          requestId: request.id,
          workOrderId: wo.id,
          status: "authorized",
          amountCents: delta,
          platformFeeCents: split.platformFeeCents,
          payoutCents: split.tradiePayoutCents,
          kind: "variance",
        });
      }
    }
    return { ok: true, needsApproval, varianceId: variance.id };
  },

  async decideVariance(token, varianceId, decision) {
    const resolved = resolveDemoToken(token);
    if (!resolved || !["owner_portal", "pm_portfolio"].includes(resolved.scope)) {
      return { ok: false, error: "This link isn't active." };
    }
    const v = demoVariances.find((x) => x.id === varianceId);
    if (!v) return { ok: false, error: "Not found." };
    const request = requests.find((r) => r.id === v.requestId);
    const property = request ? properties.find((p) => p.id === request.propertyId) : null;
    const allowed =
      (resolved.scope === "owner_portal" && property?.ownerContactId === resolved.aggregateId) ||
      (resolved.scope === "pm_portfolio" && property?.pmContactId === resolved.contactId);
    if (!allowed) return { ok: false, error: "Not found." };
    const result = demoDecideVariance(varianceId, decision);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  },

  async getFastPay(tradiePortalToken) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return null;
    return { enabled: Boolean(fastPayByTradie[resolved.contactId]) };
  },

  async setFastPay(tradiePortalToken, enabled) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return { ok: false, error: "This link isn't active." };
    fastPayByTradie[resolved.contactId] = enabled;
    return { ok: true };
  },

  // ——— v8 R3.5: parts to job + the learning loop ———

  async addJobPart(tradiePortalToken, workOrderId, input) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return { ok: false, error: "This link isn't active." };
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === demoBizId(resolved.contactId!));
    if (!wo) return { ok: false, error: "Job not found." };
    const request = requests.find((r) => r.id === wo.requestId);
    if (!request || requestState(request) !== "in_progress") {
      return { ok: false, error: "Parts are booked on site, while the job is in progress." };
    }
    const label = input.label.trim();
    if (!label || !Number.isFinite(input.costCents) || input.costCents <= 0) {
      return { ok: false, error: "A part needs a name and a cost." };
    }
    const playbook = (request.playbookKey ? getPlaybook(request.playbookKey) : null) ?? playbookForCategory(request.category);
    const bookedCents =
      payments
        .filter((pmt) => pmt.requestId === request.id && pmt.status !== "voided")
        .reduce((s, pmt) => s + pmt.amountCents, 0) ||
      (wo.quoteCents ?? 0) + (wo.callOutFeeCents ?? 0);
    const needsApproval = varianceNeedsApproval(playbook, bookedCents, bookedCents + input.costCents);

    if (!needsApproval) {
      demoJobParts.push({ id: `part-${++demoPartSeq}`, workOrderId: wo.id, label, costCents: input.costCents, status: "active" });
      demoWorkOrderEvents.push({ workOrderId: wo.id, eventType: "part_added", at: new Date().toISOString(), note: label });
      const split = splitPayment(input.costCents);
      payments.push({
        id: `pay-${++demoPaymentSeq}`,
        requestId: request.id,
        workOrderId: wo.id,
        status: "authorized",
        amountCents: input.costCents,
        platformFeeCents: split.platformFeeCents,
        payoutCents: split.tradiePayoutCents,
        kind: "variance",
      });
      return { ok: true, needsApproval: false };
    }

    const variance: DemoVariance = {
      id: `var-${++demoVarianceSeq}`,
      requestId: request.id,
      workOrderId: wo.id,
      bookedCents,
      newTotalCents: bookedCents + input.costCents,
      reason: `Part needed: ${label}`,
      status: "pending",
      decidedAt: null,
    };
    demoVariances.push(variance);
    demoJobParts.push({
      id: `part-${++demoPartSeq}`,
      workOrderId: wo.id,
      label,
      costCents: input.costCents,
      status: "pending_approval",
      varianceId: variance.id,
    });
    demoWorkOrderEvents.push({ workOrderId: wo.id, eventType: "part_proposed", at: new Date().toISOString(), note: label });
    return { ok: true, needsApproval: true, varianceId: variance.id };
  },

  // ——— v8 R4b: warranty identity ———

  async setAssetDetails(tradiePortalToken, workOrderId, input) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return { ok: false, error: "This link isn't active." };
    const wo = workOrders.find((w) => w.id === workOrderId && w.tradieContactId === demoBizId(resolved.contactId!));
    if (!wo) return { ok: false, error: "Job not found." };
    const request = requests.find((r) => r.id === wo.requestId);
    if (!request || !["in_progress", "evidence_pending"].includes(requestState(request))) {
      return { ok: false, error: "Asset details are recorded on site." };
    }
    const manufacturer = input.manufacturer.trim().slice(0, 80);
    const model = input.model.trim().slice(0, 80);
    const serial = input.serial.trim().slice(0, 80);
    const receipt = input.receipt?.dataUrl?.startsWith("data:") ? input.receipt : null;
    if (!manufacturer && !model && !serial && !receipt) return { ok: false, error: "Nothing to record." };
    wo.assetManufacturer = manufacturer || null;
    wo.assetModel = model || null;
    wo.assetSerial = serial || null;
    if (receipt) {
      wo.receiptDataUrl = receipt.dataUrl;
      wo.assetPurchasedAt = receipt.purchasedAt || null;
      wo.assetWarrantyMonths = Math.max(0, Math.min(240, Math.round(receipt.warrantyMonths))) || null;
    }
    demoWorkOrderEvents.push({ workOrderId: wo.id, eventType: "asset_identified", at: new Date().toISOString(), note: `${manufacturer} ${model} ${serial}`.trim() });
    return { ok: true };
  },

  // ——— v8 R6: feedback, performance, same-day funding ———

  async submitReview(token, requestId, input) {
    const resolved = resolveDemoToken(token);
    if (!resolved || !["tenant_intake", "owner_portal"].includes(resolved.scope)) {
      return { ok: false, error: "This link isn't active." };
    }
    const rating = Math.round(input.rating);
    if (rating < 1 || rating > 5) return { ok: false, error: "Rating is 1 to 5 stars." };
    const request = requests.find((r) => r.id === requestId);
    if (!request) return { ok: false, error: "Job not found." };
    const inScope =
      resolved.scope === "tenant_intake"
        ? request.propertyId === resolved.aggregateId
        : properties.some((pp) => pp.id === request.propertyId && pp.ownerContactId === resolved.aggregateId);
    if (!inScope) return { ok: false, error: "Job not found." };
    if (!["verified", "invoiced", "paid", "closed"].includes(requestState(request))) {
      return { ok: false, error: "Review after the job is verified." };
    }
    if (demoReviews.some((rv) => rv.requestId === requestId)) return { ok: false, error: "This job already has a review." };
    const wo = workOrders.find((w) => w.requestId === requestId);
    if (!wo) return { ok: false, error: "Job not found." };
    demoReviews.push({
      id: `rev-${++demoReviewSeq}`,
      requestId,
      tradieContactId: wo.tradieContactId,
      rating,
      comment: input.comment?.trim().slice(0, 500) || null,
      reviewerRole: resolved.scope === "tenant_intake" ? "occupant" : "payer",
      response: null,
      createdAt: new Date().toISOString(),
    });
    return { ok: true };
  },

  async respondToReview(tradiePortalToken, reviewId, response) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return { ok: false, error: "This link isn't active." };
    const review = demoReviews.find((rv) => rv.id === reviewId);
    if (!review || review.tradieContactId !== demoBizId(resolved.contactId)) return { ok: false, error: "Review not found." };
    if (review.response) return { ok: false, error: "Already responded — one reply, on the record." };
    const text = response.trim().slice(0, 500);
    if (text.length < 2) return { ok: false, error: "Say something." };
    review.response = text;
    return { ok: true };
  },

  async fundJobNow(ownerToken, requestId) {
    const resolved = resolveDemoToken(ownerToken);
    if (resolved?.scope !== "owner_portal") return { ok: false, error: "This link isn't active." };
    const request = requests.find((r) => r.id === requestId);
    if (!request || !properties.some((pp) => pp.id === request.propertyId && pp.ownerContactId === resolved.aggregateId)) {
      return { ok: false, error: "Job not found." };
    }
    return demoFundJob(request, `token:${ownerToken.slice(0, 12)}`);
  },

  async getPerformance(token) {
    const resolved = resolveDemoToken(token);
    if (!resolved) return null;
    if (resolved.scope === "tradie_portal" && resolved.contactId) {
      return demoTradiePerformance(demoBizId(resolved.contactId));
    }
    if (resolved.scope === "pm_portfolio" && resolved.contactId) {
      return demoPortfolioPerformance("pm", properties.filter((pp) => pp.pmContactId === resolved.contactId));
    }
    if (resolved.scope === "owner_portal") {
      return demoPortfolioPerformance("owner", properties.filter((pp) => pp.ownerContactId === resolved.aggregateId));
    }
    return null;
  },

  // ——— v8 R7: PM subscription + house tradies ———

  async getPmSubscription(pmPortfolioToken): Promise<PmSubscriptionView | null> {
    const resolved = resolveDemoToken(pmPortfolioToken);
    if (resolved?.scope !== "pm_portfolio" || !resolved.contactId) return null;
    const pum = properties.filter((pp) => pp.pmContactId === resolved.contactId).length;
    const sub = demoPmSubscriptions[resolved.contactId] ?? null;
    return {
      current: sub ? { ...sub } : null,
      options: DEFAULT_PM_TIERS.map((t) => ({ sku: t.sku, name: t.name, priceCents: t.priceCents, propertyCap: t.propertyCap })),
      propertiesUnderManagement: pum,
      overCap: Boolean(sub && pum > sub.propertyCap),
    };
  },

  async selectPmSubscription(pmPortfolioToken, sku) {
    const resolved = resolveDemoToken(pmPortfolioToken);
    if (resolved?.scope !== "pm_portfolio" || !resolved.contactId) return { ok: false, error: "This link isn't active." };
    const tier = DEFAULT_PM_TIERS.find((t) => t.sku === sku);
    if (!tier) return { ok: false, error: "Unknown subscription tier." };
    demoPmSubscriptions[resolved.contactId] = {
      sku: tier.sku,
      name: tier.name,
      priceCents: tier.priceCents,
      propertyCap: tier.propertyCap,
      selectedAt: new Date().toISOString(),
    };
    return { ok: true };
  },

  async getHouseTradies(pmPortfolioToken): Promise<HouseTradiesView | null> {
    const resolved = resolveDemoToken(pmPortfolioToken);
    if (resolved?.scope !== "pm_portfolio" || !resolved.contactId) return null;
    const cfg = demoHouseTradies[resolved.contactId] ?? { tradieContactIds: [], maxJobCents: 30_000 };
    const businesses = contacts.filter((c) => c.kind === "tradie" && !c.employerContactId);
    return {
      tradies: cfg.tradieContactIds.map((id, i) => ({
        contactId: id,
        name: contacts.find((c) => c.id === id)?.fullName ?? "",
        online:
          Boolean(tradiePresence[id]?.online) ||
          contacts.some((c) => c.employerContactId === id && tradiePresence[c.id]?.online),
        priority: i + 1,
      })),
      maxJobCents: cfg.maxJobCents,
      networkTradies: businesses.map((c) => ({ contactId: c.id, name: c.fullName })),
    };
  },

  async setHouseTradies(pmPortfolioToken, input) {
    const resolved = resolveDemoToken(pmPortfolioToken);
    if (resolved?.scope !== "pm_portfolio" || !resolved.contactId) return { ok: false, error: "This link isn't active." };
    const ids = [...new Set(input.tradieContactIds)].slice(0, 3);
    if (ids.some((id) => !contacts.some((c) => c.id === id && c.kind === "tradie"))) {
      return { ok: false, error: "Pick tradies from the network." };
    }
    demoHouseTradies[resolved.contactId] = {
      tradieContactIds: ids,
      maxJobCents: Math.max(0, Math.min(500_000, Math.round(input.maxJobCents))),
    };
    return { ok: true };
  },

  // ——— v8 R5b: crews ———

  async listCrew(tradiePortalToken) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return null;
    if (demoBizId(resolved.contactId) !== resolved.contactId) return []; // staff don't manage the crew
    return contacts
      .filter((c) => c.employerContactId === resolved.contactId)
      .map((c) => ({ contactId: c.id, name: c.fullName, online: Boolean(tradiePresence[c.id]?.online) }));
  },

  async addCrewMember(tradiePortalToken, input) {
    const resolved = resolveDemoToken(tradiePortalToken);
    if (resolved?.scope !== "tradie_portal" || !resolved.contactId) return { ok: false, error: "This link isn't active." };
    if (demoBizId(resolved.contactId) !== resolved.contactId) {
      return { ok: false, error: "Only the business seat manages the crew." };
    }
    const name = input.name.trim().slice(0, 80);
    if (name.length < 2) return { ok: false, error: "A name, please." };
    const staff: DemoContact = {
      id: `contact-staff-${++demoContactSeq}`,
      kind: "tradie",
      fullName: name,
      email: input.email?.trim() || "",
      phone: input.phone?.trim() || undefined,
      employerContactId: resolved.contactId,
    };
    contacts.push(staff);
    tradiePresence[staff.id] = { online: false };
    const token = issueDemoToken("tradie_portal", staff.id, staff.id);
    return { ok: true, path: `/p/trade/${token}` };
  },

  async attachAssetReceipt(ownerToken, assetId, input) {
    const resolved = resolveDemoToken(ownerToken);
    if (!resolved || !["owner_portal", "pm_portfolio"].includes(resolved.scope)) {
      return { ok: false, error: "This link isn't active." };
    }
    const asset = propertyAssets.find((a) => a.id === assetId);
    if (!asset) return { ok: false, error: "Asset not found." };
    const property = properties.find((p) => p.id === asset.propertyId);
    const allowed =
      (resolved.scope === "owner_portal" && property?.ownerContactId === resolved.aggregateId) ||
      (resolved.scope === "pm_portfolio" && property?.pmContactId === resolved.contactId);
    if (!allowed) return { ok: false, error: "Asset not found." };
    if (!input.dataUrl?.startsWith("data:")) return { ok: false, error: "Attach the receipt photo or PDF scan." };
    asset.receiptDataUrl = input.dataUrl;
    asset.purchasedAt = input.purchasedAt || null;
    asset.manufacturerWarrantyMonths = Math.max(0, Math.min(240, Math.round(input.warrantyMonths))) || null;
    return { ok: true };
  },
};

// ——— Admin oversight (customer-site release): demo parity ———

interface DemoJoinRequest {
  persona: string;
  fullName: string;
  email: string;
  phone: string | null;
  suburb: string | null;
  message: string | null;
  createdAt: string;
}
const demoJoinRequestRows: DemoJoinRequest[] = [];

export function recordDemoJoinRequest(input: Omit<DemoJoinRequest, "createdAt">): void {
  demoJoinRequestRows.push({ ...input, createdAt: new Date().toISOString() });
}

/** The operator god-view, computed from the demo arrays — structural parity
 * with lib/admin-data.ts's live queries. */
export function demoAdminOverview() {
  const OPEN = new Set(["reported", "triaged", "pending_approval", "approved", "quoting", "scheduled", "in_progress"]);
  const PENDING = new Set(["evidence_pending", "verified", "invoiced"]);
  const CLOSED = new Set(["paid", "closed"]);
  const bucketOf = (st: string) => (OPEN.has(st) ? "open" : PENDING.has(st) ? "pending" : CLOSED.has(st) ? "closed" : null);

  const pipeline = {
    open: { count: 0, valueCents: 0 },
    pending: { count: 0, valueCents: 0 },
    closed: { count: 0, valueCents: 0 },
  } as Record<"open" | "pending" | "closed", { count: number; valueCents: number }>;
  const transactions: Array<{
    requestId: string; title: string; address: string; bucket: "open" | "pending" | "closed";
    state: string; amountCents: number | null; feeCents: number | null; at: string;
  }> = [];
  const valueOf = (requestId: string) => {
    const slices = payments.filter((pm) => pm.requestId === requestId && pm.status !== "voided");
    if (slices.length === 0) return { amount: null as number | null, fee: null as number | null };
    return {
      amount: slices.reduce((s, pm) => s + pm.amountCents, 0),
      fee: slices.reduce((s, pm) => s + pm.platformFeeCents + (pm.fastpayFeeCents ?? 0), 0),
    };
  };
  for (const r of [...requests].sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt))) {
    const state = requestState(r);
    const bucket = bucketOf(state);
    if (!bucket) continue;
    const { amount, fee } = valueOf(r.id);
    pipeline[bucket].count += 1;
    pipeline[bucket].valueCents += amount ?? 0;
    if (transactions.length < 25) {
      const property = properties.find((p) => p.id === r.propertyId);
      transactions.push({
        requestId: r.id, title: r.title, address: property ? `${property.address}, ${property.suburb}` : "",
        bucket, state, amountCents: amount, feeCents: fee, at: r.reportedAt,
      });
    }
  }

  const monthlyMap = new Map<string, { month: string; jobsClosed: number; grossCents: number; platformFeeCents: number; fastpayFeeCents: number }>();
  const nowMonth = new Date().toISOString().slice(0, 7);
  for (const pm of payments) {
    if (pm.status !== "transferred" && pm.status !== "captured") continue;
    const m = monthlyMap.get(nowMonth) ?? { month: nowMonth, jobsClosed: 0, grossCents: 0, platformFeeCents: 0, fastpayFeeCents: 0 };
    m.grossCents += pm.amountCents;
    m.platformFeeCents += pm.platformFeeCents;
    m.fastpayFeeCents += pm.fastpayFeeCents ?? 0;
    monthlyMap.set(nowMonth, m);
  }
  for (const r of requests) {
    if (!CLOSED.has(requestState(r))) continue;
    const m = monthlyMap.get(nowMonth) ?? { month: nowMonth, jobsClosed: 0, grossCents: 0, platformFeeCents: 0, fastpayFeeCents: 0 };
    m.jobsClosed += 1;
    monthlyMap.set(nowMonth, m);
  }

  const byPm = new Map<string, { pmName: string; properties: number; openJobs: number; addresses: string[] }>();
  for (const p of properties) {
    const pmName = (p.pmContactId && contacts.find((c) => c.id === p.pmContactId)?.fullName) || "Self-managed";
    const g = byPm.get(pmName) ?? { pmName, properties: 0, openJobs: 0, addresses: [] };
    g.properties += 1;
    g.addresses.push(`${p.address}, ${p.suburb}`);
    g.openJobs += requests.filter((r) => r.propertyId === p.id && OPEN.has(requestState(r))).length;
    byPm.set(pmName, g);
  }

  const pmSubscriptions = Object.entries(demoPmSubscriptions).map(([pmId, sub]) => {
    const pum = properties.filter((pp) => pp.pmContactId === pmId).length;
    return {
      pmName: contacts.find((c) => c.id === pmId)?.fullName ?? "Unknown manager",
      sku: sub.sku,
      tierName: sub.name,
      priceCents: sub.priceCents,
      propertyCap: sub.propertyCap,
      propertiesUnderManagement: pum,
      overCap: pum > sub.propertyCap,
      hubspotDealId: null,
      selectedAt: sub.selectedAt,
    };
  });

  return {
    dataSource: "demo" as const,
    hubspot: { configured: Boolean(process.env.HUBSPOT_ACCESS_TOKEN) },
    pmSubscriptions,
    subscriptionMrrCents: pmSubscriptions.reduce((sm, x) => sm + x.priceCents, 0),
    counts: {
      properties: properties.length,
      propertyManagers: contacts.filter((c) => c.kind === "property_manager").length,
      owners: contacts.filter((c) => c.kind === "owner").length,
      tradies: contacts.filter((c) => c.kind === "tradie").length,
      tradiesOnline: contacts.filter((c) => c.kind === "tradie" && tradiePresence[c.id]?.online).length,
      joinRequests: demoJoinRequestRows.length,
    },
    pipeline,
    transactions,
    monthly: [...monthlyMap.values()],
    propertiesByPm: [...byPm.values()].sort((a, b) => b.properties - a.properties),
    joinRequests: [...demoJoinRequestRows].reverse().map((j) => ({
      persona: j.persona, fullName: j.fullName, email: j.email, suburb: j.suburb,
      company: null, abn: null, trades: null, serviceSuburbs: null,
      propertiesUnderMgmt: null, propertyCount: null,
      hubspotSynced: false, at: j.createdAt,
    })),
  };
}

// ——— v8 R2 helpers ———

/** The human verification + Penny's settlement — shared by the Job Screen's
 * verify tap and one-tap moment actions (Supabase parity: verifySettleCore). */
function demoVerifySettle(
  request: DemoRequest,
  actor: { actorType: "tenant" | "agency_user"; actorId: string },
): { ok: true; funding?: "owner_handoff" } | { ok: false; error: string } {
  const current = requestState(request);
  const verifyResult = transition(current, "verify", actor.actorType);
  if (!verifyResult.ok) return { ok: false, error: `Cannot verify from state "${current}".` };
  const now = new Date().toISOString();
  request.events.push({ eventType: "verify", actorType: actor.actorType, actorId: actor.actorId, at: now });

  const wo = workOrders.find((w) => w.requestId === request.id);
  if (!wo) return { ok: true };
  wo.status = verifyResult.state;

  // Settlement: capture + transfer (simulated PSP), the record write, the
  // certificate if this was a compliance playbook — Penny's whole job.
  const playbook = request.playbookKey ? getPlaybook(request.playbookKey) : null;
  const openSlices = payments.filter((p) => p.requestId === request.id && p.status !== "voided");
  const activePartsCents = demoJobParts
    .filter((pt) => pt.workOrderId === wo.id && pt.status === "active")
    .reduce((s, pt) => s + pt.costCents, 0);
  const settleAmount =
    openSlices.length > 0
      ? openSlices.reduce((s, p) => s + p.amountCents, 0)
      : (wo.quoteCents ?? 0) + (wo.callOutFeeCents ?? 0) + activePartsCents;

  const invoiceResult = transition(verifyResult.state, "invoice", "system");
  if (invoiceResult.ok) {
    request.events.push({
      eventType: "invoice",
      actorType: "system",
      actorId: "penny:capture",
      at: now,
      note: `Fixed price captured on verification — ${(settleAmount / 100).toFixed(2)}`,
    });
    wo.invoiceCents = settleAmount;
    wo.invoicedAt = now;

    // The Address Record write.
    if (playbook) {
      let asset = propertyAssets.find(
        (a) => a.propertyId === request.propertyId && a.category === playbook.category && a.label === playbook.assetLabel,
      );
      if (!asset) {
        asset = {
          id: `asset-${++demoAssetSeq}`,
          propertyId: request.propertyId,
          category: playbook.category,
          label: playbook.assetLabel,
          installedAt: null,
        };
        propertyAssets.push(asset);
      }
      // The id-plate truth the tradie recorded on site lands on the record.
      if (wo.assetManufacturer) asset.manufacturer = wo.assetManufacturer;
      if (wo.assetModel) asset.model = wo.assetModel;
      if (wo.assetSerial) asset.serialNumber = wo.assetSerial;
      // The tradie's receipt (they bought the unit) — never overwrites one
      // already on file.
      if (wo.receiptDataUrl && !asset.receiptDataUrl) {
        asset.receiptDataUrl = wo.receiptDataUrl;
        asset.purchasedAt = wo.assetPurchasedAt ?? null;
        asset.manufacturerWarrantyMonths = wo.assetWarrantyMonths ?? null;
      }
      wo.assetId = asset.id;
      if (playbook.warrantyDefaultMonths > 0) {
        wo.warrantyExpiresAt = new Date(Date.now() + playbook.warrantyDefaultMonths * 30 * 86_400_000).toISOString();
      }
      if (playbook.compliance) {
        const property = properties.find((p) => p.id === request.propertyId);
        property?.evidence.push({ requirementKey: playbook.compliance.filesCertificate, completedAt: new Date() });
      }
    }

    const fastPay = Boolean(fastPayByTradie[wo.tradieContactId]);
    const split = splitPaymentWithFastPay(settleAmount, fastPay);
    // The same-day funding ladder (v8 R6) — parity with verifySettleCore.
    const fundProp = properties.find((pp) => pp.id === request.propertyId);
    const funding = decideFunding({
      pmManaged: Boolean(fundProp?.pmContactId),
      trustBalanceCents: fundProp?.trustBalanceCents ?? null,
      amountCents: settleAmount,
    });
    const transferNow = funding.source !== "owner_handoff";
    for (const slice of openSlices) {
      if (slice.status !== "authorized") continue; // deposits settled at confirmation
      slice.status = transferNow ? "transferred" : "captured";
      slice.workOrderId = wo.id;
      slice.fastpayFeeCents = fastPay ? split.fastPayFeeCents : null;
    }
    if (funding.source === "pm_trust" && fundProp) fundProp.trustBalanceCents = funding.trustBalanceAfterCents;
    demoWorkOrderEvents.push({
      workOrderId: wo.id,
      eventType: funding.source === "owner_handoff" ? "funding_handoff" : "funding_decided",
      at: now,
      note: funding.note,
    });
    if (funding.source === "owner_handoff") return { ok: true, funding: "owner_handoff" };

    const paidResult = transition(invoiceResult.state, "record_payment", "system");
    const closedResult = paidResult.ok ? transition(paidResult.state, "close", "system") : null;
    if (paidResult.ok) request.events.push({ eventType: "record_payment", actorType: "system", actorId: "penny:psp", at: now });
    if (closedResult?.ok) request.events.push({ eventType: "close", actorType: "system", actorId: "penny:psp", at: now });
    wo.status = closedResult?.ok ? closedResult.state : invoiceResult.state;
  }
  return { ok: true };
}

/** Owner pays a trust-short job now (v8 R6) — parity: fundJobCore. */
function demoFundJob(request: DemoRequest, actorId: string): { ok: true } | { ok: false; error: string } {
  const captured = payments.filter((pm) => pm.requestId === request.id && pm.status === "captured");
  if (captured.length === 0) return { ok: false, error: "Nothing awaiting funding on this job." };
  for (const slice of captured) slice.status = "transferred";
  const wo = workOrders.find((w) => w.requestId === request.id);
  demoWorkOrderEvents.push({
    workOrderId: wo?.id ?? request.id,
    eventType: "funded_by_owner",
    at: new Date().toISOString(),
    note: `Owner paid now (${actorId}) — tradie same-day; PM trust untouched.`,
  });
  const now = new Date().toISOString();
  const paid = transition(requestState(request), "record_payment", "system");
  if (paid.ok) {
    request.events.push({ eventType: "record_payment", actorType: "system", actorId: "penny:psp", at: now });
    const closed = transition(paid.state, "close", "system");
    if (closed.ok) request.events.push({ eventType: "close", actorType: "system", actorId: "penny:psp", at: now });
    if (wo) wo.status = closed.ok ? closed.state : paid.state;
  }
  return { ok: true };
}

/** Tradie business performance (v8 R6) — parity: tradiePerformance. */
function demoTradiePerformance(bizId: string): PerformanceView {
  const bizName = contacts.find((c) => c.id === bizId)?.fullName ?? "You";
  const wos = workOrders.filter((w) => w.tradieContactId === bizId);
  const byStatus = new Map<string, number>();
  let quoted = 0, invoiced = 0, collected = 0, awaiting = 0;
  const activity: PerformanceView["activity"] = [];
  const warranties: PerformanceView["warranties"] = [];
  for (const w of wos) {
    const request = requests.find((r) => r.id === w.requestId);
    if (!request) continue;
    const state = requestState(request);
    byStatus.set(state, (byStatus.get(state) ?? 0) + 1);
    quoted += (w.quoteCents ?? 0) + (w.callOutFeeCents ?? 0);
    invoiced += w.invoiceCents ?? 0;
    const who = (w.assignedStaffContactId && contacts.find((c) => c.id === w.assignedStaffContactId)?.fullName) || bizName;
    const property = properties.find((pp) => pp.id === request.propertyId);
    const job = `${request.title}${property ? ` @ ${property.suburb}` : ""}`;
    activity.push({
      at: w.invoicedAt ?? w.onTheWayAt ?? request.reportedAt,
      who,
      what: w.invoicedAt
        ? `finished${w.actualMinutes ? ` (on site ${w.actualMinutes} min${w.estimatedMinutes ? ` / est ${w.estimatedMinutes}` : ""})` : ""}`
        : state.replace(/_/g, " "),
      job,
    });
    if (w.warrantyExpiresAt && new Date(w.warrantyExpiresAt) > new Date()) {
      warranties.push({ assetLabel: job, until: w.warrantyExpiresAt, property: property ? `${property.address}, ${property.suburb}` : null });
    }
  }
  const reqIds = new Set(wos.map((w) => w.requestId));
  for (const pm of payments) {
    if (!reqIds.has(pm.requestId)) continue;
    if (pm.status === "transferred") collected += pm.amountCents;
    if (pm.status === "captured") awaiting += pm.amountCents;
  }
  const partsUsed: PerformanceView["partsUsed"] = demoJobParts
    .filter((pt) => pt.status === "active" && wos.some((w) => w.id === pt.workOrderId))
    .map((pt) => {
      const w = wos.find((x) => x.id === pt.workOrderId)!;
      const request = requests.find((r) => r.id === w.requestId);
      return { label: pt.label, costCents: pt.costCents, job: request?.title ?? "Job", at: new Date().toISOString() };
    });
  const reviews: ReviewView[] = demoReviews
    .filter((rv) => rv.tradieContactId === bizId)
    .map((rv) => ({
      id: rv.id,
      rating: rv.rating,
      comment: rv.comment,
      reviewerRole: rv.reviewerRole,
      at: rv.createdAt,
      response: rv.response,
      jobTitle: requests.find((r) => r.id === rv.requestId)?.title ?? "Job",
    }))
    .reverse();
  const avgRating = reviews.length ? reviews.reduce((sm, rv) => sm + rv.rating, 0) / reviews.length : null;
  const acc = tradieAccuracyFor(bizId);
  const scoreValue = scoreTrustWithFeedback(
    { completedJobs: acc.completedJobs, avgAbsVariancePct: blendedAccuracyPct(acc.avgAbsVariancePct, acc.avgAbsTimeVariancePct) },
    { avgRating, reviewCount: reviews.length },
  );
  const openCount = [...byStatus.entries()].filter(([st]) => !["paid", "closed", "cancelled", "declined"].includes(st)).reduce((sm, [, c]) => sm + c, 0);
  return {
    scope: "tradie",
    heading: `${bizName} — business performance`,
    tiles: [
      { label: "Jobs on the books", value: String(wos.length), hint: `${openCount} live` },
      { label: "Collected", value: `$${Math.round(collected / 100).toLocaleString("en-AU")}` },
      { label: "Trust score", value: String(scoreValue), hint: avgRating ? `★ ${avgRating.toFixed(1)} (${reviews.length})` : "no reviews yet" },
      { label: "Warranty obligations", value: String(warranties.length), hint: "live workmanship promises" },
    ],
    jobsByStatus: [...byStatus.entries()].map(([state, count]) => ({ state: state as RequestState, count })),
    activity: activity.sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).slice(0, 20),
    partsUsed,
    warranties,
    money: { quotedCents: quoted, invoicedCents: invoiced, collectedCents: collected, awaitingFundsCents: awaiting },
    score: {
      value: scoreValue,
      avgAbsMoneyVariancePct: acc.avgAbsVariancePct,
      avgAbsTimeVariancePct: acc.avgAbsTimeVariancePct,
      avgRating,
      reviewCount: reviews.length,
      tips: scoreTips({
        avgAbsMoneyVariancePct: acc.avgAbsVariancePct,
        avgAbsTimeVariancePct: acc.avgAbsTimeVariancePct,
        avgRating,
        completedJobs: acc.completedJobs,
      }),
    },
    reviews,
    perProperty: null,
  };
}

/** PM/owner portfolio performance (v8 R6) — parity: portfolioPerformance. */
function demoPortfolioPerformance(scope: "pm" | "owner", scopeProps: DemoProperty[]): PerformanceView {
  const OPEN = new Set(["reported", "triaged", "pending_approval", "approved", "quoting", "scheduled", "in_progress", "evidence_pending"]);
  const propIds = new Set(scopeProps.map((pp) => pp.id));
  const scopeReqs = requests.filter((r) => propIds.has(r.propertyId));
  const reqIds = new Set(scopeReqs.map((r) => r.id));
  let collected = 0, awaiting = 0, invoicedTotal = 0;
  for (const pm of payments) {
    if (!reqIds.has(pm.requestId)) continue;
    if (pm.status === "transferred") collected += pm.amountCents;
    if (pm.status === "captured") awaiting += pm.amountCents;
  }
  const byStatus = new Map<string, number>();
  const activity: PerformanceView["activity"] = [];
  const warranties: PerformanceView["warranties"] = [];
  for (const r of [...scopeReqs].sort((x, y) => Date.parse(y.reportedAt) - Date.parse(x.reportedAt))) {
    const state = requestState(r);
    byStatus.set(state, (byStatus.get(state) ?? 0) + 1);
    const property = scopeProps.find((pp) => pp.id === r.propertyId);
    if (activity.length < 20) activity.push({ at: r.reportedAt, who: property ? `${property.address}` : "", what: state.replace(/_/g, " "), job: r.title });
    const wo = workOrders.find((w) => w.requestId === r.id);
    if (wo) {
      invoicedTotal += wo.invoiceCents ?? 0;
      if (wo.warrantyExpiresAt && new Date(wo.warrantyExpiresAt) > new Date()) {
        const tradie = contacts.find((c) => c.id === wo.tradieContactId);
        warranties.push({
          assetLabel: `${r.title}${tradie ? ` — ${tradie.fullName}` : ""}`,
          until: wo.warrantyExpiresAt,
          property: property ? `${property.address}, ${property.suburb}` : null,
        });
      }
    }
  }
  const perProperty = scopeProps.map((pp) => {
    const propReqs = scopeReqs.filter((r) => r.propertyId === pp.id);
    return {
      propertyId: pp.id,
      address: `${pp.address}, ${pp.suburb}`,
      openJobs: propReqs.filter((r) => OPEN.has(requestState(r))).length,
      spend12moCents: spendingForProperties([pp.id], 12).totalCents,
      warranties: warranties.filter((w) => w.property === `${pp.address}, ${pp.suburb}`).length,
      compliance: evaluateProperty(pp.profile, pp.evidence, new Date()).overall,
      trustBalanceCents: scope === "pm" ? (pp.trustBalanceCents ?? 0) : null,
    };
  });
  return {
    scope,
    heading: scope === "pm" ? "Portfolio performance" : "Your properties — performance",
    tiles: [
      { label: "Properties", value: String(scopeProps.length) },
      { label: "Open jobs", value: String(scopeReqs.filter((r) => OPEN.has(requestState(r))).length) },
      { label: "Maintained (12mo)", value: `$${Math.round(perProperty.reduce((sm, x) => sm + x.spend12moCents, 0) / 100).toLocaleString("en-AU")}` },
      {
        label: "Awaiting funds",
        value: `$${Math.round(awaiting / 100).toLocaleString("en-AU")}`,
        hint: awaiting > 0 ? "trust short — owner can pay now" : "all settled same-day",
      },
    ],
    jobsByStatus: [...byStatus.entries()].map(([state, count]) => ({ state: state as RequestState, count })),
    activity,
    partsUsed: [],
    warranties,
    money: { quotedCents: 0, invoicedCents: invoicedTotal, collectedCents: collected, awaitingFundsCents: awaiting },
    score: null,
    reviews: [],
    perProperty,
  };
}

// ——— v8 R1 helpers ———

/** Crews (v8 R5b): a staff member acts FOR their employer. */
function demoBizId(contactId: string): string {
  return contacts.find((c) => c.id === contactId)?.employerContactId ?? contactId;
}

function onlineTradieIds(): string[] {
  const ids = contacts
    .filter((c) => c.kind === "tradie" && tradiePresence[c.id]?.online)
    .map((c) => demoBizId(c.id));
  return [...new Set(ids)];
}

function bookablePropertyId(token: string, propertyId?: string): string | null {
  const resolved = resolveDemoToken(token);
  if (!resolved) return null;
  if (resolved.scope === "tenant_intake") return resolved.aggregateId;
  if (resolved.scope === "owner_portal") {
    const owned = properties.filter((p) => p.ownerContactId === resolved.aggregateId);
    if (propertyId) return owned.some((p) => p.id === propertyId) ? propertyId : null;
    return owned[0]?.id ?? null;
  }
  return null;
}

function evidenceItemsFor(workOrderId: string): PlaybookEvidenceItem[] {
  return jobEvidence
    .filter((e) => e.workOrderId === workOrderId)
    .map((e) => ({ gate: e.gate as PlaybookEvidenceItem["gate"], at: new Date(e.createdAt) }));
}

function demoJobSource(request: DemoRequest): JobSource {
  const property = properties.find((p) => p.id === request.propertyId);
  const wo = workOrders.find((w) => w.requestId === request.id);
  const acceptedQuote = quotes.find((q) => q.requestId === request.id && q.status === "accepted");
  const tradieId = wo?.tradieContactId ?? acceptedQuote?.tradieContactId ?? null;
  const tradieBiz = tradieId ? contacts.find((c) => c.id === tradieId) : null;
  const staff = wo?.assignedStaffContactId ? contacts.find((c) => c.id === wo.assignedStaffContactId) : null;
  const tradie =
    staff && tradieBiz && staff.id !== tradieBiz.id
      ? { ...staff, fullName: `${staff.fullName} (${tradieBiz.fullName})` }
      : tradieBiz;
  const owner = property?.ownerContactId ? contacts.find((c) => c.id === property.ownerContactId) : null;
  const pm = property?.pmContactId ? contacts.find((c) => c.id === property.pmContactId) : null;
  const occupant = contacts.find((c) => c.kind === "tenant");
  const payment = payments.find((p) => p.requestId === request.id);

  return {
    request: {
      id: request.id,
      title: request.title,
      description: request.description,
      category: request.category,
      estimateCents: request.estimateCents,
      state: requestState(request),
      isWarrantyClaim: Boolean(request.warrantyClaimOfWorkOrderId),
      events: request.events.map((e) => ({ eventType: e.eventType, actorType: e.actorType, note: e.note, at: e.at })),
      playbookKey: request.playbookKey ?? null,
      bookedSlot: request.bookedStartAt
        ? { startAt: request.bookedStartAt, endAt: request.bookedEndAt ?? request.bookedStartAt }
        : null,
    },
    propertyAddress: property ? `${property.address}, ${property.suburb}` : "",
    workOrder: wo
      ? {
          id: wo.id,
          onTheWayAt: wo.onTheWayAt ?? null,
          scheduledStartAt: wo.scheduledStartAt ?? null,
          scheduledEndAt: wo.scheduledEndAt ?? null,
          completionNote: wo.completionNote,
          estimatedMinutes: wo.estimatedMinutes ?? null,
          actualMinutes: wo.actualMinutes ?? null,
        }
      : null,
    tradie: tradie ? { name: tradie.fullName, verified: true } : null,
    ownerName: owner?.fullName ?? null,
    pmName: pm?.fullName ?? null,
    occupantName: occupant?.fullName ?? null,
    payment: aggregateDemoPayments(request.id),
    evidence: wo
      ? jobEvidence
          .filter((e) => e.workOrderId === wo.id)
          .map((e) => ({ gate: e.gate, dataUrl: e.dataUrl, note: e.note, at: e.createdAt }))
      : [],
    variance: latestDemoVariance(request.id),
    parts: wo
      ? demoJobParts
          .filter((pt) => pt.workOrderId === wo.id)
          .map((pt) => ({ id: pt.id, label: pt.label, costCents: pt.costCents, status: pt.status }))
      : [],
  };
}

/** Parity with supabase-data's aggregatePayments: sum the slices, report the
 * least-settled status so "authorized" never reads as "paid". */
function aggregateDemoPayments(
  requestId: string,
): { status: PaymentState; amountCents: number; payoutCents: number | null } | null {
  const live = payments.filter((p) => p.requestId === requestId && p.status !== "voided");
  if (live.length === 0) return null;
  const amountCents = live.reduce((s, p) => s + p.amountCents, 0);
  const rank: Record<string, number> = { authorized: 0, disputed: 0, captured: 1, transferred: 2 };
  const status = live.reduce<PaymentState>(
    (least, p) => ((rank[p.status] ?? 0) < (rank[least] ?? 0) ? p.status : least),
    live[0]!.status,
  );
  return { status, amountCents, payoutCents: splitPayment(amountCents).tradiePayoutCents };
}

function latestDemoVariance(requestId: string) {
  const v = demoVariances.filter((x) => x.requestId === requestId).at(-1);
  return v
    ? {
        id: v.id,
        bookedCents: v.bookedCents,
        newTotalCents: v.newTotalCents,
        reason: v.reason,
        status: v.status,
        photoDataUrl: v.photoDataUrl ?? null,
      }
    : null;
}

/** Parity with supabase-data's ensurePaymentPlan. */
function ensureDemoPaymentPlan(request: DemoRequest, totalCents: number, workOrderId: string): void {
  if (totalCents <= 0) return;
  if (payments.some((p) => p.requestId === request.id)) return;
  const playbook = request.playbookKey ? getPlaybook(request.playbookKey) : null;
  const schedule = paymentScheduleFor(playbook ?? {}, totalCents);
  const now = new Date().toISOString();
  for (const slice of schedule) {
    const split = splitPayment(slice.amountCents);
    const settleNow = slice.captureOn === "confirmation";
    payments.push({
      id: `pay-${++demoPaymentSeq}`,
      requestId: request.id,
      workOrderId,
      status: settleNow ? "transferred" : "authorized",
      amountCents: slice.amountCents,
      platformFeeCents: split.platformFeeCents,
      payoutCents: split.tradiePayoutCents,
      kind: slice.kind,
    });
    if (settleNow) {
      // Work-order aggregate event in the live store; the demo keeps a side
      // log because request.events IS the state-machine stream here.
      demoWorkOrderEvents.push({
        workOrderId,
        eventType: "payment_transferred",
        at: now,
        note: `Deposit captured at confirmation (materials) — ${(slice.amountCents / 100).toFixed(2)}`,
      });
    }
  }
}

/** v8 R3.5: parts booked to jobs (parity: job_parts). */
interface DemoJobPart {
  id: string;
  workOrderId: string;
  label: string;
  costCents: number;
  status: "active" | "pending_approval" | "declined";
  varianceId?: string | null;
}
const demoJobParts: DemoJobPart[] = [];
let demoPartSeq = 0;

/** v8 R7: the PM's subscription + house tradies — parity: pm_subscriptions,
 * pm_preferred_tradies, pm_dispatch_prefs. */
const demoPmSubscriptions: Record<string, { sku: string; name: string; priceCents: number; propertyCap: number; selectedAt: string }> = {};
const demoHouseTradies: Record<string, { tradieContactIds: string[]; maxJobCents: number }> = {};

/** v8 R6: reviews (one per job) — parity: job_reviews. */
interface DemoReview {
  id: string;
  requestId: string;
  tradieContactId: string;
  rating: number;
  comment: string | null;
  reviewerRole: "occupant" | "payer";
  response: string | null;
  createdAt: string;
}
const demoReviews: DemoReview[] = [];
let demoReviewSeq = 0;

/** Demo stand-in for the live store's work_order aggregate events —
 * variance/payment events never enter the request's state-machine stream. */
const demoWorkOrderEvents: Array<{ workOrderId: string; eventType: string; at: string; note?: string }> = [];

/** Parity with supabase-data's decideVarianceCore. */
function demoDecideVariance(
  varianceId: string,
  decision: "approve" | "decline",
): { ok: boolean; error?: string; requestId?: string } {
  const v = demoVariances.find((x) => x.id === varianceId);
  if (!v) return { ok: false, error: "Not found." };
  if (v.status !== "pending") return { ok: false, error: "This change was already decided." };
  v.status = decision === "approve" ? "approved" : "declined";
  v.decidedAt = new Date().toISOString();
  for (const pt of demoJobParts.filter((x) => x.varianceId === v.id)) {
    pt.status = decision === "approve" ? "active" : "declined";
  }
  demoWorkOrderEvents.push({
    workOrderId: v.workOrderId,
    eventType: decision === "approve" ? "variance_approved" : "variance_declined",
    at: v.decidedAt,
  });
  if (decision === "approve") {
    const delta = v.newTotalCents - v.bookedCents;
    if (delta > 0) {
      const split = splitPayment(delta);
      payments.push({
        id: `pay-${++demoPaymentSeq}`,
        requestId: v.requestId,
        workOrderId: v.workOrderId,
        status: "authorized",
        amountCents: delta,
        platformFeeCents: split.platformFeeCents,
        payoutCents: split.tradiePayoutCents,
        kind: "variance",
      });
    }
  }
  return { ok: true, requestId: v.requestId };
}

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
    .filter((a) => propertyIds.includes(a.propertyId))
    .map((a) => {
      const property = properties.find((p) => p.id === a.propertyId);
      const horizon = assessAssetHorizon({
        category: a.category,
        installedAt: a.installedAt ? new Date(a.installedAt) : today,
        today,
      });
      const mfrWarrantyUntil =
        a.purchasedAt && a.manufacturerWarrantyMonths
          ? new Date(new Date(a.purchasedAt).getTime() + a.manufacturerWarrantyMonths * 30 * 86_400_000).toISOString()
          : null;
      return {
        assetId: a.id,
        propertyAddress: property ? `${property.address}, ${property.suburb}` : "",
        assetLabel: a.label,
        category: a.category,
        ageYears: horizon.ageYears,
        effectiveLifeYears: horizon.effectiveLifeYears,
        remainingLifeYears: horizon.remainingLifeYears,
        status: horizon.status,
        plannedReplacementCents: medians[a.category] ?? null,
        disclaimer: horizon.disclaimer,
        manufacturer: a.manufacturer ?? null,
        model: a.model ?? null,
        serialNumber: a.serialNumber ?? null,
        receiptOnFile: Boolean(a.receiptDataUrl),
        manufacturerWarrantyUntil: mfrWarrantyUntil,
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
  const allCompleted = workOrders.filter(
    (w) => w.tradieContactId === tradieContactId && w.invoiceCents !== null && w.quoteCents !== null && w.quoteCents > 0,
  );
  // FAIRNESS (core rule): only jobs the TRADIE priced count toward quote
  // accuracy — network-priced fixed-band jobs are excluded.
  const pricingOf = (w: DemoWorkOrder) => {
    const request = requests.find((r) => r.id === w.requestId);
    const pb = request?.playbookKey ? getPlaybook(request.playbookKey) : null;
    return pb?.pricing.model ?? "quote_race"; // no playbook = the tradie priced it
  };
  const completed = allCompleted.filter((w) => countsTowardQuoteAccuracy(pricingOf(w)));
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
  const scopeChanged = new Set(
    demoVariances.filter((v) => v.status === "approved" || v.status === "auto_applied").map((v) => v.workOrderId),
  );
  const timeVariances = workOrders
    .filter(
      (w) =>
        w.tradieContactId === tradieContactId &&
        w.actualMinutes != null &&
        (w.estimatedMinutes ?? 0) > 0 &&
        countsTowardTimeAccuracy(scopeChanged.has(w.id) ? "approved" : "none"),
    )
    .map((w) => computeTimeAccuracy(w.estimatedMinutes!, w.actualMinutes!).absVariancePct);
  const avgAbsTimeVariancePct =
    timeVariances.length > 0 ? timeVariances.reduce((a, b) => a + b, 0) / timeVariances.length : null;
  return {
    completedJobs: allCompleted.length,
    avgAbsVariancePct,
    avgAbsTimeVariancePct,
    trustScore: scoreTrust({
      completedJobs: completed.length,
      avgAbsVariancePct: blendedAccuracyPct(avgAbsVariancePct, avgAbsTimeVariancePct),
    }),
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
