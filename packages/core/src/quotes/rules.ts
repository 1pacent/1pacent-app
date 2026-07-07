import { assertCents, type Cents } from "../money";

/**
 * Pure validation for a tradie's quote submission (the 3-tradie
 * marketplace). Amount validation only — matching/ranking/acceptance
 * decisions live in the DataSource layer, which is where the DB
 * transaction and actor guards belong.
 */

export interface QuoteSubmissionInput {
  quoteCents: Cents;
  callOutFeeCents: Cents;
  note?: string;
}

const MAX_NOTE_LENGTH = 2000;

export function validateQuoteSubmission(input: QuoteSubmissionInput): void {
  assertCents(input.quoteCents);
  assertCents(input.callOutFeeCents);
  if (input.note && input.note.length > MAX_NOTE_LENGTH) {
    throw new RangeError(`Quote note exceeds ${MAX_NOTE_LENGTH} characters`);
  }
}

/** What the landlord actually compares across the 3 quotes: quote + call-out fee. */
export function totalQuoteCents(input: Pick<QuoteSubmissionInput, "quoteCents" | "callOutFeeCents">): Cents {
  assertCents(input.quoteCents);
  assertCents(input.callOutFeeCents);
  const total = input.quoteCents + input.callOutFeeCents;
  assertCents(total);
  return total;
}
