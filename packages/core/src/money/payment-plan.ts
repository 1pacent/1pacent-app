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

/* ——— v8 R3: milestone capture, variance rows, Fast-Pay ——— */

/** Which slice of the job's money a payments row represents. */
export const PAYMENT_KINDS = ["primary", "deposit", "balance", "variance"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export interface PaymentScheduleItem {
  kind: PaymentKind;
  amountCents: Cents;
  /** When Penny may CAPTURE this slice. Authorization always precedes it. */
  captureOn: "verify" | "confirmation";
}

/**
 * Milestone capture (Developer Brief v8 §4): multi-day playbooks capture a
 * deposit at confirmation (materials) and the balance on verify — never one
 * long hold. Single-visit playbooks stay one capture-on-verify slice.
 * Deliberately consumer-repair scope: VIC's domestic-building deposit caps
 * are a hard boundary; depositPct here must stay defensible for repairs.
 */
export function paymentScheduleFor(
  playbook: { milestones?: { depositPct: number } },
  totalCents: Cents,
): PaymentScheduleItem[] {
  assertCents(totalCents);
  const depositPct = playbook.milestones?.depositPct ?? 0;
  if (depositPct <= 0 || totalCents === 0) {
    return [{ kind: "primary", amountCents: totalCents, captureOn: "verify" }];
  }
  if (depositPct >= 100) throw new RangeError("depositPct must be < 100");
  const deposit = Math.round((totalCents * depositPct) / 100 / 100) * 100;
  return [
    { kind: "deposit", amountCents: deposit, captureOn: "confirmation" },
    { kind: "balance", amountCents: totalCents - deposit, captureOn: "verify" },
  ];
}

/** Fast-Pay (Monetisation.md): the tradie chooses money-today; the factoring
 * fee comes off their payout, the platform fee is unchanged. */
export const FASTPAY_FEE_BPS = 200; // 2%

export function splitPaymentWithFastPay(
  amountCents: Cents,
  fastPay: boolean,
): { platformFeeCents: Cents; fastPayFeeCents: Cents; tradiePayoutCents: Cents } {
  const base = splitPayment(amountCents);
  if (!fastPay) return { ...base, fastPayFeeCents: 0 };
  const fastPayFeeCents = Math.round((amountCents * FASTPAY_FEE_BPS) / 10_000);
  return {
    platformFeeCents: base.platformFeeCents,
    fastPayFeeCents,
    tradiePayoutCents: base.tradiePayoutCents - fastPayFeeCents,
  };
}
