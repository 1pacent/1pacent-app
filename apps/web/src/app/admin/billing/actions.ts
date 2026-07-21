"use server";

import { revalidatePath } from "next/cache";
import {
  updateBillingTier,
  updateBillingSettings,
  provisionTier,
  provisionAllTiers,
  importFromHubspot,
} from "@/lib/billing";

export async function saveTierAction(
  sku: string,
  input: { name: string; description: string; baseFeeCents: number; perPropertyCents: number; propertyCap: number; active: boolean },
) {
  const r = await updateBillingTier(sku, input);
  if (r.ok) revalidatePath("/admin/billing");
  return r;
}

export async function saveSettingsAction(input: { transactionFeeBps: number; fastpayFeeBps: number }) {
  const r = await updateBillingSettings(input);
  if (r.ok) revalidatePath("/admin/billing");
  return r;
}

export async function provisionTierAction(sku: string) {
  const r = await provisionTier(sku);
  if (r.ok) revalidatePath("/admin/billing");
  return r;
}

export async function provisionAllAction() {
  const r = await provisionAllTiers();
  revalidatePath("/admin/billing");
  return r;
}

export async function importHubspotAction() {
  const r = await importFromHubspot();
  if (r.ok) revalidatePath("/admin/billing");
  return r;
}
