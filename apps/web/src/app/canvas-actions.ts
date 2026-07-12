"use server";

import { getData } from "@/lib/data";
import { sendSeatMessage, type SeatMessageResult, type SeatMode } from "@/lib/sally-seat";
import { dispatchQuotesIfApproved } from "@/lib/dispatch-quotes";
import { triggerDispatchNotify } from "@/lib/n8n";

/**
 * Canvas card actions (Product Design v6 §2.1): every decision is an
 * authenticated, token-scoped, deterministic action — the event log records
 * a human, never a model. Sally can point at these cards; only these
 * handlers can fire them.
 */

const MAX_MESSAGE_LENGTH = 2000;

export async function seatMessageAction(
  mode: SeatMode,
  token: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  message: string,
): Promise<SeatMessageResult> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Type a message first." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "That message is too long." };
  return sendSeatMessage(mode, token, history, trimmed);
}

export async function confirmSlotAction(
  token: string,
  workOrderId: string,
  slotIndex: number,
): Promise<{ ok: boolean; error?: string }> {
  return (await getData()).confirmSlot(token, workOrderId, slotIndex);
}

export async function confirmFixedFromCanvasAction(
  token: string,
  requestId: string,
): Promise<{ ok: boolean; error?: string }> {
  return (await getData()).confirmFixed(token, requestId);
}

/** Owner decision from the canvas. Scope check in the data layer path: the
 * request must belong to a property this owner token can see. */
export async function ownerDecideAction(
  token: string,
  requestId: string,
  decision: "approve" | "decline",
): Promise<{ ok: boolean; error?: string }> {
  const data = await getData();
  const ctx = await data.getOwnerPortalContext(token);
  if (!ctx) return { ok: false, error: "This link isn't active." };
  const inScope = ctx.properties.some((p) => p.requests.some((r) => r.id === requestId));
  if (!inScope) return { ok: false, error: "Request not found." };
  const outcome = await data.decideApprovalByRequestId(requestId, decision);
  if (!outcome.ok) return { ok: false, error: outcome.error };
  await dispatchQuotesIfApproved(data, requestId, outcome.state);
  return { ok: true };
}

export async function ownerAcceptQuoteAction(
  token: string,
  requestId: string,
  quoteId: string,
): Promise<{ ok: boolean; error?: string }> {
  const data = await getData();
  const ctx = await data.getOwnerPortalContext(token);
  if (!ctx) return { ok: false, error: "This link isn't active." };
  const inScope = ctx.properties.some((p) => p.requests.some((r) => r.id === requestId));
  if (!inScope) return { ok: false, error: "Request not found." };
  const result = await data.acceptQuote(requestId, quoteId);
  if (!result.ok) return { ok: false, error: result.error };
  if (result.accepted && result.declined) {
    try {
      await triggerDispatchNotify({ requestId, accepted: result.accepted, declined: result.declined });
    } catch (e) {
      console.warn("[canvas] n8n dispatch-notify failed:", e);
    }
  }
  return { ok: true };
}

export async function dispatchBatchAction(
  token: string,
  requirementKey: string,
  suburb: string,
): Promise<{ ok: boolean; dispatched?: number; error?: string }> {
  return (await getData()).dispatchComplianceBatch(token, { requirementKey, suburb });
}

export async function generateReportAction(
  token: string,
  kind: "property_data_pack" | "spending_summary" | "obligations_calendar",
): Promise<{ ok: boolean; reportId?: string; error?: string }> {
  return (await getData()).generateReport(token, kind);
}
