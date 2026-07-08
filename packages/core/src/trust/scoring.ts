import { assertCents, type Cents } from "../money";

/**
 * Quote-vs-actual trending — the tradie trust signal. Mirrors the SQL in
 * `tradie_trust_scores` (packages/db/migrations/0003_sally_quotes_and_memory.sql);
 * that view is a read-time convenience only. This function is the source
 * of truth for the formula so the two can't silently drift — any future
 * ranking/auto-invite logic should call this, not the view.
 */

export interface QuoteAccuracy {
  /** Positive = the job cost more than quoted; negative = came in under. */
  signedVariancePct: number;
  /** Magnitude only — "how far off", regardless of direction. */
  absVariancePct: number;
}

export function computeQuoteAccuracy(quoteCents: Cents, invoiceCents: Cents): QuoteAccuracy {
  assertCents(quoteCents);
  assertCents(invoiceCents);
  if (quoteCents === 0) {
    throw new RangeError("Cannot compute quote accuracy against a zero-cent quote");
  }
  const signedVariancePct = ((invoiceCents - quoteCents) / quoteCents) * 100;
  return { signedVariancePct, absVariancePct: Math.abs(signedVariancePct) };
}

export interface TrustScoreInput {
  completedJobs: number;
  /** Null when there's no completed-job history yet. */
  avgAbsVariancePct: number | null;
}

export type TrustTier = "unproven" | "reliable" | "needs_review";

/** Below this many completed jobs, one good or bad job shouldn't swing a tier. */
const MIN_JOBS_FOR_TRUST = 3;
/** Average quote-accuracy variance beyond this flags for landlord review. */
const NEEDS_REVIEW_THRESHOLD_PCT = 25;

/** Coarse tier for UI display — "unproven" until there's enough history to trust. */
export function classifyTrust(input: TrustScoreInput): TrustTier {
  if (input.completedJobs < MIN_JOBS_FOR_TRUST || input.avgAbsVariancePct === null) {
    return "unproven";
  }
  return input.avgAbsVariancePct > NEEDS_REVIEW_THRESHOLD_PCT ? "needs_review" : "reliable";
}

/**
 * Continuous 0-100 trust score for the quote-ranking formula
 * (packages/core/src/quotes/ranking.ts) — classifyTrust's tier is for
 * display; this is for math. An unproven tradie (below the minimum job
 * count, or no history) gets a neutral 50 — neither rewarded nor
 * penalised for being new, since "new" isn't the same as "untrustworthy".
 */
export function scoreTrust(input: TrustScoreInput): number {
  if (input.completedJobs < MIN_JOBS_FOR_TRUST || input.avgAbsVariancePct === null) {
    return 50;
  }
  return Math.max(0, Math.min(100, 100 - input.avgAbsVariancePct));
}
