import type { PropertyComplianceStatus } from "../compliance/engine";

/**
 * PM portfolio compliance batching (Developer Brief v4 §6). Groups upcoming
 * (non-green) compliance requirements across a portfolio by requirement +
 * suburb, and surfaces groups of 2+ properties whose due dates fall within a
 * shared window — the visible seed of the negotiated-rate mechanic, without
 * needing real route optimization yet.
 */

export interface BatchablePropertyInput {
  address: string;
  suburb: string;
  compliance: PropertyComplianceStatus;
}

export interface BatchableGroup {
  requirementKey: string;
  requirementName: string;
  suburb: string;
  propertyAddresses: string[];
  windowStart: Date;
  windowEnd: Date;
}

const BATCH_WINDOW_DAYS = 30;

export function computeBatchableCompliance(properties: readonly BatchablePropertyInput[]): BatchableGroup[] {
  const groups = new Map<
    string,
    { requirementKey: string; requirementName: string; suburb: string; entries: Array<{ address: string; dueAt: Date }> }
  >();

  for (const p of properties) {
    for (const r of p.compliance.requirements) {
      if (!r.dueAt || r.status === "green") continue;
      const key = `${r.requirement.key}::${p.suburb}`;
      if (!groups.has(key)) {
        groups.set(key, { requirementKey: r.requirement.key, requirementName: r.requirement.name, suburb: p.suburb, entries: [] });
      }
      groups.get(key)!.entries.push({ address: p.address, dueAt: r.dueAt });
    }
  }

  const result: BatchableGroup[] = [];
  for (const g of groups.values()) {
    const sorted = [...g.entries].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    const earliest = sorted[0]!.dueAt;
    const windowEndCutoff = new Date(earliest.getTime() + BATCH_WINDOW_DAYS * 86_400_000);
    const inWindow = sorted.filter((e) => e.dueAt.getTime() <= windowEndCutoff.getTime());
    if (inWindow.length < 2) continue;
    result.push({
      requirementKey: g.requirementKey,
      requirementName: g.requirementName,
      suburb: g.suburb,
      propertyAddresses: inWindow.map((e) => e.address),
      windowStart: earliest,
      windowEnd: inWindow[inWindow.length - 1]!.dueAt,
    });
  }
  return result;
}
