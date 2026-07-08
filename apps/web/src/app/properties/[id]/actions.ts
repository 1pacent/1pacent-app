"use server";

import type { AcceptQuoteResult, DecisionOutcome } from "@/lib/data-types";
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
