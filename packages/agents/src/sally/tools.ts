import type { AiGateway } from "../gateway";
import type { ToolDefinition, ToolLoopMessage } from "../openrouter-client";

/**
 * Sally's tool registry (Developer Brief v6 §2.1/§2.2). This package defines
 * tool *shapes* only — execution stays in the API tier, where each name is
 * bound to a DataSource call with the session token's scope baked in. The
 * model cannot name a property or portfolio it wasn't given: the data layer
 * is the security boundary, the prompt is a courtesy.
 *
 * Approvals, payments, dispatch and slot-confirm are deliberately NOT tools —
 * they are card actions (Product Design v6 §2.1). Sally can show the card;
 * the human taps it.
 */

export type SallyMode =
  | "tenant_intake"
  | "tradie_lead_capture"
  | "owner_portal"
  | "pm_portfolio"
  | "tradie_portal";

export interface SallyToolDefinition {
  name: string;
  description: string;
  /** JSON schema, strict mode (all fields required/nullable). */
  parameters: Record<string, unknown>;
  /** Which personas may even see this tool. */
  modes: readonly SallyMode[];
}

export interface SallyToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface SallyToolResult {
  name: string;
  result: unknown;
}

const NO_ARGS: Record<string, unknown> = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

export const SALLY_TOOLS: readonly SallyToolDefinition[] = [
  {
    name: "get_my_requests",
    description:
      "The tenant's own maintenance requests for their tenancy, with live status and history.",
    parameters: NO_ARGS,
    modes: ["tenant_intake"],
  },
  {
    name: "get_property_compliance",
    description:
      "Compliance status (smoke alarms, gas, electrical…) for the properties in scope: what was last checked, when, and what's next due.",
    parameters: NO_ARGS,
    modes: ["tenant_intake", "owner_portal", "pm_portfolio"],
  },
  {
    name: "get_spending_summary",
    description:
      "Maintenance spending across the properties in scope: totals by category over a period, with network-median comparisons where available.",
    parameters: {
      type: "object",
      properties: {
        period_months: {
          type: ["integer", "null"],
          description: "Look-back window in months; null for the default (12).",
        },
      },
      required: ["period_months"],
      additionalProperties: false,
    },
    modes: ["owner_portal", "pm_portfolio"],
  },
  {
    name: "get_asset_horizon",
    description:
      "Where each tracked asset sits on its replacement horizon (age vs effective life), so replacements can be planned instead of emergencies. Planning estimates, never a tax schedule.",
    parameters: NO_ARGS,
    modes: ["owner_portal", "pm_portfolio"],
  },
  {
    name: "get_obligations_calendar",
    description:
      "The regulatory obligations calendar for the properties in scope: what compliance checks fall due, month by month, with batchable groups flagged.",
    parameters: {
      type: "object",
      properties: {
        horizon_days: {
          type: ["integer", "null"],
          description: "How far ahead to look, in days; null for the default (120).",
        },
      },
      required: ["horizon_days"],
      additionalProperties: false,
    },
    modes: ["pm_portfolio", "owner_portal"],
  },
  {
    name: "generate_report",
    description:
      "Generate a downloadable report artifact (e.g. the Property Data Pack for an accountant). Returns a report id; the report lands on the canvas as a card.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["property_data_pack", "spending_summary", "obligations_calendar"],
          description: "Which report to generate.",
        },
        property_id: {
          type: ["string", "null"],
          description: "The property the report is about, when the scope has more than one; null to use the only/first property in scope.",
        },
      },
      required: ["kind", "property_id"],
      additionalProperties: false,
    },
    modes: ["owner_portal", "pm_portfolio"],
  },
  {
    name: "get_my_jobs",
    description: "The tradie's jobs: state, property, schedule — today's run and what's open.",
    parameters: NO_ARGS,
    modes: ["tradie_portal"],
  },
  {
    name: "get_my_accuracy",
    description:
      "The tradie's quote-vs-invoice accuracy trend and what it's doing to their trust score and ranking.",
    parameters: NO_ARGS,
    modes: ["tradie_portal"],
  },
] as const;

export function toolsForMode(mode: SallyMode): SallyToolDefinition[] {
  return SALLY_TOOLS.filter((t) => t.modes.includes(mode));
}

/** Max model→tools→model rounds per turn. Hard cap (Developer Brief v6 §2.1). */
export const MAX_TOOL_ROUNDS = 3;

export type SallyToolExecutor = (call: SallyToolCall) => Promise<SallyToolResult>;

export interface SallyToolTurnParams {
  gateway: AiGateway;
  model: string;
  mode: SallyMode;
  systemPrompt: string;
  /** Prior turns, oldest first — no system message. */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  /** Bound in the API tier with the session token's scope baked in. */
  execute: SallyToolExecutor;
}

export interface SallyToolTurnResult {
  reply: string;
  /** Every tool that actually ran this turn, in order — for events/ai_meta. */
  toolsUsed: SallyToolResult[];
}

/**
 * The tool loop: model → toolCalls → execute (API tier) → append results →
 * model → final reply. An episode turn simply produces no tool calls and
 * flows on unchanged. Unknown tool names are rejected, never executed.
 */
export async function runSallyToolTurn(params: SallyToolTurnParams): Promise<SallyToolTurnResult> {
  const tools = toolsForMode(params.mode);
  const allowedNames = new Set(tools.map((t) => t.name));
  const toolDefs: ToolDefinition[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  const messages: ToolLoopMessage[] = [
    { role: "system", content: params.systemPrompt },
    ...params.history,
    { role: "user", content: params.userMessage },
  ];

  const toolsUsed: SallyToolResult[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const turn = await params.gateway.chatWithTools({
      model: params.model,
      messages,
      tools: toolDefs,
    });

    if (!turn.toolCalls || turn.toolCalls.length === 0) {
      return { reply: turn.reply ?? "", toolsUsed };
    }

    if (turn.assistantMessage) messages.push(turn.assistantMessage);

    for (const call of turn.toolCalls) {
      if (!allowedNames.has(call.name)) {
        // Reject unknown/out-of-mode tools — tell the model, don't execute.
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: `unknown tool "${call.name}"` }),
        });
        continue;
      }
      const result = await params.execute({ name: call.name, arguments: call.arguments });
      toolsUsed.push(result);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result.result ?? null),
      });
    }
  }

  // Round cap hit: one final plain completion so the user always gets prose.
  const final = await params.gateway.chatWithTools({
    model: params.model,
    messages,
    tools: [],
  });
  return { reply: final.reply ?? "", toolsUsed };
}
