import { describe, expect, it } from "vitest";
import { evaluateApprovalPolicy, type ApprovalPolicyRule } from "../src/approvals/policy.js";

describe("evaluateApprovalPolicy", () => {
  it("auto-approves when the only rule's price cap is satisfied", () => {
    const rules: ApprovalPolicyRule[] = [
      { maxTotalCents: 30_000, minTrustScore: null, excludeCategories: [] },
    ];
    const result = evaluateApprovalPolicy(rules, {
      category: "plumbing_general",
      totalCents: 29_000,
      trustScore: 40,
    });
    expect(result).toEqual({ autoApprove: true, matchedRuleIndex: 0 });
  });

  it("does not auto-approve when the price exceeds every rule's cap", () => {
    const rules: ApprovalPolicyRule[] = [
      { maxTotalCents: 30_000, minTrustScore: null, excludeCategories: [] },
    ];
    const result = evaluateApprovalPolicy(rules, {
      category: "plumbing_general",
      totalCents: 30_001,
      trustScore: 100,
    });
    expect(result).toEqual({ autoApprove: false, matchedRuleIndex: null });
  });

  it("requires the trust threshold when a rule sets one", () => {
    const rules: ApprovalPolicyRule[] = [
      { maxTotalCents: 80_000, minTrustScore: 80, excludeCategories: [] },
    ];
    expect(
      evaluateApprovalPolicy(rules, { category: "electrical_general", totalCents: 50_000, trustScore: 79 }),
    ).toEqual({ autoApprove: false, matchedRuleIndex: null });
    expect(
      evaluateApprovalPolicy(rules, { category: "electrical_general", totalCents: 50_000, trustScore: 80 }),
    ).toEqual({ autoApprove: true, matchedRuleIndex: 0 });
  });

  it("excluded categories never auto-approve regardless of price or trust", () => {
    const rules: ApprovalPolicyRule[] = [
      {
        maxTotalCents: null,
        minTrustScore: null,
        excludeCategories: ["dangerous_electrical_fault", "gas_leak"],
      },
    ];
    const result = evaluateApprovalPolicy(rules, {
      category: "dangerous_electrical_fault",
      totalCents: 1,
      trustScore: 100,
    });
    expect(result).toEqual({ autoApprove: false, matchedRuleIndex: null });
  });

  it("falls through to a later, looser rule when an earlier one doesn't match", () => {
    const rules: ApprovalPolicyRule[] = [
      { maxTotalCents: 30_000, minTrustScore: null, excludeCategories: [] },
      { maxTotalCents: 80_000, minTrustScore: 80, excludeCategories: [] },
    ];
    const result = evaluateApprovalPolicy(rules, {
      category: "plumbing_general",
      totalCents: 50_000,
      trustScore: 85,
    });
    expect(result).toEqual({ autoApprove: true, matchedRuleIndex: 1 });
  });

  it("a rule with no cap and no trust requirement matches anything not excluded", () => {
    const rules: ApprovalPolicyRule[] = [{ maxTotalCents: null, minTrustScore: null, excludeCategories: [] }];
    const result = evaluateApprovalPolicy(rules, {
      category: "garden_external",
      totalCents: 999_999,
      trustScore: 0,
    });
    expect(result).toEqual({ autoApprove: true, matchedRuleIndex: 0 });
  });

  it("returns no match for an empty rule set", () => {
    const result = evaluateApprovalPolicy([], { category: "other", totalCents: 100, trustScore: 100 });
    expect(result).toEqual({ autoApprove: false, matchedRuleIndex: null });
  });
});
