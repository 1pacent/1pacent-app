import { NextResponse, type NextRequest } from "next/server";
import { getData } from "@/lib/data";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Onboarding is the first use: mint the right guest pass and drop the
 * visitor straight into their seat. Demo mode uses the seeded passes. */
export async function GET(request: NextRequest) {
  const as = request.nextUrl.searchParams.get("as") ?? "fix";
  const base = request.nextUrl.origin;

  if (!supabaseConfigured()) {
    const demo: Record<string, string> = {
      fix: "/p/fix/demo-intake",
      trade: "/p/trade/demo-tradie-portal",
      own: "/p/own/demo-owner-portal",
      deck: "/p/deck/demo-pm-portfolio",
    };
    return NextResponse.redirect(`${base}${demo[as] ?? demo.fix}`);
  }

  const data = await getData();
  const targets = await data.getTestLinkTargets();
  let path: string | null = null;
  if (as === "fix" && targets.properties[0]) {
    const minted = await data.mintTenantIntakeLink(targets.properties[0].id);
    if (minted.ok) path = minted.path.replace(/^\/r\//, "/p/fix/");
  } else if (as === "trade" && targets.tradies[0]) {
    const minted = await data.mintTradiePortalLink(targets.tradies[0].id);
    if (minted.ok) path = minted.path.replace(/^\/t\//, "/p/trade/");
  } else if (as === "own" && targets.owners[0]) {
    const minted = await data.mintOwnerPortalLink(targets.owners[0].id);
    if (minted.ok) path = minted.path.replace(/^\/o\//, "/p/own/");
  } else if (as === "deck" && targets.propertyManagers[0]) {
    const minted = await data.mintPmPortfolioLink(targets.propertyManagers[0].id);
    if (minted.ok) path = minted.path.replace(/^\/pm\//, "/p/deck/");
  }
  return NextResponse.redirect(`${base}${path ?? "/p"}`);
}
