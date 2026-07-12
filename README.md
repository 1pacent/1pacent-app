# 1Pacent — the Property Passport

Compliance-first maintenance orchestration for Australian rental
properties. The **ledger** (asset ages, quotes-vs-actuals, warranties,
certificates, trust history — per property, forever) is the product; the
AI is the interface; the deterministic core is what makes it trustworthy.

This is the **v7 build**: the Talk / See / Do engagement model from
`docs/PRODUCT_DESIGN_v6.md` executed per `docs/DEVELOPER_BRIEF_v7.md`
(Hermes-ready AI gateway, Honcho memory seam, Qdrant vector seam), on the
v2 post-audit architecture (`docs/ARCHITECTURE.md`,
`docs/ADR-001-database-platform.md`).

**The invariant:** AI proposes → cards decide → core executes. No
approval, payment, dispatch or slot confirmation is ever performed by a
model — Sally surfaces a card, a human taps it, `packages/core` validates
the transition, and the append-only events ledger records a human actor.
The LLM being down removes convenience, never a capability.

## The experience — one shell, four personas

Every seat is a tokenised link (no accounts): **Talk** to Sally on the
left (persona-scoped by the token's position in the knowledge graph,
answering only through scoped tools over the ledger), act on the card
**board** on the right, with the full manual **workspace** beneath.

| Seat | Route | What lands on their board |
|---|---|---|
| Renter | `/r/[token]` | Ticket status, George's slot proposals, confirm-fixed, compliance status |
| Owner / landlord | `/o/[token]` | Approvals with ranked quotes, warranty catches, asset horizon, spending vs the Cost Index, Property Data Pack |
| Property manager | `/pm/[token]` | The crew headline, obligations calendar, batchable compliance with one-tap batch dispatch, red list |
| Tradie | `/t/[token]` | George's day card with property briefings, quote-accuracy → trust, Nelly's auto-quote settings |

## Workspace

| Path | Package | What |
|---|---|---|
| `packages/core` | `@1pacent/core` | Pure domain logic: request state machine, VIC compliance engine, approval policy, pricing/ranking/trust, slot proposal, depreciation planning estimates, spending/obligations reports, tokens, money. Fully unit-tested. |
| `packages/agents` | `@1pacent/agents` | The AI layer: gateway (Hermes ↔ OpenRouter, env-switched), Sally's 5 persona modes + tool registry/loop, Honcho memory backend (money/date/compliance/asset facts refused in code — DB is truth), Qdrant vector backend. Offline-testable. |
| `packages/db` | `@1pacent/db` | SQL migrations (RLS, append-only event log), migration runner, RLS policy tests. |
| `apps/web` | `@1pacent/web` | Next.js app: the twin-panel shell, canvas read model, workspaces, tokenised flows. Demo mode until Supabase is configured. |

## Getting started

```bash
pnpm install
pnpm test        # core + agents unit tests + db harness (RLS tests need DATABASE_URL)
pnpm typecheck
pnpm dev         # http://localhost:3000
```

Demo routes (seeded data, no DB needed):

- `/dashboard` — portfolio traffic lights + "test as a persona" link minting
- `/r/demo-intake` — renter: Sally intake + board
- `/o/demo-owner-portal` — owner seat: Talk + decision board
- `/pm/demo-pm-portfolio` — PM: obligations, batch dispatch
- `/t/demo-tradie-portal` — tradie: day card, accuracy, auto-quote
- `/a/demo-approval` — landlord one-tap approval link

## AI layer switches (all optional; graceful degradation)

- `OPENROUTER_API_KEY` — Sally on; without it the boards and workspaces are fully functional.
- `HERMES_URL` (+ `HERMES_API_KEY`, `HERMES_OPENAI_COMPAT=1`) — route reasoning through the owned Hermes runtime; transport failure falls back to OpenRouter with a logged warning.
- `HONCHO_BASE_URL` — per-person theory-of-mind memory; guarded facts are refused at the boundary.
- `QDRANT_URL` — vector recall re-homes from pgvector to Qdrant.

## Database (Supabase project `yxgvvbfsbvykmsqzuzxi`, Sydney)

Migrations live twice, deliberately in lockstep: `packages/db/migrations`
(canonical, applied by our runner + RLS tests) and `supabase/migrations`
(the mirror Supabase's GitHub integration deploys).

```bash
DATABASE_URL=postgres://... pnpm --filter @1pacent/db migrate   # apply migrations + VIC seed
DATABASE_URL=postgres://... pnpm --filter @1pacent/db seed      # demo org + prints live /r and /a tokens
DATABASE_URL=postgres://... pnpm --filter @1pacent/db test      # RLS policy tests (disposable DB!)
```

The web app switches from demo data to Supabase as soon as
`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set (see
`apps/web/.env.example`; `DATA_SOURCE=demo` forces demo mode). Keys are
secrets — set them in Vercel/CI env, never commit them.

## n8n

The legacy workflow estate (190 workflows) is versioned under
`n8n/export/` and reviewed in `docs/N8N_WORKFLOW_AUDIT.md` — read that
before touching the VPS; it lists urgent lockdown actions.

## Rules of the road

- The client never computes approvals/quotes/status — `@1pacent/core`
  decides, server-side.
- Approver identity comes from a session or signed token, never a
  request body.
- `events` is append-only and is the source of truth; status columns are
  projections.
- Money is integer cents (`bigint`), end to end.
- No infra hostnames/IPs in any client bundle.
