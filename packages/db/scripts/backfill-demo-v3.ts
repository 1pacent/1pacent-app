/**
 * Additive backfill for the existing demo org: rate cards + availability for
 * the 3 seeded tradies, a real property_manager contact assigned to
 * Richmond, and fresh tradie_portal/tradie_lead_intake/pm_portfolio tokens.
 * Safe to re-run — every insert is skip-if-exists, nothing is deleted.
 *
 * Usage: DATABASE_URL=postgres://... node --experimental-strip-types scripts/backfill-demo-v3.ts
 */
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const newToken = () => {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token, "utf8").digest("hex") };
};

try {
  const [org] = await sql`select id from orgs where name = 'Demo Org (1Pacent)' limit 1`;
  if (!org) {
    console.error("No existing demo org found — run `pnpm --filter @1pacent/db seed` first.");
    process.exit(1);
  }
  const orgId = org.id as string;

  const tradies = await sql`select id, full_name from contacts where org_id = ${orgId} and kind = 'tradie' order by full_name`;
  const johnId = tradies.find((t) => t.full_name === "John Snow")?.id as string | undefined;
  const leoId = tradies.find((t) => t.full_name === "Leo Baker")?.id as string | undefined;
  const sarahId = tradies.find((t) => t.full_name === "Sarah Mannis")?.id as string | undefined;

  const rateCardSpecs: Array<[string | undefined, number, number, Array<[string, number, number]>]> = [
    [johnId, 8_000, 12_000, [["electrical_general", 18_000, 90], ["dangerous_electrical_fault", 25_000, 60]]],
    [leoId, 7_500, 11_000, [["plumbing_general", 16_000, 75]]],
    [sarahId, 6_000, 9_500, [["garden_external", 20_000, 120]]],
  ];
  for (const [tradieId, calloutFee, hourly, items] of rateCardSpecs) {
    if (!tradieId) continue;
    const [existing] = await sql`select id from tradie_rate_cards where tradie_contact_id = ${tradieId}`;
    if (existing) {
      console.log("Rate card already exists for", tradieId, "— skipping.");
      continue;
    }
    const [card] = await sql`insert into tradie_rate_cards (org_id, tradie_contact_id, call_out_fee_cents, hourly_rate_cents)
              values (${orgId}, ${tradieId}, ${calloutFee}, ${hourly}) returning id`;
    for (const [category, flatPrice, minutes] of items) {
      await sql`insert into tradie_rate_card_items (org_id, rate_card_id, category, flat_price_cents, typical_minutes)
                values (${orgId}, ${card!.id}, ${category}, ${flatPrice}, ${minutes})`;
    }
    const [existingAvail] = await sql`select 1 from tradie_availability_windows where tradie_contact_id = ${tradieId} limit 1`;
    if (!existingAvail) {
      for (let day = 1; day <= 5; day++) {
        await sql`insert into tradie_availability_windows (org_id, tradie_contact_id, day_of_week, start_time, end_time)
                  values (${orgId}, ${tradieId}, ${day}, '09:00', '17:00')`;
      }
    }
    console.log("Seeded rate card + availability for", tradieId);
  }

  // Fix the property manager contact's kind (was seeded as 'owner' before the
  // property_manager kind existed) and assign them to Richmond, informed not gating.
  const [pm] = await sql`select id from contacts where org_id = ${orgId} and full_name ilike 'Jordan Blake%' limit 1`;
  let pmId = pm?.id as string | undefined;
  if (pmId) {
    await sql`update contacts set kind = 'property_manager', full_name = 'Jordan Blake' where id = ${pmId}`;
  } else {
    const [created] = await sql`insert into contacts (org_id, kind, full_name, email)
      values (${orgId}, 'property_manager', 'Jordan Blake', 'mac@1pacent.com') returning id`;
    pmId = created!.id as string;
  }
  const [richmond] = await sql`select id from properties where org_id = ${orgId} and suburb = 'Richmond' limit 1`;
  if (richmond) {
    await sql`update properties set pm_contact_id = ${pmId!}, pm_approval_required = false where id = ${richmond.id}`;
  }

  const yearFromNow = new Date(Date.now() + 365 * 86_400_000);
  const johnPortal = newToken();
  if (johnId) {
    await sql`insert into access_tokens (org_id, token_hash, scope, aggregate_id, contact_id, expires_at)
              values (${orgId}, ${johnPortal.hash}, 'tradie_portal', ${johnId}, ${johnId}, ${yearFromNow})`;
  }
  const johnLeadIntake = newToken();
  if (johnId) {
    await sql`insert into access_tokens (org_id, token_hash, scope, aggregate_id, expires_at)
              values (${orgId}, ${johnLeadIntake.hash}, 'tradie_lead_intake', ${johnId}, ${yearFromNow})`;
  }
  const pmPortfolio = newToken();
  await sql`insert into access_tokens (org_id, token_hash, scope, aggregate_id, contact_id, expires_at)
            values (${orgId}, ${pmPortfolio.hash}, 'pm_portfolio', ${pmId!}, ${pmId!}, ${yearFromNow})`;

  console.log("");
  console.log("Backfill complete for demo org:", orgId);
  console.log("Property manager portfolio (informed, not gating): /pm/" + pmPortfolio.token);
  if (johnId) {
    console.log("John Snow's rate-card portal:                       /t/" + johnPortal.token);
    console.log("John Snow's own lead-intake link (share with his customers): /l/" + johnLeadIntake.token);
  }
} finally {
  await sql.end();
}
