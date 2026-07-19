import "server-only";
import { aiClient } from "@/lib/ai";
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
import { getData } from "./data";
import type { DataSource, TradieLeadConversationContext } from "./data-types";

/**
 * Sally's second surface: a tradie's OWN AI receptionist, for their OWN
 * customers — not the tenant/property marketplace flow in sally.ts.
 * Deliberately simpler: no live price/ETA hints here (that needs
 * comparable-job data scoped by property, which a tradie's own lead
 * doesn't have) — the tradie's rate card still auto-populates a suggested
 * quote once the lead completes (packages/core, never AI-invented), which
 * is the core requirement. See docs/DEVELOPER_BRIEF_v3.md §5.
 */

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const EMBEDDING_MODEL = process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small";

function requireOpenRouterClient(): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  return aiClient();
}

export interface SendTradieLeadMessageResult {
  ok: boolean;
  error?: string;
  reply?: string;
  conversationId?: string;
  dispatched?: boolean;
}

export async function sendTradieLeadMessage(
  token: string,
  userMessage: string,
  conversationId?: string,
): Promise<SendTradieLeadMessageResult> {
  const data = await getData();
  const context = await data.startTradieLeadConversation(token, conversationId);
  if (!context) return { ok: false, error: "This link is invalid or has expired." };

  await data.appendSallyMessage(context.conversationId, "tenant", userMessage);

  let client: OpenRouterClient;
  try {
    client = requireOpenRouterClient();
  } catch (e) {
    console.error("[sallyTradie] OpenRouter not configured:", e);
    return { ok: false, error: "Sally isn't available right now — please try again shortly." };
  }
  const embedder = createOpenRouterEmbedder(client, EMBEDDING_MODEL);

  let memoryContext: string | undefined;
  try {
    const queryEmbedding = await embedder(userMessage);
    const chunks = await data.retrieveSallyMemory(context.contactId, queryEmbedding);
    memoryContext = formatMemoryContext(chunks);
  } catch (e) {
    console.warn("[sallyTradie] memory retrieval failed, continuing without it:", e);
  }

  const historyBeforeReply = await data.getSallyMessages(context.conversationId);
  const chatHistory: ChatMessage[] = historyBeforeReply
    .slice(0, -1)
    .map((m) => ({ role: m.role === "tenant" ? "user" : "assistant", content: m.content }));

  let reply: string;
  try {
    const turn = await runSallyTurn({
      client,
      model: DEFAULT_MODEL,
      context: {
        operating: { mode: "tradie_lead_capture", tradieBusinessName: context.tradieBusinessName },
        memoryContext,
      },
      history: chatHistory,
      userMessage,
    });
    reply = turn.reply;
  } catch (e) {
    console.error("[sallyTradie] chat completion failed:", e);
    return { ok: false, error: "Sally didn't catch that — mind trying again?", conversationId: context.conversationId };
  }
  await data.appendSallyMessage(context.conversationId, "sally", reply);

  const transcript = [...historyBeforeReply, { role: "sally" as const, content: reply }];
  let dispatched = false;
  let proposal: SallyProposal | undefined;
  try {
    proposal = await extractSallyProposal({ client, model: DEFAULT_MODEL, transcript });
  } catch (e) {
    console.warn("[sallyTradie] extraction failed, conversation continues:", e);
  }
  if (proposal?.extraction.readyToDispatch) {
    dispatched = await completeLead({ data, client, embedder, context, transcript, proposal });
  }

  return { ok: true, reply, conversationId: context.conversationId, dispatched };
}

interface CompleteParams {
  data: DataSource;
  client: OpenRouterClient;
  embedder: EmbedFn;
  context: TradieLeadConversationContext;
  transcript: Array<{ role: "tenant" | "sally"; content: string }>;
  proposal: SallyProposal;
}

async function completeLead(params: CompleteParams): Promise<boolean> {
  const { data, client, embedder, context, transcript, proposal } = params;
  try {
    const outcome = await data.completeTradieLead(context.conversationId, {
      title: proposal.extraction.title,
      description: proposal.extraction.description,
      category: proposal.extraction.category,
      customerName: proposal.extraction.customerName,
      aiMeta: proposal.aiMeta,
    });
    if (!outcome.ok) return false;

    try {
      const facts = await summarizeConversationForMemory({ client, model: DEFAULT_MODEL, transcript });
      if (facts.length > 0) {
        const chunks = await Promise.all(facts.map(async (f) => ({ ...f, embedding: await embedder(f.content) })));
        // Tradie leads have no property — scope memory to the customer contact only.
        await data.writeSallyMemory({
          conversationId: context.conversationId,
          contactId: context.contactId,
          chunks: chunks.map((c) => ({ ...c, scopeLevel: "contact" as const })),
        });
      }
    } catch (e) {
      console.warn("[sallyTradie] memory write failed:", e);
    }

    return true;
  } catch (e) {
    console.warn("[sallyTradie] lead completion failed, conversation continues:", e);
    return false;
  }
}
