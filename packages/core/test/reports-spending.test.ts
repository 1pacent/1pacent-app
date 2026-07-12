import { describe, expect, it } from "vitest";
import { summariseSpending, type CompletedJobSpend } from "../src/reports/spending.js";

const TODAY = new Date("2026-07-12T00:00:00Z");

function job(
  category: CompletedJobSpend["category"],
  invoiceCents: number,
  invoicedAt: string,
  propertyId = "prop-1",
): CompletedJobSpend {
  return { category, invoiceCents, invoicedAt: new Date(invoicedAt), propertyId };
}

describe("summariseSpending", () => {
  it("totals only jobs inside the period", () => {
    const summary = summariseSpending(
      [
        job("plumbing_general", 30_000, "2026-06-01T00:00:00Z"),
        job("plumbing_general", 20_000, "2026-01-15T00:00:00Z"),
        job("electrical_general", 50_000, "2024-01-01T00:00:00Z"), // out of period
      ],
      { periodMonths: 12, today: TODAY },
    );
    expect(summary.totalCents).toBe(50_000);
    expect(summary.jobCount).toBe(2);
    expect(summary.byCategory).toHaveLength(1);
    expect(summary.byCategory[0]!.category).toBe("plumbing_general");
  });

  it("computes vs-median deltas when the Cost Index median is supplied", () => {
    const summary = summariseSpending(
      [job("plumbing_general", 44_000, "2026-06-01T00:00:00Z")],
      {
        periodMonths: 12,
        today: TODAY,
        networkMediansCents: { plumbing_general: 50_000 },
      },
    );
    // 44k vs 50k median = 12% under.
    expect(summary.byCategory[0]!.vsMedianPct).toBe(-12);
  });

  it("leaves vsMedianPct null without a median", () => {
    const summary = summariseSpending(
      [job("other", 10_000, "2026-06-01T00:00:00Z")],
      { periodMonths: 12, today: TODAY },
    );
    expect(summary.byCategory[0]!.vsMedianPct).toBeNull();
    expect(summary.byCategory[0]!.networkMedianCents).toBeNull();
  });

  it("sorts categories by spend, largest first", () => {
    const summary = summariseSpending(
      [
        job("electrical_general", 10_000, "2026-06-01T00:00:00Z"),
        job("plumbing_general", 90_000, "2026-06-02T00:00:00Z"),
      ],
      { periodMonths: 12, today: TODAY },
    );
    expect(summary.byCategory.map((c) => c.category)).toEqual([
      "plumbing_general",
      "electrical_general",
    ]);
  });

  it("rejects a non-positive period", () => {
    expect(() => summariseSpending([], { periodMonths: 0, today: TODAY })).toThrow(RangeError);
  });
});
