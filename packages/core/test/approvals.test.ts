import { describe, expect, it } from "vitest";
import { decideApproval } from "../src/approvals/rules.js";
import {
  isUrgentCategory,
  VIC_URGENT_REPAIR_STATUTORY_CAP_CENTS,
} from "../src/requests/urgency.js";

describe("urgency classification", () => {
  it("classifies statutory urgent categories", () => {
    expect(isUrgentCategory("gas_leak")).toBe(true);
    expect(isUrgentCategory("burst_water_service")).toBe(true);
    expect(isUrgentCategory("failure_of_essential_service_hot_water")).toBe(true);
  });

  it("does not classify routine categories as urgent", () => {
    expect(isUrgentCategory("garden_external")).toBe(false);
    expect(isUrgentCategory("pest_control")).toBe(false);
    expect(isUrgentCategory("other")).toBe(false);
  });
});

describe("decideApproval", () => {
  const policy = { autoApproveCapCents: 50_000 }; // $500 cap

  it("auto-approves routine work under the cap", () => {
    expect(decideApproval({ category: "plumbing_general", estimateCents: 30_000, policy })).toEqual(
      { outcome: "auto_approved", reason: "under_cap" },
    );
  });

  it("routes routine work over the cap to the landlord", () => {
    expect(decideApproval({ category: "plumbing_general", estimateCents: 80_000, policy })).toEqual(
      { outcome: "requires_landlord_approval", reason: "over_cap" },
    );
  });

  it("boundary: exactly at cap auto-approves", () => {
    expect(
      decideApproval({ category: "plumbing_general", estimateCents: 50_000, policy }).outcome,
    ).toBe("auto_approved");
  });

  it("a zero cap means nothing routine auto-approves", () => {
    expect(
      decideApproval({
        category: "plumbing_general",
        estimateCents: 0,
        policy: { autoApproveCapCents: 0 },
      }).outcome,
    ).toBe("requires_landlord_approval");
  });

  it("urgent bypass approves over the routine cap, up to the statutory $2,500", () => {
    expect(decideApproval({ category: "gas_leak", estimateCents: 200_000, policy })).toEqual({
      outcome: "auto_approved",
      reason: "urgent_bypass",
    });
  });

  it("urgent work over the urgent cap still goes to the landlord", () => {
    expect(
      decideApproval({
        category: "gas_leak",
        estimateCents: VIC_URGENT_REPAIR_STATUTORY_CAP_CENTS + 1,
        policy,
      }),
    ).toEqual({ outcome: "requires_landlord_approval", reason: "urgent_over_cap" });
  });

  it("honours a configured urgent cap below the statutory default", () => {
    expect(
      decideApproval({
        category: "gas_leak",
        estimateCents: 150_000,
        policy: { autoApproveCapCents: 50_000, urgentCapCents: 100_000 },
      }).outcome,
    ).toBe("requires_landlord_approval");
  });

  it("rejects non-integer money", () => {
    expect(() =>
      decideApproval({ category: "other", estimateCents: 10.5, policy }),
    ).toThrow(RangeError);
  });
});
