import { describe, expect, it } from "vitest";
import { computeBatchableCompliance, type BatchablePropertyInput } from "../src/pm/batching.js";
import type { RequirementStatus } from "../src/compliance/engine.js";
import type { ComplianceRequirement } from "../src/compliance/catalogue.js";

const gasCheck: ComplianceRequirement = {
  key: "vic_gas_safety_check",
  jurisdiction: "VIC",
  name: "Gas safety check",
  description: "",
  frequencyMonths: 24,
  evidenceRequired: [],
  legislationRef: "",
};

function req(status: RequirementStatus["status"], dueAt: Date | null): RequirementStatus {
  return { requirement: gasCheck, status, dueAt, daysUntilDue: null, lastCompletedAt: null };
}

function property(address: string, suburb: string, requirements: RequirementStatus[]): BatchablePropertyInput {
  return {
    address,
    suburb,
    compliance: {
      overall: "amber",
      requirements,
      counts: { green: 0, amber: requirements.length, red: 0 },
    },
  };
}

describe("computeBatchableCompliance", () => {
  it("returns nothing when fewer than 2 properties share a requirement + suburb", () => {
    const properties = [property("1 A St", "Fitzroy", [req("amber", new Date("2026-08-01"))])];
    expect(computeBatchableCompliance(properties)).toEqual([]);
  });

  it("ignores requirements that are already green", () => {
    const properties = [
      property("1 A St", "Fitzroy", [req("green", new Date("2026-08-01"))]),
      property("2 B St", "Fitzroy", [req("green", new Date("2026-08-05"))]),
    ];
    expect(computeBatchableCompliance(properties)).toEqual([]);
  });

  it("groups 2+ properties in the same suburb whose due dates fall within 30 days", () => {
    const properties = [
      property("1 A St", "Fitzroy", [req("amber", new Date("2026-08-01"))]),
      property("2 B St", "Fitzroy", [req("amber", new Date("2026-08-20"))]),
    ];
    const groups = computeBatchableCompliance(properties);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.propertyAddresses.sort()).toEqual(["1 A St", "2 B St"]);
    expect(groups[0]!.suburb).toBe("Fitzroy");
  });

  it("does not group properties in different suburbs", () => {
    const properties = [
      property("1 A St", "Fitzroy", [req("amber", new Date("2026-08-01"))]),
      property("2 B St", "Richmond", [req("amber", new Date("2026-08-05"))]),
    ];
    expect(computeBatchableCompliance(properties)).toEqual([]);
  });

  it("excludes a property whose due date falls outside the 30-day window from the earliest", () => {
    const properties = [
      property("1 A St", "Fitzroy", [req("amber", new Date("2026-08-01"))]),
      property("2 B St", "Fitzroy", [req("amber", new Date("2026-08-20"))]),
      property("3 C St", "Fitzroy", [req("red", new Date("2026-10-15"))]),
    ];
    const groups = computeBatchableCompliance(properties);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.propertyAddresses.sort()).toEqual(["1 A St", "2 B St"]);
  });
});
