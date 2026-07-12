import { describe, expect, it } from "vitest";
import { buildObligationsCalendar, type ObligationsPropertyInput } from "../src/reports/obligations.js";
import type { RequirementStatus } from "../src/compliance/engine.js";
import type { ComplianceRequirement } from "../src/compliance/catalogue.js";

const TODAY = new Date("2026-07-12T00:00:00Z");

const gasCheck: ComplianceRequirement = {
  key: "vic_gas_safety_check",
  jurisdiction: "VIC",
  name: "Gas safety check",
  description: "",
  frequencyMonths: 24,
  evidenceRequired: [],
  legislationRef: "",
};

function req(
  status: "green" | "amber" | "red",
  dueAt: Date | null,
  daysUntilDue: number | null = null,
): RequirementStatus {
  return { requirement: gasCheck, status, dueAt, daysUntilDue, lastCompletedAt: null };
}

function property(
  propertyId: string,
  address: string,
  suburb: string,
  requirements: RequirementStatus[],
): ObligationsPropertyInput {
  return {
    propertyId,
    address,
    suburb,
    compliance: {
      overall: "amber",
      requirements,
      counts: { green: 0, amber: requirements.length, red: 0 },
    },
  };
}

describe("buildObligationsCalendar", () => {
  it("rolls non-green obligations up per month within the horizon", () => {
    const cal = buildObligationsCalendar(
      [
        property("p1", "1 Rose St", "Fitzroy", [req("amber", new Date("2026-08-10T00:00:00Z"), 29)]),
        property("p2", "2 Rose St", "Fitzroy", [req("amber", new Date("2026-09-05T00:00:00Z"), 55)]),
      ],
      { horizonDays: 90, today: TODAY },
    );
    expect(cal.totalObligations).toBe(2);
    expect(cal.months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
  });

  it("excludes green requirements and items beyond the horizon", () => {
    const cal = buildObligationsCalendar(
      [
        property("p1", "1 Rose St", "Fitzroy", [
          req("green", new Date("2026-08-01T00:00:00Z")),
          req("amber", new Date("2027-06-01T00:00:00Z"), 320), // beyond 90 days
        ]),
      ],
      { horizonDays: 90, today: TODAY },
    );
    expect(cal.totalObligations).toBe(0);
    expect(cal.months).toHaveLength(0);
  });

  it("flags batchable groups (2+ same requirement, same suburb, shared window)", () => {
    const cal = buildObligationsCalendar(
      [
        property("p1", "1 Rose St", "Fitzroy", [req("amber", new Date("2026-08-10T00:00:00Z"), 29)]),
        property("p2", "2 Rose St", "Fitzroy", [req("amber", new Date("2026-08-20T00:00:00Z"), 39)]),
        property("p3", "9 Beach Rd", "St Kilda", [req("amber", new Date("2026-08-15T00:00:00Z"), 34)]),
      ],
      { horizonDays: 90, today: TODAY },
    );
    expect(cal.batchable).toHaveLength(1);
    expect(cal.batchable[0]!.suburb).toBe("Fitzroy");
    expect(cal.batchable[0]!.propertyAddresses).toEqual(["1 Rose St", "2 Rose St"]);
  });

  it("orders items chronologically inside a month", () => {
    const cal = buildObligationsCalendar(
      [
        property("p1", "1 Rose St", "Fitzroy", [req("red", new Date("2026-08-20T00:00:00Z"), 39)]),
        property("p2", "2 Rose St", "Fitzroy", [req("amber", new Date("2026-08-10T00:00:00Z"), 29)]),
      ],
      { horizonDays: 90, today: TODAY },
    );
    expect(cal.months[0]!.items.map((i) => i.address)).toEqual(["2 Rose St", "1 Rose St"]);
  });

  it("rejects a non-positive horizon", () => {
    expect(() => buildObligationsCalendar([], { horizonDays: 0, today: TODAY })).toThrow(RangeError);
  });
});
