/** The PM PUM cohort ladder (v8 R7) — pure data, importable anywhere.
 * SKUs match the HubSpot portal's PRD-1P-004-* products; prices AUD/month.
 * hubspot.ts enriches this from the live catalogue when a token exists. */

export interface PmTier {
  sku: string;
  name: string;
  priceCents: number;
  propertyCap: number;
  hubspotProductId: string | null;
}

/** The editable tier record (v9 R9) — billing_tiers row, DB source of truth.
 * priceCents (the monthly Stripe charge) is DERIVED: base + perProperty×cap. */
export interface BillingTier {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  baseFeeCents: number;
  perPropertyCents: number;
  propertyCap: number;
  active: boolean;
  sortOrder: number;
  stripeProductId: string | null;
  stripePriceId: string | null;
  hubspotProductId: string | null;
}

/** The monthly amount Stripe bills for a tier: base + per-property × cap. */
export function tierMonthlyCents(t: Pick<BillingTier, "baseFeeCents" | "perPropertyCents" | "propertyCap">): number {
  return t.baseFeeCents + t.perPropertyCents * t.propertyCap;
}

// v9 R9.1: value-anchored monotonic ladder (base + per-property × cap). These
// mirror the seeded billing_tiers; the DB is the source of truth, this is the
// demo/local fallback.
export const DEFAULT_PM_TIERS: PmTier[] = [
  { sku: "PRD-1P-004-20", name: "20 - Properties Under Management", priceCents: 18_000, propertyCap: 20, hubspotProductId: null },
  { sku: "PRD-1P-004-50", name: "50 - Properties Under Management", priceCents: 37_500, propertyCap: 50, hubspotProductId: null },
  { sku: "PRD-1P-004-100", name: "100 - Properties Under Management", priceCents: 60_000, propertyCap: 100, hubspotProductId: null },
  { sku: "PRD-1P-004-200", name: "200 - Properties Under Management", priceCents: 100_000, propertyCap: 200, hubspotProductId: null },
  { sku: "PRD-1P-004-300", name: "300 - Properties Under Management", priceCents: 135_000, propertyCap: 300, hubspotProductId: null },
  { sku: "PRD-1P-004-400", name: "400 - Properties Under Management", priceCents: 170_000, propertyCap: 400, hubspotProductId: null },
  { sku: "PRD-1P-004-500", name: "500 - Properties Under Management", priceCents: 205_000, propertyCap: 500, hubspotProductId: null },
  { sku: "PRD-1P-004-750", name: "750 - Properties Under Management", priceCents: 300_000, propertyCap: 750, hubspotProductId: null },
  { sku: "PRD-1P-004-1000", name: "1000 - Properties Under Management", priceCents: 400_000, propertyCap: 1000, hubspotProductId: null },
];
