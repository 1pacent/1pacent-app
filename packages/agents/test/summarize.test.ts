import { describe, expect, it, vi } from "vitest";
import { OpenRouterClient } from "../src/openrouter-client.js";
import { summarizeConversationForMemory } from "../src/memory/summarize.js";

function clientReturning(content: string): OpenRouterClient {
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  })) as unknown as typeof fetch;
  return new OpenRouterClient({ apiKey: "k", fetchImpl });
}

describe("summarizeConversationForMemory", () => {
  it("parses curated facts from the response", async () => {
    const client = clientReturning(
      JSON.stringify({
        facts: [{ scopeLevel: "contact", chunkType: "preference", content: "Prefers morning access" }],
      }),
    );
    const facts = await summarizeConversationForMemory({
      client,
      model: "m",
      transcript: [{ role: "tenant", content: "only mornings work for me" }],
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]!.content).toBe("Prefers morning access");
  });

  it("returns an empty array when nothing durable was found", async () => {
    const client = clientReturning(JSON.stringify({ facts: [] }));
    const facts = await summarizeConversationForMemory({ client, model: "m", transcript: [] });
    expect(facts).toEqual([]);
  });

  it("strips markdown fences before parsing", async () => {
    const client = clientReturning("```json\n" + JSON.stringify({ facts: [] }) + "\n```");
    const facts = await summarizeConversationForMemory({ client, model: "m", transcript: [] });
    expect(facts).toEqual([]);
  });
});
