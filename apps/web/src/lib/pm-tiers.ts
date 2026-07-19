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

export const DEFAULT_PM_TIERS: PmTier[] = [
  { sku: "PRD-1P-004-20", name: "20 - Properties Under Management", priceCents: 4_000, propertyCap: 20, hubspotProductId: null },
  { sku: "PRD-1P-004-50", name: "50 - Properties Under Management", priceCents: 10_000, propertyCap: 50, hubspotProductId: null },
  { sku: "PRD-1P-004-100", name: "100 - Properties Under Management", priceCents: 20_000, propertyCap: 100, hubspotProductId: null },
  { sku: "PRD-1P-004-200", name: "200 - Properties Under Management", priceCents: 40_000, propertyCap: 200, hubspotProductId: null },
  { sku: "PRD-1P-004-300", name: "300 - Properties Under Management", priceCents: 60_000, propertyCap: 300, hubspotProductId: null },
  { sku: "PRD-1P-004-400", name: "400 - Properties Under Management", priceCents: 80_000, propertyCap: 400, hubspotProductId: null },
  { sku: "PRD-1P-004-500", name: "500 - Properties Under Management", priceCents: 100_000, propertyCap: 500, hubspotProductId: null },
  { sku: "PRD-1P-004-1000", name: "1000 - Properties Under Management", priceCents: 200_000, propertyCap: 1000, hubspotProductId: null },
];
