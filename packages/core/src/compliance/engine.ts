import {
  applicableRequirements,
  type ComplianceRequirement,
  type PropertyComplianceProfile,
} from "./catalogue";

/**
 * Traffic-light compliance engine (Epic 1). Deterministic and pure:
 * (catalogue, evidence dates, today) -> status. No I/O.
 */

export type TrafficLight = "green" | "amber" | "red";

/** Days before the due date at which green turns amber. */
export const DEFAULT_WARNING_WINDOW_DAYS = 60;

export interface EvidenceRecord {
  requirementKey: string;
  /** Date the check/certificate was completed. */
  completedAt: Date;
  /** Explicit expiry if the certificate carries one; otherwise derived from frequency. */
  expiresAt?: Date;
}

export interface RequirementStatus {
  requirement: ComplianceRequirement;
  status: TrafficLight;
  /** When the requirement next falls due; null for satisfied one-offs. */
  dueAt: Date | null;
  daysUntilDue: number | null;
  lastCompletedAt: Date | null;
}

export interface PropertyComplianceStatus {
  overall: TrafficLight;
  requirements: RequirementStatus[];
  counts: Record<TrafficLight, number>;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

const MS_PER_DAY = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function evaluateRequirement(
  requirement: ComplianceRequirement,
  evidence: readonly EvidenceRecord[],
  today: Date,
  warningWindowDays: number = DEFAULT_WARNING_WINDOW_DAYS,
): RequirementStatus {
  const relevant = evidence
    .filter((e) => e.requirementKey === requirement.key)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  const latest = relevant[0] ?? null;

  if (!latest) {
    // Never evidenced: red, due immediately.
    return {
      requirement,
      status: "red",
      dueAt: today,
      daysUntilDue: 0,
      lastCompletedAt: null,
    };
  }

  if (requirement.frequencyMonths === null && !latest.expiresAt) {
    // Satisfied one-off requirement.
    return {
      requirement,
      status: "green",
      dueAt: null,
      daysUntilDue: null,
      lastCompletedAt: latest.completedAt,
    };
  }

  const dueAt =
    latest.expiresAt ?? addMonths(latest.completedAt, requirement.frequencyMonths ?? 0);
  const daysUntilDue = daysBetween(today, dueAt);

  let status: TrafficLight;
  if (daysUntilDue < 0) status = "red";
  else if (daysUntilDue <= warningWindowDays) status = "amber";
  else status = "green";

  return { requirement, status, dueAt, daysUntilDue, lastCompletedAt: latest.completedAt };
}

export function evaluateProperty(
  profile: PropertyComplianceProfile,
  evidence: readonly EvidenceRecord[],
  today: Date,
  warningWindowDays: number = DEFAULT_WARNING_WINDOW_DAYS,
): PropertyComplianceStatus {
  const requirements = applicableRequirements(profile).map((req) =>
    evaluateRequirement(req, evidence, today, warningWindowDays),
  );
  const counts: Record<TrafficLight, number> = { green: 0, amber: 0, red: 0 };
  for (const r of requirements) counts[r.status] += 1;
  const overall: TrafficLight = counts.red > 0 ? "red" : counts.amber > 0 ? "amber" : "green";
  return { overall, requirements, counts };
}
