import type { RequestCategory } from "../requests/urgency";

/**
 * Post-quote approval policy (Developer Brief v4 §3) — distinct from
 * `decideApproval` in rules.ts, which gates whether the request should even
 * proceed to getting quotes. This engine answers a different question: now
 * that a real quote exists, does it need a human, or does it satisfy a rule
 * the landlord has already set ("pre-approve anything under $X")?
 *
 * Rules are evaluated in the given order (caller sorts by priority first).
 * The first rule that isn't excluded by category and whose thresholds are
 * satisfied wins. No match => a human decides, same as today.
 */

export interface ApprovalPolicyRule {
  /** null = no price ceiling. */
  maxTotalCents: number | null;
  /** null = no trust requirement. */
  minTrustScore: number | null;
  /** Categories this rule never applies to, regardless of price/trust (safety override). */
  excludeCategories: readonly RequestCategory[];
}

export interface PolicyEvaluationInput {
  category: RequestCategory;
  totalCents: number;
  trustScore: number;
}

export interface PolicyEvaluationResult {
  autoApprove: boolean;
  matchedRuleIndex: number | null;
}

export function evaluateApprovalPolicy(
  rules: readonly ApprovalPolicyRule[],
  input: PolicyEvaluationInput,
): PolicyEvaluationResult {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.excludeCategories.includes(input.category)) continue;
    if (rule.maxTotalCents !== null && input.totalCents > rule.maxTotalCents) continue;
    if (rule.minTrustScore !== null && input.trustScore < rule.minTrustScore) continue;
    return { autoApprove: true, matchedRuleIndex: i };
  }
  return { autoApprove: false, matchedRuleIndex: null };
}
