import { describe, expect, it, vi } from "vitest";
import { OpenRouterClient } from "../src/openrouter-client.js";
import { triageIntake } from "../src/sally/triage.js";

const GOOD = {
  title: "Leaking kitchen mixer tap",
  description: "Steady drip from the mixer base; visible pooling in photo.",
  category: "plumbing_general",
  suggestedPlaybook: "tap_leak",
  hazardWarning: null,
  confidence: 0.85,
};

function clientReturning(body: unknown, capture?: { body?: Record<string, unknown> }): OpenRouterClient {
  const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: string }) => {
    if (capture && init?.body) capture.body = JSON.parse(init.body) as Record<string, unknown>;
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
  return new OpenRouterClient({ apiKey: "k", fetchImpl });
}

describe("triageIntake", () => {
  it("parses a strict-JSON triage from text + photo", async () => {
    const capture: { body?: Record<string, unknown> } = {};
    const client = clientReturning(
      { choices: [{ message: { content: JSON.stringify(GOOD) } }] },
      capture,
    );
    const result = await triageIntake({
      client,
      model: "m",
      description: "tap won't stop dripping",
      photoUrl: "data:image/jpeg;base64,xxxx",
    });
    expect(result.triage.suggestedPlaybook).toBe("tap_leak");
    expect(result.triage.hazardWarning).toBeNull();
    // The photo travelled as a multimodal content part.
    const messages = capture.body!.messages as Array<{ role: string; content: unknown }>;
    const userContent = messages[1]!.content as Array<{ type: string }>;
    expect(userContent.some((p) => p.type === "image_url")).toBe(true);
    // Strict structured output was requested.
    expect((capture.body!.response_format as { type: string }).type).toBe("json_schema");
  });

  it("rejects a malformed model response", async () => {
    const client = clientReturning({
      choices: [{ message: { content: JSON.stringify({ ...GOOD, category: "not_a_category" }) } }],
    });
    await expect(
      triageIntake({ client, model: "m", description: "x" }),
    ).rejects.toThrow();
  });
});
