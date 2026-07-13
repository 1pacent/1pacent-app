import { describe, expect, it } from "vitest";
import {
  bookableAmountFromBand,
  splitPayment,
  transitionPayment,
} from "../src/money/payment-plan.js";

describe("payment plan machine (no-custody model)", () => {
  it("authorized → captured → transferred is the happy path", () => {
    const c = transitionPayment("authorized", "capture");
    expect(c).toEqual({ ok: true, state: "captured" });
    const t = transitionPayment("captured", "transfer");
    expect(t).toEqual({ ok: true, state: "transferred" });
  });
  it("cannot capture twice or transfer before capture", () => {
    expect(transitionPayment("captured", "capture").ok).toBe(false);
    expect(transitionPayment("authorized", "transfer").ok).toBe(false);
  });
  it("an authorization can be voided (no money ever moved)", () => {
    expect(transitionPayment("authorized", "void")).toEqual({ ok: true, state: "voided" });
    expect(transitionPayment("voided", "capture").ok).toBe(false);
  });
});

describe("platform economics", () => {
  it("splits 1.2% platform fee from the tradie payout", () => {
    const { platformFeeCents, tradiePayoutCents } = splitPayment(20_000);
    expect(platformFeeCents).toBe(240);
    expect(tradiePayoutCents).toBe(19_760);
  });
  it("books the band midpoint rounded to the dollar", () => {
    expect(bookableAmountFromBand(18_000, 24_000)).toBe(21_000);
    expect(bookableAmountFromBand(18_050, 24_050)).toBe(21_100);
    expect(() => bookableAmountFromBand(24_000, 18_000)).toThrow(RangeError);
  });
});

// ——— v8 R3 additions ———

import {
  paymentScheduleFor,
  splitPaymentWithFastPay,
  FASTPAY_FEE_BPS,
} from "../src/money/payment-plan";
import { PLAYBOOKS } from "../src/playbooks";

describe("paymentScheduleFor (milestone capture, v8 R3)", () => {
  it("keeps single-visit playbooks as one capture-on-verify slice", () => {
    const schedule = paymentScheduleFor(PLAYBOOKS.tap_leak, 20_000);
    expect(schedule).toEqual([{ kind: "primary", amountCents: 20_000, captureOn: "verify" }]);
  });

  it("splits multi-day playbooks into deposit-at-confirmation + balance-on-verify", () => {
    const schedule = paymentScheduleFor(PLAYBOOKS.hws_replace, 250_000);
    expect(schedule).toHaveLength(2);
    expect(schedule[0]).toEqual({ kind: "deposit", amountCents: 75_000, captureOn: "confirmation" });
    expect(schedule[1]).toEqual({ kind: "balance", amountCents: 175_000, captureOn: "verify" });
    expect(schedule[0]!.amountCents + schedule[1]!.amountCents).toBe(250_000);
  });

  it("rounds the deposit to whole dollars and conserves the total", () => {
    const schedule = paymentScheduleFor({ milestones: { depositPct: 30 } }, 123_456);
    expect(schedule[0]!.amountCents % 100).toBe(0);
    expect(schedule[0]!.amountCents + schedule[1]!.amountCents).toBe(123_456);
  });

  it("refuses a deposit that swallows the job", () => {
    expect(() => paymentScheduleFor({ milestones: { depositPct: 100 } }, 10_000)).toThrow();
  });
});

describe("splitPaymentWithFastPay", () => {
  it("is identical to the plain split when Fast-Pay is off", () => {
    const s = splitPaymentWithFastPay(100_000, false);
    expect(s.fastPayFeeCents).toBe(0);
    expect(s.platformFeeCents).toBe(1_200);
    expect(s.tradiePayoutCents).toBe(98_800);
  });

  it("takes the 2% factoring fee off the tradie payout, platform fee unchanged", () => {
    const s = splitPaymentWithFastPay(100_000, true);
    expect(FASTPAY_FEE_BPS).toBe(200);
    expect(s.platformFeeCents).toBe(1_200);
    expect(s.fastPayFeeCents).toBe(2_000);
    expect(s.tradiePayoutCents).toBe(96_800);
    expect(s.platformFeeCents + s.fastPayFeeCents + s.tradiePayoutCents).toBe(100_000);
  });
});
