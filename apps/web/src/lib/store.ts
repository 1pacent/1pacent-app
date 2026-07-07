import {
  decideApproval,
  evaluateProperty,
  isUrgentCategory,
  projectState,
  transition,
  type ActorType,
  type EvidenceRecord,
  type PropertyComplianceProfile,
  type PropertyComplianceStatus,
  type RequestCategory,
  type RequestEvent,
  type RequestState,
} from "@1pacent/core";

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

/** Demo stand-ins for hashed access_tokens rows. */
const demoTokens: Record<string, { scope: "tenant_intake" | "landlord_approval"; aggregateId: string }> = {
  "demo-intake": { scope: "tenant_intake", aggregateId: "prop-fitzroy" },
  "demo-approval": { scope: "landlord_approval", aggregateId: "req-fence" },
};

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

/** Landlord approval via magic link: identity comes from the token, never the body. */
export function decideByToken(
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
