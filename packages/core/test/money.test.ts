import { describe, expect, it } from "vitest";
import { assertCents, formatCents, parseDollarsToCents } from "../src/money.js";

describe("parseDollarsToCents", () => {
  it("parses plain dollars", () => {
    expect(parseDollarsToCents("99")).toBe(9_900);
  });

  it("parses symbols, commas, and whitespace", () => {
    expect(parseDollarsToCents(" $1,250.50 ")).toBe(125_050);
  });

  it("parses single-digit fractions as tens of cents", () => {
    expect(parseDollarsToCents("42.5")).toBe(4_250);
  });

  it("rejects garbage", () => {
    for (const bad of ["", "abc", "1.234", "-5", "1..2"]) {
      expect(() => parseDollarsToCents(bad), bad).toThrow(RangeError);
    }
  });
});

describe("formatCents", () => {
  it("formats with grouping and symbol", () => {
    expect(formatCents(125_050)).toBe("$1,250.50");
  });

  it("formats zero and sub-dollar amounts", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
  });

  it("omits the symbol on request", () => {
    expect(formatCents(9_900, { withSymbol: false })).toBe("99.00");
  });
});

describe("assertCents", () => {
  it("rejects floats, negatives, and unsafe integers", () => {
    expect(() => assertCents(1.5)).toThrow(RangeError);
    expect(() => assertCents(-1)).toThrow(RangeError);
    expect(() => assertCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it("accepts integer cents", () => {
    expect(() => assertCents(0)).not.toThrow();
    expect(() => assertCents(250_000)).not.toThrow();
  });
});
