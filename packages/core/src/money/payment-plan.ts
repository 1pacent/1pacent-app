import { assertCents, type Cents } from "../money";

/**
 * The payment plan machine (Developer Brief v8 §4). Regulatory posture in
 * code: 1Pacent never holds funds. "authorized" is a card hold (no money
 * moved); "captured" is the PSP capturing on verified completion;
 * "transferred" is the PSP paying the tradie's connected account. Pure —
 * the PSP adapter (or the demo simulator) executes what this machine
 * permits, and every transition lands in the ledger.
 */

export const PAYMENT_STATES = ["authorized", "captured", "transferred", "voided", "disputed"] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export const PAYMENT_EVENTS = ["capture", "transfer", "void", "dispute"] as const;
export type PaymentEvent = (typeof PAYMENT_EVENTS)[number];

const PLAN: Partial<Record<PaymentState, Partial<Record<PaymentEvent, PaymentState>>>> = {
  authorized: { capture: "captured", void: "voided" },
  captured: { transfer: "transferred", dispute: "disputed" },
  transferred: { dispute: "disputed" },
};

export type PaymentTransition =
  | { ok: true; state: PaymentState }
  | { ok: false; message: string };

export function transitionPayment(from: PaymentState, event: PaymentEvent): PaymentTransition {
  const to = PLAN[from]?.[event];
  if (!to) return { ok: false, message: `Payment event "${event}" is not valid from "${from}"` };
  return { ok: true, state: to };
}

export interface PaymentView {
  status: PaymentState;
  amountCents: Cents;
  /** Platform fee retained at transfer (Monetisation.md: 1.2% of volume). */
  platformFeeCents: Cents;
  tradiePayoutCents: Cents;
}

export const PLATFORM_FEE_BPS = 120; // 1.2%

export function splitPayment(amountCents: Cents): { platformFeeCents: Cents; tradiePayoutCents: Cents } {
  assertCents(amountCents);
  const platformFeeCents = Math.round((amountCents * PLATFORM_FEE_BPS) / 10_000);
  return { platformFeeCents, tradiePayoutCents: amountCents - platformFeeCents };
}

/** Booked amount for a fixed band: the midpoint, rounded to the dollar. */
export function bookableAmountFromBand(lowCents: Cents, highCents: Cents): Cents {
  assertCents(lowCents);
  assertCents(highCents);
  if (highCents < lowCents) throw new RangeError("band inverted");
  return Math.round((lowCents + highCents) / 2 / 100) * 100;
}
