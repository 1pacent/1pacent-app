"use server";

import { triageIntake, SALLY_PROMPT_VERSION } from "@1pacent/agents";
import { aiClient } from "@/lib/ai";
import { getPlaybook, playbookForCategory, type RequestCategory } from "@1pacent/core";
import { getData } from "@/lib/data";
import { jobTopic, poke, tradeTopic } from "@/lib/poke";
import { pushMoment } from "@/lib/push";
import { triggerDispatchQuotes } from "@/lib/n8n";
import type {
  AutopilotInput,
  AutopilotView,
  BookingPreview,
  BookJobResult,
  JobProjection,
  PushSubscriptionInput,
  TradieRunView,
} from "@/lib/data-types";

/**
 * Pulse actions (v8 R1). Every mutation: token-scoped DataSource call →
 * ledger write inside core rules → realtime poke. AI appears exactly once —
 * triage proposes; the playbook table decides.
 */

const TRIAGE_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

export interface TriagePreviewResult {
  ok: boolean;
  error?: string;
  triage?: { title: string; description: string; hazardWarning: string | null } | null;
  preview?: BookingPreview | null;
  aiMeta?: { model: string; promptVersion: string; confidence: number } | null;
}

/** The Button: photo + words → proposal → priced, bookable preview. Works
 * LLM-off: pass a category directly and skip the model entirely. */
export async function triagePreviewAction(
  token: string,
  input: { description: string; photoDataUrl?: string | null; category?: RequestCategory },
): Promise<TriagePreviewResult> {
  const data = await getData();

  if (input.category) {
    const preview = await data.previewBooking(token, { category: input.category });
    if (!preview) return { ok: false, error: "This link isn't active." };
    return { ok: true, triage: null, preview, aiMeta: null };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "llm_off" };
  }
  try {
    const client = aiClient();
    const { triage, aiMeta } = await triageIntake({
      client,
      model: TRIAGE_MODEL,
      description: input.description,
      photoUrl: input.photoDataUrl ?? undefined,
    });
    const playbook = getPlaybook(triage.suggestedPlaybook) ?? playbookForCategory(triage.category);
    const preview = await data.previewBooking(token, { category: triage.category, playbookKey: playbook.key });
    if (!preview) return { ok: false, error: "This link isn't active." };
    return {
      ok: true,
      triage: { title: triage.title, description: triage.description, hazardWarning: triage.hazardWarning },
      preview,
      aiMeta,
    };
  } catch (e) {
    console.warn("[pulse] triage failed, falling back to manual pick:", e);
    return { ok: false, error: "llm_off" };
  }
}

export async function bookJobAction(
  token: string,
  input: {
    title: string;
    description: string;
    category: RequestCategory;
    playbookKey: string;
    propertyId?: string;
    slot: { startAt: string; endAt: string } | null;
    aiMeta?: { model: string; promptVersion: string; confidence: number } | null;
  },
): Promise<BookJobResult> {
  const data = await getData();
  const result = await data.bookJob(token, { ...input, aiMeta: input.aiMeta ?? null });
  if (result.ok) {
    await poke(tradeTopic());
    await poke(jobTopic(result.requestId));
    // The job ping — matched Online tradies get it on the lock screen.
    await pushMoment(result.requestId, "tradie_offered", {
      title: "Job ping 🔧",
      body: `${input.title} — first accept wins.`,
      tag: `offer-${result.requestId}`,
    });
    // n8n job ping (transport only; graceful no-op while n8n is down).
    try {
      await triggerDispatchQuotes({
        requestId: result.requestId,
        property: { address: "" },
        request: { title: input.title, description: input.description },
        invites: [],
      });
    } catch (e) {
      console.warn("[pulse] n8n job ping skipped:", e);
    }
  }
  return result;
}

export async function getJobAction(token: string, requestId: string): Promise<JobProjection | null> {
  return (await getData()).getJobProjection(token, requestId);
}

export async function acceptOfferAction(token: string, quoteId: string) {
  const data = await getData();
  const result = await data.acceptJobOffer(token, quoteId);
  if (result.ok && result.requestId) {
    await poke(jobTopic(result.requestId));
    await poke(tradeTopic());
    await pushMoment(result.requestId, "occupant", {
      title: "You're booked ✓",
      body: "A verified tradie accepted your job. Watch it live.",
      path: `job/${result.requestId}`,
      tag: `booked-${result.requestId}`,
    });
  }
  return result;
}

/** Quote-race invites (v8 R8.1): the tradie names a price from their seat. */
export async function submitOfferQuoteAction(
  token: string,
  quoteId: string,
  input: { quoteCents: number; callOutFeeCents?: number; note?: string },
) {
  const data = await getData();
  const result = await data.submitOfferQuote(token, quoteId, {
    quoteCents: input.quoteCents,
    callOutFeeCents: input.callOutFeeCents ?? 0,
    note: input.note,
  });
  if (result.ok) {
    await poke(tradeTopic());
    await poke(jobTopic(result.requestId));
  }
  return result;
}

export async function setOnlineAction(token: string, online: boolean, geo?: { lat: number; lng: number } | null) {
  const result = await (await getData()).setTradiePresence(token, online, geo ?? null);
  await poke(tradeTopic());
  return result;
}

export async function onMyWayAction(token: string, workOrderId: string, requestId: string) {
  const result = await (await getData()).markOnMyWay(token, workOrderId);
  if (result.ok) {
    await poke(jobTopic(requestId));
    // George's on-the-way ping — with a real ETA when both sides have
    // coordinates (tradie presence × verified property geo).
    await pushMoment(requestId, "occupant", {
      title: "On the way 🚐",
      body: result.etaMinutes
        ? `Your tradie is about ${result.etaMinutes} min away. Track the job live.`
        : "Your tradie is heading to you now. Track the job live.",
      path: `job/${requestId}`,
      tag: `otw-${requestId}`,
    });
  }
  return result;
}

export async function startJobPulseAction(token: string, workOrderId: string, requestId: string) {
  const result = await (await getData()).startJob(token, workOrderId);
  if (result.ok) await poke(jobTopic(requestId));
  return result;
}

export async function addEvidenceAction(
  token: string,
  workOrderId: string,
  requestId: string,
  input: { gate: string; dataUrl: string | null; note?: string },
) {
  const result = await (await getData()).addJobEvidence(token, workOrderId, input);
  if (result.ok) await poke(jobTopic(requestId));
  return result;
}

export async function completeJobAction(token: string, workOrderId: string, requestId: string, note: string) {
  const result = await (await getData()).completeJob(token, workOrderId, note);
  if (result.ok) {
    await poke(jobTopic(requestId));
    // The verify moment — one tap from the lock screen releases payment.
    await pushMoment(requestId, "occupant", {
      title: "Job done — all good?",
      body: "Tap Verify to confirm the work. Payment releases only when you say so.",
      path: `job/${requestId}`,
      oneTap: { kind: "verify_job", choices: [{ choice: "verify", label: "Verify ✓" }], actorType: "tenant" },
      tag: `verify-${requestId}`,
    });
    await pushMoment(requestId, "payer", {
      title: "Job done — evidence in",
      body: "Photos are on the record. Verify to capture and pay same-day.",
      path: `job/${requestId}`,
      oneTap: { kind: "verify_job", choices: [{ choice: "verify", label: "Verify ✓" }], actorType: "agency_user" },
      tag: `verify-${requestId}`,
    });
  }
  return result;
}

export async function verifySettleAction(token: string, requestId: string) {
  const result = await (await getData()).verifyAndSettle(token, requestId);
  if (result.ok) {
    await poke(jobTopic(requestId));
    await poke(tradeTopic());
    // Trust short (v8 R6): the obligation hands to the owner — one tap pays
    // now and the tradie still gets same-day money.
    if (result.funding === "owner_handoff") {
      await pushMoment(requestId, "payer", {
        title: "Rent hasn't landed — pay this one now?",
        body: "The property's trust balance is short. One tap pays by card; your tradie is paid today.",
        path: `job/${requestId}`,
        oneTap: { kind: "fund_job", choices: [{ choice: "pay", label: "Pay now" }] },
        tag: `fund-${requestId}`,
      });
    }
  }
  return result;
}

export async function sallyVersion(): Promise<string> {
  return SALLY_PROMPT_VERSION;
}

// ——— v8 R2: Autopilot & the Deck ———

export async function savePushSubscriptionAction(token: string, input: PushSubscriptionInput) {
  return (await getData()).savePushSubscription(token, input);
}

export async function getAutopilotAction(token: string): Promise<AutopilotView | null> {
  return (await getData()).getAutopilot(token);
}

export async function setAutopilotAction(token: string, input: AutopilotInput) {
  return (await getData()).setAutopilot(token, input);
}

export async function addCrewMemberAction(token: string, input: { name: string; email?: string; phone?: string }) {
  return (await getData()).addCrewMember(token, input);
}

export async function getTradieRunAction(token: string): Promise<TradieRunView | null> {
  return (await getData()).getTradieRun(token);
}

export async function dispatchBatchAction(token: string, input: { requirementKey: string; suburb: string }) {
  const result = await (await getData()).dispatchComplianceBatch(token, input);
  if (result.ok) await poke(tradeTopic());
  return result;
}

// ——— v8 R3: Real money & the second orbit ———

export async function proposeVarianceAction(
  token: string,
  workOrderId: string,
  requestId: string,
  input: { newTotalCents: number; reason: string; photoDataUrl?: string | null },
) {
  const result = await (await getData()).proposeVariance(token, workOrderId, input);
  if (result.ok) {
    await poke(jobTopic(requestId));
    if (result.needsApproval && result.varianceId) {
      // Work pauses; the payer decides — from the lock screen if they like.
      await pushMoment(requestId, "payer", {
        title: "Price changed on site",
        body: `${input.reason} — new total $${Math.round(input.newTotalCents / 100)}. Approve to continue?`,
        path: `job/${requestId}`,
        oneTap: {
          kind: "decide_variance",
          choices: [
            { choice: "approve", label: "Approve" },
            { choice: "decline", label: "Keep booked scope" },
          ],
          meta: { varianceId: result.varianceId },
        },
        tag: `variance-${requestId}`,
      });
    }
  }
  return result;
}

export async function decideVarianceAction(token: string, varianceId: string, requestId: string, decision: "approve" | "decline") {
  const result = await (await getData()).decideVariance(token, varianceId, decision);
  if (result.ok) await poke(jobTopic(requestId));
  return result;
}

export async function getFastPayAction(token: string) {
  return (await getData()).getFastPay(token);
}

export async function setFastPayAction(token: string, enabled: boolean) {
  return (await getData()).setFastPay(token, enabled);
}

export async function generateDataPackAction(token: string, propertyId: string) {
  return (await getData()).generateReport(token, "property_data_pack", propertyId);
}

// ——— v8 R7: PM subscription + house tradies ———

export async function selectPmSubscriptionAction(token: string, sku: string) {
  return (await getData()).selectPmSubscription(token, sku);
}

export async function setHouseTradiesAction(token: string, input: { tradieContactIds: string[]; maxJobCents: number }) {
  return (await getData()).setHouseTradies(token, input);
}

// ——— v8 R6: feedback, performance, funding ———

export async function submitReviewAction(token: string, requestId: string, input: { rating: number; comment?: string }) {
  const result = await (await getData()).submitReview(token, requestId, input);
  if (result.ok) await poke(jobTopic(requestId));
  return result;
}

export async function respondToReviewAction(token: string, reviewId: string, response: string) {
  return (await getData()).respondToReview(token, reviewId, response);
}

export async function fundJobNowAction(token: string, requestId: string) {
  const result = await (await getData()).fundJobNow(token, requestId);
  if (result.ok) {
    await poke(jobTopic(requestId));
    await poke(tradeTopic());
  }
  return result;
}

// ——— v8 R3.5: parts to job ———

export async function setAssetDetailsAction(
  token: string,
  workOrderId: string,
  requestId: string,
  input: {
    manufacturer: string;
    model: string;
    serial: string;
    receipt?: { dataUrl: string; purchasedAt: string; warrantyMonths: number } | null;
  },
) {
  const result = await (await getData()).setAssetDetails(token, workOrderId, input);
  if (result.ok) await poke(jobTopic(requestId));
  return result;
}

export async function attachAssetReceiptAction(
  token: string,
  assetId: string,
  input: { dataUrl: string; purchasedAt: string; warrantyMonths: number },
) {
  return (await getData()).attachAssetReceipt(token, assetId, input);
}

export async function addJobPartAction(
  token: string,
  workOrderId: string,
  requestId: string,
  input: { label: string; costCents: number },
) {
  const result = await (await getData()).addJobPart(token, workOrderId, input);
  if (result.ok) {
    await poke(jobTopic(requestId));
    if (result.needsApproval && result.varianceId) {
      await pushMoment(requestId, "payer", {
        title: "A part is needed",
        body: `${input.label} — adds $${Math.round(input.costCents / 100)}. Approve to continue?`,
        path: `job/${requestId}`,
        oneTap: {
          kind: "decide_variance",
          choices: [
            { choice: "approve", label: "Approve part" },
            { choice: "decline", label: "Not this time" },
          ],
          meta: { varianceId: result.varianceId },
        },
        tag: `variance-${requestId}`,
      });
    }
  }
  return result;
}
