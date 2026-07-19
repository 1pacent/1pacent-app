import { scoreTrust, type TrustScoreInput } from "./scoring";

/**
 * Customer feedback in the trust score (v8 R6 — archive lineage:
 * TRADIE-RENTAL-102-Tenant-Feedback-Trust-Score). The score becomes
 * 70% objective accuracy (money+time, fairness rules applied upstream)
 * and 30% human feedback — enough to matter, never enough for charm to
 * bury chronic over-quoting, or one grudge review to sink a sharp tradie.
 */

export const ACCURACY_WEIGHT = 0.7;
export const FEEDBACK_WEIGHT = 0.3;
/** Below this many reviews, feedback nudges rather than swings. */
const MIN_REVIEWS_FOR_FULL_WEIGHT = 3;

export function ratingToScore(avgRating: number): number {
  return Math.max(0, Math.min(100, ((avgRating - 1) / 4) * 100));
}

export interface FeedbackInput {
  avgRating: number | null; // 1..5
  reviewCount: number;
}

export function scoreTrustWithFeedback(accuracy: TrustScoreInput, feedback: FeedbackInput): number {
  const base = scoreTrust(accuracy);
  if (feedback.avgRating === null || feedback.reviewCount === 0) return base;
  const feedbackScore = ratingToScore(feedback.avgRating);
  // Ramp feedback weight in with review volume.
  const weight = FEEDBACK_WEIGHT * Math.min(1, feedback.reviewCount / MIN_REVIEWS_FOR_FULL_WEIGHT);
  return Math.round(base * (1 - weight) + feedbackScore * weight);
}

/** What would move this score — honest, computed, no platitudes. */
export function scoreTips(input: {
  avgAbsMoneyVariancePct: number | null;
  avgAbsTimeVariancePct: number | null;
  avgRating: number | null;
  completedJobs: number;
}): string[] {
  const tips: string[] = [];
  if (input.completedJobs < 3) tips.push("Complete more jobs — under 3 finished jobs the network holds you at a neutral 50.");
  if (input.avgAbsMoneyVariancePct !== null && input.avgAbsMoneyVariancePct > 10) {
    tips.push(`Quote closer to your final invoice — you average ±${input.avgAbsMoneyVariancePct.toFixed(0)}% off; under 10% is where scores climb.`);
  }
  if (input.avgAbsTimeVariancePct !== null && input.avgAbsTimeVariancePct > 25) {
    tips.push(`Tighten time estimates or flag scope changes earlier — you run ±${input.avgAbsTimeVariancePct.toFixed(0)}% vs estimate; approved variances never count against you.`);
  }
  if (input.avgRating !== null && input.avgRating < 4.2) {
    tips.push("Reply to every review and close the loop — responded feedback reads better to the next payer, and future ratings follow communication.");
  }
  if (tips.length === 0) tips.push("Keep doing exactly this — sharp quotes, honest time, happy customers. Volume compounds the score.");
  return tips;
}
