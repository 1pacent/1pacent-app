import type { PropertyComplianceStatus } from "../compliance/engine";
import { computeBatchableCompliance, type BatchableGroup } from "../pm/batching";

/**
 * The obligations calendar — the PM/owner "what's due across the portfolio
 * next quarter?" answer (Product Design v6 §4.3). Wraps the existing
 * compliance engine over a portfolio and rolls obligations up per month,
 * with batchable groups flagged (reuses computeBatchableCompliance). Pure.
 */

export interface ObligationsPropertyInput {
  propertyId: string;
  address: string;
  suburb: string;
  compliance: PropertyComplianceStatus;
}

export interface ObligationItem {
  propertyId: string;
  address: string;
  suburb: string;
  requirementKey: string;
  requirementName: string;
  dueAt: Date;
  daysUntilDue: number;
  status: "amber" | "red";
}

export interface ObligationsMonth {
  /** "2026-09" */
  month: string;
  items: ObligationItem[];
}

export interface ObligationsCalendar {
  horizonDays: number;
  months: ObligationsMonth[];
  /** Groups of 2+ same-requirement, same-suburb obligations in a shared window. */
  batchable: BatchableGroup[];
  totalObligations: number;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildObligationsCalendar(
  properties: readonly ObligationsPropertyInput[],
  options: { horizonDays: number; today: Date },
): ObligationsCalendar {
  if (!Number.isInteger(options.horizonDays) || options.horizonDays <= 0) {
    throw new RangeError(`horizonDays must be a positive integer, got ${options.horizonDays}`);
  }
  const horizonEnd = new Date(options.today.getTime() + options.horizonDays * 86_400_000);

  const items: ObligationItem[] = [];
  for (const p of properties) {
    for (const r of p.compliance.requirements) {
      if (!r.dueAt || r.status === "green") continue;
      if (r.dueAt.getTime() > horizonEnd.getTime()) continue;
      items.push({
        propertyId: p.propertyId,
        address: p.address,
        suburb: p.suburb,
        requirementKey: r.requirement.key,
        requirementName: r.requirement.name,
        dueAt: r.dueAt,
        daysUntilDue: r.daysUntilDue ?? 0,
        status: r.status,
      });
    }
  }
  items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  const monthsMap = new Map<string, ObligationItem[]>();
  for (const item of items) {
    const key = monthKey(item.dueAt);
    if (!monthsMap.has(key)) monthsMap.set(key, []);
    monthsMap.get(key)!.push(item);
  }
  const months: ObligationsMonth[] = [...monthsMap.entries()].map(([month, monthItems]) => ({
    month,
    items: monthItems,
  }));

  const batchable = computeBatchableCompliance(
    properties.map((p) => ({ address: p.address, suburb: p.suburb, compliance: p.compliance })),
  );

  return { horizonDays: options.horizonDays, months, batchable, totalObligations: items.length };
}
