/**
 * Mint one fresh tokenised link per persona against the live database —
 * the internal spot-check equivalent of the dashboard's "test as a persona"
 * panel. Prints full URLs; tokens are stored hashed, shown once here.
 * Usage: DATABASE_URL=... APP_BASE_URL=https://... pnpm --filter @1pacent/db mint-links
 */
import postgres from "postgres";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
const sql = postgres(url, { max: 1, onnotice: () => {} });

const TTL_HOURS: Record<string, number> = {
  tenant_intake: 24 * 90,
  owner_portal: 24 * 365,
  pm_portfolio: 24 * 365,
  tradie_portal: 24 * 365,
};

try {
  const [org] = await sql`select id from orgs order by created_at limit 1`;
  const orgId = org!.id as string;
  const contacts = await sql`select id, kind, full_name from contacts where org_id = ${orgId}`;
  const [prop] = await sql`select id, address_line1 from properties where org_id = ${orgId} order by created_at limit 1`;
  const tenant = contacts.find((c) => c.kind === "tenant");
  const owner = contacts.find((c) => c.kind === "owner");
  const pm = contacts.find((c) => c.kind === "property_manager");
  const tradie = contacts.find((c) => c.kind === "tradie");

  async function mint(scope: string, aggregateId: string, contactId: string | null, path: string, label: string) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + TTL_HOURS[scope]! * 3_600_000);
    await sql`insert into access_tokens (org_id, token_hash, scope, aggregate_id, contact_id, expires_at)
      values (${orgId}, ${tokenHash}, ${scope}, ${aggregateId}, ${contactId}, ${expiresAt})`;
    console.log(`${label}: ${base}${path}/${token}`);
  }

  await mint("tenant_intake", prop!.id as string, tenant!.id as string, "/r", `renter @ ${prop!.address_line1}`);
  await mint("owner_portal", owner!.id as string, owner!.id as string, "/o", `owner (${owner!.full_name})`);
  await mint("pm_portfolio", pm!.id as string, pm!.id as string, "/pm", `pm (${pm!.full_name})`);
  await mint("tradie_portal", tradie!.id as string, tradie!.id as string, "/t", `tradie (${tradie!.full_name})`);
} finally {
  await sql.end();
}
