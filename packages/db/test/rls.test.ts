import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

/**
 * RLS policy tests (sprint-0 definition of done: "org A must never read
 * org B"). These run against a real Postgres with the migrations applied —
 * set DATABASE_URL (a disposable database!) to enable them; they are
 * skipped otherwise so the suite stays green in environments without a DB.
 *
 * We simulate Supabase by stubbing auth.uid() to read a session GUC,
 * then switching to a non-superuser role so RLS applies.
 */

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("row-level security", () => {
  const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : (null as never);
  let orgA: string;
  let orgB: string;
  const userA = "00000000-0000-4000-8000-00000000000a";
  const userB = "00000000-0000-4000-8000-00000000000b";

  beforeAll(async () => {
    // Supabase provides auth.uid(); plain Postgres test DBs need a stub.
    await sql.unsafe(`
      create schema if not exists auth;
      create or replace function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('test.user_id', true), '')::uuid
      $$;
      do $$ begin
        create role app_user nologin;
      exception when duplicate_object then null; end $$;
      grant usage on schema public to app_user;
      grant select, insert, update, delete on all tables in schema public to app_user;
      grant execute on all functions in schema public to app_user;
    `);

    const [a] = await sql`insert into orgs (name, kind) values ('Org A', 'agency') returning id`;
    const [b] = await sql`insert into orgs (name, kind) values ('Org B', 'agency') returning id`;
    orgA = a!.id;
    orgB = b!.id;
    await sql`insert into org_members (org_id, user_id, role) values (${orgA}, ${userA}, 'owner')`;
    await sql`insert into org_members (org_id, user_id, role) values (${orgB}, ${userB}, 'owner')`;
    await sql`insert into properties (org_id, address_line1, suburb, postcode)
              values (${orgA}, '1 Alpha St', 'Fitzroy', '3065')`;
    await sql`insert into properties (org_id, address_line1, suburb, postcode)
              values (${orgB}, '2 Beta Ave', 'Richmond', '3121')`;

    // Sally/quotes fixtures — org A only, used to prove org B can't see them.
    const [tradieA] = await sql`insert into contacts (org_id, kind, full_name, email)
              values (${orgA}, 'tradie', 'Test Tradie', 'tradie@example.com') returning id`;
    const [tenantA] = await sql`insert into contacts (org_id, kind, full_name, email)
              values (${orgA}, 'tenant', 'Test Tenant', 'tenant@example.com') returning id`;
    const [requestA] = await sql`insert into maintenance_requests (org_id, property_id, title)
              values (${orgA}, (select id from properties where org_id = ${orgA} limit 1), 'Leaking tap')
              returning id`;
    await sql`insert into quotes (org_id, request_id, tradie_contact_id, quote_cents, call_out_fee_cents)
              values (${orgA}, ${requestA!.id}, ${tradieA!.id}, 15000, 8000)`;
    const [propA] = await sql`select id from properties where org_id = ${orgA} limit 1`;
    const [convoA] = await sql`insert into sally_conversations (org_id, contact_id, property_id, request_id)
              values (${orgA}, ${tenantA!.id}, ${propA!.id}, ${requestA!.id}) returning id`;
    const zeroVector = `[${"0,".repeat(1535)}0]`;
    await sql`insert into sally_memory_chunks
              (org_id, contact_id, scope_level, chunk_type, content, embedding, source_conversation_id)
              values (${orgA}, ${tenantA!.id}, 'contact', 'fact', 'Prefers morning access',
                      ${zeroVector}::vector, ${convoA!.id})`;

    // Rate card / availability fixtures — org A's tradie only.
    const [rateCardA] = await sql`insert into tradie_rate_cards
              (org_id, tradie_contact_id, call_out_fee_cents, hourly_rate_cents)
              values (${orgA}, ${tradieA!.id}, 8000, 12000) returning id`;
    await sql`insert into tradie_rate_card_items (org_id, rate_card_id, category, flat_price_cents)
              values (${orgA}, ${rateCardA!.id}, 'plumbing_general', 18000)`;
    await sql`insert into tradie_availability_windows
              (org_id, tradie_contact_id, day_of_week, start_time, end_time)
              values (${orgA}, ${tradieA!.id}, 1, '09:00', '17:00')`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe(`
      delete from tradie_availability_windows; delete from tradie_rate_card_items;
      delete from tradie_rate_cards;
      delete from sally_memory_chunks; delete from sally_messages;
      delete from sally_conversations; delete from quotes;
      delete from maintenance_requests; delete from contacts;
      delete from properties; delete from org_members; delete from orgs;
    `);
    await sql.end();
  });

  async function asUser<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>) {
    return sql.begin(async (tx) => {
      await tx.unsafe(`set local role app_user; set local "test.user_id" = '${userId}'`);
      return fn(tx);
    });
  }

  it("org A sees only its own properties", async () => {
    const rows = await asUser(userA, (tx) => tx`select address_line1 from properties`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.address_line1).toBe("1 Alpha St");
  });

  it("org B sees only its own properties", async () => {
    const rows = await asUser(userB, (tx) => tx`select address_line1 from properties`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.address_line1).toBe("2 Beta Ave");
  });

  it("a user cannot insert rows into another org", async () => {
    await expect(
      asUser(userA, (tx) =>
        tx`insert into properties (org_id, address_line1, suburb, postcode)
           values (${orgB}, 'Injected', 'Nowhere', '0000')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("an anonymous session sees nothing", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx.unsafe(`set local role app_user`);
      return tx`select * from properties`;
    });
    expect(rows).toHaveLength(0);
  });

  it("org B cannot see org A's quotes", async () => {
    const rows = await asUser(userB, (tx) => tx`select id from quotes`);
    expect(rows).toHaveLength(0);
  });

  it("org A sees its own quote", async () => {
    const rows = await asUser(userA, (tx) => tx`select quote_cents from quotes`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quote_cents).toBe(15000);
  });

  it("org B cannot see org A's Sally conversations or memory", async () => {
    const convos = await asUser(userB, (tx) => tx`select id from sally_conversations`);
    const chunks = await asUser(userB, (tx) => tx`select id from sally_memory_chunks`);
    expect(convos).toHaveLength(0);
    expect(chunks).toHaveLength(0);
  });

  it("org A sees its own Sally conversation and memory chunk", async () => {
    const convos = await asUser(userA, (tx) => tx`select id from sally_conversations`);
    const chunks = await asUser(userA, (tx) => tx`select content from sally_memory_chunks`);
    expect(convos).toHaveLength(1);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe("Prefers morning access");
  });

  it("org B cannot see org A's rate card, rate card items, or availability", async () => {
    const cards = await asUser(userB, (tx) => tx`select id from tradie_rate_cards`);
    const items = await asUser(userB, (tx) => tx`select id from tradie_rate_card_items`);
    const windows = await asUser(userB, (tx) => tx`select id from tradie_availability_windows`);
    expect(cards).toHaveLength(0);
    expect(items).toHaveLength(0);
    expect(windows).toHaveLength(0);
  });

  it("org A sees its own rate card, rate card items, and availability", async () => {
    const cards = await asUser(userA, (tx) => tx`select call_out_fee_cents from tradie_rate_cards`);
    const items = await asUser(userA, (tx) => tx`select flat_price_cents from tradie_rate_card_items`);
    const windows = await asUser(userA, (tx) => tx`select day_of_week from tradie_availability_windows`);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.call_out_fee_cents).toBe(8000);
    expect(items).toHaveLength(1);
    expect(items[0]!.flat_price_cents).toBe(18000);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.day_of_week).toBe(1);
  });

  it("events are append-only even for privileged writers", async () => {
    const [e] = await sql`insert into events
      (org_id, aggregate_type, aggregate_id, event_type, actor_type, actor_id)
      values (${orgA}, 'maintenance_request', gen_random_uuid(), 'triage', 'system', 'test')
      returning id`;
    await expect(sql`update events set event_type = 'tampered' where id = ${e!.id}`).rejects.toThrow(
      /append-only/,
    );
    await expect(sql`delete from events where id = ${e!.id}`).rejects.toThrow(/append-only/);
  });
});

describe("rls test harness", () => {
  it("suite loads (RLS tests run when DATABASE_URL is set)", () => {
    expect(true).toBe(true);
  });
});
