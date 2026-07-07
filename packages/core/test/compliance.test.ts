import { describe, expect, it } from "vitest";
import {
  applicableRequirements,
  VIC_COMPLIANCE_CATALOGUE,
} from "../src/compliance/catalogue.js";
import {
  evaluateProperty,
  evaluateRequirement,
  type EvidenceRecord,
} from "../src/compliance/engine.js";

const TODAY = new Date("2026-07-07T00:00:00Z");

const smokeReq = VIC_COMPLIANCE_CATALOGUE.find((r) => r.key === "vic_smoke_alarm_check")!;
const minStdReq = VIC_COMPLIANCE_CATALOGUE.find((r) => r.key === "vic_minimum_standards")!;

function evidence(key: string, completed: string, expires?: string): EvidenceRecord {
  return {
    requirementKey: key,
    completedAt: new Date(completed),
    ...(expires ? { expiresAt: new Date(expires) } : {}),
  };
}

describe("applicableRequirements", () => {
  it("includes gas check only for gas properties", () => {
    const withGas = applicableRequirements({ jurisdiction: "VIC", hasGas: true, hasPool: false });
    const withoutGas = applicableRequirements({ jurisdiction: "VIC", hasGas: false, hasPool: false });
    expect(withGas.map((r) => r.key)).toContain("vic_gas_safety_check");
    expect(withoutGas.map((r) => r.key)).not.toContain("vic_gas_safety_check");
  });

  it("includes pool barrier only for pool properties", () => {
    const withPool = applicableRequirements({ jurisdiction: "VIC", hasGas: false, hasPool: true });
    expect(withPool.map((r) => r.key)).toContain("vic_pool_barrier");
  });

  it("returns nothing for jurisdictions without a seeded ruleset", () => {
    expect(applicableRequirements({ jurisdiction: "NSW", hasGas: true, hasPool: true })).toEqual([]);
  });
});

describe("evaluateRequirement", () => {
  it("is red with no evidence, due immediately", () => {
    const status = evaluateRequirement(smokeReq, [], TODAY);
    expect(status.status).toBe("red");
    expect(status.daysUntilDue).toBe(0);
    expect(status.lastCompletedAt).toBeNull();
  });

  it("is green when checked recently", () => {
    const status = evaluateRequirement(
      smokeReq,
      [evidence("vic_smoke_alarm_check", "2026-06-01T00:00:00Z")],
      TODAY,
    );
    expect(status.status).toBe("green");
    expect(status.dueAt?.toISOString().slice(0, 10)).toBe("2027-06-01");
  });

  it("is amber inside the 60-day warning window", () => {
    // Checked 2025-08-15 → due 2026-08-15, 39 days from TODAY.
    const status = evaluateRequirement(
      smokeReq,
      [evidence("vic_smoke_alarm_check", "2025-08-15T00:00:00Z")],
      TODAY,
    );
    expect(status.status).toBe("amber");
    expect(status.daysUntilDue).toBe(39);
  });

  it("is red when overdue", () => {
    const status = evaluateRequirement(
      smokeReq,
      [evidence("vic_smoke_alarm_check", "2025-01-01T00:00:00Z")],
      TODAY,
    );
    expect(status.status).toBe("red");
    expect(status.daysUntilDue).toBeLessThan(0);
  });

  it("uses the latest evidence when multiple records exist", () => {
    const status = evaluateRequirement(
      smokeReq,
      [
        evidence("vic_smoke_alarm_check", "2024-01-01T00:00:00Z"),
        evidence("vic_smoke_alarm_check", "2026-06-20T00:00:00Z"),
      ],
      TODAY,
    );
    expect(status.status).toBe("green");
  });

  it("prefers an explicit certificate expiry over the derived frequency", () => {
    const status = evaluateRequirement(
      smokeReq,
      [evidence("vic_smoke_alarm_check", "2026-06-01T00:00:00Z", "2026-07-10T00:00:00Z")],
      TODAY,
    );
    expect(status.status).toBe("amber");
    expect(status.daysUntilDue).toBe(3);
  });

  it("a satisfied one-off requirement stays green with no due date", () => {
    const status = evaluateRequirement(
      minStdReq,
      [evidence("vic_minimum_standards", "2025-01-01T00:00:00Z")],
      TODAY,
    );
    expect(status.status).toBe("green");
    expect(status.dueAt).toBeNull();
    expect(status.daysUntilDue).toBeNull();
  });
});

describe("evaluateProperty", () => {
  it("rolls up: any red makes the property red", () => {
    const result = evaluateProperty(
      { jurisdiction: "VIC", hasGas: true, hasPool: false },
      [evidence("vic_smoke_alarm_check", "2026-06-01T00:00:00Z")],
      TODAY,
    );
    expect(result.overall).toBe("red");
    expect(result.counts.red).toBeGreaterThan(0);
  });

  it("fully evidenced property is green", () => {
    const profile = { jurisdiction: "VIC" as const, hasGas: false, hasPool: false };
    const all = applicableRequirements(profile).map((r) =>
      evidence(r.key, "2026-06-15T00:00:00Z"),
    );
    const result = evaluateProperty(profile, all, TODAY);
    expect(result.overall).toBe("green");
    expect(result.counts.red).toBe(0);
    expect(result.counts.amber).toBe(0);
  });

  it("amber (no red) rolls up to amber", () => {
    const profile = { jurisdiction: "VIC" as const, hasGas: false, hasPool: false };
    const records = applicableRequirements(profile).map((r) =>
      r.key === "vic_smoke_alarm_check"
        ? evidence(r.key, "2025-08-15T00:00:00Z") // amber
        : evidence(r.key, "2026-06-15T00:00:00Z"),
    );
    const result = evaluateProperty(profile, records, TODAY);
    expect(result.overall).toBe("amber");
  });
});
