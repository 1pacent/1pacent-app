import { describe, expect, it } from "vitest";
import { estimatePriceBand } from "../src/pricing/estimate.js";

describe("estimatePriceBand", () => {
  it("returns the low-confidence fallback band with zero comparables", () => {
    const result = estimatePriceBand("plumbing_general", []);
    expect(result.confidence).toBe("low");
    expect(result.evidenceCount).toBe(0);
    expect(result.lowCents).toBeLessThan(result.highCents);
  });

  it("uses a tighter electrical fallback band than the general default", () => {
    const electrical = estimatePriceBand("electrical_general", []);
    const general = estimatePriceBand("garden_external", []);
    expect(electrical.highCents).toBeLessThan(general.highCents);
  });

  it("returns a medium-confidence band around the median with 1-2 comparables", () => {
    const result = estimatePriceBand("plumbing_general", [{ finalInvoiceCents: 20_000 }]);
    expect(result.confidence).toBe("medium");
    expect(result.evidenceCount).toBe(1);
    expect(result.lowCents).toBe(18_000); // 20000 * 0.9
    expect(result.highCents).toBe(24_000); // 20000 * 1.2
  });

  it("returns a high-confidence percentile band with 3+ comparables", () => {
    const comparables = [10_000, 15_000, 20_000, 25_000, 30_000].map((finalInvoiceCents) => ({
      finalInvoiceCents,
    }));
    const result = estimatePriceBand("plumbing_general", comparables);
    expect(result.confidence).toBe("high");
    expect(result.evidenceCount).toBe(5);
    // p25=15000, p75=25000, p50=20000
    expect(result.lowCents).toBe(13_500); // 15000 * 0.9
    expect(result.highCents).toBe(28_750); // max(25000*1.15, 20000) = 28750
  });

  it("the band is order-independent (unsorted input works the same)", () => {
    const sorted = [10_000, 15_000, 20_000].map((finalInvoiceCents) => ({ finalInvoiceCents }));
    const shuffled = [20_000, 10_000, 15_000].map((finalInvoiceCents) => ({ finalInvoiceCents }));
    expect(estimatePriceBand("other", sorted)).toEqual(estimatePriceBand("other", shuffled));
  });

  it("rejects invalid comparable amounts", () => {
    expect(() => estimatePriceBand("other", [{ finalInvoiceCents: -100 }])).toThrow(RangeError);
  });
});
