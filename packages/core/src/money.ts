/**
 * Money is always integer cents (AUD). Never floats, never strings-as-numbers.
 * This replaces the legacy `text` money columns flagged in the audit (H2).
 */

export type Cents = number;

const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

export function assertCents(value: number): asserts value is Cents {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SAFE_CENTS) {
    throw new RangeError(`Invalid money amount (expected non-negative integer cents): ${value}`);
  }
}

/** Parse a human-entered dollar amount ("1,250.50", "$99", "  42 ") into cents. */
export function parseDollarsToCents(input: string): Cents {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new RangeError(`Unparseable dollar amount: "${input}"`);
  }
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0") || "0");
  assertCents(cents);
  return cents;
}

/** Format cents for display: 125050 -> "$1,250.50" */
export function formatCents(cents: Cents, options?: { withSymbol?: boolean }): string {
  assertCents(cents);
  const withSymbol = options?.withSymbol ?? true;
  const dollars = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  const grouped = dollars.toLocaleString("en-AU");
  return `${withSymbol ? "$" : ""}${grouped}.${frac}`;
}
