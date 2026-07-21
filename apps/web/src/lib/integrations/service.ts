import "server-only";
import { serviceClient, supabaseConfigured } from "../supabase";
import { encryptJson, encryptionConfigured } from "./crypto";
import { getConnector, listConnectors } from "./registry";
import { runSync } from "./sync";
import type { JobOutcome, PmProvider, SyncResult } from "./types";

/**
 * Integration lifecycle service (v9 R9.2): connect / sync / write-back toggle /
 * disconnect / delete, plus the write-back gate. All credential handling goes
 * through AES-256-GCM encryption; write-back is OFF by default and never fires
 * unless explicitly enabled.
 */

export { listConnectors };

export function integrationsReady(): { db: boolean; encryption: boolean } {
  return { db: supabaseConfigured(), encryption: encryptionConfigured() };
}

export interface ConnectInput {
  pmContactId: string;
  orgId: string;
  provider: PmProvider;
  /** Provider credentials (e.g. { accessToken }). Encrypted before storage. */
  credentials: Record<string, unknown>;
}

export async function connectIntegration(input: ConnectInput): Promise<{ ok: boolean; error?: string; sync?: SyncResult }> {
  if (!supabaseConfigured()) return { ok: false, error: "DB not configured" };
  if (!encryptionConfigured()) return { ok: false, error: "INTEGRATION_ENC_KEY not set — cannot store credentials securely" };
  const db = serviceClient();
  const { data: row, error } = await db
    .from("pm_integrations")
    .upsert(
      {
        org_id: input.orgId,
        pm_contact_id: input.pmContactId,
        provider: input.provider,
        credentials_encrypted: encryptJson(input.credentials),
        status: "connected",
        write_back_enabled: false, // always off on (re)connect
        connected_at: new Date().toISOString(),
        disconnected_at: null,
      },
      { onConflict: "pm_contact_id,provider" },
    )
    .select("*")
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? "connect failed" };
  await db.from("pm_integration_events").insert({
    integration_id: row.id,
    pm_contact_id: input.pmContactId,
    provider: input.provider,
    event_type: "integration_connected",
    detail: { live: getConnector(input.provider).live },
  });
  const sync = await runSync(row as never);
  return { ok: true, sync };
}

export async function syncIntegration(integrationId: string): Promise<SyncResult> {
  const db = serviceClient();
  const { data: row } = await db.from("pm_integrations").select("*").eq("id", integrationId).maybeSingle();
  if (!row) return { ok: false, imported: 0, updated: 0, archived: 0, propertyCount: 0, overCap: false, cap: null, error: "not found" };
  return runSync(row as never);
}

export async function setWriteBack(integrationId: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const db = serviceClient();
  const { data: row, error } = await db
    .from("pm_integrations")
    .update({ write_back_enabled: enabled })
    .eq("id", integrationId)
    .select("pm_contact_id, provider")
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? "not found" };
  await db.from("pm_integration_events").insert({
    integration_id: integrationId,
    pm_contact_id: row.pm_contact_id,
    provider: row.provider,
    event_type: "writeback_toggled",
    detail: { enabled },
  });
  return { ok: true };
}

export async function disconnectIntegration(integrationId: string): Promise<{ ok: boolean; error?: string }> {
  const db = serviceClient();
  const { data: row, error } = await db
    .from("pm_integrations")
    .update({ status: "disconnected", credentials_encrypted: null, write_back_enabled: false, disconnected_at: new Date().toISOString() })
    .eq("id", integrationId)
    .select("pm_contact_id, provider")
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? "not found" };
  await db.from("pm_integration_events").insert({
    integration_id: integrationId,
    pm_contact_id: row.pm_contact_id,
    provider: row.provider,
    event_type: "integration_disconnected",
    detail: {},
  });
  return { ok: true };
}

/**
 * Deletion workflow: purge credentials AND the imported external linkage +
 * encrypted maintenance-contact data for this PM/provider. Property rows are
 * retained (they may carry live jobs/history) but stripped of external linkage
 * and any imported tenant data.
 */
export async function deleteIntegration(integrationId: string): Promise<{ ok: boolean; error?: string; propertiesStripped: number }> {
  const db = serviceClient();
  const { data: integ } = await db.from("pm_integrations").select("pm_contact_id, provider").eq("id", integrationId).maybeSingle();
  if (!integ) return { ok: false, error: "not found", propertiesStripped: 0 };
  const { data: props } = await db
    .from("properties")
    .select("id")
    .eq("external_source", integ.provider)
    .eq("pm_contact_id", integ.pm_contact_id);
  const ids = ((props ?? []) as Array<{ id: string }>).map((p) => p.id);
  for (const id of ids) {
    await db.from("properties").update({ external_ref: null, external_source: null, maintenance_contact_encrypted: null }).eq("id", id);
  }
  await db.from("pm_integration_events").insert({
    integration_id: integrationId,
    pm_contact_id: integ.pm_contact_id,
    provider: integ.provider,
    event_type: "integration_deleted",
    detail: { propertiesStripped: ids.length },
  });
  await db.from("pm_integrations").delete().eq("id", integrationId);
  return { ok: true, propertiesStripped: ids.length };
}

/**
 * The write-back GATE. Called on job completion. No-ops unless the property
 * was imported from a provider AND that connection has write-back explicitly
 * enabled AND the connector supports it. This is what keeps Zaivo from writing
 * to the PM's system by default.
 */
export async function maybeWriteBackJobOutcome(requestId: string): Promise<{ attempted: boolean; ok?: boolean }> {
  if (!supabaseConfigured() || !encryptionConfigured()) return { attempted: false };
  const db = serviceClient();
  const { data: req } = await db
    .from("maintenance_requests")
    .select("id, title, property_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { attempted: false };
  const { data: prop } = await db
    .from("properties")
    .select("external_source, external_ref, pm_contact_id")
    .eq("id", req.property_id)
    .maybeSingle();
  if (!prop?.external_source || !prop.external_ref) return { attempted: false };
  const { data: integ } = await db
    .from("pm_integrations")
    .select("id, provider, write_back_enabled, credentials_encrypted, status")
    .eq("pm_contact_id", prop.pm_contact_id)
    .eq("provider", prop.external_source)
    .maybeSingle();
  if (!integ || !integ.write_back_enabled || integ.status !== "connected" || !integ.credentials_encrypted) {
    return { attempted: false }; // default path: write-back stays OFF
  }
  const connector = getConnector(integ.provider as PmProvider);
  if (!connector.pushJobOutcome) return { attempted: false };
  try {
    const { decryptJson } = await import("./crypto");
    const outcome: JobOutcome = {
      externalPropertyId: prop.external_ref,
      title: req.title as string,
      completedAt: new Date().toISOString(),
      summary: "Completed via Zaivo. Evidence and invoice on the Zaivo record.",
    };
    const r = await connector.pushJobOutcome({ credentials: decryptJson(integ.credentials_encrypted) }, outcome);
    await db.from("pm_integration_events").insert({
      integration_id: integ.id,
      pm_contact_id: prop.pm_contact_id,
      provider: integ.provider,
      event_type: "writeback_pushed",
      detail: { requestId, ok: r.ok, error: r.error ?? null },
    });
    return { attempted: true, ok: r.ok };
  } catch (e) {
    console.warn("[integrations] write-back failed:", e);
    return { attempted: true, ok: false };
  }
}
