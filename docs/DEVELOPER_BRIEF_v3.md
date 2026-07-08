# 1Pacent — Developer Brief v3.0

**Prepared:** 2026-07-08
**Companion to:** `docs/PRODUCT_BRIEF_v3.md` — read that first for the *why*; this is the *how*.
**Supersedes:** `DEVELOPER_BRIEF_v2` as the active build target (its security remediations B1–B3 and its architecture rules in `docs/ARCHITECTURE.md` still hold — this brief extends, not replaces, that foundation).

---

## 1. What's already built (don't re-build this)

The current codebase already implements a working, tested, live-verified slice of the product brief:

- **Event-sourced multi-tenant core** (`packages/db/migrations/0001-0003`): `orgs`/`org_members` with RLS, append-only `events` table, tokenised `access_tokens` for zero-account tenant/tradie flows, `quotes` table with status lifecycle, `sally_conversations`/`sally_messages`/`sally_memory_chunks` (pgvector), `tradie_trust_scores` view.
- **Pure-TS domain logic** (`packages/core`): request state machine, VIC compliance catalogue + traffic-light engine, approval rules (auto-approve cap + urgent statutory bypass), quote validation, `computeQuoteAccuracy`/`classifyTrust` (§6.2 of the product brief, already implemented).
- **Sally, conversational, live and verified working end-to-end**: `packages/agents` (OpenRouter chat + structured extraction + embeddings, zero DB access by design) + `apps/web/src/lib/sally.ts` (orchestration) — a real conversation, on the deployed app, has completed, auto-approved, dispatched to 3 tradies, and written real pgvector memory.
- **3-tradie quote marketplace**: `DataSource.dispatchQuotesForRequest`/`getQuoteContext`/`submitQuoteByToken`/`acceptQuote`, tradie-facing `/q/[token]` submission page, landlord-facing quote picker with trust-tier badges on `/properties/[id]`.
- **n8n as a proven internal notification worker**: two live, header-auth-protected, tested workflows (`1PACENT-SALLY-DISPATCH-QUOTES`/`-NOTIFY`) sending real Resend emails — confirmed via execution logs, not just code review.
- **Deployed and live** on Vercel against a real Supabase project.

Everything below is scoped as **additions** to this foundation, not a rewrite. Where the product brief's requirements are already met, this brief says so explicitly and moves on.

---

## 2. Gap analysis — product brief §3/§5/§6 vs. current build

| Product brief requirement | Current state | Gap |
|---|---|---|
| Live price band during Sally's call (§3.2, tier 1) | Sally proposes a *rough estimate* via LLM (`callOutFeeEstimateCents` in `packages/agents/src/sally/extract.ts`) | **Real gap.** This is an LLM guess, not the deterministic percentile-over-comparables engine the product brief requires. Needs building (§4.1). |
| Tradie rate card auto-populating quotes (§3.2 tier 2, §5.4.4) | Tradie fills in a raw dollar figure on `/q/[token]` | **Real gap.** No `tradie_rate_cards` concept exists. Needs building (§4.2). |
| Weighted 3-quote ranking, trust/cost/availability (§5.2.2, §6.1) | Quotes are listed in submission order, no ranking | **Real gap.** Needs the scoring formula (§4.3). |
| ETA band on the call (§3.1) | Not computed | **Real gap.** Needs a lightweight historical-response-time query (§4.4). |
| Property manager "informed not triaging" (§5.3) | Only `owner`/`tenant`/`tradie` contact kinds exist; no PM-specific role or notification-only path | **Real gap.** Needs a role addition (§4.5). |
| Tradie's own AI receptionist for their whole business (§5.4.2) | Sally only exists inside the tenant-intake flow (`/r/[token]`), scoped to one org's properties | **Real gap, biggest epic.** Needs a parallel Sally surface scoped to a tradie's own business (§5). |
| Trust score anti-gaming rules — min sample, decay (§6.2) | `classifyTrust` already gates on `MIN_JOBS_FOR_TRUST`; no time-decay yet | **Partial.** Decay is a small addition (§4.6). |
| Configurable auto-approval thresholds per property/trade/category (§5.2, §5.3) | `decideApproval` supports a per-property cap + urgent bypass only, not per-trade/category granularity | **Partial**, acceptable for v1 — flagged, not urgent (§7). |
| Signed, non-guessable job-status link | `/r`/`/a`/`/q` tokens already SHA-256-hashed and scoped — the pattern is right | **No gap.** A customer-facing `/status/[token]` page just needs to reuse the existing token machinery. |
| Compliance catalogue, jurisdiction-sourced | Already built, VIC-seeded, extensible | **No gap.** |
| Invoicing / payments | Not built | **Deliberately out of scope for this phase** — product brief §9 defers this to Phase 3. |

---

## 3. Data model additions

New migration `packages/db/migrations/0004_rate_cards_scheduling_pm.sql`. Follow the existing conventions exactly: `org_id`-scoped, RLS via the `do $$ foreach` pattern, money as `bigint` cents, no new patterns invented where an old one already fits.

```sql
-- Rate cards: what a tradie actually charges, configured once, drives auto-drafted quotes.
create table tradie_rate_cards (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references orgs(id) on delete cascade,
  tradie_contact_id   uuid not null references contacts(id),
  call_out_fee_cents  bigint not null check (call_out_fee_cents >= 0),
  hourly_rate_cents   bigint not null check (hourly_rate_cents >= 0),
  updated_at          timestamptz not null default now()
);
create unique index on tradie_rate_cards (tradie_contact_id);

-- Standard job-type prices layered on top of the base rate card (e.g. "power point install: $180 flat").
create table tradie_rate_card_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  rate_card_id    uuid not null references tradie_rate_cards(id) on delete cascade,
  category        text not null,             -- matches @1pacent/core's RequestCategory
  flat_price_cents bigint check (flat_price_cents >= 0),
  typical_minutes  integer check (typical_minutes > 0)
);
create index on tradie_rate_card_items (rate_card_id, category);

-- Availability windows, used by the scheduling score (§4.4) — deliberately simple (day-of-week +
-- time-of-day bands), not a full calendar sync in this phase.
create table tradie_availability_windows (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  tradie_contact_id  uuid not null references contacts(id),
  day_of_week        integer not null check (day_of_week between 0 and 6),
  start_time         time not null,
  end_time           time not null
);
create index on tradie_availability_windows (tradie_contact_id, day_of_week);

-- Property manager: a distinct contact kind, informed-not-gating by default.
alter table contacts drop constraint contacts_kind_check;
alter table contacts add constraint contacts_kind_check
  check (kind in ('tenant', 'tradie', 'owner', 'property_manager'));

-- Per-property PM notification preference — does this PM need to approve, or just be informed?
alter table properties add column pm_contact_id uuid references contacts(id);
alter table properties add column pm_approval_required boolean not null default false;
```

RLS: apply the standard org-isolation policy to `tradie_rate_cards`, `tradie_rate_card_items`, `tradie_availability_windows` exactly as done for `quotes` in migration 0003.

---

## 4. Core algorithms — pure TS in `packages/core`, mirroring the old system's *proven* logic

The old n8n build's real value was in these formulas, executed as raw SQL inside Code nodes with no tests and no version control discipline. Port the *logic*, not the SQL — as tested, pure TypeScript functions in `packages/core`, called from `apps/web/src/lib/supabase-data.ts` exactly like `computeQuoteAccuracy`/`classifyTrust` already are.

### 4.1 Pricing engine — `packages/core/src/pricing/estimate.ts`

```ts
export interface ComparableJob {
  finalInvoiceCents: number;
  category: RequestCategory;
}

export interface PriceBand {
  lowCents: number;
  highCents: number;
  confidence: "low" | "medium" | "high";
  evidenceCount: number;
}

export function estimatePriceBand(category: RequestCategory, comparables: ComparableJob[]): PriceBand {
  // 3+ comparables: 25th/75th percentile of finalInvoiceCents, tight band.
  // 1-2: looser band around the median.
  // 0: documented per-category fallback table (not an LLM guess).
  // confidence: blend of evidenceCount and comparables' own accuracy history.
}
```

This is the function that replaces Sally's current LLM-guessed `callOutFeeEstimateCents`. Call it from `apps/web/src/lib/supabase-data.ts` (a new `getPriceBand(category, propertySuburb)` DataSource method querying completed `work_orders`/`quotes` for comparables), and inject the *result* into Sally's system prompt as a fact she states, not a number she invents — matching the non-negotiable "AI never sets a binding price" rule already enforced elsewhere in this codebase.

### 4.2 Rate-card-driven quote drafting

When a tradie opens `/q/[token]`, pre-fill the quote form from `tradie_rate_cards`/`tradie_rate_card_items` (matched by the request's category) instead of a blank input. This is a `DataSource.getQuoteContext` extension — add `suggestedQuoteCents`/`suggestedCallOutFeeCents` to `QuoteContext`, computed server-side from the tradie's own rate card, never from the AI. The tradie still confirms or edits before submitting — the binding-price-comes-from-a-human rule holds.

### 4.3 Quote ranking — `packages/core/src/quotes/ranking.ts`

```ts
export interface RankableQuote {
  quoteId: string;
  totalCents: number;   // quote + call-out fee
  trustScore: number;   // 0-100, from classifyTrust's inputs
  availabilityScore: number; // 0-100, from §4.4
}

export function rankQuotes(quotes: RankableQuote[]): Array<RankableQuote & { compositeScore: number }> {
  // Normalise cost across the set (cheapest = 100), then:
  // compositeScore = trustScore*0.40 + normalisedCostScore*0.35 + availabilityScore*0.25
  // Sort descending. This is the validated formula from the old build's RENTAL-105 —
  // keep the weights unless/until real usage data says otherwise.
}
```

Wire into `apps/web/src/app/properties/[id]/page.tsx`'s quote-fetching logic (currently just lists `listQuotesForRequest` output in submission order) — sort by `compositeScore` before rendering, and surface the score/rank on `QuotesPanelQuote`.

### 4.4 Availability / scheduling score — `packages/core/src/scheduling/score.ts`

```ts
export function scoreAvailability(input: {
  tradieRespondedWithinMinutes: number | null; // null if not yet responded
  matchesTenantPreferredWindow: boolean;
  currentOpenJobCount: number;
}): number {
  // 0-100. Faster response + preferred-window match score higher; busy tradies score lower.
  // Mirrors the old system's availability_score shape, simplified (no real routing/travel-time
  // calculation yet — that's a real gap in the old system too, don't rebuild the fake
  // suburb-string heuristic, just don't promise travel-optimised scheduling until there's a
  // real maps/routing integration to back it).
}
```

Also back the **ETA band** (product brief §3.1): a `DataSource.getTypicalResponseWindow(category, urgency, suburb)` method querying historical `quote_invited → quote_submitted` timestamp deltas for comparable past requests, surfaced to Sally as a stated fact ("typically responds within...") during the live conversation — same non-invented-number discipline as pricing.

### 4.5 Property manager — informed, not gating

Extend `DataSource.acceptQuote` (and the auto-approve path in `completeSallyConversation`/`decideApprovalByToken`) to check `properties.pm_approval_required`:
- `false` (default): PM contact gets a notification email (via the existing n8n `1PACENT-SALLY-DISPATCH-NOTIFY` pattern — add a PM CC, don't build a new workflow for this) alongside the landlord, informing them of the decision already made.
- `true`: the approval flow requires the PM's token/session, not the landlord's, before `acceptQuote` proceeds — same mechanism as landlord approval today, just a different `contact_id` gating it.

This directly implements the product brief's "PM is informed, not a mandatory checkpoint, unless explicitly configured otherwise" requirement with no new architectural pattern — it's a boolean flag and a contact reference.

### 4.6 Trust score decay

Extend `packages/core/src/trust/scoring.ts`'s `classifyTrust` (or add a sibling function) to weight recent jobs more heavily — a simple rolling window (e.g. last 20 jobs, or last 12 months) rather than an all-time average, so a tradie's score reflects current performance. This is a small, well-tested addition to an already-built function, not new architecture.

---

## 5. The tradie AI business assistant — the biggest new epic

Product brief §5.4 requires a tradie's *own* Sally, answering *their* calls (not just marketplace-sourced ones), for their whole business. This is architecturally a **new conversation surface**, reusing everything already built:

- **Reuse as-is:** `packages/agents` (OpenRouter client, prompt/extraction/memory patterns), the `sally_conversations`/`sally_messages`/`sally_memory_chunks` schema (already `contact_id`-scoped, which is exactly right — a tradie's customer is just a different `contact_id` than a tenant), ElevenLabs TTS route.
- **New:** a **tradie-scoped entry point** — e.g. a tradie's own shareable intake link/number, distinct from a property's `/r/[token]`, where the "property" concept doesn't apply and the conversation's purpose is lead capture + quote drafting for that tradie's *own* customer, not a landlord's maintenance request.
- **New prompt variant**: `packages/agents/src/sally/prompts.ts` needs a second persona mode (or a parameterised "operating context": `tenant_intake` vs `tradie_lead_capture`) — same guardrails (never diagnose, never invent a firm price), different framing ("Hi, you've reached {tradie_business_name}...", matching the vault Sally MVP brief's validated identity script).
- **New completion path**: instead of `completeSallyConversation` creating a `maintenance_request` tied to a property, a tradie-lead conversation creates a lead record tied to the tradie directly, auto-drafts a quote from their rate card (§4.2), and notifies the tradie (their own version of "a lead + draft quote appeared in your inbox").
- **Explicitly phase this as text-first, matching the rest of this build** (product brief §9) — the vault brief's live-call-answering "wow" moment (Twilio call-forwarding + ElevenLabs mid-call) is real but is a Phase 2 telephony investment, not a Phase 1 requirement to prove the loop.

---

## 6. Guardrails carried forward, non-negotiable

Everything found broken, unauthenticated, or dangerously permissive in the old system's actual code (`docs/N8N_WORKFLOW_AUDIT.md`, plus this session's forensic read of `docs/tradie-import/`) must not be reintroduced:

1. **Every customer-facing lookup is a signed, scoped, single-issue token** — the old system's `/status/lookup` and both `/customer/job-status` variants returned raw, unredacted PII off a guessable bare reference string with no auth. This codebase's `access_tokens` pattern already fixes this; any new endpoint (tradie job-status, PM notification links) must use it, no exceptions.
2. **AI never sets a binding price, never sends a payment request without a human action triggering it.** The old system's Penny agent had the first half enforced in code but the second half only as an unenforced prompt instruction — when payments are eventually built (Phase 3), the "send payment request" action must require an explicit tradie action, not just an LLM tool call with no gate, whatever the prompt says.
3. **No multi-tenancy retrofits.** The old system had none, anywhere, in the tradie/agent-memory/knowledge layer (confirmed: zero `tenant_id` columns in that entire subsystem). Every new table in this brief is `org_id`-scoped with RLS from its first migration, per existing convention.
4. **No premature complexity.** Do not build: a general agent-catalog registry with programmatic handoff routing, message-template "variants," a bespoke Trust Passport object distinct from the formulaic score in §4.6, or a live social-media publish integration. All four were built in the old system and never used — resist rebuilding them until real usage data asks for them.
5. **n8n stays an internal, header-auth-only notification worker.** No new workflow gets a public, unauthenticated webhook; no new workflow performs a database write the API tier hasn't already committed (the existing `1PACENT-SALLY-DISPATCH-*` workflows are the reference pattern — copy their shape, don't invent a new one).

---

## 7. Explicitly deferred, not urgent

- Per-trade/per-category auto-approval threshold granularity (current per-property cap + urgent bypass is an acceptable v1).
- Real travel-time/routing-based scheduling (the old system's version was a fake suburb-string heuristic — don't rebuild that; wait for a real maps/routing integration before promising travel-optimised scheduling).
- Pre-job materials stock-level checking (currently, and acceptably for v1, inventory is only decremented after the fact).
- Any BAS/tax lodgement functionality — invoice-ready export and accountant handover is the permanent ceiling, not a v1 limitation to later exceed.

---

## 8. Build order

1. **Migration 0004** (§3) + RLS tests, following the exact pattern in `packages/db/test/rls.test.ts`.
2. **Pricing engine** (§4.1) + tests, wired into Sally's prompt context (replacing the LLM-guessed call-out fee range) and into the tenant-facing conversation.
3. **Rate cards** (§4.2): a tradie-facing settings page to configure call-out fee/hourly rate/category prices, and the `/q/[token]` quote form pre-fill.
4. **Quote ranking** (§4.3) + **availability scoring** (§4.4), wired into the landlord's quote picker and Sally's stated ETA band.
5. **Property manager role** (§4.5): schema, notification-vs-approval branching, PM portfolio view.
6. **Trust decay** (§4.6): small, isolated addition to already-tested code.
7. **Tradie AI business assistant** (§5): the larger epic — new conversation entry point, prompt variant, lead-to-quote completion path, tradie inbox UI. Ship as its own vertical slice, demoable independently of the marketplace flow.
8. **End-to-end verification** the same way this codebase already proved the marketplace loop: a real conversation, real dispatch, real database inspection, real email confirmation — not just green tests. This project has a working playbook for that now; use it again.
