# 1Pacent

Compliance-first maintenance orchestration for Australian rental
properties. Landlords and agencies get a traffic-light compliance
dashboard and audit-grade maintenance trail; tenants and tradies act
through QR/links with no accounts, ever.

This is the **v2 build** implementing `1PACENT_DEVELOPER_BRIEF_v2`
(post-audit rebuild: Next.js + TypeScript client, pure-TS domain core,
Postgres with RLS on Supabase, n8n demoted to internal worker). See
`docs/ARCHITECTURE.md` and `docs/ADR-001-database-platform.md`.

## Workspace

| Path | Package | What |
|---|---|---|
| `packages/core` | `@1pacent/core` | Domain logic: request state machine, VIC compliance engine, approval rules, tokens, money. Fully unit-tested. |
| `packages/db` | `@1pacent/db` | SQL migrations (RLS, append-only event log), migration runner, RLS policy tests. |
| `apps/web` | `@1pacent/web` | Next.js app: dashboard, tenant intake, landlord approval links. Demo mode until Supabase is configured. |

## Getting started

```bash
pnpm install
pnpm test        # core unit tests + db harness (RLS tests need DATABASE_URL)
pnpm typecheck
pnpm dev         # http://localhost:3000
```

Demo routes (seeded data, no DB needed):

- `/dashboard` — portfolio compliance traffic lights
- `/properties/prop-fitzroy` — compliance detail + request event timelines
- `/r/demo-intake` — tenant repair intake (urgent categories fast-track)
- `/a/demo-approval` — landlord one-tap approval link

## Database

```bash
DATABASE_URL=postgres://... pnpm --filter @1pacent/db migrate   # apply migrations + VIC seed
DATABASE_URL=postgres://... pnpm --filter @1pacent/db test      # RLS policy tests (disposable DB!)
```

## Rules of the road

- The client never computes approvals/quotes/status — `@1pacent/core`
  decides, server-side.
- Approver identity comes from a session or signed token, never a
  request body.
- `events` is append-only and is the source of truth; status columns are
  projections.
- Money is integer cents (`bigint`), end to end.
- No infra hostnames/IPs in any client bundle.
