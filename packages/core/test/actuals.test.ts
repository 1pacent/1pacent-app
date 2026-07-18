import { describe, expect, it } from "vitest";
import { blendedAccuracyPct, computeTimeAccuracy } from "../src/trust/actuals";
import { scoreTrust } from "../src/trust/scoring";

describe("computeTimeAccuracy (the learning loop)", () => {
  it("rates an on-estimate job sharp", () => {
    const a = computeTimeAccuracy(60, 65);
    expect(Math.round(a.signedVariancePct)).toBe(8);
    expect(a.rating).toBe("sharp");
  });

  it("rates a modest overrun fair and a blowout loose", () => {
    expect(computeTimeAccuracy(60, 80).rating).toBe("fair");
    expect(computeTimeAccuracy(60, 130).rating).toBe("loose");
  });

  it("beating the estimate is negative signed variance", () => {
    expect(computeTimeAccuracy(120, 90).signedVariancePct).toBeLessThan(0);
  });

  it("refuses a zero estimate", () => {
    expect(() => computeTimeAccuracy(0, 30)).toThrow();
  });
});

describe("blendedAccuracyPct", () => {
  it("weights money 70 / time 30", () => {
    expect(blendedAccuracyPct(10, 30)).toBeCloseTo(16);
  });

  it("stands on one signal when the other has no history", () => {
    expect(blendedAccuracyPct(12, null)).toBe(12);
    expect(blendedAccuracyPct(null, 22)).toBe(22);
    expect(blendedAccuracyPct(null, null)).toBeNull();
  });

  it("a chronically-late tradie's trust score now drops even with tight quotes", () => {
    const tightQuotesOnly = scoreTrust({ completedJobs: 10, avgAbsVariancePct: blendedAccuracyPct(2, null)! });
    const tightQuotesAlwaysLate = scoreTrust({ completedJobs: 10, avgAbsVariancePct: blendedAccuracyPct(2, 60)! });
    expect(tightQuotesAlwaysLate).toBeLessThan(tightQuotesOnly);
  });
});

// ——— v8 R4b: fairness rules ———

import { countsTowardQuoteAccuracy, countsTowardTimeAccuracy } from "../src/trust/actuals";

describe("fairness: whose accuracy is it?", () => {
  it("network-priced (fixed band) jobs never count against the tradie's quote accuracy", () => {
    expect(countsTowardQuoteAccuracy("fixed_band")).toBe(false);
    expect(countsTowardQuoteAccuracy("rate_card")).toBe(true);
    expect(countsTowardQuoteAccuracy("quote_race")).toBe(true);
  });

  it("an approved scope change voids the time estimate; a declined one keeps it", () => {
    expect(countsTowardTimeAccuracy("approved")).toBe(false);
    expect(countsTowardTimeAccuracy("auto_applied")).toBe(false);
    expect(countsTowardTimeAccuracy("declined")).toBe(true);
    expect(countsTowardTimeAccuracy("none")).toBe(true);
  });
});
