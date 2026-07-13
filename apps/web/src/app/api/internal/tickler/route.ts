import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { supabaseConfigured, serviceClient } from "@/lib/supabase";

/**
 * V8-COMPLIANCE-TICKLER target (Developer Brief v8 §6): n8n's daily cron
 * calls this header-auth'd route; it computes each subscribed owner/PM's
 * 60/30/7-day obligation picture from the ledger and pushes a digest.
 * n8n is transport + schedule only — no reasoning, no public ingress.
 */

export async function POST(request: NextRequest) {
  const auth = request.headers.get("x-internal-auth");
  if (!process.env.N8N_INTERNAL_AUTH_TOKEN || auth !== process.env.N8N_INTERNAL_AUTH_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }
  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "live stack only" }, { status: 501 });
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ ok: false, error: "push not configured" }, { status: 501 });
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:mac@1pacent.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const { obligationsForProperties } = await import("@/lib/supabase-data");
  const db = serviceClient();
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("contact_id, endpoint, keys, home_path, contacts!inner(id, kind, full_name)");
  let sent = 0;
  for (const sub of (subs ?? []) as Array<{
    contact_id: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
    home_path: string | null;
    contacts: { id: string; kind: string; full_name: string } | { id: string; kind: string; full_name: string }[];
  }>) {
    const contact = Array.isArray(sub.contacts) ? sub.contacts[0] : sub.contacts;
    if (!contact || contact.kind === "tradie" || contact.kind === "tenant") continue;
    const { data: props } =
      contact.kind === "owner"
        ? await db.from("properties").select("id").eq("owner_contact_id", contact.id)
        : await db.from("properties").select("id").eq("pm_contact_id", contact.id);
    const propertyIds = ((props ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (propertyIds.length === 0) continue;
    const calendar = await obligationsForProperties(propertyIds, 60);
    if (calendar.totalObligations === 0) continue;
    const dueSoon = calendar.months
      .flatMap((m) => m.items)
      .filter((i) => i.daysUntilDue <= 7).length;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({
          title: "Compliance radar 📋",
          body: `${calendar.totalObligations} obligation${calendar.totalObligations === 1 ? "" : "s"} inside 60 days${dueSoon > 0 ? ` — ${dueSoon} due this week` : ""}.`,
          url: sub.home_path ?? "/p",
          tag: "tickler",
        }),
        { TTL: 43_200 },
      );
      sent += 1;
    } catch (e) {
      console.warn("[tickler] push failed:", e);
    }
  }
  return NextResponse.json({ ok: true, sent });
}
