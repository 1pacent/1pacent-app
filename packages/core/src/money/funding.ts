import { assertCents, type Cents } from "../money";

/**
 * Settlement funding (v8 R6): WHO pays same-day, decided deterministically.
 * The whole attraction for tradies is same-day money — but PM-managed
 * properties traditionally settle from trust at month-end, and a property's
 * trust balance may not cover the job yet (rent not landed).
 *
 * The ladder:
 *  1. Owner-occupier / self-managed → the payer's card (authorized at
 *     booking) captures on verify. Same-day, always.
 *  2. PM-managed with sufficient property trust balance → fund from trust
 *     NOW. Tradie paid same-day; PM's ledger reconciles instead of batching.
 *  3. PM-managed, trust short → the obligation HANDS OFF to the landlord:
 *     a one-tap "pay now by card" Moment. Rent timing stops being the
 *     tradie's problem.
 *  4. Landlord declines/ignores → the payment sits captured-awaiting-funds
 *     for the month-end run; the tradie's Fast-Pay (funding partner) can
 *     still make THEM whole same-day.
 */

export type FundingSource = "payer_card" | "pm_trust" | "owner_handoff" | "awaiting_funds";

export interface FundingDecision {
  source: FundingSource;
  /** For pm_trust: the balance after funding. */
  trustBalanceAfterCents?: Cents;
  /** Human line for the ledger event. */
  note: string;
}

export function decideFunding(input: {
  pmManaged: boolean;
  trustBalanceCents: Cents | null;
  amountCents: Cents;
}): FundingDecision {
  assertCents(input.amountCents);
  if (!input.pmManaged) {
    return { source: "payer_card", note: "Payer's card captured on verification — same-day." };
  }
  const balance = input.trustBalanceCents ?? 0;
  if (balance >= input.amountCents) {
    return {
      source: "pm_trust",
      trustBalanceAfterCents: balance - input.amountCents,
      note: `Funded from the property's trust balance — same-day, no month-end batch.`,
    };
  }
  return {
    source: "owner_handoff",
    note: `Trust balance short ($${(balance / 100).toFixed(2)} of $${(input.amountCents / 100).toFixed(2)}) — handed to the owner to pay now.`,
  };
}
