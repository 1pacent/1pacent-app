import "server-only";
import {
  buildSallySystemPrompt,
  resolveGateway,
  runSallyToolTurn,
  SALLY_PROMPT_VERSION,
  type SallyMode,
  type SallyOperatingContext,
} from "@1pacent/agents";
import { getData } from "./data";
import { createSallyToolExecutor } from "./sally-tools";

/**
 * Sally's seat modes (owner / PM / tradie) — free-flow questions answered
 * ONLY through scoped tools over the ledger (Product Design v6 §3). The
 * conversation history rides with the client for these seats (no episode to
 * persist); the facts always come from the DataSource, so nothing here is a
 * source of truth.
 *
 * Reasoning routes through the AI gateway (Product Brief v7): Hermes when
 * `HERMES_URL` is configured, direct OpenRouter otherwise — same behaviour.
 */

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const MAX_HISTORY_TURNS = 20;

export type SeatMode = Extract<SallyMode, "owner_portal" | "pm_portfolio" | "tradie_portal">;

export interface SeatMessageResult {
  ok: boolean;
  error?: string;
  reply?: string;
  /** Names of tools that actually ran — surfaced so the UI can say "checked the ledger". */
  toolsUsed?: string[];
}

export async function sendSeatMessage(
  mode: SeatMode,
  token: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userMessage: string,
): Promise<SeatMessageResult> {
  const data = await getData();

  // Token validation doubles as graph positioning — each context call is
  // scope-checked in the data layer.
  let operating: SallyOperatingContext;
  if (mode === "owner_portal") {
    const ctx = await data.getOwnerPortalContext(token);
    if (!ctx) return { ok: false, error: "This link is invalid or has expired." };
    operating = {
      mode,
      ownerFirstName: ctx.ownerName.split(" ")[0],
      propertyAddresses: ctx.properties.map((p) => `${p.address}, ${p.suburb}`),
    };
  } else if (mode === "pm_portfolio") {
    const ctx = await data.getPmPortfolioContext(token);
    if (!ctx) return { ok: false, error: "This link is invalid or has expired." };
    operating = { mode, pmFirstName: ctx.pmName.split(" ")[0], propertyCount: ctx.properties.length };
  } else {
    const ctx = await data.getTradiePortalContext(token);
    if (!ctx) return { ok: false, error: "This link is invalid or has expired." };
    operating = { mode, tradieBusinessName: ctx.tradieName };
  }

  const gateway = resolveGateway({
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    HERMES_URL: process.env.HERMES_URL,
    HERMES_API_KEY: process.env.HERMES_API_KEY,
    HERMES_AGENT: process.env.HERMES_AGENT,
    HERMES_OPENAI_COMPAT: process.env.HERMES_OPENAI_COMPAT,
  });
  if (!gateway) {
    return { ok: false, error: "Sally's offline — everything on the board still works." };
  }

  try {
    const turn = await runSallyToolTurn({
      gateway,
      model: DEFAULT_MODEL,
      mode,
      systemPrompt: buildSallySystemPrompt({ operating }),
      history: history.slice(-MAX_HISTORY_TURNS),
      userMessage,
      execute: createSallyToolExecutor(data, token),
    });
    // The audit trail for "answered from tools, not memory": every tool that
    // ran this turn, logged with the prompt version.
    console.log(
      `[sally-seat] mode=${mode} prompt=${SALLY_PROMPT_VERSION} provider=${gateway.providerName} tools=[${turn.toolsUsed.map((t) => t.name).join(",")}]`,
    );
    return { ok: true, reply: turn.reply, toolsUsed: turn.toolsUsed.map((t) => t.name) };
  } catch (e) {
    console.error("[sally-seat] turn failed:", e);
    return { ok: false, error: "Sally didn't catch that — mind trying again?" };
  }
}
