
1PACENT_DEVELOPER_BRIEF_v2.md


# 1Pacent — Developer Brief v2.0 (Improved Build)
 
**Based on a full audit of `feature/flutter-mvp-foundation`** (32 Dart files / ~5,200 LOC frontend; 39 n8n deploy scripts / ~1MB; 83-table Postgres schema).
**This brief tells developers what to keep, what to rebuild, what to fix first, and in what order.**
 
---
 
## 0. TL;DR for the team
 
You have built a large, ambitious **n8n + Postgres orchestration backend** and a thin **Flutter web GUI** on top of it. The backend is the valuable asset. The frontend is the replaceable layer. Three security issues are launch-blockers. Scope must be cut hard to reach a paying MVP.
 
**Keep & harden:** the Postgres domain model (especially the compliance catalogue), the API-contract discipline, the server-side secret handling, the defensive model parsers.
**Rebuild:** the client, as a Next.js/TypeScript web app with link/QR entry for tenants and tradies.
**Fix before anything else:** multi-tenancy isolation (RLS), webhook authentication, and the public-client → n8n coupling.
**Cut for MVP:** 6 of 9 AI agents, voice, social reputation, skills intelligence, RAG.
 
---
 
## 1. Audit findings (evidence-based)
 
### 1.1 Launch-blockers (must fix before any external user)
 
| # | Finding | Evidence | Impact |
|---|---|---|---|
| **B1** | **No multi-tenancy isolation.** No row-level security anywhere in the schema. "tenant_id" mostly defaults to hardcoded `'TENANT-001'`. | `tradie_app_schema.sql` — 0 RLS policies; `tenant_id text not null default 'TENANT-001'` | Any agency can read any other agency's landlords, tenants, and compliance data. APP breach. |
| **B2** | **Unauthenticated webhooks.** No auth on any of 39 n8n endpoints. Approval takes `"approved_by":"app_user"` as a plain body string. | `deploy_*.ps1` — no `authentication` key set on any webhook node | Anyone with a URL can create work orders, approve spend, read ops data. |
| **B3** | **Public client calls n8n directly**, with a hardcoded VPS IP fallback. No gateway, auth tier, or rate limiting. | `app_config.dart` → `N8N_FALLBACK_BASE_URL=...contaboserver.net`; `n8n_webhook_service.dart` posts straight to webhooks | Orchestration engine exposed as a public API. No abuse protection. |
 
### 1.2 High-priority (fix during MVP build)
 
| # | Finding | Evidence |
|---|---|---|
| H1 | **Wrong client tech for the product.** Flutter web = heavy load, weak SEO for landlord acquisition, awkward magic-link/QR flows — which the product's own design (Sally voice/QR, tradie links) depends on. | Whole `lib/` tree; `architecture.md` |
| H2 | **Money stored as `text`** in legacy tables. | `quotes.original_amount text`, `invoices.amount text` (rental tables correctly use `numeric`) |
| H3 | **God-widget.** `start_job_screen.dart` is 1,470 lines doing triage + quoting + booking + approval, with UAT data hardcoded into `TextEditingController`s. | `start_job_screen.dart` |
| H4 | **No repository/service abstraction beyond one webhook client.** Screens instantiate `N8nWebhookService()` directly; no DI, hard to test/mock. | `pm_dashboard_screen.dart`, `start_job_screen.dart` |
| H5 | **Massive scope for pre-revenue.** 9 named AI agents, voice, social reputation, RAG, skills intelligence. | `architecture.md`, `n8n/deploy/` (39 scripts) |
| H6 | **No audit/event log as source of truth.** Status lives as mutable `text` columns; `workflow_events` exists but isn't the authoritative timeline. | `work_orders.status`, scattered event tables |
 
### 1.3 What's genuinely good (preserve these)
 
- **API-contract discipline** — `docs/api_contracts.md` forbids the client from computing quotes, approvals, warranty, invoices. Keep this rule verbatim.
- **Server-side secrets** — ElevenLabs key minted via n8n token endpoint, never in client. No secrets committed (`.env` holds only URLs + non-sensitive agent id).
- **Defensive parsers** — models fall back across many key names (`Job.fromJson`, `Quote.fromJson`). Port this tolerance.
- **Compliance data model** — `compliance_requirement_catalogue` (jurisdiction, frequency_months, evidence_required[], legislation_source_key) + `compliance_certificates` (expiry, status). This is the moat. Build on it.
- **Rental schema core** — `work_orders`, `landlord_approvals`, `tenant_availability_windows`, `rental_quote_options` use proper FKs and `numeric` money.
- **SQL escaping** helper in n8n code nodes.
---
 
## 2. Target architecture (improved)
 
```
   Landlord / Agency (accounts)     Tenant / Tradie (tokenised links, no account)
              │                                   │
              ▼                                   ▼
        ┌──────────────────────────────────────────────┐
        │   Next.js 14 (TypeScript, App Router)          │  ← rebuild of Flutter layer
        │   SSR marketing+SEO, dashboards, link flows    │
        └───────────────────┬────────────────────────────┘
                            │ authenticated REST/tRPC
                            ▼
        ┌──────────────────────────────────────────────┐
        │   API layer (Next route handlers / NestJS)     │  ← NEW: the missing auth/gateway tier
        │   authn/z, rate limit, validation, RLS context │
        └───────────────────┬────────────────────────────┘
                            │
          ┌─────────────────┼───────────────────────────┐
          ▼                 ▼                           ▼
   ┌────────────┐   ┌──────────────┐          ┌────────────────────┐
   │ Postgres   │   │  n8n (async  │          │ Object storage     │
   │ + RLS      │   │  orchestration,          │ (evidence, certs,  │
   │ (Sydney)   │   │  agents, jobs)│          │  hashed + EXIF)    │
   └────────────┘   └──────────────┘          └────────────────────┘
```
 
**Key change from current state:** insert an authenticated API layer between the public client and n8n. The client never calls an n8n webhook directly again. n8n becomes an internal async worker triggered by the API layer (or by DB events), not a public endpoint.
 
### Stack decisions
| Layer | Choice | Why |
|---|---|---|
| Client | **Next.js 14 + TypeScript + Tailwind + shadcn/ui** | SEO for landlord acquisition, fast loads, magic-link/QR native, one language front-to-back |
| API/auth tier | **Supabase (Postgres + Auth + RLS + Storage, Sydney)**, or NestJS + Postgres if self-hosting continues | Fixes B1/B2/B3 mostly out-of-the-box; AU residency |
| Orchestration | **Keep n8n** but move it behind the API tier; secure with internal auth | Preserves the real backend investment |
| Domain logic | `packages/core` pure-TS (state machine, compliance rules) | Testable, framework-free; mirrors the current contract discipline |
| Payments (Phase 3) | Stripe Billing → Connect | |
| Voice/agents | Keep Sally token pattern; defer the other 8 agents | |
 
If the team prefers to keep the self-hosted VPS/n8n stack rather than adopt Supabase, that is acceptable **only if** B1/B2/B3 are solved explicitly: add Postgres RLS + a session-context pattern, put every webhook behind header-auth or an authenticated API gateway, and stand up a real API tier. Supabase just gives you these for free.
 
---
 
## 3. Salvage map (file-by-file disposition)
 
| Current asset | Disposition | Action |
|---|---|---|
| `n8n/database/tradie_app_schema.sql` (rental + compliance tables) | **KEEP + HARDEN** | Add RLS, migrate legacy `text` money → `numeric`, make `events` the source of truth |
| `compliance_*` tables | **KEEP — this is the moat** | Seed VIC ruleset; wire to reminders + certificate capture |
| `docs/api_contracts.md` | **KEEP** | Becomes the OpenAPI spec for the new API tier |
| `lib/services/*sally*`, `web/sally_elevenlabs_bridge.js` | **PORT** | Reimplement token-mint pattern in the API tier; keep server-side key handling |
| `lib/models/*.dart` (defensive parsers) | **PORT to TS** | Same fallback tolerance in zod schemas |
| `lib/features/*` (Flutter screens) | **DISCARD as code, KEEP as UX spec** | Rebuild in React; the flows/timeline/quote-list UX are good references |
| `start_job_screen.dart` | **DISCARD** | Re-implement as a 3-step wizard, logic in `core`, no hardcoded UAT data |
| 6 of 9 agents (Mia, Quintino, Nelly, Sparky, George extras, RAG/authority docs) | **PARK** (keep scripts, don't deploy) | Out of MVP scope |
| Sally (triage), Leo (landlord approval), Penny (payments) | **KEEP minimal** | Core to the MVP flow |
| Contabo IP fallback in config | **DELETE** | No hardcoded infra endpoints in client |
 
---
 
## 4. Data model fixes (do these to the schema)
 
1. **Enable RLS on every tenant-scoped table.** Introduce a real `org_id` (agency or self-managing landlord) on all domain tables. Policy: a row is visible only when `org_id = current_setting('app.current_org')`. Add automated policy tests (org A must never read org B).
2. **Replace mutable status with an append-only `events` table** as the source of truth: `(id, org_id, aggregate_type, aggregate_id, event_type, actor_type, actor_id, payload jsonb, created_at)`. Never UPDATE/DELETE. Current-status columns become a projection.
3. **Migrate legacy money to `numeric`**: `quotes.original_amount/current_amount`, `invoices.amount`. Store cents as `bigint` or `numeric(12,2)` consistently.
4. **Evidence integrity**: on `rental_job_evidence` and `compliance_certificates`, store `sha256`, original `exif jsonb`, `uploaded_by`, server `uploaded_at`. This is what makes a Compliance Pack audit-grade.
5. **Tokenised access**: `access_tokens (id, scope, aggregate_id, contact_id, expires_at, used_at)` for tenant/tradie link flows. No accounts for those personas at MVP.
---
 
## 5. Security remediation (B1–B3) — sprint 0, non-negotiable
 
- **B2 first (fastest):** put every n8n webhook behind authentication (header-auth token minted by the API tier, or move them off the public internet entirely so only the API tier can reach them). Remove `approved_by` as a client-supplied string — approver identity comes from the authenticated session/token, never the request body.
- **B3:** stand up the API tier. Client → API (authenticated) → n8n (internal). Delete the Contabo IP fallback. Add rate limiting on intake and approval routes.
- **B1:** RLS + `org_id` + session-context, with policy tests in CI. No external user touches data until this is green.
**Definition of done for sprint 0:** an automated test proves org A cannot read org B; an automated test proves an unauthenticated request to any n8n path is rejected; the client contains no infrastructure hostnames/IPs.
 
---
 
## 6. MVP scope (cut to this)
 
**In:** self-managing VIC landlord + small agency accounts; compliance dashboard (traffic lights from the catalogue); tenant QR/link intake (photo evidence, no account); request state machine + event log; landlord approval via magic link; tradie link job-card (accept/quote/schedule/evidence/invoice, no account); Sally text triage (voice optional); Compliance Pack PDF export; Stripe Billing.
 
**Out (park, don't delete):** Mia (social reputation), Quintino (skills intelligence), Nelly (quote intelligence), Sparky (electrical SME), RAG/authority documents, voice-first Sally, the ops "moat intelligence." These return in Phase 2+ once there's revenue and usage data to prioritise them.
 
---
 
## 7. Build order (each epic shippable)
 
**Sprint 0 — Security & foundations.** RLS + org_id + policy tests; API tier with authn/z; webhook auth; delete IP fallback; CI (typecheck, unit, RLS tests, preview deploys). *No feature work until B1–B3 pass.*
 
**Epic 1 — Compliance core (the wedge).** Port compliance catalogue → seed VIC rules (smoke 12mo, gas 24mo, electrical 24mo, switchboard, pool, minimum standards). Property onboarding with AU address autocomplete + 6-question wizard → traffic-light dashboard. Certificate upload (hashed, EXIF). Compliance Pack PDF. *Milestone: landlord sees accurate compliance status in <10 min.*
 
**Epic 2 — Requests + tenant intake.** State machine in `core` (reported→triaged→approval→quoting→scheduled→in_progress→evidence→verified→invoiced→paid→closed) with exhaustive transition tests. Event log authoritative. Tenant QR/link intake (photos, urgency, access windows), tokenised status page. Duplicate detection.
 
**Epic 3 — Approvals + notifications.** Auto-approve cap per property; urgent-repair bypass (VIC urgent list); one-tap approve/decline magic links (identity from token, not body). Notification engine (Resend + Twilio, logged). SLA timers.
 
**Epic 4 — Tradie flow (win here — incumbents are weak).** Tradie contacts with licence/insurance + expiry alerts. Work-order dispatch via email/SMS link. Tokenised job card: accept, quote, propose times vs tenant windows, before/after evidence, invoice upload. *Design bar: ≤3 taps from email, zero signup.*
 
**Epic 5 — Agency mode + billing.** Team seats/roles, owner-approval routing, monthly owner report PDF, CSV import (PropertyMe/Property Tree export formats), Stripe Billing tiers, usage limits.
 
**Epic 6 — Launch hardening.** WCAG 2.1 AA, perf budget (LCP <2.5s on 4G), pen-test of token/approval flows, backup/restore drill, APP privacy review, programmatic SEO pages per state compliance topic.
 
**Phase 2+ (reactivate parked backend):** AI triage (Sally + Nelly), PMS integrations, Xero, NSW/QLD rulesets, then Stripe Connect + tradie fast-pay + the parked agents.
 
---
 
## 8. Engineering standards
 
- Small PRs, each buildable/tested/documented (carry over from the current repo's good habits).
- `packages/core`: pure-TS domain logic, ≥90% coverage on state machine + compliance rules engine.
- Keep the **API-contract rule**: the client validates form completeness and formats display only; it never computes quotes, approvals, warranty, invoices, matching, or schedule. All such logic stays server-side.
- Playwright e2e on 4 golden paths: landlord onboard→compliance; tenant QR→request; approval→tradie complete w/ evidence; certificate upload→compliance item closes.
- RLS policy tests in CI against a seeded multi-org DB.
- No hardcoded infra hostnames/IPs in any client bundle. No secrets in client or Vercel env.
- Seed script: one realistic demo org (12 properties, mixed compliance states, requests across all statuses) — doubles as sales demo.
## 9. Definition of done for MVP launch
 
1. Org isolation proven by automated RLS tests; all n8n paths reject unauthenticated calls.
2. VIC landlord: signup → property → accurate compliance status in <10 min.
3. Tenant: QR → photo-evidenced request in <90s, no account.
4. Urgent request reaches a tradie's phone <60s after triage.
5. Tradie: accept→schedule→evidence→invoice entirely from links, zero signup.
6. Every request action reconstructable from the event log; Compliance Pack PDF is audit-grade.
7. Billing live on all tiers; money stored as `numeric` end-to-end.
 
