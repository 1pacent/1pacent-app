"use server";

import { parseDollarsToCents, REQUEST_CATEGORIES, type RequestCategory } from "@1pacent/core";
import { getData } from "@/lib/data";
import { RATE_CARD_CATEGORIES } from "./categories";

function toRequestCategory(value: string): RequestCategory {
  return (REQUEST_CATEGORIES as readonly string[]).includes(value) ? (value as RequestCategory) : "other";
}

export interface SaveRateCardResult {
  ok: boolean;
  error?: string;
}

export async function saveRateCard(token: string, formData: FormData): Promise<SaveRateCardResult> {
  let callOutFeeCents: number;
  let hourlyRateCents: number;
  try {
    callOutFeeCents = parseDollarsToCents(String(formData.get("callOutFee") ?? "").trim());
    hourlyRateCents = parseDollarsToCents(String(formData.get("hourlyRate") ?? "").trim());
  } catch {
    return { ok: false, error: "Enter valid dollar amounts for call-out fee and hourly rate." };
  }

  const items = [];
  for (const { value } of RATE_CARD_CATEGORIES) {
    const priceRaw = String(formData.get(`price_${value}`) ?? "").trim();
    const minutesRaw = String(formData.get(`minutes_${value}`) ?? "").trim();
    if (!priceRaw && !minutesRaw) continue;
    let flatPriceCents: number | null = null;
    try {
      flatPriceCents = priceRaw ? parseDollarsToCents(priceRaw) : null;
    } catch {
      return { ok: false, error: `Enter a valid price for "${value.replace(/_/g, " ")}".` };
    }
    const typicalMinutes = minutesRaw ? Number.parseInt(minutesRaw, 10) : null;
    if (typicalMinutes !== null && (!Number.isFinite(typicalMinutes) || typicalMinutes <= 0)) {
      return { ok: false, error: `Enter a valid typical duration for "${value.replace(/_/g, " ")}".` };
    }
    items.push({ category: value, flatPriceCents, typicalMinutes });
  }

  const data = await getData();
  return data.saveRateCard(token, { callOutFeeCents, hourlyRateCents, items });
}

/** Nelly's auto-quote opt-in (v6 §4.4): bounded, revocable, never silent. */
export async function setAutoQuoteAction(
  token: string,
  enabled: boolean,
  maxTotalDollars: string,
): Promise<{ ok: boolean; error?: string }> {
  let maxTotalCents: number | null = null;
  const trimmed = maxTotalDollars.trim();
  if (trimmed) {
    try {
      maxTotalCents = parseDollarsToCents(trimmed);
    } catch {
      return { ok: false, error: "Enter a valid dollar cap, or leave it blank for no cap." };
    }
  }
  return (await getData()).setAutoQuote(token, { enabled, maxTotalCents });
}

export async function startJobAction(token: string, workOrderId: string) {
  return (await getData()).startJob(token, workOrderId);
}

export async function markJobDoneAction(token: string, workOrderId: string, note: string) {
  return (await getData()).markJobDone(token, workOrderId, note);
}

export interface InvoiceJobResult {
  ok: boolean;
  error?: string;
}

export async function invoiceJobAction(
  token: string,
  workOrderId: string,
  category: string,
  formData: FormData,
): Promise<InvoiceJobResult> {
  let invoiceCents: number;
  let callOutFeeCents: number;
  try {
    invoiceCents = parseDollarsToCents(String(formData.get("invoiceCents") ?? "").trim());
    callOutFeeCents = parseDollarsToCents(String(formData.get("callOutFeeCents") ?? "").trim());
  } catch {
    return { ok: false, error: "Enter valid dollar amounts for the invoice and call-out fee." };
  }
  const warrantyRaw = String(formData.get("warrantyMonths") ?? "0").trim();
  const warrantyMonths = Number.parseInt(warrantyRaw, 10);
  if (!Number.isFinite(warrantyMonths) || warrantyMonths < 0 || warrantyMonths > 24) {
    return { ok: false, error: "Warranty must be between 0 and 24 months." };
  }
  const assetLabel = String(formData.get("assetLabel") ?? "").trim();
  if (!assetLabel) return { ok: false, error: "Describe what was worked on (e.g. \"Hot water system\")." };
  const assetInstalledAt = String(formData.get("assetInstalledAt") ?? "").trim() || null;

  const data = await getData();
  return data.invoiceJob(token, workOrderId, {
    invoiceCents,
    callOutFeeCents,
    warrantyMonths,
    assetLabel,
    assetCategory: toRequestCategory(category),
    assetInstalledAt,
  });
}
