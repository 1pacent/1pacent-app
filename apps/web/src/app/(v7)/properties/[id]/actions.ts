"use server";

import type { RequestCategory } from "@1pacent/core";
import type { ApprovalPolicyRuleInput, AcceptQuoteResult, DecisionOutcome, OccupancyStatus } from "@/lib/data-types";
import { getData } from "@/lib/data";
import { dispatchQuotesIfApproved } from "@/lib/dispatch-quotes";
import { triggerDispatchNotify } from "@/lib/n8n";

export async function acceptQuoteAction(requestId: string, quoteId: string): Promise<AcceptQuoteResult> {
  const data = await getData();
  const result = await data.acceptQuote(requestId, quoteId);
  if (result.ok && result.accepted && result.declined) {
    try {
      await triggerDispatchNotify({
        requestId,
        accepted: result.accepted,
        declined: result.declined,
      });
    } catch (e) {
      console.warn("[properties] n8n dispatch-notify failed:", e);
    }
  }
  return result;
}

export async function decideApprovalAction(
  requestId: string,
  decision: "approve" | "decline",
): Promise<DecisionOutcome> {
  const data = await getData();
  const outcome = await data.decideApprovalByRequestId(requestId, decision);
  if (outcome.ok) {
    await dispatchQuotesIfApproved(data, requestId, outcome.state);
  }
  return outcome;
}

export async function updateOwnershipAction(
  propertyId: string,
  occupancyStatus: OccupancyStatus,
  ownerContactId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  return (await getData()).updatePropertyOwnership(propertyId, { occupancyStatus, ownerContactId });
}

/** Never auto-approve these regardless of price or trust, when the landlord ticks
 * "never auto-approve gas or electrical" in the policy editor. */
const SAFETY_EXCLUDED_CATEGORIES: RequestCategory[] = [
  "gas_leak",
  "dangerous_electrical_fault",
  "safety_device_fault_smoke_alarm_or_pool_barrier",
];

export interface PolicyFormInput {
  underCapDollars: string;
  trustTierCapDollars: string;
  trustTierMinScore: string;
  excludeGasElectrical: boolean;
}

export async function saveApprovalPolicyAction(
  propertyId: string,
  input: PolicyFormInput,
): Promise<{ ok: boolean; error?: string }> {
  const rules: ApprovalPolicyRuleInput[] = [];
  const excludeCategories = input.excludeGasElectrical ? SAFETY_EXCLUDED_CATEGORIES : [];

  const underCap = Number.parseFloat(input.underCapDollars);
  if (Number.isFinite(underCap) && underCap > 0) {
    rules.push({
      priority: 0,
      maxTotalCents: Math.round(underCap * 100),
      minTrustScore: null,
      excludeCategories,
      enabled: true,
    });
  }

  const trustCap = Number.parseFloat(input.trustTierCapDollars);
  const trustMin = Number.parseInt(input.trustTierMinScore, 10);
  if (Number.isFinite(trustCap) && trustCap > 0 && Number.isFinite(trustMin) && trustMin >= 0 && trustMin <= 100) {
    rules.push({
      priority: 1,
      maxTotalCents: Math.round(trustCap * 100),
      minTrustScore: trustMin,
      excludeCategories,
      enabled: true,
    });
  }

  return (await getData()).saveApprovalPolicy(propertyId, rules);
}
