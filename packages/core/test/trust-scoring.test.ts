import { describe, expect, it } from "vitest";
import { classifyTrust, computeQuoteAccuracy } from "../src/trust/scoring.js";

describe("computeQuoteAccuracy", () => {
  it("computes zero variance when the quote matched the invoice exactly", () => {
    expect(computeQuoteAccuracy(15_000, 15_000)).toEqual({ signedVariancePct: 0, absVariancePct: 0 });
  });

  it("computes positive signed variance when the job cost more than quoted", () => {
    const result = computeQuoteAccuracy(10_000, 12_000);
    expect(result.signedVariancePct).toBeCloseTo(20);
    expect(result.absVariancePct).toBeCloseTo(20);
  });

  it("computes negative signed variance when the job came in under quote", () => {
    const result = computeQuoteAccuracy(10_000, 8_000);
    expect(result.signedVariancePct).toBeCloseTo(-20);
    expect(result.absVariancePct).toBeCloseTo(20);
  });

  it("rejects a zero-cent quote", () => {
    expect(() => computeQuoteAccuracy(0, 5_000)).toThrow(RangeError);
  });

  it("rejects invalid money", () => {
    expect(() => computeQuoteAccuracy(-1, 5_000)).toThrow(RangeError);
  });
});

describe("classifyTrust", () => {
  it("is unproven below the minimum job count", () => {
    expect(classifyTrust({ completedJobs: 2, avgAbsVariancePct: 5 })).toBe("unproven");
  });

  it("is unproven with no variance history", () => {
    expect(classifyTrust({ completedJobs: 10, avgAbsVariancePct: null })).toBe("unproven");
  });

  it("is reliable with enough jobs and low variance", () => {
    expect(classifyTrust({ completedJobs: 5, avgAbsVariancePct: 10 })).toBe("reliable");
  });

  it("needs review with enough jobs but high variance", () => {
    expect(classifyTrust({ completedJobs: 5, avgAbsVariancePct: 40 })).toBe("needs_review");
  });

  it("boundary: exactly at the review threshold is still reliable", () => {
    expect(classifyTrust({ completedJobs: 5, avgAbsVariancePct: 25 })).toBe("reliable");
  });
});
