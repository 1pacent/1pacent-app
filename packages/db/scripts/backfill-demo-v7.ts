/**
 * v7 demo backfill: connect the ownership/management graph and give the
 * ledger enough completed history to power the Talk/See/Do surfaces —
 * the asset horizon card, the spending-vs-Cost-Index card, the tradie
 * accuracy card, and the Property Data Pack's depreciation planning
 * estimates all derive from real rows, not fixtures.
 *
 * Idempotent: keyed on the seeded request titles.
 * Usage: DATABASE_URL=postgres://... pnpm --filter @1pacent/db backfill-v7
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

try {
  const [org] = await sql`select id from orgs order by created_at limit 1`;
  if (!org) throw new Error("No org found");
  const orgId = org.id as string;

  const contacts = await sql`select id, kind, full_name from contacts where org_id = ${orgId}`;
  const owner = contacts.find((c) => c.kind === "owner");
  const pm = contacts.find((c) => c.kind === "property_manager");
  const tenant = contacts.find((c) => c.kind === "tenant");
  const john = contacts.find((c) => c.kind === "tradie" && (c.full_name as string).startsWith("John"));
  const leo = contacts.find((c) => c.kind === "tradie" && (c.full_name as string).startsWith("Leo"));
  if (!owner || !pm || !john || !leo) throw new Error("Expected seeded contacts missing");

  const properties = await sql`select id, address_line1 from properties where org_id = ${orgId} order by created_at`;
  const roseSt = properties.find((p) => (p.address_line1 as string).includes("Rose"));
  const swanSt = properties.find((p) => (p.address_line1 as string).includes("Swan"));
  if (!roseSt || !swanSt) throw new Error("Expected seeded properties missing");

  // 1. The ownership/management graph: Mark owns everything, Jordan manages everything.
  await sql`update properties set owner_contact_id = ${owner.id}, pm_contact_id = ${pm.id} where org_id = ${orgId}`;
  console.log(`graph: owner=${owner.full_name}, pm=${pm.full_name} across ${properties.length} properties`);

  // 2. Asset registry: the HWS at year ~10 of 12 is the horizon card's flagship line.
  async function ensureAsset(propertyId: string, category: string, label: string, installedAt: Date | null) {
    const existing = await sql`select id from property_assets where property_id = ${propertyId} and label = ${label}`;
    if (existing.length > 0) return existing[0]!.id as string;
    const [row] = await sql`insert into property_assets (org_id, property_id, category, label, installed_at)
      values (${orgId}, ${propertyId}, ${category}, ${label}, ${installedAt}) returning id`;
    console.log(`asset: ${label}`);
    return row!.id as string;
  }

  const hwsRose = await ensureAsset(
    roseSt.id as string,
    "failure_of_essential_service_hot_water",
    "Hot water system (Rheem Stellar 360)",
    daysAgo(3_680),
  );
  void hwsRose;
  const hwsSwan = await ensureAsset(
    swanSt.id as string,
    "failure_of_essential_service_hot_water",
    "Heat-pump hot water system",
    daysAgo(206),
  );
  const tapSwan = await ensureAsset(swanSt.id as string, "plumbing_general", "Kitchen mixer tap", daysAgo(5));

  // 3. Completed, invoiced jobs — the Cost Index and accuracy signal.
  async function ensureCompletedJob(input: {
    propertyId: string;
    title: string;
    description: string;
    category: string;
    tradieId: string;
    tradieName: string;
    assetId: string;
    quoteCents: number;
    callOutFeeCents: number;
    invoiceCents: number;
    finishedDaysAgo: number;
    warrantyDays: number | null;
  }) {
    const existing = await sql`select id from maintenance_requests where org_id = ${orgId} and title = ${input.title}`;
    if (existing.length > 0) {
      console.log(`job exists: ${input.title}`);
      return;
    }
    const d = input.finishedDaysAgo;
    const [req] = await sql`insert into maintenance_requests
      (org_id, property_id, title, description, category, is_urgent, status, estimate_cents, reported_at)
      values (${orgId}, ${input.propertyId}, ${input.title}, ${input.description}, ${input.category},
              false, 'closed', ${input.quoteCents}, ${daysAgo(d + 4)}) returning id`;
    const reqId = req!.id as string;

    const base = { org_id: orgId, aggregate_type: "maintenance_request", aggregate_id: reqId };
    const chain: Array<[string, string, string, number]> = [
      ["triage", "system", "triage-rules", d + 4],
      ["auto_approve", "system", "approval-rules", d + 4],
      ["schedule", "tradie", input.tradieId, d + 3],
      ["start_work", "tradie", input.tradieId, d + 2],
      ["submit_evidence", "tradie", input.tradieId, d + 2],
      ["verify", "tenant", tenant ? (tenant.id as string) : "tenant", d + 1],
      ["invoice", "tradie", input.tradieId, d],
      ["record_payment", "system", "auto-payment", d],
      ["close", "system", "auto-payment", d],
    ];
    for (const [eventType, actorType, actorId, ago] of chain) {
      await sql`insert into events (org_id, aggregate_type, aggregate_id, event_type, actor_type, actor_id, created_at)
        values (${base.org_id}, ${base.aggregate_type}, ${base.aggregate_id}, ${eventType}, ${actorType}, ${actorId}, ${daysAgo(ago)})`;
    }

    await sql`insert into work_orders
      (org_id, request_id, tradie_contact_id, status, quote_cents, call_out_fee_cents, invoice_cents,
       asset_id, warranty_expires_at, invoiced_at, completion_note)
      values (${orgId}, ${reqId}, ${input.tradieId}, 'closed', ${input.quoteCents}, ${input.callOutFeeCents},
              ${input.invoiceCents}, ${input.assetId},
              ${input.warrantyDays ? new Date(Date.now() + input.warrantyDays * DAY) : null},
              ${daysAgo(d)}, 'Completed')`;
    console.log(`job: ${input.title} — ${input.tradieName} invoiced $${(input.invoiceCents / 100).toFixed(2)}`);
  }

  await ensureCompletedJob({
    propertyId: swanSt.id as string,
    title: "Hot water system replacement",
    description: "HWS failed at 14 years; replaced with a new heat-pump unit.",
    category: "failure_of_essential_service_hot_water",
    tradieId: leo.id as string,
    tradieName: leo.full_name as string,
    assetId: hwsSwan,
    quoteCents: 250_000,
    callOutFeeCents: 8_000,
    invoiceCents: 240_000,
    finishedDaysAgo: 206,
    warrantyDays: null,
  });

  await ensureCompletedJob({
    propertyId: swanSt.id as string,
    title: "Dripping kitchen tap repair",
    description: "Kitchen mixer tap dripping constantly; cartridge replaced.",
    category: "plumbing_general",
    tradieId: john.id as string,
    tradieName: john.full_name as string,
    assetId: tapSwan,
    quoteCents: 18_000,
    callOutFeeCents: 8_000,
    invoiceCents: 16_500,
    finishedDaysAgo: 5,
    warrantyDays: 80,
  });

  console.log("backfill-v7 complete.");
} finally {
  await sql.end();
}
