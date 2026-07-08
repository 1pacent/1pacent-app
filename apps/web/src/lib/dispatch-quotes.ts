import "server-only";
import type { DataSource } from "./data-types";
import { triggerDispatchQuotes } from "./n8n";

/**
 * Shared by every path that can move a request into "approved" — Sally's
 * auto-approve bypass, a landlord's token-based decision (/a/[token]), and
 * the internal dashboard's direct approve action — so quotes go out to the
 * 3 tradies exactly once, regardless of which surface approved the request.
 */
export async function dispatchQuotesIfApproved(data: DataSource, requestId: string, state: string): Promise<void> {
  if (state !== "approved") return;
  const result = await data.dispatchQuotesForRequest(requestId);
  if (!result.ok) {
    console.warn("[dispatch-quotes] dispatchQuotesForRequest failed:", result.error);
    return;
  }
  const base = process.env.APP_BASE_URL ?? "";
  try {
    await triggerDispatchQuotes({
      requestId,
      property: { address: result.propertyAddress },
      request: { title: result.requestTitle, description: result.requestDescription },
      invites: result.invites.map((i) => ({
        quoteId: i.quoteId,
        tradieName: i.tradieName,
        tradieEmail: i.tradieEmail,
        quoteUrl: `${base}/q/${i.token}`,
      })),
    });
  } catch (e) {
    console.warn("[dispatch-quotes] n8n dispatch-quotes notification failed:", e);
  }
}
