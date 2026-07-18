import { NextResponse, type NextRequest } from "next/server";
import { geoscapeConfigured, getAddressDetail, suggestAddresses } from "@/lib/geoscape";

/**
 * Address autocomplete for the customer surfaces. `?q=` → suggestions;
 * `?id=` → the picked address's full record (PID + coordinates). Server-side
 * key, tiny responses, honest 501 when the provider isn't configured.
 */

export async function GET(request: NextRequest) {
  if (!geoscapeConfigured()) {
    return NextResponse.json({ ok: false, error: "address lookup not configured" }, { status: 501 });
  }
  const q = request.nextUrl.searchParams.get("q");
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const detail = await getAddressDetail(id);
    return detail
      ? NextResponse.json({ ok: true, detail })
      : NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  if (!q || q.trim().length < 4) return NextResponse.json({ ok: true, suggestions: [] });
  const suggestions = await suggestAddresses(q.slice(0, 120));
  return NextResponse.json({ ok: true, suggestions });
}
