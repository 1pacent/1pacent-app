import "server-only";
import {
  OpenRouterClient,
  createOpenRouterEmbedder,
  extractSallyProposal,
  formatMemoryContext,
  runSallyTurn,
  summarizeConversationForMemory,
  type ChatMessage,
  type EmbedFn,
  type SallyProposal,
} from "@1pacent/agents";
import { estimatePriceBand, formatCents, formatResponseWindow } from "@1pacent/core";
import { getData } from "./data";
import type { DataSource, SallyConversationContext } from "./data-types";
import { triggerDispatchQuotes } from "./n8n";

/**
 * Orchestrates a single Sally turn: persistence lives in the DataSource
 * (data-types.ts), LLM/embedding calls live in @1pacent/agents, deterministic
 * pricing/ETA logic lives in @1pacent/core, and this module is the only
 * place that ties them together — matching the "thin action, logic lives
 * in core/agents/DataSource" convention used across the rest of the app.
 */

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const EMBEDDING_MODEL = process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";
/** Below this overall extraction confidence, don't trust the category enough to price against it. */
const MIN_CONFIDENCE_FOR_PRICE_BAND = 0.4;

function requireOpenRouterClient(): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  return new OpenRouterClient({ apiKey });
}

export interface SendSallyMessageResult {
  ok: boolean;
  error?: string;
  reply?: string;
  dispatched?: boolean;
}

export async function sendSallyMessage(token: string, userMessage: string): Promise<SendSallyMessageResult> {
  const data = await getData();
  const context = await data.startSallyConversation(token);
  if (!context) return { ok: false, error: "This link is invalid or has expired." };

  await data.appendSallyMessage(context.conversationId, "tenant", userMessage);

  let client: OpenRouterClient;
  try {
    client = requireOpenRouterClient();
  } catch (e) {
    console.error("[sally] OpenRouter not configured:", e);
    return { ok: false, error: "Sally isn't available right now — please try again shortly." };
  }
  const embedder = createOpenRouterEmbedder(client, EMBEDDING_MODEL);

  let memoryContext: string | undefined;
  try {
    const queryEmbedding = await embedder(userMessage);
    const chunks = await data.retrieveSallyMemory(context.contactId, queryEmbedding);
    memoryContext = formatMemoryContext(chunks);
  } catch (e) {
    console.warn("[sally] memory retrieval failed, continuing without it:", e);
  }

  const historyBeforeReply = await data.getSallyMessages(context.conversationId);
  const transcriptSoFar = historyBeforeReply.map((m) => ({ role: m.role, content: m.content }));

  // Try extraction BEFORE the reply, once there's at least one prior exchange — this is what
  // makes the price/ETA bands "live, on the call" rather than only known at the very end.
  // Reused below for the completion decision too, so this never runs twice per turn.
  let proposal: SallyProposal | undefined;
  if (historyBeforeReply.length >= 2) {
    try {
      proposal = await extractSallyProposal({ client, model: DEFAULT_MODEL, transcript: transcriptSoFar });
    } catch (e) {
      console.warn("[sally] mid-conversation extraction failed, continuing without price/ETA hints:", e);
    }
  }

  const { priceBandHint, etaHint } = await buildLiveHints(data, context, proposal);

  const chatHistory: ChatMessage[] = historyBeforeReply
    .slice(0, -1) // exclude the message we just appended — passed separately as userMessage
    .map((m) => ({ role: m.role === "tenant" ? "user" : "assistant", content: m.content }));

  let reply: string;
  try {
    const turn = await runSallyTurn({
      client,
      model: DEFAULT_MODEL,
      context: {
        operating: {
          mode: "tenant_intake",
          propertyAddress: context.propertyAddress,
          tenantFirstName: context.tenantFirstName,
        },
        memoryContext,
        priceBandHint,
        etaHint,
      },
      history: chatHistory,
      userMessage,
    });
    reply = turn.reply;
  } catch (e) {
    console.error("[sally] chat completion failed:", e);
    return { ok: false, error: "Sally didn't catch that — mind trying again?" };
  }
  await data.appendSallyMessage(context.conversationId, "sally", reply);

  const transcript = [...transcriptSoFar, { role: "sally" as const, content: reply }];
  let dispatched = false;
  if (proposal?.extraction.readyToDispatch) {
    dispatched = await completeConversation({ data, client, embedder, context, transcript, proposal });
  }

  return { ok: true, reply, dispatched };
}

async function buildLiveHints(
  data: DataSource,
  context: SallyConversationContext,
  proposal: SallyProposal | undefined,
): Promise<{ priceBandHint?: string; etaHint?: string }> {
  if (!proposal || !proposal.extraction.categoryConfident || proposal.extraction.confidence < MIN_CONFIDENCE_FOR_PRICE_BAND) {
    return {};
  }
  try {
    const [comparables, typicalMinutes] = await Promise.all([
      data.getComparableJobs(context.propertyId, proposal.extraction.category),
      data.getTypicalResponseMinutes(context.propertyId, proposal.extraction.category),
    ]);
    const band = estimatePriceBand(proposal.extraction.category, comparables);
    const priceBandHint = `${formatCents(band.lowCents)}–${formatCents(band.highCents)} (${band.confidence} confidence, based on ${band.evidenceCount} comparable job${band.evidenceCount === 1 ? "" : "s"})`;
    const etaHint = typicalMinutes !== null ? formatResponseWindow(typicalMinutes) : undefined;
    return { priceBandHint, etaHint };
  } catch (e) {
    console.warn("[sally] live price/ETA hint computation failed, continuing without it:", e);
    return {};
  }
}

interface CompleteParams {
  data: DataSource;
  client: OpenRouterClient;
  embedder: EmbedFn;
  context: SallyConversationContext;
  transcript: Array<{ role: "tenant" | "sally"; content: string }>;
  proposal: SallyProposal;
}

async function completeConversation(params: CompleteParams): Promise<boolean> {
  const { data, client, embedder, context, transcript, proposal } = params;
  try {
    const outcome = await data.completeSallyConversation(context.conversationId, {
      title: proposal.extraction.title,
      description: proposal.extraction.description,
      category: proposal.extraction.category,
      aiMeta: proposal.aiMeta,
    });
    if (!outcome.ok) return false;

    await writeMemorySafely({ data, client, embedder, context, transcript });
    await dispatchQuotesIfApproved(data, outcome.requestId, outcome.state);
    return true;
  } catch (e) {
    console.warn("[sally] completion failed, conversation continues:", e);
    return false;
  }
}

interface WriteMemoryParams {
  data: DataSource;
  client: OpenRouterClient;
  embedder: EmbedFn;
  context: SallyConversationContext;
  transcript: Array<{ role: "tenant" | "sally"; content: string }>;
}

async function writeMemorySafely(params: WriteMemoryParams): Promise<void> {
  const { data, client, embedder, context, transcript } = params;
  try {
    const facts = await summarizeConversationForMemory({ client, model: DEFAULT_MODEL, transcript });
    if (facts.length === 0) return;
    const chunks = await Promise.all(
      facts.map(async (f) => ({ ...f, embedding: await embedder(f.content) })),
    );
    await data.writeSallyMemory({
      conversationId: context.conversationId,
      contactId: context.contactId,
      propertyId: context.propertyId,
      chunks,
    });
  } catch (e) {
    console.warn("[sally] memory write failed:", e);
  }
}

async function dispatchQuotesIfApproved(data: DataSource, requestId: string, state: string): Promise<void> {
  if (state !== "approved") return;
  const result = await data.dispatchQuotesForRequest(requestId);
  if (!result.ok) {
    console.warn("[sally] dispatchQuotesForRequest failed:", result.error);
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
    console.warn("[sally] n8n dispatch-quotes notification failed:", e);
  }
}
