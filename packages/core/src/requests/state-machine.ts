/**
 * Maintenance request lifecycle state machine.
 *
 * The append-only event log is the source of truth (audit finding H6);
 * a request's current status is always a projection over its events.
 * The client never computes transitions — it only renders them
 * (api_contracts rule carried over from the original repo).
 */

export const REQUEST_STATES = [
  "reported",
  "triaged",
  "pending_approval",
  "approved",
  "declined",
  "quoting",
  "scheduled",
  "in_progress",
  "evidence_pending",
  "verified",
  "invoiced",
  "paid",
  "closed",
  "cancelled",
] as const;

export type RequestState = (typeof REQUEST_STATES)[number];

export const ACTOR_TYPES = ["tenant", "landlord", "agency_user", "tradie", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const REQUEST_EVENTS = [
  "triage",
  "request_approval",
  "auto_approve",
  "approve",
  "decline",
  "request_quotes",
  "accept_quote",
  "schedule",
  "start_work",
  "submit_evidence",
  "reject_evidence",
  "verify",
  "invoice",
  "record_payment",
  "close",
  "cancel",
] as const;

export type RequestEvent = (typeof REQUEST_EVENTS)[number];

interface TransitionRule {
  to: RequestState;
  /** Who is allowed to cause this transition. Enforced server-side. */
  allowedActors: readonly ActorType[];
}

type TransitionTable = Partial<Record<RequestState, Partial<Record<RequestEvent, TransitionRule>>>>;

const MANAGERS = ["agency_user", "system"] as const;

export const TRANSITIONS: TransitionTable = {
  reported: {
    triage: { to: "triaged", allowedActors: MANAGERS },
    cancel: { to: "cancelled", allowedActors: ["tenant", ...MANAGERS] },
  },
  triaged: {
    request_approval: { to: "pending_approval", allowedActors: MANAGERS },
    // Auto-approval: under the property's cap, or via the VIC urgent-repair
    // bypass. Only the system may fire it — never a client-supplied field.
    auto_approve: { to: "approved", allowedActors: ["system"] },
    cancel: { to: "cancelled", allowedActors: MANAGERS },
  },
  pending_approval: {
    // Approver identity comes from an authenticated session or signed
    // magic-link token — never from the request body (audit finding B2).
    approve: { to: "approved", allowedActors: ["landlord", "agency_user"] },
    decline: { to: "declined", allowedActors: ["landlord", "agency_user"] },
    cancel: { to: "cancelled", allowedActors: MANAGERS },
  },
  approved: {
    request_quotes: { to: "quoting", allowedActors: MANAGERS },
    // Pre-agreed rates or urgent dispatch may skip quoting entirely.
    schedule: { to: "scheduled", allowedActors: ["tradie", ...MANAGERS] },
    cancel: { to: "cancelled", allowedActors: MANAGERS },
  },
  quoting: {
    accept_quote: { to: "scheduled", allowedActors: ["landlord", ...MANAGERS] },
    cancel: { to: "cancelled", allowedActors: MANAGERS },
  },
  scheduled: {
    start_work: { to: "in_progress", allowedActors: ["tradie", ...MANAGERS] },
    cancel: { to: "cancelled", allowedActors: MANAGERS },
  },
  in_progress: {
    submit_evidence: { to: "evidence_pending", allowedActors: ["tradie", ...MANAGERS] },
    cancel: { to: "cancelled", allowedActors: MANAGERS },
  },
  evidence_pending: {
    verify: { to: "verified", allowedActors: ["tenant", ...MANAGERS] },
    reject_evidence: { to: "in_progress", allowedActors: ["tenant", ...MANAGERS] },
  },
  verified: {
    invoice: { to: "invoiced", allowedActors: ["tradie", ...MANAGERS] },
    close: { to: "closed", allowedActors: MANAGERS },
  },
  invoiced: {
    record_payment: { to: "paid", allowedActors: MANAGERS },
  },
  paid: {
    close: { to: "closed", allowedActors: MANAGERS },
  },
  declined: {
    close: { to: "closed", allowedActors: MANAGERS },
  },
};

export const TERMINAL_STATES: readonly RequestState[] = ["closed", "cancelled"];

export function isTerminal(state: RequestState): boolean {
  return TERMINAL_STATES.includes(state);
}

export type TransitionResult =
  | { ok: true; state: RequestState }
  | { ok: false; error: "invalid_transition" | "actor_not_allowed"; message: string };

export function transition(from: RequestState, event: RequestEvent, actor: ActorType): TransitionResult {
  const rule = TRANSITIONS[from]?.[event];
  if (!rule) {
    return {
      ok: false,
      error: "invalid_transition",
      message: `Event "${event}" is not valid in state "${from}"`,
    };
  }
  if (!rule.allowedActors.includes(actor)) {
    return {
      ok: false,
      error: "actor_not_allowed",
      message: `Actor "${actor}" may not perform "${event}" (allowed: ${rule.allowedActors.join(", ")})`,
    };
  }
  return { ok: true, state: rule.to };
}

/** Events that are valid from a given state (for rendering available actions). */
export function availableEvents(from: RequestState, actor?: ActorType): RequestEvent[] {
  const rules = TRANSITIONS[from];
  if (!rules) return [];
  return (Object.entries(rules) as [RequestEvent, TransitionRule][])
    .filter(([, rule]) => (actor ? rule.allowedActors.includes(actor) : true))
    .map(([event]) => event);
}

/**
 * Project current status from an ordered event stream. Unknown or invalid
 * events throw — the log must never contain an illegal transition, because
 * transitions are validated before events are appended.
 */
export function projectState(
  events: ReadonlyArray<{ eventType: RequestEvent; actorType: ActorType }>,
): RequestState {
  let state: RequestState = "reported";
  for (const e of events) {
    const result = transition(state, e.eventType, e.actorType);
    if (!result.ok) {
      throw new Error(`Corrupt event stream: ${result.message} (at state "${state}")`);
    }
    state = result.state;
  }
  return state;
}
