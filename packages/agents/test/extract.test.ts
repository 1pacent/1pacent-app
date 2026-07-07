import { describe, expect, it, vi } from "vitest";
import { OpenRouterClient } from "../src/openrouter-client.js";
import { extractSallyProposal } from "../src/sally/extract.js";

function clientReturning(content: string): OpenRouterClient {
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  })) as unknown as typeof fetch;
  return new OpenRouterClient({ apiKey: "k", fetchImpl });
}

const VALID_EXTRACTION = {
  title: "Leaking kitchen tap",
  description: "The kitchen tap has been dripping constantly for two days.",
  category: "plumbing_general",
  tenantStatedUrgency: "soon",
  readyToDispatch: true,
  confidence: 0.9,
};

describe("extractSallyProposal", () => {
  it("parses a clean JSON response", async () => {
    const client = clientReturning(JSON.stringify(VALID_EXTRACTION));
    const result = await extractSallyProposal({ client, model: "m", transcript: [] });
    expect(result.extraction.title).toBe("Leaking kitchen tap");
    expect(result.aiMeta.confidence).toBe(0.9);
    expect(result.aiMeta.model).toBe("m");
  });

  it("strips markdown fences before parsing", async () => {
    const client = clientReturning("```json\n" + JSON.stringify(VALID_EXTRACTION) + "\n```");
    const result = await extractSallyProposal({ client, model: "m", transcript: [] });
    expect(result.extraction.category).toBe("plumbing_general");
  });

  it("throws on a payload that fails schema validation", async () => {
    const client = clientReturning(JSON.stringify({ ...VALID_EXTRACTION, category: "not_a_real_category" }));
    await expect(extractSallyProposal({ client, model: "m", transcript: [] })).rejects.toThrow();
  });

  it("throws on non-JSON content", async () => {
    const client = clientReturning("sorry, I can't help with that");
    await expect(extractSallyProposal({ client, model: "m", transcript: [] })).rejects.toThrow();
  });
});
