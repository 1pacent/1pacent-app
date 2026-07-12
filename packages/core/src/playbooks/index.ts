import type { RequestCategory } from "../requests/urgency";
import type { RequestState } from "../requests/state-machine";

/**
 * Playbooks (Developer Brief v8 §2): the standard-process layer. Every job
 * runs a codified, versioned run-sheet — what Sally must resolve at intake,
 * how the job is priced, which evidence gates must pass before the state
 * machine will accept completion, which compliance certificate it files,
 * and how money moves. Consistency of execution comes from here; the crew
 * executes inside a playbook, never outside one. Pure data + pure functions.
 */

export const PLAYBOOK_KEYS = [
  "tap_leak",
  "hws_replace",
  "gas_check",
  "smoke_alarm_check",
  "electrical_fault",
  "general_quote_race",
] as const;

export type PlaybookKey = (typeof PLAYBOOK_KEYS)[number];

export type EvidenceGate = "arrival_photo" | "before" | "after" | "certificate";

export type PricingModel =
  | { model: "fixed_band"; source: "cost_index" }
  | { model: "rate_card" }
  | { model: "quote_race"; invitees: 3; countdownMinutes: number };

export interface Playbook {
  key: PlaybookKey;
  version: number;
  title: string;
  category: RequestCategory;
  urgencyClass: "statutory_urgent" | "priority" | "routine";
  /** What the intake must resolve before booking. */
  intake: { requiredSlots: readonly string[]; photoPrompt: string };
  pricing: PricingModel;
  /** Gates that must ALL be satisfied before `submit_evidence` is accepted. */
  evidenceGates: readonly EvidenceGate[];
  compliance?: { filesCertificate: string };
  warrantyDefaultMonths: number;
  /** Asset label written to the Address Record on completion. */
  assetLabel: string;
  /** On-site scope increase above this % of the booked price needs a payer Moment. */
  varianceThresholdPct: number;
  /** Typical on-site duration, drives slot length. */
  typicalMinutes: number;
}

export const PLAYBOOKS: Record<PlaybookKey, Playbook> = {
  tap_leak: {
    key: "tap_leak",
    version: 1,
    title: "Leaking tap / minor plumbing",
    category: "plumbing_general",
    urgencyClass: "routine",
    intake: { requiredSlots: ["location_in_home", "leak_rate"], photoPrompt: "Show the tap and any water damage" },
    pricing: { model: "fixed_band", source: "cost_index" },
    evidenceGates: ["before", "after"],
    warrantyDefaultMonths: 3,
    assetLabel: "Tap / fixture",
    varianceThresholdPct: 25,
    typicalMinutes: 60,
  },
  hws_replace: {
    key: "hws_replace",
    version: 1,
    title: "Hot water system failure",
    category: "failure_of_essential_service_hot_water",
    urgencyClass: "statutory_urgent",
    intake: { requiredSlots: ["system_type", "any_hot_water_at_all"], photoPrompt: "Show the unit's label plate" },
    pricing: { model: "quote_race", invitees: 3, countdownMinutes: 120 },
    evidenceGates: ["before", "after", "certificate"],
    compliance: { filesCertificate: "vic_gas_safety_check" },
    warrantyDefaultMonths: 12,
    assetLabel: "Hot water system",
    varianceThresholdPct: 15,
    typicalMinutes: 240,
  },
  gas_check: {
    key: "gas_check",
    version: 1,
    title: "Gas safety check",
    category: "plumbing_general",
    urgencyClass: "routine",
    intake: { requiredSlots: ["access_window"], photoPrompt: "" },
    pricing: { model: "fixed_band", source: "cost_index" },
    evidenceGates: ["arrival_photo", "certificate"],
    compliance: { filesCertificate: "vic_gas_safety_check" },
    warrantyDefaultMonths: 0,
    assetLabel: "Gas appliance service",
    varianceThresholdPct: 20,
    typicalMinutes: 90,
  },
  smoke_alarm_check: {
    key: "smoke_alarm_check",
    version: 1,
    title: "Smoke alarm safety check",
    category: "electrical_general",
    urgencyClass: "routine",
    intake: { requiredSlots: ["access_window"], photoPrompt: "" },
    pricing: { model: "fixed_band", source: "cost_index" },
    evidenceGates: ["arrival_photo", "certificate"],
    compliance: { filesCertificate: "vic_smoke_alarm_check" },
    warrantyDefaultMonths: 0,
    assetLabel: "Smoke alarms",
    varianceThresholdPct: 20,
    typicalMinutes: 45,
  },
  electrical_fault: {
    key: "electrical_fault",
    version: 1,
    title: "Electrical fault",
    category: "dangerous_electrical_fault",
    urgencyClass: "statutory_urgent",
    intake: { requiredSlots: ["what_stopped_working", "burning_smell_or_sparks"], photoPrompt: "Show the switchboard" },
    pricing: { model: "rate_card" },
    evidenceGates: ["before", "after"],
    warrantyDefaultMonths: 6,
    assetLabel: "Electrical fixture",
    varianceThresholdPct: 20,
    typicalMinutes: 90,
  },
  general_quote_race: {
    key: "general_quote_race",
    version: 1,
    title: "General repair (quoted)",
    category: "other",
    urgencyClass: "routine",
    intake: { requiredSlots: ["description"], photoPrompt: "Show the problem" },
    pricing: { model: "quote_race", invitees: 3, countdownMinutes: 240 },
    evidenceGates: ["before", "after"],
    warrantyDefaultMonths: 3,
    assetLabel: "General repair",
    varianceThresholdPct: 25,
    typicalMinutes: 120,
  },
};

/** Category → default playbook. The triage proposes; this table decides. */
export function playbookForCategory(category: RequestCategory): Playbook {
  for (const pb of Object.values(PLAYBOOKS)) {
    if (pb.key !== "general_quote_race" && pb.category === category) return pb;
  }
  if (category.includes("electrical")) return PLAYBOOKS.electrical_fault;
  if (category.includes("plumbing") || category === "burst_water_service") return PLAYBOOKS.tap_leak;
  return PLAYBOOKS.general_quote_race;
}

export function getPlaybook(key: string): Playbook | null {
  return (PLAYBOOKS as Record<string, Playbook>)[key] ?? null;
}

export interface EvidenceItem {
  gate: EvidenceGate | "extra";
  at: Date;
}

/** Which gates are still unsatisfied. Empty array = the job may complete. */
export function unsatisfiedGates(playbook: Playbook, evidence: readonly EvidenceItem[]): EvidenceGate[] {
  return playbook.evidenceGates.filter((gate) => !evidence.some((e) => e.gate === gate));
}

export type PlaybookGateCheck = { ok: true } | { ok: false; missing: EvidenceGate[]; message: string };

/**
 * Core rule, not UI hope (v8 §2): the state machine will not accept
 * completion events while gates are unsatisfied.
 */
export function checkPlaybookGate(
  playbook: Playbook,
  targetEvent: "submit_evidence" | "invoice",
  evidence: readonly EvidenceItem[],
): PlaybookGateCheck {
  void targetEvent; // both completion events share the gate set in v1
  const missing = unsatisfiedGates(playbook, evidence);
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    missing,
    message: `Evidence required before completion: ${missing.map((m) => m.replace(/_/g, " ")).join(", ")}.`,
  };
}

/** Does an on-site price change need a payer decision? */
export function varianceNeedsApproval(playbook: Playbook, bookedCents: number, newTotalCents: number): boolean {
  if (bookedCents <= 0) return newTotalCents > 0;
  const pct = ((newTotalCents - bookedCents) / bookedCents) * 100;
  return pct > playbook.varianceThresholdPct;
}

/** The states of the shared Job Screen arc, in order. */
export const JOB_ARC = [
  "booked",
  "confirmed",
  "on_the_way",
  "on_site",
  "done",
  "verified",
  "paid",
] as const;
export type JobArcStep = (typeof JOB_ARC)[number];

/** Project the arc step from ledger state + realtime flags. */
export function arcStepFor(state: RequestState, flags: { onTheWay: boolean; captured: boolean }): JobArcStep {
  if (flags.captured) return "paid";
  switch (state) {
    case "verified":
    case "invoiced":
    case "paid":
    case "closed":
      return flags.captured ? "paid" : "verified";
    case "evidence_pending":
      return "done";
    case "in_progress":
      return "on_site";
    case "scheduled":
      return flags.onTheWay ? "on_the_way" : "confirmed";
    default:
      return "booked";
  }
}
