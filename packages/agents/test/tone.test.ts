import { describe, expect, it } from "vitest";
import { recallTone, type MemoryBackend } from "../src/memory/backend";

function backendReturning(content: string | null, opts?: { throwOnRecall?: boolean }): MemoryBackend {
  return {
    name: "honcho",
    async writeFacts() {
      return { written: 0, refused: 0 };
    },
    async recall() {
      if (opts?.throwOnRecall) throw new Error("honcho down");
      return content;
    },
  };
}

describe("recallTone", () => {
  it("returns a clipped tone hint", async () => {
    const tone = await recallTone(backendReturning("Prefers short messages. Gets anxious about strangers in the house."), {
      orgId: "org",
      contactId: "c1",
    });
    expect(tone).toContain("short messages");
  });

  it("drops a tone hint that smells like a ledger fact — DB is truth", async () => {
    const tone = await recallTone(backendReturning("They still owe $450 on the last invoice, due 12/08/2026."), {
      orgId: "org",
      contactId: "c1",
    });
    expect(tone).toBeNull();
  });

  it("degrades to null when Honcho is down (politely generic, never wrong)", async () => {
    const tone = await recallTone(backendReturning(null, { throwOnRecall: true }), { orgId: "org", contactId: "c1" });
    expect(tone).toBeNull();
  });

  it("clips runaway recalls to 400 chars", async () => {
    const tone = await recallTone(backendReturning("friendly ".repeat(100)), { orgId: "org", contactId: "c1" });
    expect(tone).not.toBeNull();
    expect(tone!.length).toBeLessThanOrEqual(401);
  });
});
