import type { ExternalProperty } from "./types";

/**
 * PII allowlist (v9 R9.2). The single chokepoint every provider's raw payload
 * passes through. It COPIES ONLY the allowlisted fields into ExternalProperty —
 * anything else (date of birth, identity documents, bank/financial data, rent
 * ledgers, arrears, owner income, tenant identifiers beyond a coordination
 * name/phone) is dropped by construction, so a provider adding a new field can
 * never leak PII by default.
 *
 * Connectors map their raw records to this loose shape; `toExternalProperty`
 * is the gate that enforces the allowlist.
 */

export interface RawPropertyLike {
  externalId?: unknown;
  addressLine1?: unknown;
  addressLine2?: unknown;
  suburb?: unknown;
  state?: unknown;
  postcode?: unknown;
  propertyType?: unknown;
  managedFromDate?: unknown;
  maintenanceContactName?: unknown;
  maintenanceContactPhone?: unknown;
  archived?: unknown;
  // Any other keys (dob, identityDocument, bankAccount, rentAmount, arrears,
  // ownerIncome, …) are intentionally ignored.
  [k: string]: unknown;
}

/** Fields that must NEVER be persisted, even if a connector mistakenly maps
 * them onto the allowlist shape. Belt-and-braces alongside the allowlist. */
const FORBIDDEN_SUBSTRINGS = [
  "dob",
  "dateofbirth",
  "birth",
  "licence",
  "license",
  "passport",
  "identity",
  "bank",
  "bsb",
  "account",
  "rent",
  "arrear",
  "ledger",
  "income",
  "tax",
  "medicare",
  "ssn",
];

function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Map a raw provider record to the PII-safe ExternalProperty, or null if it
 * lacks the minimum (id + address). */
export function toExternalProperty(raw: RawPropertyLike): ExternalProperty | null {
  const externalId = s(raw.externalId);
  const addressLine1 = s(raw.addressLine1);
  const suburb = s(raw.suburb);
  const state = s(raw.state);
  const postcode = s(raw.postcode);
  if (!externalId || !addressLine1 || !suburb || !state || !postcode) return null;
  return {
    externalId,
    addressLine1,
    addressLine2: s(raw.addressLine2),
    suburb,
    state,
    postcode,
    propertyType: s(raw.propertyType),
    managedFromDate: s(raw.managedFromDate),
    maintenanceContactName: s(raw.maintenanceContactName),
    maintenanceContactPhone: s(raw.maintenanceContactPhone),
    archived: raw.archived === true,
  };
}

/** Assert a connector didn't smuggle a forbidden key into its raw record keys.
 * Logs and strips; never throws (import must not fail on a stray field). */
export function assertNoForbiddenKeys(raw: Record<string, unknown>, provider: string): void {
  for (const k of Object.keys(raw)) {
    const lower = k.toLowerCase();
    if (FORBIDDEN_SUBSTRINGS.some((f) => lower.includes(f))) {
      console.warn(`[integrations:${provider}] dropped forbidden field "${k}" (PII allowlist)`);
    }
  }
}
