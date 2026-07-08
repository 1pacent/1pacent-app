"use server";

import { getData } from "@/lib/data";
import { dispatchQuotesIfApproved } from "@/lib/dispatch-quotes";

export async function decide(token: string, decision: "approve" | "decline") {
  const data = await getData();
  const context = await data.getApprovalContext(token);
  const outcome = await data.decideApprovalByToken(token, decision);
  if (outcome.ok && context) {
    await dispatchQuotesIfApproved(data, context.request.id, outcome.state);
  }
  return outcome;
}
