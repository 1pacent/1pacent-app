import type { RequestCategory } from "../requests/urgency";

/**
 * Warranty-aware routing (Developer Brief v4 §2, §6). When a new issue is
 * raised, check whether an already-completed job on the same property and
 * category is still under warranty — if so, route straight back to the
 * original tradie instead of opening a new 3-quote marketplace round.
 */

export interface WarrantyCandidate {
  workOrderId: string;
  tradieContactId: string;
  assetId: string;
  category: RequestCategory;
  warrantyExpiresAt: Date;
}

/** Picks the most recently expiring still-open warranty for this category. */
export function findWarrantyMatch(
  candidates: readonly WarrantyCandidate[],
  category: RequestCategory,
  now: Date,
): WarrantyCandidate | null {
  let best: WarrantyCandidate | null = null;
  for (const c of candidates) {
    if (c.category !== category) continue;
    if (c.warrantyExpiresAt.getTime() <= now.getTime()) continue;
    if (!best || c.warrantyExpiresAt.getTime() > best.warrantyExpiresAt.getTime()) {
      best = c;
    }
  }
  return best;
}
