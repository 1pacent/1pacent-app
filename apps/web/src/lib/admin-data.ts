import "server-only";
import { supabaseConfigured, serviceClient } from "./supabase";
import { hubspotConfigured } from "./hubspot";

/**
 * Operator oversight (admin.<domain>): a god-view across the whole network —
 * deliberately NOT part of the token-scoped DataSource. Read-only aggregates
 * over the same ledger tables; the demo store supplies a parity view so the
 * dashboard demos without credentials.
 */

export type TxBucket = "open" | "pending" | "closed";

export interface AdminOverview {
  dataSource: "live" | "demo";
  hubspot: { configured: boolean };
  counts: {
    properties: number;
    propertyManagers: number;
    owners: number;
    tradies: number;
    tradiesOnline: number;
    joinRequests: number;
  };
  pipeline: Record<TxBucket, { count: number; valueCents: number }>;
  /** Newest first. */
  transactions: Array<{
    requestId: string;
    title: string;
    address: string;
    bucket: TxBucket;
    state: string;
    amountCents: number | null;
    feeCents: number | null;
    at: string;
  }>;
  /** Oldest → newest, up to 6 months. */
  monthly: Array<{
    month: string; // "2026-07"
    jobsClosed: number;
    grossCents: number;
    platformFeeCents: number;
    fastpayFeeCents: number;
  }>;
  propertiesByPm: Array<{
    pmName: string;
    properties: number;
    openJobs: number;
    addresses: string[];
  }>;
  /** v8 R7: which monthly cohort each PM chose, against actual PUM. */
  pmSubscriptions: Array<{
    pmName: string;
    sku: string;
    tierName: string;
    priceCents: number;
    propertyCap: number;
    propertiesUnderManagement: number;
    overCap: boolean;
    hubspotDealId: string | null;
    selectedAt: string;
  }>;
  subscriptionMrrCents: number;
  joinRequests: Array<{
    persona: string;
    fullName: string;
    email: string;
    suburb: string | null;
    company: string | null;
    abn: string | null;
    trades: string[] | null;
    serviceSuburbs: string[] | null;
    propertiesUnderMgmt: number | null;
    propertyCount: number | null;
    hubspotSynced: boolean;
    at: string;
  }>;
}

const OPEN_STATES = new Set(["reported", "triaged", "pending_approval", "approved", "quoting", "scheduled", "in_progress"]);
const PENDING_STATES = new Set(["evidence_pending", "verified", "invoiced"]);
const CLOSED_STATES = new Set(["paid", "closed"]);

export function bucketFor(state: string): TxBucket | null {
  if (OPEN_STATES.has(state)) return "open";
  if (PENDING_STATES.has(state)) return "pending";
  if (CLOSED_STATES.has(state)) return "closed";
  return null; // cancelled/declined stay out of the pipeline
}

export async function getAdminOverview(): Promise<AdminOverview> {
  if (!supabaseConfigured()) {
    const { demoAdminOverview } = await import("./store");
    return demoAdminOverview();
  }
  const db = serviceClient();
  const [{ data: props }, { data: contacts }, { data: presence }, { data: reqs }, { data: pays }, { data: joins }, { data: subs }] =
    await Promise.all([
      db.from("properties").select("id, address_line1, suburb, pm_contact_id, owner_contact_id"),
      db.from("contacts").select("id, kind, full_name"),
      db.from("tradie_presence").select("tradie_contact_id, online"),
      db.from("maintenance_requests").select("id, title, status, property_id, reported_at").order("reported_at", { ascending: false }).limit(500),
      db.from("payments").select("request_id, amount_cents, platform_fee_cents, fastpay_fee_cents, status, updated_at"),
      db.from("join_requests").select("persona, full_name, email, suburb, company_name, abn, trade_types, service_suburbs, properties_under_mgmt, properties, hubspot_id, created_at").order("created_at", { ascending: false }).limit(25),
      db.from("pm_subscriptions").select("pm_contact_id, sku, name, price_cents, property_cap, hubspot_deal_id, selected_at"),
    ]);

  const propRows = (props ?? []) as Array<{ id: string; address_line1: string; suburb: string; pm_contact_id: string | null; owner_contact_id: string | null }>;
  const contactRows = (contacts ?? []) as Array<{ id: string; kind: string; full_name: string }>;
  const reqRows = (reqs ?? []) as Array<{ id: string; title: string; status: string; property_id: string; reported_at: string }>;
  const payRows = (pays ?? []) as Array<{ request_id: string; amount_cents: number; platform_fee_cents: number | null; fastpay_fee_cents: number | null; status: string; updated_at: string }>;
  const nameOf = new Map(contactRows.map((c) => [c.id, c.full_name]));
  const addrOf = new Map(propRows.map((p) => [p.id, `${p.address_line1}, ${p.suburb}`]));

  const paysByRequest = new Map<string, typeof payRows>();
  for (const p of payRows) {
    (paysByRequest.get(p.request_id) ?? paysByRequest.set(p.request_id, []).get(p.request_id)!).push(p);
  }
  const requestValue = (id: string): { amount: number | null; fee: number | null } => {
    const slices = (paysByRequest.get(id) ?? []).filter((p) => p.status !== "voided");
    if (slices.length === 0) return { amount: null, fee: null };
    return {
      amount: slices.reduce((s, p) => s + Number(p.amount_cents), 0),
      fee: slices.reduce((s, p) => s + Number(p.platform_fee_cents ?? 0) + Number(p.fastpay_fee_cents ?? 0), 0),
    };
  };

  const pipeline: AdminOverview["pipeline"] = {
    open: { count: 0, valueCents: 0 },
    pending: { count: 0, valueCents: 0 },
    closed: { count: 0, valueCents: 0 },
  };
  const transactions: AdminOverview["transactions"] = [];
  for (const r of reqRows) {
    const bucket = bucketFor(r.status);
    if (!bucket) continue;
    const { amount, fee } = requestValue(r.id);
    pipeline[bucket].count += 1;
    pipeline[bucket].valueCents += amount ?? 0;
    if (transactions.length < 25) {
      transactions.push({
        requestId: r.id,
        title: r.title,
        address: addrOf.get(r.property_id) ?? "",
        bucket,
        state: r.status,
        amountCents: amount,
        feeCents: fee,
        at: r.reported_at,
      });
    }
  }

  // Monthly: settled money by the month it settled.
  const monthlyMap = new Map<string, AdminOverview["monthly"][number]>();
  for (const p of payRows) {
    if (p.status !== "transferred" && p.status !== "captured") continue;
    const month = String(p.updated_at).slice(0, 7);
    const m = monthlyMap.get(month) ?? { month, jobsClosed: 0, grossCents: 0, platformFeeCents: 0, fastpayFeeCents: 0 };
    m.grossCents += Number(p.amount_cents);
    m.platformFeeCents += Number(p.platform_fee_cents ?? 0);
    m.fastpayFeeCents += Number(p.fastpay_fee_cents ?? 0);
    monthlyMap.set(month, m);
  }
  const closedByMonth = new Map<string, Set<string>>();
  for (const r of reqRows) {
    if (!CLOSED_STATES.has(r.status)) continue;
    const slices = paysByRequest.get(r.id) ?? [];
    const at = slices.find((p) => p.status === "transferred")?.updated_at ?? r.reported_at;
    const month = String(at).slice(0, 7);
    (closedByMonth.get(month) ?? closedByMonth.set(month, new Set()).get(month)!).add(r.id);
  }
  for (const [month, set] of closedByMonth) {
    const m = monthlyMap.get(month) ?? { month, jobsClosed: 0, grossCents: 0, platformFeeCents: 0, fastpayFeeCents: 0 };
    m.jobsClosed = set.size;
    monthlyMap.set(month, m);
  }
  const monthly = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  // Properties by PM.
  const byPm = new Map<string, { pmName: string; properties: number; openJobs: number; addresses: string[] }>();
  for (const p of propRows) {
    const pmName = (p.pm_contact_id && nameOf.get(p.pm_contact_id)) || "Self-managed";
    const g = byPm.get(pmName) ?? { pmName, properties: 0, openJobs: 0, addresses: [] };
    g.properties += 1;
    g.addresses.push(`${p.address_line1}, ${p.suburb}`);
    g.openJobs += reqRows.filter((r) => r.property_id === p.id && OPEN_STATES.has(r.status)).length;
    byPm.set(pmName, g);
  }

  const presenceRows = (presence ?? []) as Array<{ online: boolean }>;
  const joinRows = (joins ?? []) as Array<{ persona: string; full_name: string; email: string; suburb: string | null; company_name: string | null; abn: string | null; trade_types: string[] | null; service_suburbs: string[] | null; properties_under_mgmt: number | null; properties: unknown; hubspot_id: string | null; created_at: string }>;

  const subRows = (subs ?? []) as Array<{
    pm_contact_id: string;
    sku: string;
    name: string;
    price_cents: number;
    property_cap: number;
    hubspot_deal_id: string | null;
    selected_at: string;
  }>;
  const pmSubscriptions = subRows.map((sr) => {
    const pum = propRows.filter((pp) => pp.pm_contact_id === sr.pm_contact_id).length;
    return {
      pmName: nameOf.get(sr.pm_contact_id) ?? "Unknown manager",
      sku: sr.sku,
      tierName: sr.name,
      priceCents: Number(sr.price_cents),
      propertyCap: Number(sr.property_cap),
      propertiesUnderManagement: pum,
      overCap: pum > Number(sr.property_cap),
      hubspotDealId: sr.hubspot_deal_id,
      selectedAt: sr.selected_at,
    };
  });

  return {
    dataSource: "live",
    hubspot: { configured: hubspotConfigured() },
    pmSubscriptions,
    subscriptionMrrCents: pmSubscriptions.reduce((sm, x) => sm + x.priceCents, 0),
    counts: {
      properties: propRows.length,
      propertyManagers: contactRows.filter((c) => c.kind === "property_manager").length,
      owners: contactRows.filter((c) => c.kind === "owner").length,
      tradies: contactRows.filter((c) => c.kind === "tradie").length,
      tradiesOnline: presenceRows.filter((p) => p.online).length,
      joinRequests: joinRows.length,
    },
    pipeline,
    transactions,
    monthly,
    propertiesByPm: [...byPm.values()].sort((a, b) => b.properties - a.properties),
    joinRequests: joinRows.map((j) => ({
      persona: j.persona,
      fullName: j.full_name,
      email: j.email,
      suburb: j.suburb,
      company: j.company_name,
      abn: j.abn,
      trades: j.trade_types,
      serviceSuburbs: j.service_suburbs,
      propertiesUnderMgmt: j.properties_under_mgmt,
      propertyCount: Array.isArray(j.properties) ? j.properties.length : null,
      hubspotSynced: Boolean(j.hubspot_id),
      at: j.created_at,
    })),
  };
}
