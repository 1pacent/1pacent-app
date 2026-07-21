import "server-only";

/**
 * HubSpot CRM seam (env-gated, same pattern as Stripe/Hermes): with
 * HUBSPOT_ACCESS_TOKEN set (a private-app token), join requests and network
 * contacts upsert into HubSpot as contacts; without it, every call no-ops
 * honestly and the admin dashboard says so. HubSpot is a mirror for sales
 * workflow — the ledger remains the source of truth.
 */

export function hubspotConfigured(): boolean {
  return Boolean(process.env.HUBSPOT_ACCESS_TOKEN);
}

export interface HubspotContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  /** Mapped to HubSpot's lifecycle + a custom-ish note via jobtitle. */
  persona?: string;
  suburb?: string | null;
  company?: string | null;
}

export type HubspotResult = { ok: true; id: string } | { ok: false; error: string };

async function call(path: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body: json };
}

/** Create-or-update by email (HubSpot upsert via search + create/patch). */
export async function upsertHubspotContact(input: HubspotContactInput): Promise<HubspotResult> {
  if (!hubspotConfigured()) return { ok: false, error: "HubSpot not configured" };
  const properties: Record<string, string> = {
    email: input.email,
    ...(input.firstName ? { firstname: input.firstName } : {}),
    ...(input.lastName ? { lastname: input.lastName } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.persona ? { jobtitle: `Zaivo ${input.persona}` } : {}),
    ...(input.suburb ? { city: input.suburb } : {}),
    ...(input.company ? { company: input.company } : {}),
  };
  const search = await call("/crm/v3/objects/contacts/search", "POST", {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: input.email }] }],
    limit: 1,
  });
  const existing = (search.body.results as Array<{ id: string }> | undefined)?.[0];
  if (existing) {
    const patch = await call(`/crm/v3/objects/contacts/${existing.id}`, "PATCH", { properties });
    return patch.ok ? { ok: true, id: existing.id } : { ok: false, error: hsError(patch.body) };
  }
  const created = await call("/crm/v3/objects/contacts", "POST", { properties });
  return created.ok && created.body.id
    ? { ok: true, id: String(created.body.id) }
    : { ok: false, error: hsError(created.body) };
}

function hsError(body: Record<string, unknown>): string {
  return typeof body.message === "string" ? body.message : "HubSpot call failed";
}


/** ——— v8 R7: PM subscription tiers from HubSpot products ——— */

import { DEFAULT_PM_TIERS, type PmTier } from "./pm-tiers";
export { DEFAULT_PM_TIERS, type PmTier };

/** Live tiers from the HubSpot product catalogue (SKU prefix PRD-1P-004-);
 * falls back to the shipped ladder on any failure. */
export async function listPmTiers(): Promise<PmTier[]> {
  if (!hubspotConfigured()) return DEFAULT_PM_TIERS;
  try {
    const res = await call("/crm/v3/objects/products?limit=100&properties=name,price,hs_sku", "GET");
    const results = (res.body.results ?? []) as Array<{ id: string; properties: { name?: string; price?: string; hs_sku?: string } }>;
    const tiers: PmTier[] = [];
    for (const prod of results) {
      const sku = prod.properties.hs_sku ?? "";
      const m = /^PRD-1P-004-(\d+)$/.exec(sku);
      if (!m) continue;
      tiers.push({
        sku,
        name: (prod.properties.name ?? sku).trim(),
        priceCents: Math.round(Number(prod.properties.price ?? 0) * 100),
        propertyCap: Number(m[1]),
        hubspotProductId: prod.id,
      });
    }
    return tiers.length > 0 ? tiers.sort((x, y) => x.propertyCap - y.propertyCap) : DEFAULT_PM_TIERS;
  } catch (e) {
    console.warn("[hubspot] product fetch failed, using shipped tiers:", e);
    return DEFAULT_PM_TIERS;
  }
}

/** Raw HubSpot product read for the catalogue prepopulate (v9 R9): name +
 * description + price, keyed by SKU. */
export interface HubspotProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceCents: number;
}

export async function listHubspotProducts(): Promise<HubspotProduct[]> {
  if (!hubspotConfigured()) return [];
  try {
    const res = await call("/crm/v3/objects/products?limit=100&properties=name,price,hs_sku,description", "GET");
    const results = (res.body.results ?? []) as Array<{ id: string; properties: { name?: string; price?: string; hs_sku?: string; description?: string } }>;
    return results
      .filter((p) => /^PRD-1P-004-\d+$/.test(p.properties.hs_sku ?? ""))
      .map((p) => ({
        id: p.id,
        sku: p.properties.hs_sku!,
        name: (p.properties.name ?? p.properties.hs_sku!).trim(),
        description: p.properties.description?.trim() || null,
        priceCents: Math.round(Number(p.properties.price ?? 0) * 100),
      }));
  } catch (e) {
    console.warn("[hubspot] product list failed:", e);
    return [];
  }
}

/** Create-or-update a HubSpot product by SKU (the CRM mirror of a tier). */
export async function upsertHubspotProduct(input: {
  sku: string;
  name: string;
  description?: string | null;
  monthlyCents: number;
  hubspotProductId?: string | null;
}): Promise<{ ok: boolean; id: string | null }> {
  if (!hubspotConfigured()) return { ok: false, id: null };
  const properties: Record<string, string> = {
    name: input.name,
    hs_sku: input.sku,
    price: String(input.monthlyCents / 100),
    ...(input.description ? { description: input.description } : {}),
    recurringbillingfrequency: "monthly",
  };
  try {
    let id = input.hubspotProductId ?? null;
    if (!id) {
      // Find by SKU first (avoid duplicates).
      const search = await call("/crm/v3/objects/products/search", "POST", {
        filterGroups: [{ filters: [{ propertyName: "hs_sku", operator: "EQ", value: input.sku }] }],
        properties: ["hs_sku"],
        limit: 1,
      });
      const hit = ((search.body.results ?? []) as Array<{ id: string }>)[0];
      if (hit) id = hit.id;
    }
    if (id) {
      const upd = await call(`/crm/v3/objects/products/${id}`, "PATCH", { properties });
      return { ok: upd.ok, id: upd.ok ? id : null };
    }
    const created = await call("/crm/v3/objects/products", "POST", { properties });
    return { ok: created.ok, id: created.ok ? String(created.body.id) : null };
  } catch (e) {
    console.warn("[hubspot] product upsert failed:", e);
    return { ok: false, id: null };
  }
}

/** Mirror the selection as a HubSpot deal (+ line item) on the PM's contact.
 * Best-effort: local truth is the pm_subscriptions row either way. */
export async function recordSubscriptionDeal(input: {
  pmName: string;
  pmEmail: string | null;
  tier: PmTier;
  propertiesUnderManagement: number;
}): Promise<{ dealId: string | null }> {
  if (!hubspotConfigured()) return { dealId: null };
  try {
    let contactId: string | null = null;
    if (input.pmEmail) {
      const hs = await upsertHubspotContact({ email: input.pmEmail, firstName: input.pmName.split(" ")[0], lastName: input.pmName.split(" ").slice(1).join(" ") || undefined, persona: "pm" });
      if (hs.ok) contactId = hs.id;
    }
    const deal = await call("/crm/v3/objects/deals", "POST", {
      properties: {
        dealname: `Zaivo PUM subscription — ${input.tier.name} (${input.propertiesUnderManagement} PUM)`,
        amount: String(input.tier.priceCents / 100),
        pipeline: "default",
        dealstage: "appointmentscheduled",
      },
      ...(contactId
        ? { associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }] }
        : {}),
    });
    if (!deal.ok || !deal.body.id) return { dealId: null };
    const dealId = String(deal.body.id);
    if (input.tier.hubspotProductId) {
      await call("/crm/v3/objects/line_items", "POST", {
        properties: { hs_product_id: input.tier.hubspotProductId, quantity: "1" },
        associations: [{ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 20 }] }],
      }).catch(() => null);
    }
    return { dealId };
  } catch (e) {
    console.warn("[hubspot] deal mirror failed:", e);
    return { dealId: null };
  }
}
