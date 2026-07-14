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
