import { NextResponse, type NextRequest } from "next/server";
import { getConnector } from "@/lib/integrations/registry";
import { serviceClient, supabaseConfigured } from "@/lib/supabase";
import { PM_PROVIDERS, type PmProvider } from "@/lib/integrations/types";

/**
 * Provider webhook ingress (v9 R9.2). Webhooks only ACCELERATE — scheduled
 * reconciliation is the source of truth — so this endpoint verifies (when the
 * connector supports it), records the signal, and lets reconciliation apply
 * the authoritative diff. Never trusts the payload for financial/PII data.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!(PM_PROVIDERS as readonly string[]).includes(provider)) {
    return NextResponse.json({ ok: false, error: "unknown provider" }, { status: 404 });
  }
  const connector = getConnector(provider as PmProvider);
  const raw = await request.text();

  if (connector.verifyWebhook && !connector.verifyWebhook(request.headers, raw)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  if (supabaseConfigured()) {
    await serviceClient()
      .from("pm_integration_events")
      .insert({ pm_contact_id: "00000000-0000-0000-0000-000000000000", provider, event_type: "webhook_received", detail: { bytes: raw.length } })
      .then(() => null, () => null);
  }

  // Real per-provider delta application lands with the live connector's
  // parseWebhook; until then, acknowledge — scheduled reconciliation catches it.
  return NextResponse.json({ ok: true, acknowledged: true });
}
