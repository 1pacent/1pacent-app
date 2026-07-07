/**
 * Minimal forward-only migration runner. Applies every migrations/NNNN_*.sql
 * not yet recorded in schema_migrations, in filename order, each in a
 * transaction. Usage: DATABASE_URL=postgres://... pnpm --filter @1pacent/db migrate
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )`;

  const files = (await readdir(migrationsDir)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const applied = new Set(
    (await sql`select filename from schema_migrations`).map((r) => r.filename as string),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const body = await readFile(path.join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (filename) values (${file})`;
    });
    console.log(`apply ${file}`);
  }
} finally {
  await sql.end();
}
