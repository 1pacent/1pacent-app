import { describe, expect, it } from "vitest";
import { hashToken, issueToken, validateToken, type StoredToken } from "../src/tokens.js";

const NOW = new Date("2026-07-07T00:00:00Z");

function stored(overrides: Partial<StoredToken> & { token?: string } = {}): {
  raw: string;
  record: StoredToken;
} {
  const issued = issueToken(overrides.scope ?? "landlord_approval", NOW);
  return {
    raw: issued.token,
    record: {
      tokenHash: issued.tokenHash,
      scope: issued.scope,
      expiresAt: issued.expiresAt,
      usedAt: null,
      ...overrides,
    },
  };
}

describe("issueToken", () => {
  it("issues a url-safe token and stores only its hash", () => {
    const t = issueToken("tenant_intake", NOW);
    expect(t.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(t.tokenHash).toBe(hashToken(t.token));
    expect(t.tokenHash).not.toContain(t.token);
  });

  it("approval links expire in 72 hours; intake QR lives 90 days", () => {
    const approval = issueToken("landlord_approval", NOW);
    const intake = issueToken("tenant_intake", NOW);
    expect(approval.expiresAt.getTime() - NOW.getTime()).toBe(72 * 3_600_000);
    expect(intake.expiresAt.getTime() - NOW.getTime()).toBe(90 * 24 * 3_600_000);
  });
});

describe("validateToken", () => {
  it("accepts a valid token", () => {
    const { raw, record } = stored();
    expect(validateToken(raw, record, "landlord_approval", NOW)).toEqual({ ok: true });
  });

  it("rejects a missing record", () => {
    expect(validateToken("anything", null, "landlord_approval", NOW)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("rejects a wrong token without leaking why", () => {
    const { record } = stored();
    expect(validateToken("wrong-token", record, "landlord_approval", NOW)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("rejects an expired token", () => {
    const { raw, record } = stored();
    const later = new Date(record.expiresAt.getTime() + 1);
    expect(validateToken(raw, record, "landlord_approval", later)).toEqual({
      ok: false,
      error: "expired",
    });
  });

  it("rejects scope mismatch (an intake token cannot approve spend)", () => {
    const { raw, record } = stored({ scope: "tenant_intake" });
    expect(validateToken(raw, record, "landlord_approval", NOW)).toEqual({
      ok: false,
      error: "wrong_scope",
    });
  });

  it("approval links are single-use", () => {
    const { raw, record } = stored({ usedAt: new Date("2026-07-06T00:00:00Z") });
    expect(validateToken(raw, record, "landlord_approval", NOW)).toEqual({
      ok: false,
      error: "already_used",
    });
  });

  it("intake links remain reusable after use", () => {
    const { raw, record } = stored({ scope: "tenant_intake", usedAt: NOW });
    expect(validateToken(raw, record, "tenant_intake", NOW)).toEqual({ ok: true });
  });
});
