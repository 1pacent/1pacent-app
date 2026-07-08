import { assertCents, type Cents } from "../money";
import type { RequestCategory } from "../requests/urgency";

/**
 * Deterministic, evidence-tiered price estimation — the number Sally is
 * allowed to say out loud during a live conversation. Never an LLM guess:
 * a percentile-over-comparables query when there's history, a documented
 * fallback band when there isn't. Mirrors the shape of the previous
 * build's one genuinely well-designed pricing tool (see
 * docs/DEVELOPER_BRIEF_v3.md §4.1) — ported as tested pure logic rather
 * than untested raw SQL.
 */

export interface ComparableJob {
  finalInvoiceCents: Cents;
}

export type PriceConfidence = "low" | "medium" | "high";

export interface PriceBand {
  lowCents: Cents;
  highCents: Cents;
  confidence: PriceConfidence;
  evidenceCount: number;
}

/** Starting band when there's no job history at all for a category yet. */
const DEFAULT_FALLBACK_BAND: { lowCents: Cents; highCents: Cents } = {
  lowCents: 15_000,
  highCents: 45_000,
};

const ELECTRICAL_FALLBACK_BAND: { lowCents: Cents; highCents: Cents } = {
  lowCents: 15_000,
  highCents: 35_000,
};

function fallbackBandFor(category: RequestCategory): { lowCents: Cents; highCents: Cents } {
  return category.includes("electrical") ? ELECTRICAL_FALLBACK_BAND : DEFAULT_FALLBACK_BAND;
}

/** Linear-interpolation percentile (matches Postgres's percentile_cont, which
 * the comparable logic in the previous build used). `sorted` must be sorted ascending. */
function percentileCont(sorted: readonly Cents[], p: number): number {
  if (sorted.length === 0) throw new RangeError("percentileCont of an empty array");
  if (sorted.length === 1) return sorted[0]!;
  const idx = p * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower]!;
  const weight = idx - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function round(cents: number): Cents {
  return Math.round(cents);
}

export function estimatePriceBand(category: RequestCategory, comparables: readonly ComparableJob[]): PriceBand {
  const amounts = comparables.map((c) => c.finalInvoiceCents);
  amounts.forEach(assertCents);
  const sorted = [...amounts].sort((a, b) => a - b);
  const evidenceCount = sorted.length;

  if (evidenceCount >= 3) {
    const p25 = percentileCont(sorted, 0.25);
    const p50 = percentileCont(sorted, 0.5);
    const p75 = percentileCont(sorted, 0.75);
    return {
      lowCents: round(p25 * 0.9),
      highCents: round(Math.max(p75 * 1.15, p50)),
      confidence: "high",
      evidenceCount,
    };
  }

  if (evidenceCount >= 1) {
    const median = percentileCont(sorted, 0.5);
    return {
      lowCents: round(median * 0.9),
      highCents: round(median * 1.2),
      confidence: "medium",
      evidenceCount,
    };
  }

  const fallback = fallbackBandFor(category);
  return { ...fallback, confidence: "low", evidenceCount: 0 };
}
