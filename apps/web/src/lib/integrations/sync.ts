import "server-only";
import { serviceClient } from "../supabase";
import { getConnector } from "./registry";
import { decryptJson, encryptSecret } from "./crypto";
import type { ExternalProperty, PmProvider, SyncResult } from "./types";

/**
 * Sync orchestrator (v9 R9.2): bulk import + reconciliation + property-count →
 * tier-cap check. Reconciliation is the source of truth (webhooks only
 * accelerate it). Imported properties carry `external_source`/`external_ref`
 * so re-syncs dedupe and can mark archived.
 */

interface IntegrationRow {
  id: string;
  org_id: string;
  pm_contact_id: string;
  provider: PmProvider;
  credentials_encrypted: string | null;
  status: string;
}

async function logEvent(integrationId: string, pmContactId: string, provider: string, type: string, detail: unknown) {
  await serviceClient()
    .from("pm_integration_events")
    .insert({ integration_id: integrationId, pm_contact_id: pmContactId, provider, event_type: type, detail });
}

/** Upsert one external property into `properties`, matched by source+ref.
 * Returns "imported" | "updated". Maintenance contact is encrypted at rest. */
async function upsertProperty(
  db: ReturnType<typeof serviceClient>,
  integ: IntegrationRow,
  ext: ExternalProperty,
): Promise<"imported" | "updated"> {
  const { data: existing } = await db
    .from("properties")
    .select("id")
    .eq("external_source", integ.provider)
    .eq("external_ref", ext.externalId)
    .eq("pm_contact_id", integ.pm_contact_id)
    .maybeSingle();

  const contact =
    ext.maintenanceContactName || ext.maintenanceContactPhone
      ? encryptSecret(JSON.stringify({ name: ext.maintenanceContactName, phone: ext.maintenanceContactPhone }))
      : null;

  const row = {
    org_id: integ.org_id,
    pm_contact_id: integ.pm_contact_id,
    address_line1: ext.addressLine1,
    address_line2: ext.addressLine2 ?? null,
    suburb: ext.suburb,
    state: ext.state,
    postcode: ext.postcode,
    jurisdiction: ext.state,
    external_source: integ.provider,
    external_ref: ext.externalId,
    maintenance_contact_encrypted: contact,
  };

  if (existing) {
    await db.from("properties").update(row).eq("id", existing.id);
    return "updated";
  }
  await db.from("properties").insert(row);
  return "imported";
}

/** Full sync for one connection: pull → PII-map (done in the connector) →
 * upsert → mark archived → cap check. */
export async function runSync(integration: IntegrationRow): Promise<SyncResult> {
  const db = serviceClient();
  const connector = getConnector(integration.provider);
  if (!integration.credentials_encrypted) {
    return emptyResult("no credentials");
  }
  let externals: ExternalProperty[] = [];
  try {
    const credentials = decryptJson(integration.credentials_encrypted);
    externals = await connector.listProperties({ credentials });
  } catch (e) {
    await db.from("pm_integrations").update({ status: "error", last_error: String(e) }).eq("id", integration.id);
    return emptyResult(e instanceof Error ? e.message : "sync failed");
  }

  let imported = 0;
  let updated = 0;
  const seenRefs = new Set<string>();
  for (const ext of externals) {
    if (ext.archived) continue;
    seenRefs.add(ext.externalId);
    const r = await upsertProperty(db, integration, ext);
    if (r === "imported") imported++;
    else updated++;
  }

  // Archived reconciliation: properties we previously imported for this PM that
  // the provider no longer returns (or flagged ceased) get their external link
  // cleared (we keep the property row — it may carry live jobs/history).
  const { data: mine } = await db
    .from("properties")
    .select("id, external_ref")
    .eq("external_source", integration.provider)
    .eq("pm_contact_id", integration.pm_contact_id);
  let archived = 0;
  for (const p of (mine ?? []) as Array<{ id: string; external_ref: string }>) {
    if (!seenRefs.has(p.external_ref)) {
      await db.from("properties").update({ external_ref: null, external_source: null }).eq("id", p.id);
      archived++;
    }
  }

  // Property count → tier cap check.
  const { count } = await db
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("pm_contact_id", integration.pm_contact_id);
  const propertyCount = count ?? 0;
  const { data: sub } = await db
    .from("pm_subscriptions")
    .select("property_cap")
    .eq("pm_contact_id", integration.pm_contact_id)
    .maybeSingle();
  const cap = sub ? Number(sub.property_cap) : null;
  const overCap = cap !== null && propertyCount > cap;

  await db
    .from("pm_integrations")
    .update({ status: "connected", last_sync_at: new Date().toISOString(), last_error: null })
    .eq("id", integration.id);
  await logEvent(integration.id, integration.pm_contact_id, integration.provider, "integration_reconciled", {
    imported,
    updated,
    archived,
    propertyCount,
    cap,
    overCap,
  });
  if (overCap) {
    await logEvent(integration.id, integration.pm_contact_id, integration.provider, "over_cap_detected", { propertyCount, cap });
  }

  return { ok: true, imported, updated, archived, propertyCount, overCap, cap };
}

function emptyResult(error: string): SyncResult {
  return { ok: false, imported: 0, updated: 0, archived: 0, propertyCount: 0, overCap: false, cap: null, error };
}
