import { describe, expect, it } from "vitest";
import { asDate, asNumber, asString, firstOf } from "../src/parse.js";

describe("firstOf", () => {
  it("falls back across key aliases, skipping null/undefined", () => {
    expect(firstOf({ job_id: null, jobId: "J-1" }, ["job_id", "jobId", "id"])).toBe("J-1");
    expect(firstOf({ id: "J-2" }, ["job_id", "jobId", "id"])).toBe("J-2");
    expect(firstOf({}, ["job_id"])).toBeUndefined();
    expect(firstOf(null, ["job_id"])).toBeUndefined();
  });
});

describe("coercions", () => {
  it("asString accepts strings and finite numbers", () => {
    expect(asString("x")).toBe("x");
    expect(asString(42)).toBe("42");
    expect(asString(NaN)).toBeUndefined();
    expect(asString({})).toBeUndefined();
  });

  it("asNumber accepts numbers and numeric strings", () => {
    expect(asNumber(3)).toBe(3);
    expect(asNumber("3.5")).toBe(3.5);
    expect(asNumber("")).toBeUndefined();
    expect(asNumber("abc")).toBeUndefined();
  });

  it("asDate accepts Date instances and parseable strings", () => {
    expect(asDate(new Date("2026-01-01"))?.getUTCFullYear()).toBe(2026);
    expect(asDate("2026-01-01T00:00:00Z")?.getUTCFullYear()).toBe(2026);
    expect(asDate("not a date")).toBeUndefined();
  });
});
