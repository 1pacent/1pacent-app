# 1Pacent architecture (v2 build)

Implements the target architecture from `1PACENT_DEVELOPER_BRIEF_v2` — see
that brief for the audit findings this design answers.

```
   Landlord / Agency (accounts)     Tenant / Tradie (tokenised links, no account)
              │                                   │
              ▼                                   ▼
        ┌──────────────────────────────────────────────┐
        │  apps/web — Next.js (App Router, TypeScript)   │
        │  SSR marketing + SEO, dashboards, link flows   │
        └───────────────────┬────────────────────────────┘
                            │ same-origin route handlers / server actions
                            ▼
        ┌──────────────────────────────────────────────┐
        │  API tier (Next server actions/route handlers)│
        │  authn/z, token validation, rate limiting,    │
        │  invokes packages/core, appends events        │
        └───────────────────┬────────────────────────────┘
                            │
          ┌─────────────────┼───────────────────────────┐
          ▼                 ▼                           ▼
   ┌────────────┐   ┌──────────────┐          ┌────────────────────┐
   │ Supabase   │   │ n8n (internal │          │ Supabase Storage   │
   │ Postgres   │   │ async worker: │          │ (evidence, certs,  │
   │ + RLS      │   │ SMS/email/PDF)│          │  sha256 + EXIF)    │
   │ (Sydney)   │   └──────────────┘          └────────────────────┘
   └────────────┘
```

## Layout

| Path | What it is |
|---|---|
| `packages/core` | Pure-TS domain logic: request state machine, VIC compliance catalogue + traffic-light engine, approval rules (auto-approve cap + VIC urgent bypass), quote-vs-actual trust scoring, money-as-cents, event envelope, access-token issue/validate. Zero I/O, ≥90 % coverage target. |
| `packages/agents` | Sally's LLM/embedding provider calls (OpenRouter chat + embeddings, injectable-`fetch` client for testing) and prompt/extraction logic. No database access — retrieval/writes live in `apps/web`'s Supabase layer, matching the "core stays pure, apps/web owns Supabase" split. See `docs/SALLY_MEMORY.md`. |
| `packages/db` | SQL migrations (RLS on every org-scoped table, append-only `events`, tokenised `access_tokens`, VIC catalogue seed, `quotes` + `sally_*` memory tables, `tradie_trust_scores` view, pgvector), forward-only migration runner, RLS policy tests. |
| `apps/web` | Next.js client + API tier. Landlord dashboard (incl. the 3-quote picker), property compliance detail, Sally conversational tenant intake (`/r/[token]`), landlord approval (`/a/[token]`), tradie quote submission (`/q/[token]`). Runs on a seeded in-memory repository until Supabase env vars are set. |

## Non-negotiable rules (carried from the audit)

1. **The client never computes** quotes, approvals, warranty, invoices,
   matching, or schedules — it renders what `core` decides server-side
   (`docs/api_contracts` discipline).
2. **Approver identity comes from an authenticated session or a signed
   single-use token — never a request-body string** (B2 remediation;
   enforced by actor guards in the state machine).
3. **The event log is the source of truth.** Status columns are
   projections; `events` rejects UPDATE/DELETE at the trigger level. AI
   proposals carry `ai_meta` (model, prompt version, confidence) so every
   AI-influenced decision is reconstructable — the Compliance Pack depends
   on this.
4. **No infra hostnames/IPs in any client bundle** (B3). The browser only
   ever talks to same-origin handlers.
5. **n8n is an internal worker, not a public API.** It performs
   deterministic side effects (SMS, email, PDF) when the API tier asks;
   it holds no agent reasoning and accepts no public ingress.

## Where the AI lives

Agent reasoning (Sally, conversational tenant intake) lives in
`packages/agents` (structured outputs via zod, eval-friendly — LLM/embedding
clients take an injectable `fetch` so tests run offline), invoked from
`apps/web/src/lib/sally.ts`. AI output is always a **proposal event**;
deterministic rules in `packages/core` (urgency list, approval caps) make
the decision — Sally proposes category/urgency/call-out-fee-estimate,
`isUrgentCategory`/`decideApproval` decide. Sally's long-term memory
(pgvector, per-contact curated facts, never raw transcript) is documented
in `docs/SALLY_MEMORY.md`. The nine n8n-embedded agents from the previous
iteration stay parked per brief §6.

Once a request reaches `approved`, the API tier requests quotes from 3
seeded tradie contacts (`DataSource.dispatchQuotesForRequest`) and calls
n8n (`1PACENT-SALLY-DISPATCH-QUOTES`) purely to send the notification
emails — n8n does no reasoning and no DB writes, matching rule 5 below.
The landlord accepts one quote on the dashboard; `1PACENT-SALLY-DISPATCH-NOTIFY`
sends the win/lose emails. Every completed job's `quote_cents` vs
`invoice_cents` on `work_orders` feeds `tradie_trust_scores` (a read-time
view; `packages/core`'s `computeQuoteAccuracy`/`classifyTrust` are the
source of truth for the formula).

## What lands next (build order per brief §7)

- Supabase project (Sydney) + `SUPABASE_URL`/keys in env; swap the demo
  repository for the Postgres-backed one behind the same interface.
- Auth (magic links) for landlord/agency accounts; org onboarding wizard.
- Evidence upload (Storage, sha256 + EXIF capture) on intake and job
  completion; certificate upload closing compliance items.
- Notification worker (Resend + Twilio via internal n8n) and SLA timers.
- Compliance Pack PDF export; Stripe Billing (Epic 5).
