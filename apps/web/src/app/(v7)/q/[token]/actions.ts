"use server";

import { parseDollarsToCents } from "@1pacent/core";
import { getData } from "@/lib/data";

export interface SubmitQuoteResult {
  ok: boolean;
  error?: string;
}

export async function submitQuote(token: string, formData: FormData): Promise<SubmitQuoteResult> {
  const quoteRaw = String(formData.get("quote") ?? "").trim();
  const calloutRaw = String(formData.get("calloutFee") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  let quoteCents: number;
  let callOutFeeCents: number;
  try {
    quoteCents = parseDollarsToCents(quoteRaw);
    callOutFeeCents = calloutRaw ? parseDollarsToCents(calloutRaw) : 0;
  } catch {
    return { ok: false, error: "Enter valid dollar amounts (e.g. 150.00)." };
  }

  const data = await getData();
  return data.submitQuoteByToken(token, { quoteCents, callOutFeeCents, note: note || undefined });
}
