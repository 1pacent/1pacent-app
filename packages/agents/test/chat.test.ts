import { describe, expect, it, vi } from "vitest";
import { OpenRouterClient } from "../src/openrouter-client.js";
import { runSallyTurn } from "../src/sally/chat.js";

describe("runSallyTurn", () => {
  it("sends the system prompt, history, and new message, and returns the reply", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "Hi there!" } }] }) };
    }) as unknown as typeof fetch;
    const client = new OpenRouterClient({ apiKey: "k", fetchImpl });

    const result = await runSallyTurn({
      client,
      model: "m",
      context: { propertyAddress: "1 Test St" },
      history: [{ role: "user", content: "hi" }],
      userMessage: "my tap is leaking",
    });

    expect(result.reply).toBe("Hi there!");
    const messages = capturedBody!.messages as Array<{ role: string; content: string }>;
    expect(messages[0]!.role).toBe("system");
    expect(messages[0]!.content).toContain("1 Test St");
    expect(messages[1]).toEqual({ role: "user", content: "hi" });
    expect(messages[2]).toEqual({ role: "user", content: "my tap is leaking" });
  });

  it("includes memory context in the system prompt when provided", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
    }) as unknown as typeof fetch;
    const client = new OpenRouterClient({ apiKey: "k", fetchImpl });

    await runSallyTurn({
      client,
      model: "m",
      context: { propertyAddress: "1 Test St", memoryContext: "Prefers morning access" },
      history: [],
      userMessage: "hello",
    });

    const messages = capturedBody!.messages as Array<{ role: string; content: string }>;
    expect(messages[0]!.content).toContain("Prefers morning access");
  });
});
