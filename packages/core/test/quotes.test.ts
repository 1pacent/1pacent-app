import { describe, expect, it } from "vitest";
import { totalQuoteCents, validateQuoteSubmission } from "../src/quotes/rules.js";

describe("validateQuoteSubmission", () => {
  it("accepts a valid quote", () => {
    expect(() =>
      validateQuoteSubmission({ quoteCents: 15_000, callOutFeeCents: 8_000 }),
    ).not.toThrow();
  });

  it("rejects a negative or non-integer quote", () => {
    expect(() => validateQuoteSubmission({ quoteCents: -1, callOutFeeCents: 0 })).toThrow(RangeError);
    expect(() => validateQuoteSubmission({ quoteCents: 10.5, callOutFeeCents: 0 })).toThrow(RangeError);
  });

  it("rejects a negative call-out fee", () => {
    expect(() => validateQuoteSubmission({ quoteCents: 15_000, callOutFeeCents: -500 })).toThrow(
      RangeError,
    );
  });

  it("rejects an overlong note", () => {
    expect(() =>
      validateQuoteSubmission({ quoteCents: 15_000, callOutFeeCents: 8_000, note: "x".repeat(2001) }),
    ).toThrow(RangeError);
  });
});

describe("totalQuoteCents", () => {
  it("sums quote + call-out fee", () => {
    expect(totalQuoteCents({ quoteCents: 15_000, callOutFeeCents: 8_000 })).toBe(23_000);
  });
});
