import { describe, expect, it } from "vitest";
import { formatMemoryContext } from "../src/memory/format.js";

describe("formatMemoryContext", () => {
  it("returns undefined for no chunks", () => {
    expect(formatMemoryContext([])).toBeUndefined();
  });

  it("formats chunks as a bulleted list", () => {
    expect(formatMemoryContext([{ content: "Prefers mornings" }, { content: "Has a dog" }])).toBe(
      "- Prefers mornings\n- Has a dog",
    );
  });
});
