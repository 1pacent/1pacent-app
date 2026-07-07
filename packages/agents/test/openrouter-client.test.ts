import { describe, expect, it, vi } from "vitest";
import { OpenRouterClient, OpenRouterError } from "../src/openrouter-client.js";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("OpenRouterClient.chatCompletion", () => {
  it("returns the message content on success", async () => {
    const fetchImpl = fakeFetch(200, { choices: [{ message: { content: "hello" } }] });
    const client = new OpenRouterClient({ apiKey: "k", fetchImpl });
    const result = await client.chatCompletion({ model: "m", messages: [] });
    expect(result.content).toBe("hello");
  });

  it("throws OpenRouterError on a non-2xx response", async () => {
    const fetchImpl = fakeFetch(401, { error: { message: "User not found." } });
    const client = new OpenRouterClient({ apiKey: "k", fetchImpl });
    await expect(client.chatCompletion({ model: "m", messages: [] })).rejects.toThrow(OpenRouterError);
  });

  it("throws when the response has no message content", async () => {
    const fetchImpl = fakeFetch(200, { choices: [{}] });
    const client = new OpenRouterClient({ apiKey: "k", fetchImpl });
    await expect(client.chatCompletion({ model: "m", messages: [] })).rejects.toThrow(OpenRouterError);
  });
});

describe("OpenRouterClient.embed", () => {
  it("returns the embedding vector on success", async () => {
    const fetchImpl = fakeFetch(200, { data: [{ embedding: [0.1, 0.2, 0.3] }] });
    const client = new OpenRouterClient({ apiKey: "k", fetchImpl });
    const result = await client.embed("text", "model");
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("throws OpenRouterError when no vector is returned", async () => {
    const fetchImpl = fakeFetch(200, { data: [{}] });
    const client = new OpenRouterClient({ apiKey: "k", fetchImpl });
    await expect(client.embed("text", "model")).rejects.toThrow(OpenRouterError);
  });
});
