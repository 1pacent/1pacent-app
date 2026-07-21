import "server-only";
import type { ConnectorContext, ExternalProperty, JobOutcome, PmConnector } from "../types";
import { assertNoForbiddenKeys, toExternalProperty, type RawPropertyLike } from "../pii";

/**
 * PropertyMe reference connector (v9 R9.2). Models the shape of PropertyMe's
 * partner REST API (OAuth2 bearer). This is the pattern every other connector
 * follows. Field mapping is confined to the PII allowlist via
 * `toExternalProperty`. Going live requires a PropertyMe developer-program
 * client + token; until credentials are present it reports `live: false` and
 * returns nothing rather than guessing.
 *
 * NOTE: exact endpoint paths/field names must be confirmed against PropertyMe's
 * current partner docs. The mapping below is the contract, not a guarantee.
 */

const BASE = "https://api.propertyme.com/v1"; // confirm per partner docs

interface PmCreds {
  accessToken?: string;
}

async function pmGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`PropertyMe ${path} → ${res.status}`);
  return res.json();
}

/** Map one PropertyMe property record to a raw allowlist-shaped object. Only
 * the maintenance-relevant fields are read; financial/identity fields on the
 * source record are simply never referenced. */
function mapRaw(rec: Record<string, unknown>): RawPropertyLike {
  const addr = (rec.Address ?? rec.address ?? {}) as Record<string, unknown>;
  return {
    externalId: rec.Id ?? rec.id,
    addressLine1: addr.Line1 ?? addr.street ?? rec.StreetAddress,
    addressLine2: addr.Line2 ?? null,
    suburb: addr.Suburb ?? addr.suburb,
    state: addr.State ?? addr.state,
    postcode: addr.Postcode ?? addr.postcode,
    propertyType: rec.PropertyType ?? rec.type ?? null,
    managedFromDate: rec.ManagementStartDate ?? null,
    // Access-coordination contact only (a name/phone), if the API exposes one.
    maintenanceContactName: (rec.PrimaryContactName as string) ?? null,
    maintenanceContactPhone: (rec.PrimaryContactPhone as string) ?? null,
    archived: rec.IsArchived === true || rec.ManagementStatus === "Ceased",
  };
}

export const propertymeConnector: PmConnector = {
  provider: "propertyme",
  displayName: "PropertyMe",
  live: false, // flip true once the partner client + token flow is finalised

  async listProperties(ctx: ConnectorContext): Promise<ExternalProperty[]> {
    const token = (ctx.credentials as PmCreds).accessToken;
    if (!token) return [];
    const data = (await pmGet(token, "/properties?managed=true")) as { Items?: Record<string, unknown>[] } | Record<string, unknown>[];
    const items = Array.isArray(data) ? data : (data.Items ?? []);
    const out: ExternalProperty[] = [];
    for (const rec of items) {
      assertNoForbiddenKeys(rec, "propertyme");
      const mapped = toExternalProperty(mapRaw(rec));
      if (mapped) out.push(mapped);
    }
    return out;
  },

  async pushJobOutcome(ctx: ConnectorContext, outcome: JobOutcome): Promise<{ ok: boolean; error?: string }> {
    // WRITE-BACK — only ever called when the connection has it enabled. Narrow
    // by design: a maintenance note, never money or tenancy mutation.
    const token = (ctx.credentials as PmCreds).accessToken;
    if (!token) return { ok: false, error: "no token" };
    try {
      const res = await fetch(`${BASE}/properties/${outcome.externalPropertyId}/maintenance-notes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          note: `Zaivo: ${outcome.title} completed ${outcome.completedAt}. ${outcome.summary}`,
        }),
      });
      return res.ok ? { ok: true } : { ok: false, error: `PropertyMe write-back ${res.status}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "write-back failed" };
    }
  },
};
