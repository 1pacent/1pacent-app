import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfigured, serviceClient } from "@/lib/supabase";

/**
 * Stripe webhook ingestion (Developer Brief v8 §4): payment truth always
 * lands in the ledger, even if the app tier hiccuped during settlement.
 * Signature-verified with STRIPE_WEBHOOK_SECRET; without it (or without
 * Supabase) the route answers 501 — the simulated PSP needs no webhooks.
 * n8n's V8-STRIPE-WEBHOOKS forwards here as backup transport only.
 */

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !supabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "stripe webhooks not configured" }, { status: 501 });
  }
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyStripeSignature(payload, signature, secret)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 400 });
  }

  const event = JSON.parse(payload) as {
    id: string;
    type: string;
    data: { object: { id: string; metadata?: { request_id?: string }; amount?: number } };
  };
  const intent = event.data.object;
  const pspRef = intent.id;

  const statusByEvent: Record<string, string> = {
    "payment_intent.amount_capturable_updated": "authorized",
    "payment_intent.succeeded": "captured",
    "payment_intent.canceled": "voided",
    "charge.dispute.created": "disputed",
  };
  const status = statusByEvent[event.type];
  if (!status) return NextResponse.json({ ok: true, ignored: event.type });

  const db = serviceClient();
  const { data: paymentRows } = await db
    .from("payments")
    .select("id, org_id, request_id, status")
    .eq("psp_ref", pspRef)
    .limit(1);
  const payment = (paymentRows ?? [])[0] as { id: string; org_id: string; request_id: string; status: string } | undefined;
  if (!payment) return NextResponse.json({ ok: true, unmatched: pspRef });

  // Transferred is terminal-good; a webhook never walks money truth backwards.
  if (payment.status === "transferred" && status !== "disputed") {
    return NextResponse.json({ ok: true, kept: "transferred" });
  }
  await db.from("payments").update({ status, updated_at: new Date().toISOString() }).eq("id", payment.id);
  await db.from("events").insert({
    org_id: payment.org_id,
    aggregate_type: "maintenance_request",
    aggregate_id: payment.request_id,
    event_type: "psp_webhook",
    actor_type: "system",
    actor_id: "stripe:webhook",
    payload: { stripeEvent: event.type, stripeEventId: event.id, pspRef, status },
  });
  return NextResponse.json({ ok: true });
}

/** Stripe signature scheme: `t=timestamp,v1=hmac_sha256(secret, "{t}.{payload}")`. */
function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=", 2) as [string, string]),
  ) as { t?: string; v1?: string };
  if (!parts.t || !parts.v1) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
