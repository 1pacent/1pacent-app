import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured, serviceClient } from "@/lib/supabase";
import { hubspotConfigured, upsertHubspotContact } from "@/lib/hubspot";

/**
 * Onboarding intake for the customer-facing site. Stores the lead
 * (join_requests on the live stack; in-memory in demo mode) and mirrors it
 * to HubSpot when the CRM token is configured. Never fails the human for a
 * CRM hiccup — the lead lands locally first.
 */

const PERSONAS = new Set(["renter", "owner", "landlord", "pm", "tradie"]);


export async function POST(request: NextRequest) {
  let body: {
    persona?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    suburb?: string;
    message?: string;
    addressText?: string | null;
    gnafPid?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const persona = String(body.persona ?? "").toLowerCase();
  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!PERSONAS.has(persona)) return NextResponse.json({ ok: false, error: "Pick who you are." }, { status: 400 });
  if (fullName.length < 2) return NextResponse.json({ ok: false, error: "Your name, please." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "That email doesn't look right." }, { status: 400 });
  }
  const phone = body.phone ? String(body.phone).trim().slice(0, 30) : null;
  const suburb = body.suburb ? String(body.suburb).trim().slice(0, 80) : null;
  const message = body.message ? String(body.message).trim().slice(0, 500) : null;
  const addressText = body.addressText ? String(body.addressText).trim().slice(0, 200) : null;
  const gnafPid = body.gnafPid && /^[A-Za-z0-9_]{6,40}$/.test(String(body.gnafPid)) ? String(body.gnafPid) : null;

  // CRM mirror (never blocks the lead landing).
  let hubspotId: string | null = null;
  if (hubspotConfigured()) {
    const [firstName, ...rest] = fullName.split(/\s+/);
    const hs = await upsertHubspotContact({
      email,
      firstName,
      lastName: rest.join(" ") || undefined,
      phone,
      persona,
      suburb,
    }).catch(() => ({ ok: false as const, error: "hubspot unreachable" }));
    if (hs.ok) hubspotId = hs.id;
    else console.warn("[join] HubSpot mirror failed:", hs.error);
  }

  if (supabaseConfigured()) {
    const db = serviceClient();
    const { error } = await db.from("join_requests").insert({
      persona,
      full_name: fullName,
      email,
      phone,
      suburb,
      message,
      address_text: addressText,
      gnaf_pid: gnafPid,
      hubspot_id: hubspotId,
    });
    if (error) {
      console.error("[join] insert failed:", error.message);
      // Table not migrated yet (42P01): the CRM mirror may still have landed
      // the lead — don't lose the human over an ops gap.
      if (error.code === "42P01" && hubspotId) return NextResponse.json({ ok: true, via: "crm" });
      return NextResponse.json({ ok: false, error: "Could not save that — try again shortly." }, { status: 500 });
    }
  } else {
    const { recordDemoJoinRequest } = await import("@/lib/store");
    recordDemoJoinRequest({ persona, fullName, email, phone, suburb, message });
  }
  return NextResponse.json({ ok: true });
}
