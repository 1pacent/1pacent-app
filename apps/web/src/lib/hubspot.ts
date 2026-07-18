import "server-only";

/**
 * HubSpot CRM seam (env-gated, same pattern as Stripe/Hermes): with
 * HUBSPOT_ACCESS_TOKEN set (a private-app token), join requests and network
 * contacts upsert into HubSpot as contacts; without it, every call no-ops
 * honestly and the admin dashboard says so. HubSpot is a mirror for sales
 * workflow — the ledger remains the source of truth.
 */

export function hubspotConfigured(): boolean {
  return Boolean(process.env.HUBSPOT_ACCESS_TOKEN);
}

export interface HubspotContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  /** Mapped to HubSpot's lifecycle + a custom-ish note via jobtitle. */
  persona?: string;
  suburb?: string | null;
}

export type HubspotResult = { ok: true; id: string } | { ok: false; error: string };

async function call(path: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body: json };
}

/** Create-or-update by email (HubSpot upsert via search + create/patch). */
export async function upsertHubspotContact(input: HubspotContactInput): Promise<HubspotResult> {
  if (!hubspotConfigured()) return { ok: false, error: "HubSpot not configured" };
  const properties: Record<string, string> = {
    email: input.email,
    ...(input.firstName ? { firstname: input.firstName } : {}),
    ...(input.lastName ? { lastname: input.lastName } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.persona ? { jobtitle: `1Pacent ${input.persona}` } : {}),
    ...(input.suburb ? { city: input.suburb } : {}),
  };
  const search = await call("/crm/v3/objects/contacts/search", "POST", {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: input.email }] }],
    limit: 1,
  });
  const existing = (search.body.results as Array<{ id: string }> | undefined)?.[0];
  if (existing) {
    const patch = await call(`/crm/v3/objects/contacts/${existing.id}`, "PATCH", { properties });
    return patch.ok ? { ok: true, id: existing.id } : { ok: false, error: hsError(patch.body) };
  }
  const created = await call("/crm/v3/objects/contacts", "POST", { properties });
  return created.ok && created.body.id
    ? { ok: true, id: String(created.body.id) }
    : { ok: false, error: hsError(created.body) };
}

function hsError(body: Record<string, unknown>): string {
  return typeof body.message === "string" ? body.message : "HubSpot call failed";
}
