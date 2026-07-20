import { NextResponse, type NextRequest } from "next/server";
import { abrConfigured, lookupAbn, searchByName } from "@/lib/abr";

/**
 * Company / ABN autocomplete for the tradie & PM join forms. `?q=` searches
 * business names (or an 11-digit ABN); returns tiny candidate lists. Free
 * ABR web service, server-side GUID, honest 501 when unconfigured so the
 * form degrades to manual entry.
 */
export async function GET(request: NextRequest) {
  if (!abrConfigured()) {
    return NextResponse.json({ ok: false, error: "abn lookup not configured" }, { status: 501 });
  }
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ ok: true, results: [] });

  const digits = q.replace(/\s+/g, "");
  if (/^\d{11}$/.test(digits)) {
    const one = await lookupAbn(digits);
    return NextResponse.json({ ok: true, results: one ? [one] : [] });
  }
  const results = await searchByName(q.slice(0, 120));
  return NextResponse.json({ ok: true, results });
}
