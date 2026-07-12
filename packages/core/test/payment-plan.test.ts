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
