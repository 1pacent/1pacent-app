import { describe, expect, it, vi } from "vitest";
import { HonchoBackend, isGuardedFact, resolveMemoryBackend } from "../src/memory/backend.js";

describe("isGuardedFact — the DB-is-truth boundary (Product Brief v7 §2)", () => {
  it("refuses facts tagged money/date/compliance/asset", () => {
    for (const tag of ["money", "date", "compliance", "asset"]) {
      expect(isGuardedFact({ content: "anything", tags: [tag] })).toBe(true);
    }
  });

  it("refuses money-shaped content even untagged", () => {
    expect(isGuardedFact({ content: "the invoice was $450" })).toBe(true);
    expect(isGuardedFact({ content: "they paid 300 dollars last time" })).toBe(true);
    expect(isGuardedFact({ content: "quoted 250 for the job" })).toBe(true);
  });

  it("refuses compliance- and date-shaped content", () => {
    expect(isGuardedFact({ content: "smoke alarm check due next month" })).toBe(true);
    expect(isGuardedFact({ content: "gas check certificate on file" })).toBe(true);
    expect(isGuardedFact({ content: "lease expires 01/03/2027" })).toBe(true);
  });

  it("allows genuine conversational context", () => {
    expect(isGuardedFact({ content: "prefers morning access, has a friendly dog" })).toBe(false);
    expect(isGuardedFact({ content: "speaks softly, likes updates by text" })).toBe(false);
  });
});

describe("HonchoBackend", () => {
  it("writes only unguarded facts and reports refusals", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch;
    const backend = new HonchoBackend({ baseUrl: "http://honcho:8000", fetchImpl });
    const result = await backend.writeFacts({
      orgId: "org1",
      contactId: "contact1",
      conversationId: "conv1",
      facts: [
        { content: "prefers morning access" },
        { content: "invoice was $450" }, // guarded — must be refused
      ],
    });
    expect(result).toEqual({ written: 1, refused: 1 });
    const body = JSON.parse((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body as string) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]!.content).toBe("prefers morning access");
    warn.mockRestore();
  });

  it("writes nothing when every fact is guarded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const backend = new HonchoBackend({ baseUrl: "http://honcho:8000", fetchImpl });
    const result = await backend.writeFacts({
      orgId: "org1",
      contactId: "contact1",
      conversationId: "conv1",
      facts: [{ content: "rent is due on the 3rd", tags: ["money"] }],
    });
    expect(result).toEqual({ written: 0, refused: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("resolveMemoryBackend", () => {
  it("is null without HONCHO_BASE_URL (pgvector default)", () => {
    expect(resolveMemoryBackend({})).toBeNull();
  });
  it("returns Honcho when configured", () => {
    expect(resolveMemoryBackend({ HONCHO_BASE_URL: "http://honcho:8000" })?.name).toBe("honcho");
  });
});
