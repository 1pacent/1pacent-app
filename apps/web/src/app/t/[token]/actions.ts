"use server";

import { parseDollarsToCents } from "@1pacent/core";
import { getData } from "@/lib/data";
import { RATE_CARD_CATEGORIES } from "./categories";

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
