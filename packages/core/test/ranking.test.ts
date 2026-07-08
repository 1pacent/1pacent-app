import { describe, expect, it } from "vitest";
import { rankQuotes } from "../src/quotes/ranking.js";

describe("rankQuotes", () => {
  it("returns an empty array for no quotes", () => {
    expect(rankQuotes([])).toEqual([]);
  });

  it("ranks the cheapest, most trusted, most available quote first", () => {
    const ranked = rankQuotes([
      { quoteId: "a", totalCents: 30_000, trustScore: 50, availabilityScore: 50 },
      { quoteId: "b", totalCents: 20_000, trustScore: 90, availabilityScore: 90 },
      { quoteId: "c", totalCents: 25_000, trustScore: 70, availabilityScore: 70 },
    ]);
    expect(ranked.map((q) => q.quoteId)).toEqual(["b", "c", "a"]);
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[2]!.rank).toBe(3);
  });

  it("gives the cheapest quote a cost score of 100", () => {
    const ranked = rankQuotes([
      { quoteId: "a", totalCents: 10_000, trustScore: 0, availabilityScore: 0 },
      { quoteId: "b", totalCents: 20_000, trustScore: 0, availabilityScore: 0 },
    ]);
    const cheapest = ranked.find((q) => q.quoteId === "a")!;
    expect(cheapest.costScore).toBe(100);
  });

  it("a high trust score can outrank a cheaper but untrustworthy quote", () => {
    const ranked = rankQuotes([
      { quoteId: "cheap-untrusted", totalCents: 10_000, trustScore: 0, availabilityScore: 50 },
      { quoteId: "pricier-trusted", totalCents: 15_000, trustScore: 100, availabilityScore: 50 },
    ]);
    expect(ranked[0]!.quoteId).toBe("pricier-trusted");
  });

  it("rejects out-of-range scores", () => {
    expect(() =>
      rankQuotes([{ quoteId: "a", totalCents: 10_000, trustScore: 150, availabilityScore: 50 }]),
    ).toThrow(RangeError);
  });
});
