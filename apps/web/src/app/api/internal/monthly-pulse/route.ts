import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { supabaseConfigured, serviceClient } from "@/lib/supabase";

/**
 * V8-MONTHLY-PULSE target (Developer Brief v8 §6): n8n's monthly cron calls
 * this header-auth'd route; each subscribed owner gets their Pulse — spend,
 * job count, record growth — straight from the ledger. Most owners live on
 * Moments and this digest alone, and that's success (Product Strategy §4.4).
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

  const { spendingForProperties } = await import("@/lib/supabase-data");
  const db = serviceClient();
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("contact_id, endpoint, keys, home_path, contacts!inner(id, kind)");
  let sent = 0;
  for (const sub of (subs ?? []) as Array<{
    contact_id: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
    home_path: string | null;
    contacts: { id: string; kind: string } | { id: string; kind: string }[];
  }>) {
    const contact = Array.isArray(sub.contacts) ? sub.contacts[0] : sub.contacts;
    if (contact?.kind !== "owner") continue;
    const { data: props } = await db.from("properties").select("id").eq("owner_contact_id", contact.id);
    const propertyIds = ((props ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (propertyIds.length === 0) continue;
    const spending = await spendingForProperties(db, propertyIds, 1);
    const { count: eventsCount } = await db
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
    const body =
      spending.jobCount > 0
        ? `${spending.jobCount} job${spending.jobCount === 1 ? "" : "s"} · $${Math.round(spending.totalCents / 100)} maintained · the record grew by ${eventsCount ?? 0} events.`
        : "A quiet month — nothing needed you. The record stands ready.";
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title: "Your monthly Pulse 🏡", body, url: sub.home_path ?? "/p", tag: "pulse" }),
        { TTL: 86_400 },
      );
      sent += 1;
    } catch (e) {
      console.warn("[pulse-digest] push failed:", e);
    }
  }
  return NextResponse.json({ ok: true, sent });
}
