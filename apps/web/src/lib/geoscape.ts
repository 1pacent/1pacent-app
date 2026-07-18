import "server-only";

/**
 * Geoscape (G-NAF) address seam — the typo-killer. Env-gated on
 * GEOSCAPE_API_KEY like every other provider: absent, lookups return empty
 * and the UI falls back to free-text entry. The G-NAF PID is stored as the
 * property's durable identity; coordinates feed George's ETAs.
 */

export function geoscapeConfigured(): boolean {
  return Boolean(process.env.GEOSCAPE_API_KEY);
}

export interface AddressSuggestion {
  id: string;
  address: string;
}

export interface AddressDetail {
  gnafPid: string;
  formattedAddress: string;
  addressLine: string;
  suburb: string;
  state: string;
  postcode: string;
  lat: number;
  lng: number;
}

async function call(path: string): Promise<Record<string, unknown> | null> {
  const key = process.env.GEOSCAPE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.psma.com.au${path}`, {
      headers: { Authorization: key, Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[geoscape] ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.warn("[geoscape] unreachable:", e);
    return null;
  }
}

/** Type-ahead suggestions (Predictive API). */
export async function suggestAddresses(query: string, state?: string): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 4) return [];
  const params = new URLSearchParams({ query: q });
  if (state) params.set("stateTerritory", state);
  const body = await call(`/v1/predictive/address?${params.toString()}`);
  const suggest = (body?.suggest as Array<{ id: string; address: string }> | undefined) ?? [];
  return suggest.slice(0, 6).map((s) => ({ id: s.id, address: s.address }));
}

/** Full record for a picked suggestion: PID, components, coordinates. */
export async function getAddressDetail(id: string): Promise<AddressDetail | null> {
  if (!/^[A-Za-z0-9_]{6,40}$/.test(id)) return null;
  const body = await call(`/v1/predictive/address/${encodeURIComponent(id)}`);
  const address = body?.address as
    | {
        geometry?: { coordinates?: [number, number] };
        properties?: Record<string, unknown>;
      }
    | undefined;
  const props = address?.properties;
  const coords = address?.geometry?.coordinates;
  if (!props || !coords) return null;
  const formatted = String(props.formatted_address ?? "");
  const suburb = String(props.locality_name ?? "");
  const state = String(props.state_territory ?? "");
  const postcode = String(props.postcode ?? "");
  // Street-level line = formatted minus the ", SUBURB STATE POSTCODE" tail.
  const tail = `, ${suburb} ${state} ${postcode}`;
  const addressLine = formatted.endsWith(tail) ? formatted.slice(0, -tail.length) : formatted;
  return {
    gnafPid: String(props.address_identifier ?? id),
    formattedAddress: formatted,
    addressLine,
    suburb,
    state,
    postcode,
    lng: coords[0],
    lat: coords[1],
  };
}
