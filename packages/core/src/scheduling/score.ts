/**
 * Availability scoring for the quote-ranking formula (packages/core/src/quotes/ranking.ts)
 * and for the human-readable ETA band Sally states during a live conversation.
 * Deliberately simple — no real travel-time/routing calculation yet (the
 * previous build's version was a fake suburb-string heuristic; better to be
 * honest about not having ETA-by-distance than to fake it — see
 * docs/DEVELOPER_BRIEF_v3.md §4.4 / §7).
 */

export interface AvailabilityInput {
  /** Minutes from invite to quote submission, or null if the tradie hasn't responded yet. */
  tradieRespondedWithinMinutes: number | null;
  matchesTenantPreferredWindow: boolean;
  /** How many other open jobs this tradie currently has. */
  currentOpenJobCount: number;
}

export function scoreAvailability(input: AvailabilityInput): number {
  if (input.tradieRespondedWithinMinutes === null) {
    // Hasn't responded yet — neutral, not penalised (a quote that hasn't
    // arrived isn't "unavailable", it's just not in yet).
    return 50;
  }
  let score = 100;
  score -= Math.min(60, input.tradieRespondedWithinMinutes);
  if (input.matchesTenantPreferredWindow) score += 10;
  score -= Math.min(20, input.currentOpenJobCount * 4);
  return Math.max(0, Math.min(100, score));
}

/** Human-readable ETA band for Sally to state on the call — never a promise, always a typical range. */
export function formatResponseWindow(medianMinutes: number): string {
  if (medianMinutes <= 0) throw new RangeError(`medianMinutes must be positive, got ${medianMinutes}`);
  if (medianMinutes < 60) {
    return `typically within about ${Math.round(medianMinutes / 5) * 5} minutes`;
  }
  const hours = medianMinutes / 60;
  if (hours < 24) {
    const rounded = hours < 2 ? Math.round(hours * 2) / 2 : Math.round(hours);
    return `typically within about ${rounded} hour${rounded === 1 ? "" : "s"}`;
  }
  const days = Math.round(hours / 24);
  return `typically within about ${days} day${days === 1 ? "" : "s"}`;
}
