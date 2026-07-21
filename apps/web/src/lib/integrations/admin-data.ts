import "server-only";
import { serviceClient, supabaseConfigured } from "../supabase";
import { listConnectors, integrationsReady } from "./service";

/** Operator view of PM integrations (v9 R9.2). */
export interface IntegrationView {
  id: string;
  provider: string;
  pmName: string | null;
  status: string;
  writeBackEnabled: boolean;
  lastSyncAt: string | null;
  propertyCount: number;
  cap: number | null;
  overCap: boolean;
}

export async function getIntegrationsOverview(): Promise<{
  ready: { db: boolean; encryption: boolean };
  connectors: Array<{ provider: string; displayName: string; live: boolean }>;
  connections: IntegrationView[];
}> {
  const ready = integrationsReady();
  const connectors = listConnectors();
  if (!supabaseConfigured()) return { ready, connectors, connections: [] };
  const db = serviceClient();
  const { data } = await db
    .from("pm_integrations")
    .select("id, provider, pm_contact_id, status, write_back_enabled, last_sync_at")
    .order("connected_at", { ascending: false });
  const connections: IntegrationView[] = [];
  for (const row of (data ?? []) as Array<{ id: string; provider: string; pm_contact_id: string; status: string; write_back_enabled: boolean; last_sync_at: string | null }>) {
    const [{ data: pm }, { count }, { data: sub }] = await Promise.all([
      db.from("contacts").select("full_name").eq("id", row.pm_contact_id).maybeSingle(),
      db.from("properties").select("id", { count: "exact", head: true }).eq("pm_contact_id", row.pm_contact_id),
      db.from("pm_subscriptions").select("property_cap").eq("pm_contact_id", row.pm_contact_id).maybeSingle(),
    ]);
    const propertyCount = count ?? 0;
    const cap = sub ? Number(sub.property_cap) : null;
    connections.push({
      id: row.id,
      provider: row.provider,
      pmName: (pm?.full_name as string) ?? null,
      status: row.status,
      writeBackEnabled: row.write_back_enabled,
      lastSyncAt: row.last_sync_at,
      propertyCount,
      cap,
      overCap: cap !== null && propertyCount > cap,
    });
  }
  return { ready, connectors, connections };
}
