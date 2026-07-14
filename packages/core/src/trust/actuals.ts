/**
 * Job actuals — the learning loop (archive: TRADIE-JOBS-046 /
 * TRADIE-TOOL-Job-Actuals-Capture, resurrected for v8). Every completed job
 * records estimated vs actual on-site minutes; the deltas feed the tradie's
 * trust standing and the network's Cost/Time Index. This is moat mechanics:
 * ten thousand quoted-vs-actual pairs attached to real addresses is the
 * dataset a competitor cannot copy in a weekend.
 */

export interface TimeAccuracy {
  /** Positive = ran over the estimate; negative = beat it. */
  signedVariancePct: number;
  absVariancePct: number;
  rating: "sharp" | "fair" | "loose";
}

export function computeTimeAccuracy(estimatedMinutes: number, actualMinutes: number): TimeAccuracy {
  if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) {
    throw new RangeError("estimatedMinutes must be > 0");
  }
  if (!Number.isFinite(actualMinutes) || actualMinutes < 0) {
    throw new RangeError("actualMinutes must be >= 0");
  }
  const signedVariancePct = ((actualMinutes - estimatedMinutes) / estimatedMinutes) * 100;
  const absVariancePct = Math.abs(signedVariancePct);
  return {
    signedVariancePct,
    absVariancePct,
    rating: absVariancePct <= 15 ? "sharp" : absVariancePct <= 40 ? "fair" : "loose",
  };
}

/**
 * One accuracy number from the two signals the ledger captures: money
 * (quote vs invoice) and time (estimated vs actual on site). Money is
 * weighted heavier — a surprise bill hurts more than a long morning — but
 * a tradie who is always late no longer hides behind tight quoting.
 * Either signal alone stands in when the other has no history yet.
 */
export const MONEY_WEIGHT = 0.7;
export const TIME_WEIGHT = 0.3;

export function blendedAccuracyPct(
  avgAbsMoneyVariancePct: number | null,
  avgAbsTimeVariancePct: number | null,
): number | null {
  if (avgAbsMoneyVariancePct === null && avgAbsTimeVariancePct === null) return null;
  if (avgAbsMoneyVariancePct === null) return avgAbsTimeVariancePct;
  if (avgAbsTimeVariancePct === null) return avgAbsMoneyVariancePct;
  return avgAbsMoneyVariancePct * MONEY_WEIGHT + avgAbsTimeVariancePct * TIME_WEIGHT;
}
