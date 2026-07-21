import { NextResponse } from "next/server";
import { listBillingTiers } from "@/lib/billing";
import { tierMonthlyCents } from "@/lib/pm-tiers";

/**
 * Public pricing feed (v9 R9.1) for the self-serve savings calculator on the
 * marketing site. Only what's needed to price a portfolio — no internal ids.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const tiers = await listBillingTiers(false);
  return NextResponse.json({
    tiers: tiers
      .map((t) => ({ sku: t.sku, name: t.name, propertyCap: t.propertyCap, monthlyCents: tierMonthlyCents(t) }))
      .sort((a, b) => a.propertyCap - b.propertyCap),
  });
}
