import { describe, expect, it } from "vitest";
import { formatResponseWindow, scoreAvailability } from "../src/scheduling/score.js";

describe("scoreAvailability", () => {
  it("gives a neutral score when the tradie hasn't responded yet", () => {
    expect(
      scoreAvailability({ tradieRespondedWithinMinutes: null, matchesTenantPreferredWindow: false, currentOpenJobCount: 0 }),
    ).toBe(50);
  });

  it("rewards a fast response", () => {
    const fast = scoreAvailability({ tradieRespondedWithinMinutes: 5, matchesTenantPreferredWindow: false, currentOpenJobCount: 0 });
    const slow = scoreAvailability({ tradieRespondedWithinMinutes: 55, matchesTenantPreferredWindow: false, currentOpenJobCount: 0 });
    expect(fast).toBeGreaterThan(slow);
  });

  it("rewards matching the tenant's preferred window", () => {
    const matched = scoreAvailability({ tradieRespondedWithinMinutes: 10, matchesTenantPreferredWindow: true, currentOpenJobCount: 0 });
    const unmatched = scoreAvailability({ tradieRespondedWithinMinutes: 10, matchesTenantPreferredWindow: false, currentOpenJobCount: 0 });
    expect(matched).toBeGreaterThan(unmatched);
  });

  it("penalises a busy tradie", () => {
    const busy = scoreAvailability({ tradieRespondedWithinMinutes: 10, matchesTenantPreferredWindow: false, currentOpenJobCount: 10 });
    const free = scoreAvailability({ tradieRespondedWithinMinutes: 10, matchesTenantPreferredWindow: false, currentOpenJobCount: 0 });
    expect(busy).toBeLessThan(free);
  });

  it("stays within 0-100", () => {
    const score = scoreAvailability({ tradieRespondedWithinMinutes: 1000, matchesTenantPreferredWindow: false, currentOpenJobCount: 50 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("formatResponseWindow", () => {
  it("formats sub-hour windows in minutes", () => {
    expect(formatResponseWindow(40)).toBe("typically within about 40 minutes");
  });

  it("formats hour-scale windows in hours", () => {
    expect(formatResponseWindow(90)).toBe("typically within about 1.5 hours");
    expect(formatResponseWindow(180)).toBe("typically within about 3 hours");
  });

  it("formats multi-day windows in days", () => {
    expect(formatResponseWindow(60 * 24 * 2)).toBe("typically within about 2 days");
  });

  it("rejects non-positive input", () => {
    expect(() => formatResponseWindow(0)).toThrow(RangeError);
  });
});
