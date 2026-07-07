import { assertCents, type Cents } from "../money";
import {
  isUrgentCategory,
  VIC_URGENT_REPAIR_STATUTORY_CAP_CENTS,
  type RequestCategory,
} from "../requests/urgency";

/**
 * Deterministic approval routing (Epic 3). This is "Leo" reduced to what
 * it actually is: rules, not an agent. The outcome feeds the state machine
 * (`auto_approve` by the system, or `request_approval` → magic link).
 */

export interface ApprovalPolicy {
  /** Per-property auto-approve cap set by the landlord/agency. 0 = never auto-approve. */
  autoApproveCapCents: Cents;
  /** Ceiling for the urgent bypass. Defaults to the VIC statutory $2,500. */
  urgentCapCents?: Cents;
}

export interface ApprovalInput {
  category: RequestCategory;
  estimateCents: Cents;
  policy: ApprovalPolicy;
}

export type ApprovalDecision =
  | { outcome: "auto_approved"; reason: "under_cap" | "urgent_bypass" }
  | { outcome: "requires_landlord_approval"; reason: "over_cap" | "urgent_over_cap" };

export function decideApproval(input: ApprovalInput): ApprovalDecision {
  const { category, estimateCents, policy } = input;
  assertCents(estimateCents);
  assertCents(policy.autoApproveCapCents);
  const urgentCap = policy.urgentCapCents ?? VIC_URGENT_REPAIR_STATUTORY_CAP_CENTS;
  assertCents(urgentCap);

  if (isUrgentCategory(category)) {
    return estimateCents <= urgentCap
      ? { outcome: "auto_approved", reason: "urgent_bypass" }
      : { outcome: "requires_landlord_approval", reason: "urgent_over_cap" };
  }

  return estimateCents <= policy.autoApproveCapCents && policy.autoApproveCapCents > 0
    ? { outcome: "auto_approved", reason: "under_cap" }
    : { outcome: "requires_landlord_approval", reason: "over_cap" };
}
