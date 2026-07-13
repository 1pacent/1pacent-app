import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Tokenised access for account-less personas (tenants, tradies, landlord
 * approval links) — data-model fix #5. Only the SHA-256 hash is stored;
 * the raw token appears once, in the link we send.
 */

export const TOKEN_SCOPES = [
  "tenant_intake",
  "request_status",
  "landlord_approval",
  "tradie_job",
  "tradie_portal",
  "pm_portfolio",
  "tradie_lead_intake",
  "owner_portal",
  "moment_action",
] as const;

export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** Default lifetimes per scope, in hours. */
export const TOKEN_TTL_HOURS: Record<TokenScope, number> = {
  tenant_intake: 24 * 90, // long-lived QR on the fridge
  request_status: 24 * 30,
  landlord_approval: 72, // approval links expire fast
  tradie_job: 24 * 14,
  tradie_portal: 24 * 365, // a tradie's durable "login" link — rate card, own AI receptionist
  pm_portfolio: 24 * 365, // a property manager's durable "informed, not gating" portfolio view
  tradie_lead_intake: 24 * 365, // a tradie's own shareable "talk to my business" link, for their own customers
  owner_portal: 24 * 365, // a landlord/owner's durable seat — same class as tradie_portal/pm_portfolio
  moment_action: 72, // a one-tap lock-screen decision; burns on use like an approval link
};

export interface IssuedToken {
  /** Raw token to embed in the link. Never persisted. */
  token: string;
  /** SHA-256 hex digest to store. */
  tokenHash: string;
  scope: TokenScope;
  expiresAt: Date;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueToken(scope: TokenScope, now: Date = new Date()): IssuedToken {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashToken(token),
    scope,
    expiresAt: new Date(now.getTime() + TOKEN_TTL_HOURS[scope] * 3_600_000),
  };
}

export interface StoredToken {
  tokenHash: string;
  scope: TokenScope;
  expiresAt: Date;
  usedAt?: Date | null;
  /** Approval links are single-use; intake/status/job links are reusable. */
}

const SINGLE_USE_SCOPES: readonly TokenScope[] = ["landlord_approval", "moment_action"];

export type TokenValidation =
  | { ok: true }
  | { ok: false; error: "not_found" | "expired" | "already_used" | "wrong_scope" };

export function validateToken(
  rawToken: string,
  stored: StoredToken | null,
  expectedScope: TokenScope,
  now: Date = new Date(),
): TokenValidation {
  if (!stored) return { ok: false, error: "not_found" };
  const presented = Buffer.from(hashToken(rawToken), "hex");
  const expected = Buffer.from(stored.tokenHash, "hex");
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return { ok: false, error: "not_found" };
  }
  if (stored.scope !== expectedScope) return { ok: false, error: "wrong_scope" };
  if (stored.expiresAt.getTime() < now.getTime()) return { ok: false, error: "expired" };
  if (stored.usedAt && SINGLE_USE_SCOPES.includes(stored.scope)) {
    return { ok: false, error: "already_used" };
  }
  return { ok: true };
}
