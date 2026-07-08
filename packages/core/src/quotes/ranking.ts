import type { Cents } from "../money";

/**
 * Ranks competing quotes for the landlord's one-tap approval. The weights
 * (40/35/25) are carried forward from the previous build's one genuinely
 * validated formula for this exact decision — see
 * docs/DEVELOPER_BRIEF_v3.md §4.3. Sane defaults, not sacred: revisit once
 * there's real usage data to tune against.
 */

const TRUST_WEIGHT = 0.4;
const COST_WEIGHT = 0.35;
const AVAILABILITY_WEIGHT = 0.25;

function assertScore(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} must be a number between 0 and 100, got ${value}`);
  }
}

export interface RankableQuote {
  quoteId: string;
  totalCents: Cents;
  /** 0-100, e.g. from classifyTrust-derived scoring. */
  trustScore: number;
  /** 0-100, e.g. from scoreAvailability. */
  availabilityScore: number;
}

export interface RankedQuote extends RankableQuote {
  costScore: number;
  compositeScore: number;
  rank: number;
}

export function rankQuotes(quotes: readonly RankableQuote[]): RankedQuote[] {
  if (quotes.length === 0) return [];
  quotes.forEach((q) => {
    assertScore(q.trustScore, "trustScore");
    assertScore(q.availabilityScore, "availabilityScore");
  });

  const minCost = Math.min(...quotes.map((q) => q.totalCents));
  const scored = quotes.map((q) => {
    const costScore = minCost <= 0 || q.totalCents <= 0 ? 100 : Math.min(100, (minCost / q.totalCents) * 100);
    const compositeScore = q.trustScore * TRUST_WEIGHT + costScore * COST_WEIGHT + q.availabilityScore * AVAILABILITY_WEIGHT;
    return { ...q, costScore, compositeScore };
  });

  return scored
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((q, i) => ({ ...q, rank: i + 1 }));
}
