"use server";

import { triageIntake, OpenRouterClient, SALLY_PROMPT_VERSION } from "@1pacent/agents";
import { getPlaybook, playbookForCategory, type RequestCategory } from "@1pacent/core";
import { getData } from "@/lib/data";
import { jobTopic, poke, tradeTopic } from "@/lib/poke";
import { triggerDispatchQuotes } from "@/lib/n8n";
import type { BookingPreview, BookJobResult, JobProjection } from "@/lib/data-types";

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
    const client = new OpenRouterClient({ apiKey });
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
  }
  return result;
}

export async function setOnlineAction(token: string, online: boolean) {
  const result = await (await getData()).setTradiePresence(token, online);
  await poke(tradeTopic());
  return result;
}

export async function onMyWayAction(token: string, workOrderId: string, requestId: string) {
  const result = await (await getData()).markOnMyWay(token, workOrderId);
  if (result.ok) await poke(jobTopic(requestId));
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
  if (result.ok) await poke(jobTopic(requestId));
  return result;
}

export async function verifySettleAction(token: string, requestId: string) {
  const result = await (await getData()).verifyAndSettle(token, requestId);
  if (result.ok) {
    await poke(jobTopic(requestId));
    await poke(tradeTopic());
  }
  return result;
}

export async function sallyVersion(): Promise<string> {
  return SALLY_PROMPT_VERSION;
}
