/**
 * Seed a realistic demo org (brief §8) into the target database.
 * Idempotent-ish: skips if the demo org already exists.
 *
 * Usage: DATABASE_URL=postgres://... pnpm --filter @1pacent/db seed
 *
 * Prints the raw tenant-intake and landlord-approval tokens (only their
 * SHA-256 hashes are stored) — paste them into /r/<token> and /a/<token>.
 */
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const newToken = () => {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token, "utf8").digest("hex") };
};

try {
  const existing = await sql`select id from orgs where name = 'Demo Org (1Pacent)' limit 1`;
  if (existing.length > 0) {
    console.log("Demo org already seeded:", existing[0]!.id);
    process.exit(0);
  }

  const [org] = await sql`insert into orgs (name, kind) values ('Demo Org (1Pacent)', 'self_managed_landlord') returning id`;
  const orgId = org!.id as string;

  const [fitzroy] = await sql`insert into properties
    (org_id, address_line1, suburb, state, postcode, jurisdiction, has_gas, has_pool, auto_approve_cap_cents)
    values (${orgId}, '12 Rose Street', 'Fitzroy', 'VIC', '3065', 'VIC', true, false, 50000) returning id`;
  const [richmond] = await sql`insert into properties
    (org_id, address_line1, suburb, state, postcode, jurisdiction, has_gas, has_pool, auto_approve_cap_cents)
    values (${orgId}, '8/44 Swan Street', 'Richmond', 'VIC', '3121', 'VIC', false, false, 30000) returning id`;
  await sql`insert into properties
    (org_id, address_line1, suburb, state, postcode, jurisdiction, has_gas, has_pool, auto_approve_cap_cents)
    values (${orgId}, '3 Sydney Road', 'Brunswick', 'VIC', '3056', 'VIC', true, true, 0)`;

  const certs: Array<[string, string, Date]> = [
    [fitzroy!.id, "vic_smoke_alarm_check", daysAgo(90)],
    [fitzroy!.id, "vic_gas_safety_check", daysAgo(800)], // overdue → red
    [fitzroy!.id, "vic_electrical_safety_check", daysAgo(680)], // amber
    [fitzroy!.id, "vic_switchboard_rcd", daysAgo(400)],
    [fitzroy!.id, "vic_minimum_standards", daysAgo(400)],
    [richmond!.id, "vic_smoke_alarm_check", daysAgo(30)],
    [richmond!.id, "vic_electrical_safety_check", daysAgo(100)],
    [richmond!.id, "vic_switchboard_rcd", daysAgo(100)],
    [richmond!.id, "vic_minimum_standards", daysAgo(100)],
  ];
  for (const [propertyId, key, completed] of certs) {
    await sql`insert into compliance_certificates (org_id, property_id, requirement_key, completed_at)
              values (${orgId}, ${propertyId}, ${key}, ${completed})`;
  }

  // A pending-approval request with a live approval link.
  const [req] = await sql`insert into maintenance_requests
    (org_id, property_id, title, description, category, is_urgent, status, estimate_cents)
    values (${orgId}, ${richmond!.id}, 'Back fence leaning',
            'Rear fence palings loose after the storm, leaning into the laneway.',
            'garden_external', false, 'pending_approval', 145000) returning id`;
  const base = { org_id: orgId, aggregate_type: "maintenance_request", aggregate_id: req!.id as string };
  await sql`insert into events ${sql([
    { ...base, event_type: "triage", actor_type: "system", actor_id: "seed", payload: {} },
    { ...base, event_type: "request_approval", actor_type: "system", actor_id: "seed", payload: { note: "Over $300 auto-approve cap" } },
  ])}`;

  const intake = newToken();
  const approval = newToken();
  await sql`insert into access_tokens (org_id, token_hash, scope, aggregate_id, expires_at)
            values (${orgId}, ${intake.hash}, 'tenant_intake', ${fitzroy!.id}, ${new Date(Date.now() + 90 * 86_400_000)})`;
  await sql`insert into access_tokens (org_id, token_hash, scope, aggregate_id, expires_at)
            values (${orgId}, ${approval.hash}, 'landlord_approval', ${req!.id}, ${new Date(Date.now() + 72 * 3_600_000)})`;

  console.log("Seeded demo org:", orgId);
  console.log("Tenant intake link:     /r/" + intake.token);
  console.log("Landlord approval link: /a/" + approval.token);
} finally {
  await sql.end();
}
