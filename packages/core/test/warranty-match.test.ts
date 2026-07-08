import { describe, expect, it } from "vitest";
import { findWarrantyMatch, type WarrantyCandidate } from "../src/warranty/match.js";

const now = new Date("2026-07-08T00:00:00Z");

describe("findWarrantyMatch", () => {
  it("returns null when there are no candidates", () => {
    expect(findWarrantyMatch([], "plumbing_general", now)).toBeNull();
  });

  it("returns null when no candidate matches the category", () => {
    const candidates: WarrantyCandidate[] = [
      {
        workOrderId: "wo-1",
        tradieContactId: "t-1",
        assetId: "asset-1",
        category: "electrical_general",
        warrantyExpiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    ];
    expect(findWarrantyMatch(candidates, "plumbing_general", now)).toBeNull();
  });

  it("returns null when the matching category's warranty has already expired", () => {
    const candidates: WarrantyCandidate[] = [
      {
        workOrderId: "wo-1",
        tradieContactId: "t-1",
        assetId: "asset-1",
        category: "plumbing_general",
        warrantyExpiresAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    expect(findWarrantyMatch(candidates, "plumbing_general", now)).toBeNull();
  });

  it("matches an open warranty for the same category", () => {
    const candidates: WarrantyCandidate[] = [
      {
        workOrderId: "wo-1",
        tradieContactId: "t-1",
        assetId: "asset-1",
        category: "plumbing_general",
        warrantyExpiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    ];
    expect(findWarrantyMatch(candidates, "plumbing_general", now)?.workOrderId).toBe("wo-1");
  });

  it("picks the most recently expiring warranty when several match", () => {
    const candidates: WarrantyCandidate[] = [
      {
        workOrderId: "wo-old",
        tradieContactId: "t-1",
        assetId: "asset-1",
        category: "plumbing_general",
        warrantyExpiresAt: new Date("2026-08-01T00:00:00Z"),
      },
      {
        workOrderId: "wo-new",
        tradieContactId: "t-2",
        assetId: "asset-2",
        category: "plumbing_general",
        warrantyExpiresAt: new Date("2027-06-01T00:00:00Z"),
      },
    ];
    expect(findWarrantyMatch(candidates, "plumbing_general", now)?.workOrderId).toBe("wo-new");
  });
});
