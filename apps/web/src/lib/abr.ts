import "server-only";

/**
 * ABN / company-name lookup via the Australian Business Register's ABN
 * Lookup web service (abr.business.gov.au). The service is FREE but requires
 * a registration GUID (also free, issued instantly at
 * abr.business.gov.au/Tools/WebServices). Set it as ABR_GUID.
 *
 * Env-gated exactly like Geoscape/HubSpot: with no GUID the UI falls back to
 * plain manual entry — we never block onboarding on a missing key, and we
 * never pay for lookups. The JSON callback endpoint keeps responses tiny.
 */

export function abrConfigured(): boolean {
  return Boolean(process.env.ABR_GUID);
}

export interface AbnResult {
  abn: string;
  name: string;
  state: string | null;
  postcode: string | null;
  status: string | null;
}

const BASE = "https://abr.business.gov.au/json";

/** Strip the `callback(...)` JSONP wrapper the ABR endpoint returns. */
function unwrap(text: string): unknown {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start + 1, end));
  } catch {
    return null;
  }
}

/** Search business/entity names → up to 10 candidates with their ABNs. */
export async function searchByName(query: string): Promise<AbnResult[]> {
  const guid = process.env.ABR_GUID;
  if (!guid || query.trim().length < 3) return [];
  const url = `${BASE}/MatchingNames.aspx?name=${encodeURIComponent(query.trim())}&maxResults=10&guid=${guid}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = unwrap(await res.text()) as { Names?: Array<Record<string, string>> } | null;
    return (data?.Names ?? [])
      .filter((n): n is Record<string, string> & { Abn: string } => Boolean(n.Abn))
      .map((n) => ({
        abn: n.Abn,
        name: n.Name ?? "",
        state: n.State ?? null,
        postcode: n.Postcode ?? null,
        status: n.AbnStatus ?? null,
      }));
  } catch {
    return [];
  }
}

/** Resolve a specific ABN → the legal/business name and status. */
export async function lookupAbn(abn: string): Promise<AbnResult | null> {
  const guid = process.env.ABR_GUID;
  const clean = abn.replace(/\s+/g, "");
  if (!guid || !/^\d{11}$/.test(clean)) return null;
  const url = `${BASE}/AbnDetails.aspx?abn=${clean}&guid=${guid}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const d = unwrap(await res.text()) as Record<string, string> | null;
    if (!d || !d.Abn) return null;
    const name = d.EntityName || d.BusinessName?.[0] || "";
    return {
      abn: d.Abn,
      name: typeof name === "string" ? name : String(name ?? ""),
      state: d.AddressState ?? null,
      postcode: d.AddressPostcode ?? null,
      status: d.AbnStatus ?? null,
    };
  } catch {
    return null;
  }
}
