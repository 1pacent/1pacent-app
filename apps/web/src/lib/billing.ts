import "server-only";
import { serviceClient } from "./supabase";
import { supabaseConfigured } from "./supabase";
import { DEFAULT_PM_TIERS, tierMonthlyCents, type BillingTier, type PmTier } from "./pm-tiers";
import { provisionStripeTier, stripeConfigured } from "./stripe-billing";
import { listHubspotProducts, upsertHubspotProduct, hubspotConfigured } from "./hubspot";

/**
 * The billing catalogue service (v9 R9): billing_tiers is the DB source of
 * truth, edited in the operator console, provisioned OUT to Stripe (billing)
 * and HubSpot (CRM). Everything is keyed by SKU. Falls back to the shipped
 * ladder when the DB is unconfigured (demo/local).
 */

export interface BillingSettings {
  transactionFeeBps: number;
  fastpayFeeBps: number;
  currency: string;
}

const FALLBACK_SETTINGS: BillingSettings = { transactionFeeBps: 500, fastpayFeeBps: 200, currency: "aud" };

interface TierRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  base_fee_cents: number;
  per_property_cents: number;
  property_cap: number;
  active: boolean;
  sort_order: number;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  hubspot_product_id: string | null;
}

function toTier(r: TierRow): BillingTier {
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    description: r.description,
    baseFeeCents: r.base_fee_cents,
    perPropertyCents: r.per_property_cents,
    propertyCap: r.property_cap,
    active: r.active,
    sortOrder: r.sort_order,
    stripeProductId: r.stripe_product_id,
    stripePriceId: r.stripe_price_id,
    hubspotProductId: r.hubspot_product_id,
  };
}

/** Fallback tiers (no DB) derived from the shipped ladder — base 0, $2/prop. */
function fallbackTiers(): BillingTier[] {
  return DEFAULT_PM_TIERS.map((t, i) => ({
    id: t.sku,
    sku: t.sku,
    name: t.name,
    description: null,
    baseFeeCents: 0,
    perPropertyCents: 200,
    propertyCap: t.propertyCap,
    active: true,
    sortOrder: i + 1,
    stripeProductId: null,
    stripePriceId: null,
    hubspotProductId: t.hubspotProductId,
  }));
}

export async function listBillingTiers(includeInactive = false): Promise<BillingTier[]> {
  if (!supabaseConfigured()) return fallbackTiers();
  const db = serviceClient();
  let q = db.from("billing_tiers").select("*").order("sort_order", { ascending: true });
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error || !data) {
    console.warn("[billing] tier read failed, using fallback:", error?.message);
    return fallbackTiers();
  }
  return (data as TierRow[]).map(toTier);
}

/** The PM-facing subscription options, from the DB catalogue (active only).
 * priceCents is the computed monthly charge (base + per-property × cap). This
 * replaces the old HubSpot-first `listPmTiers()` as the selection source. */
export async function pmTiersFromCatalogue(): Promise<PmTier[]> {
  const tiers = await listBillingTiers(false);
  return tiers.map((t) => ({
    sku: t.sku,
    name: t.name,
    priceCents: tierMonthlyCents(t),
    propertyCap: t.propertyCap,
    hubspotProductId: t.hubspotProductId,
  }));
}

export async function getBillingSettings(): Promise<BillingSettings> {
  if (!supabaseConfigured()) return FALLBACK_SETTINGS;
  const db = serviceClient();
  const { data } = await db
    .from("billing_settings")
    .select("transaction_fee_bps, fastpay_fee_bps, currency")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return FALLBACK_SETTINGS;
  return {
    transactionFeeBps: Number(data.transaction_fee_bps),
    fastpayFeeBps: Number(data.fastpay_fee_bps),
    currency: String(data.currency),
  };
}

export async function updateBillingSettings(input: Partial<BillingSettings>): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseConfigured()) return { ok: false, error: "DB not configured" };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.transactionFeeBps !== undefined) patch.transaction_fee_bps = Math.max(0, Math.min(10000, Math.round(input.transactionFeeBps)));
  if (input.fastpayFeeBps !== undefined) patch.fastpay_fee_bps = Math.max(0, Math.min(10000, Math.round(input.fastpayFeeBps)));
  if (input.currency) patch.currency = input.currency;
  const { error } = await serviceClient().from("billing_settings").update(patch).eq("id", 1);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface TierEdit {
  name?: string;
  description?: string | null;
  baseFeeCents?: number;
  perPropertyCents?: number;
  propertyCap?: number;
  active?: boolean;
}

export async function updateBillingTier(sku: string, edit: TierEdit): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseConfigured()) return { ok: false, error: "DB not configured" };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (edit.name !== undefined) patch.name = edit.name.trim();
  if (edit.description !== undefined) patch.description = edit.description?.trim() || null;
  if (edit.baseFeeCents !== undefined) patch.base_fee_cents = Math.max(0, Math.round(edit.baseFeeCents));
  if (edit.perPropertyCents !== undefined) patch.per_property_cents = Math.max(0, Math.round(edit.perPropertyCents));
  if (edit.propertyCap !== undefined) patch.property_cap = Math.max(1, Math.round(edit.propertyCap));
  if (edit.active !== undefined) patch.active = edit.active;
  const { error } = await serviceClient().from("billing_tiers").update(patch).eq("sku", sku);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Provision ONE tier out to Stripe (create/update Product + Price) and mirror
 * to HubSpot, then persist the returned ids. The one action that syncs all
 * three systems from the DB truth.
 */
export async function provisionTier(sku: string): Promise<{ ok: boolean; simulated: boolean; error?: string; stripePriceId?: string }> {
  const tiers = await listBillingTiers(true);
  const tier = tiers.find((t) => t.sku === sku);
  if (!tier) return { ok: false, simulated: false, error: "tier not found" };
  const settings = await getBillingSettings();
  const monthlyCents = tierMonthlyCents(tier);

  const stripe = await provisionStripeTier({
    sku: tier.sku,
    name: tier.name,
    description: tier.description,
    monthlyCents,
    currency: settings.currency,
    stripeProductId: tier.stripeProductId,
    stripePriceId: tier.stripePriceId,
  });
  if (!stripe.ok) return { ok: false, simulated: stripe.simulated, error: stripe.error };

  // Mirror to HubSpot (best-effort; never blocks Stripe truth).
  let hubspotId = tier.hubspotProductId;
  if (hubspotConfigured()) {
    const hs = await upsertHubspotProduct({
      sku: tier.sku,
      name: tier.name,
      description: tier.description,
      monthlyCents,
      hubspotProductId: tier.hubspotProductId,
    });
    if (hs.ok && hs.id) hubspotId = hs.id;
  }

  if (supabaseConfigured()) {
    await serviceClient()
      .from("billing_tiers")
      .update({
        stripe_product_id: stripe.stripeProductId ?? tier.stripeProductId,
        stripe_price_id: stripe.stripePriceId ?? tier.stripePriceId,
        hubspot_product_id: hubspotId,
        updated_at: new Date().toISOString(),
      })
      .eq("sku", sku);
  }
  return { ok: true, simulated: stripe.simulated, stripePriceId: stripe.stripePriceId };
}

export async function provisionAllTiers(): Promise<{ ok: boolean; simulated: boolean; count: number; errors: string[] }> {
  const tiers = await listBillingTiers(true);
  const errors: string[] = [];
  let simulated = false;
  let count = 0;
  for (const t of tiers) {
    const r = await provisionTier(t.sku);
    simulated = simulated || r.simulated;
    if (r.ok) count++;
    else errors.push(`${t.sku}: ${r.error}`);
  }
  return { ok: errors.length === 0, simulated, count, errors };
}

/**
 * Prepopulate the local catalogue from the curated HubSpot product details
 * (name, description, price). Matches on SKU; reconstructs the monthly price
 * into per-property × cap (+ any remainder as base fee) so the local model
 * reproduces the HubSpot price exactly. Never creates new SKUs.
 */
export async function importFromHubspot(): Promise<{ ok: boolean; updated: number; error?: string }> {
  if (!hubspotConfigured()) return { ok: false, updated: 0, error: "HubSpot not configured" };
  if (!supabaseConfigured()) return { ok: false, updated: 0, error: "DB not configured" };
  const products = await listHubspotProducts();
  if (products.length === 0) return { ok: false, updated: 0, error: "no PRD-1P-004-* products in HubSpot" };
  const tiers = await listBillingTiers(true);
  const bySku = new Map(tiers.map((t) => [t.sku, t]));
  let updated = 0;
  for (const p of products) {
    const tier = bySku.get(p.sku);
    if (!tier) continue;
    const perProperty = tier.propertyCap > 0 ? Math.floor(p.priceCents / tier.propertyCap) : p.priceCents;
    const base = p.priceCents - perProperty * tier.propertyCap;
    const { error } = await serviceClient()
      .from("billing_tiers")
      .update({
        name: p.name,
        description: p.description,
        per_property_cents: perProperty,
        base_fee_cents: base,
        hubspot_product_id: p.id,
        updated_at: new Date().toISOString(),
      })
      .eq("sku", p.sku);
    if (!error) updated++;
  }
  return { ok: true, updated };
}

/** Convenience for the console header. */
export function billingSystemStatus(): { stripe: boolean; hubspot: boolean } {
  return { stripe: stripeConfigured(), hubspot: hubspotConfigured() };
}
