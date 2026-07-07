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
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe(`
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
