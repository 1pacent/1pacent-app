import { describe, expect, it, vi } from "vitest";
import { HermesProvider, OpenRouterProvider, resolveGateway } from "../src/gateway/index.js";
import { OpenRouterClient } from "../src/openrouter-client.js";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("resolveGateway", () => {
  it("returns null without an OpenRouter key (LLM-off mode)", () => {
    expect(resolveGateway({})).toBeNull();
  });

  it("returns the direct provider when only OPENROUTER_API_KEY is set", () => {
    const gw = resolveGateway({ OPENROUTER_API_KEY: "k" });
    expect(gw?.providerName).toBe("openrouter");
  });

  it("returns Hermes when HERMES_URL is set", () => {
    const gw = resolveGateway({ OPENROUTER_API_KEY: "k", HERMES_URL: "http://hermes:8642" });
    expect(gw?.providerName).toBe("hermes");
  });
});

describe("HermesProvider", () => {
  it("chats through the OpenAI-compatible endpoint when enabled", async () => {
    const fetchImpl = fakeFetch(200, { choices: [{ message: { content: "from hermes" } }] });
    const fallback = new OpenRouterProvider(new OpenRouterClient({ apiKey: "k", fetchImpl: fakeFetch(200, {}) }));
    const hermes = new HermesProvider({
      url: "http://hermes:8642",
      openAiCompat: true,
      fallback,
      fetchImpl,
    });
    const reply = await hermes.chat({ model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(reply).toBe("from hermes");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://hermes:8642/v1/chat/completions",
      expect.anything(),
    );
  });

  it("falls back to the direct provider after two transport failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hermesFetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const directFetch = fakeFetch(200, { choices: [{ message: { content: "from openrouter" } }] });
    const fallback = new OpenRouterProvider(new OpenRouterClient({ apiKey: "k", fetchImpl: directFetch }));
    const hermes = new HermesProvider({
      url: "http://hermes:8642",
      openAiCompat: true,
      fallback,
      fetchImpl: hermesFetch,
    });
    const reply = await hermes.chat({ model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(reply).toBe("from openrouter");
    expect(hermesFetch).toHaveBeenCalledTimes(2); // one retry
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("routes tool turns to the direct provider in invoke mode (no tool loop)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hermesFetch = vi.fn() as unknown as typeof fetch;
    const directFetch = fakeFetch(200, { choices: [{ message: { content: "tools via direct" } }] });
    const fallback = new OpenRouterProvider(new OpenRouterClient({ apiKey: "k", fetchImpl: directFetch }));
    const hermes = new HermesProvider({
      url: "http://hermes:8642",
      openAiCompat: false,
      fallback,
      fetchImpl: hermesFetch,
    });
    const turn = await hermes.chatWithTools({ model: "m", messages: [], tools: [] });
    expect(turn.reply).toBe("tools via direct");
    expect(hermesFetch).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("OpenRouterClient.chatWithTools", () => {
  it("parses tool calls from the response", async () => {
    const fetchImpl = fakeFetch(200, {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "c1", type: "function", function: { name: "get_my_jobs", arguments: '{"a":1}' } },
            ],
          },
        },
      ],
    });
    const client = new OpenRouterClient({ apiKey: "k", fetchImpl });
    const turn = await client.chatWithTools({ model: "m", messages: [], tools: [] });
    expect(turn.toolCalls).toEqual([{ id: "c1", name: "get_my_jobs", arguments: { a: 1 } }]);
    expect(turn.assistantMessage).toBeDefined();
  });

  it("returns a plain reply when the model calls no tools", async () => {
    const fetchImpl = fakeFetch(200, { choices: [{ message: { content: "plain" } }] });
    const client = new OpenRouterClient({ apiKey: "k", fetchImpl });
    const turn = await client.chatWithTools({ model: "m", messages: [], tools: [] });
    expect(turn.reply).toBe("plain");
    expect(turn.toolCalls).toBeUndefined();
  });
});
