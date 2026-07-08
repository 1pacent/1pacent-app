"use server";

import type { MintLinkResult } from "@/lib/data-types";
import { getData } from "@/lib/data";

export async function mintTenantIntakeLinkAction(propertyId: string): Promise<MintLinkResult> {
  return (await getData()).mintTenantIntakeLink(propertyId);
}

export async function mintPmPortfolioLinkAction(pmContactId: string): Promise<MintLinkResult> {
  return (await getData()).mintPmPortfolioLink(pmContactId);
}

export async function mintTradiePortalLinkAction(tradieContactId: string): Promise<MintLinkResult> {
  return (await getData()).mintTradiePortalLink(tradieContactId);
}

export async function mintTradieLeadIntakeLinkAction(tradieContactId: string): Promise<MintLinkResult> {
  return (await getData()).mintTradieLeadIntakeLink(tradieContactId);
}
