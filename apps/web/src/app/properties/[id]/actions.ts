"use server";

import type { AcceptQuoteResult } from "@/lib/data-types";
import { getData } from "@/lib/data";
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
