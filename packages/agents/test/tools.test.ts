import { describe, expect, it, vi } from "vitest";
import type { AiGateway } from "../src/gateway/index.js";
import type { ToolTurn } from "../src/openrouter-client.js";
import {
  MAX_TOOL_ROUNDS,
  runSallyToolTurn,
  toolsForMode,
  type SallyToolResult,
} from "../src/sally/tools.js";

function gatewayFromScript(turns: ToolTurn[]): AiGateway & { calls: number } {
  const g = {
    providerName: "openrouter" as const,
    calls: 0,
    chat: vi.fn(async () => "unused"),
    chatWithTools: vi.fn(async () => {
      const turn = turns[Math.min(g.calls, turns.length - 1)]!;
      g.calls += 1;
      return turn;
    }),
  };
  return g;
}

function call(id: string, name: string): NonNullable<ToolTurn["toolCalls"]>[number] {
  return { id, name, arguments: {} };
}

function assistantMsg(calls: Array<{ id: string; name: string }>): ToolTurn["assistantMessage"] {
  return {
    role: "assistant",
    content: null,
    tool_calls: calls.map((c) => ({
      id: c.id,
      type: "function" as const,
      function: { name: c.name, arguments: "{}" },
    })),
  };
}

describe("toolsForMode", () => {
  it("filters the catalogue by persona mode", () => {
    const tenant = toolsForMode("tenant_intake").map((t) => t.name);
    expect(tenant).toContain("get_my_requests");
    expect(tenant).toContain("get_property_compliance");
    expect(tenant).not.toContain("get_spending_summary");
    expect(tenant).not.toContain("get_my_jobs");

    const owner = toolsForMode("owner_portal").map((t) => t.name);
    expect(owner).toContain("get_spending_summary");
    expect(owner).toContain("get_asset_horizon");
    expect(owner).not.toContain("get_my_requests");

    const tradie = toolsForMode("tradie_portal").map((t) => t.name);
    expect(tradie).toEqual(["get_my_jobs", "get_my_accuracy"]);

    // Lead capture has no tools at all — it's a pure intake flow.
    expect(toolsForMode("tradie_lead_capture")).toEqual([]);
  });
});

describe("runSallyToolTurn", () => {
  it("executes tool calls and returns the narrated reply", async () => {
    const gateway = gatewayFromScript([
      { toolCalls: [call("c1", "get_spending_summary")], assistantMessage: assistantMsg([{ id: "c1", name: "get_spending_summary" }]) },
      { reply: "You've spent $4,300 this year." },
    ]);
    const executed: string[] = [];
    const result = await runSallyToolTurn({
      gateway,
      model: "m",
      mode: "owner_portal",
      systemPrompt: "sys",
      history: [],
      userMessage: "what have I spent?",
      execute: async (c): Promise<SallyToolResult> => {
        executed.push(c.name);
        return { name: c.name, result: { totalCents: 430_000 } };
      },
    });
    expect(executed).toEqual(["get_spending_summary"]);
    expect(result.reply).toBe("You've spent $4,300 this year.");
    expect(result.toolsUsed).toHaveLength(1);
  });

  it("rejects tools outside the mode without executing them", async () => {
    const gateway = gatewayFromScript([
      // Model (wrongly) asks for a tradie tool in owner mode.
      { toolCalls: [call("c1", "get_my_jobs")], assistantMessage: assistantMsg([{ id: "c1", name: "get_my_jobs" }]) },
      { reply: "I can't look that up here." },
    ]);
    const execute = vi.fn(async (c: { name: string }) => ({ name: c.name, result: null }));
    const result = await runSallyToolTurn({
      gateway,
      model: "m",
      mode: "owner_portal",
      systemPrompt: "sys",
      history: [],
      userMessage: "what are my jobs?",
      execute,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(result.toolsUsed).toHaveLength(0);
    expect(result.reply).toBe("I can't look that up here.");
  });

  it("caps tool rounds and still returns prose", async () => {
    // Model asks for tools forever; after MAX_TOOL_ROUNDS the loop forces a
    // final plain completion.
    const forever: ToolTurn = {
      toolCalls: [call("cx", "get_asset_horizon")],
      assistantMessage: assistantMsg([{ id: "cx", name: "get_asset_horizon" }]),
    };
    const gateway = {
      providerName: "openrouter" as const,
      calls: 0,
      chat: vi.fn(async () => "unused"),
      chatWithTools: vi.fn(async (params: { tools: unknown[] }) => {
        gateway.calls += 1;
        if (params.tools.length === 0) return { reply: "final answer" };
        return forever;
      }),
    };
    const result = await runSallyToolTurn({
      gateway,
      model: "m",
      mode: "owner_portal",
      systemPrompt: "sys",
      history: [],
      userMessage: "loop please",
      execute: async (c) => ({ name: c.name, result: [] }),
    });
    expect(result.reply).toBe("final answer");
    // MAX_TOOL_ROUNDS tool turns + 1 forced plain completion.
    expect(gateway.calls).toBe(MAX_TOOL_ROUNDS + 1);
    expect(result.toolsUsed).toHaveLength(MAX_TOOL_ROUNDS);
  });

  it("passes only mode-scoped tools to the model", async () => {
    let seenTools: string[] = [];
    const gateway = {
      providerName: "openrouter" as const,
      chat: vi.fn(async () => "unused"),
      chatWithTools: vi.fn(async (params: { tools: Array<{ name: string }> }) => {
        seenTools = params.tools.map((t) => t.name);
        return { reply: "ok" };
      }),
    };
    await runSallyToolTurn({
      gateway,
      model: "m",
      mode: "tradie_portal",
      systemPrompt: "sys",
      history: [],
      userMessage: "hi",
      execute: async (c) => ({ name: c.name, result: null }),
    });
    expect(seenTools).toEqual(["get_my_jobs", "get_my_accuracy"]);
  });
});
