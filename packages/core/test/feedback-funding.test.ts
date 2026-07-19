import { describe, expect, it } from "vitest";
import { decideFunding } from "../src/money/funding";
import { ratingToScore, scoreTips, scoreTrustWithFeedback } from "../src/trust/feedback";

describe("scoreTrustWithFeedback", () => {
  const solid = { completedJobs: 10, avgAbsVariancePct: 5 };
  it("feedback lifts and drags around the accuracy base", () => {
    const base = scoreTrustWithFeedback(solid, { avgRating: null, reviewCount: 0 });
    const loved = scoreTrustWithFeedback(solid, { avgRating: 5, reviewCount: 5 });
    const hated = scoreTrustWithFeedback(solid, { avgRating: 1.5, reviewCount: 5 });
    expect(loved).toBeGreaterThan(base);
    expect(hated).toBeLessThan(base);
  });
  it("one grudge review cannot sink a sharp tradie (weight ramps with volume)", () => {
    const oneBad = scoreTrustWithFeedback(solid, { avgRating: 1, reviewCount: 1 });
    const manyBad = scoreTrustWithFeedback(solid, { avgRating: 1, reviewCount: 6 });
    expect(oneBad).toBeGreaterThan(manyBad);
    expect(oneBad).toBeGreaterThanOrEqual(85 - 10); // nudge, not a cliff
  });
  it("charm cannot bury chronic over-quoting (70/30 cap)", () => {
    const charming = scoreTrustWithFeedback({ completedJobs: 10, avgAbsVariancePct: 40 }, { avgRating: 5, reviewCount: 10 });
    expect(charming).toBeLessThan(80);
  });
  it("rating mapping is linear 1→0, 5→100", () => {
    expect(ratingToScore(1)).toBe(0);
    expect(ratingToScore(3)).toBe(50);
    expect(ratingToScore(5)).toBe(100);
  });
  it("tips are computed, not platitudes", () => {
    const tips = scoreTips({ avgAbsMoneyVariancePct: 22, avgAbsTimeVariancePct: 50, avgRating: 3.5, completedJobs: 8 });
    expect(tips.join(" ")).toMatch(/±22%/);
    expect(tips.join(" ")).toMatch(/±50%/);
  });
});

describe("decideFunding — the same-day ladder", () => {
  it("owner-occupier: card, same-day, always", () => {
    expect(decideFunding({ pmManaged: false, trustBalanceCents: null, amountCents: 30_000 }).source).toBe("payer_card");
  });
  it("PM with sufficient trust: fund now, balance decremented", () => {
    const d = decideFunding({ pmManaged: true, trustBalanceCents: 100_000, amountCents: 30_000 });
    expect(d.source).toBe("pm_trust");
    expect(d.trustBalanceAfterCents).toBe(70_000);
  });
  it("PM with rent not landed: the obligation hands to the owner", () => {
    const d = decideFunding({ pmManaged: true, trustBalanceCents: 10_000, amountCents: 30_000 });
    expect(d.source).toBe("owner_handoff");
    expect(d.note).toMatch(/handed to the owner/);
  });
});
