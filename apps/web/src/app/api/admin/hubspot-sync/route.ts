import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured, serviceClient } from "@/lib/supabase";
import { hubspotConfigured, upsertHubspotContact } from "@/lib/hubspot";

/**
 * One-way CRM push: every network contact with an email (owners, PMs,
 * tradies) plus any join requests not yet mirrored. Admin-cookie gated —
 * middleware doesn't cover /api, so the check lives here.
 */

export async function POST(request: NextRequest) {
  const key = request.cookies.get("fixbtn_admin")?.value;
  if (!process.env.ADMIN_ACCESS_KEY || key !== process.env.ADMIN_ACCESS_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }
  if (!hubspotConfigured()) {
    return NextResponse.json({ ok: false, error: "HubSpot not configured — add HUBSPOT_ACCESS_TOKEN." }, { status: 501 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Live stack only." }, { status: 501 });
  }
  const db = serviceClient();
  let synced = 0;
  let failed = 0;

  const { data: contacts } = await db.from("contacts").select("full_name, email, kind").not("email", "is", null);
  for (const c of (contacts ?? []) as Array<{ full_name: string; email: string; kind: string }>) {
    if (c.kind === "tenant") continue; // renters aren't sales contacts
    const [firstName, ...rest] = c.full_name.split(/\s+/);
    const r = await upsertHubspotContact({
      email: c.email,
      firstName,
      lastName: rest.join(" ") || undefined,
      persona: c.kind,
    }).catch(() => ({ ok: false as const, error: "unreachable" }));
    if (r.ok) synced += 1;
    else failed += 1;
  }

  const { data: joins } = await db
    .from("join_requests")
    .select("id, persona, full_name, email, phone, suburb")
    .is("hubspot_id", null);
  for (const j of (joins ?? []) as Array<{ id: string; persona: string; full_name: string; email: string; phone: string | null; suburb: string | null }>) {
    const [firstName, ...rest] = j.full_name.split(/\s+/);
    const r = await upsertHubspotContact({
      email: j.email,
      firstName,
      lastName: rest.join(" ") || undefined,
      phone: j.phone,
      persona: j.persona,
      suburb: j.suburb,
    }).catch(() => ({ ok: false as const, error: "unreachable" }));
    if (r.ok) {
      synced += 1;
      await db.from("join_requests").update({ hubspot_id: r.id }).eq("id", j.id);
    } else failed += 1;
  }

  return NextResponse.json({ ok: true, synced, failed });
}
