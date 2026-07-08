# 1Pacent — Developer Brief v5: The Crew Room

Companion to `docs/PRODUCT_BRIEF_v5.md` concept #1. End-to-end buildable spec against the codebase as it exists after Developer Brief v4 shipped (commit `91ebfb9`). Everything here extends live, verified code — no rewrites.

## 0. Ground truth this brief is built on

- `events` is already the source of truth and already attributed: `actor_id` values in production include `sally`, `approval-rules`, `approval-policy`, `warranty-routing`, `quote-dispatch`, `auto-payment`, `dashboard`, `token:<id>`. **The crew feed is 90% a presentation layer over data we already write.**
- `work_orders` already has `scheduled_for` (0001, never populated), `completion_note`, `asset_id`, `warranty_expires_at`, `invoice_cents` (0010–0011, all live).
- `tradie_availability_windows` exists and is seeded (0004) — nothing reads it except the availability score.
- Sally computes a live price band per turn (`buildLiveHints` in `apps/web/src/lib/sally.ts`) and **throws it away** — it's spoken, never persisted.
- Quote-vs-actual data now really exists (v4 job completion verified live) — `tradie_trust_scores` works. Quinn's insights are a deterministic aggregation over data already flowing.
- The state machine needs **no changes**: `accept_quote` already lands the request in `scheduled`; slot confirmation is a `work_orders.scheduled_for` update + an events row with a payload note, not a transition.

## 1. Migration `0014_crew_room.sql`

```sql
-- Crew Room (Developer Brief v5): Quinn's insight ledger, George's slot
-- proposals, Nelly's persisted evidence, and the robot-ready Job Spec.

create table crew_insights (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  agent       text not null check (agent in ('sally','leo','nelly','george','penny','quinn')),
  scope       text not null,            -- e.g. 'quote_accuracy', 'cycle_time', 'warranty_savings'
  content     text not null,            -- plain-language insight, deterministic-generated
  metrics     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index on crew_insights (org_id, created_at desc);

alter table work_orders add column proposed_slots jsonb;   -- George: [{start,end}, ...] ISO strings
alter table work_orders add column job_spec jsonb;         -- built at invoice time, versioned {specVersion:1,...}
alter table maintenance_requests add column price_band jsonb; -- Nelly: {lowCents,highCents,confidence,evidenceCount,computedAt}

alter table crew_insights enable row level security;
create policy crew_insights_org_isolation on crew_insights for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));
```

## 2. `packages/core` additions (pure, tested, zero I/O)

### 2.1 `src/crew/registry.ts` — the crew as a first-class concept

```ts
export const CREW = {
  sally:  { name: "Sally",  role: "Front of house",  description: "Talks to renters and callers; scopes every issue." },
  leo:    { name: "Leo",    role: "Approvals",       description: "Routes decisions, applies standing instructions, catches warranties." },
  nelly:  { name: "Nelly",  role: "Pricing",         description: "Prices from real comparable jobs; publishes her own accuracy." },
  george: { name: "George", role: "Scheduling",      description: "Proposes real slots from live availability." },
  penny:  { name: "Penny",  role: "Payments",        description: "Invoices and records payment." },
  quinn:  { name: "Quinn",  role: "Improvement",     description: "Watches everything; turns outcomes into better estimates." },
} as const;
export type CrewAgent = keyof typeof CREW;

/** Maps existing event actor_ids to crew members. Unmapped actors (humans,
 * tokens, 'dashboard') return null — they render as the person they are. */
export function attributeActor(actorId: string): CrewAgent | null;
// mapping: sally→sally; approval-rules|approval-policy|warranty-routing→leo;
// quote-dispatch→nelly; auto-payment→penny; slot-proposal|george→george; quinn→quinn
```

Attribution note: the archive's agent charter (see PRODUCT_BRIEF_v5 §1) makes Leo the approvals persona (`docs` v2-era "Leo/approval" + `RENTAL-110` warranty guard is an approvals-path decision); the quote *round* belongs to Nelly (her charter: quote intelligence), while George owns *time* only.

### 2.2 `src/scheduling/slots.ts` — George's slot proposer

```ts
export interface AvailabilityWindow { dayOfWeek: number; startTime: string; endTime: string } // "09:00"
export interface ExistingBooking { start: Date; end: Date }
export interface ProposedSlot { start: Date; end: Date }

/** Next `count` non-overlapping 2-hour slots inside the tradie's windows,
 * skipping existing bookings, starting from `from` (exclusive of same-hour).
 * Pure: caller passes `from` — no Date.now() inside. */
export function proposeSlots(
  windows: readonly AvailabilityWindow[],
  bookings: readonly ExistingBooking[],
  from: Date,
  count?: number, // default 3
): ProposedSlot[];
```

Tests: empty windows → []; skips a day fully booked; respects window boundaries; deterministic for fixed `from`.

### 2.3 `src/insights/quote-accuracy.ts` — Quinn's deterministic insight compiler

No LLM. Insights are computed facts rendered through fixed templates — same ethos as the pricing engine (never invented, always evidenced).

```ts
export interface CompletedJobFact {
  category: RequestCategory; quoteCents: number; invoiceCents: number;
  reportedAt: Date; closedAt: Date; wasWarrantyClaim: boolean;
}
export interface CrewInsight { agent: "nelly" | "quinn" | "leo"; scope: string; content: string; metrics: Record<string, number> }

/** Emits insights only where the sample earns them (>=3 jobs in a category):
 * - nelly/quote_accuracy: signed variance by category ("estimates ran 9% low across 5 electrical jobs")
 * - quinn/cycle_time: median report→closed hours vs previous cohort
 * - leo/warranty_savings: count + summed avoided quote value of warranty catches */
export function compileInsights(jobs: readonly CompletedJobFact[]): CrewInsight[];
```

### 2.4 `src/jobs/spec.ts` — the robot-ready Job Spec

```ts
export interface JobSpecInput { /* property address, asset {label,category,installedAt},
  request {title,description,category,isWarrantyClaim}, resolution {completionNote, reportedAt, closedAt},
  commercials {quoteCents, invoiceCents, callOutFeeCents, warrantyMonths}, executor {tradieContactId} */ }
export interface JobSpec { specVersion: 1; /* …normalised, executor-neutral shape… */ }
export function buildJobSpec(input: JobSpecInput): JobSpec;
```

Deliberately boring: normalisation + versioning, fully tested. Its value is *existing consistently on every job from now on* (PRODUCT_BRIEF_v5 §2), not cleverness.

Export all four modules from `packages/core/src/index.ts`. Tests: `test/crew-registry.test.ts`, `test/slots.test.ts`, `test/insights.test.ts`, `test/job-spec.test.ts`.

## 3. Data layer (`data-types.ts` + both implementations, demo parity as always)

```ts
// Crew feed — merged, attributed, ordered event narrative
getCrewFeed(propertyId: string): Promise<CrewFeedItem[]>;          // property-level
getPortfolioCrewFeed(): Promise<CrewFeedItem[]>;                   // dashboard, latest N across org
// CrewFeedItem: { agent: CrewAgent | null, actorLabel: string, headline: string,
//   detail?: string, at: string, requestId?: string, propertyAddress?: string }

// George
confirmSlot(tradiePortalToken: string, workOrderId: string, slotStartIso: string): Promise<{ok:boolean;error?:string}>;

// Quinn
listCrewInsights(): Promise<CrewInsightView[]>;                    // org-scoped, newest first
```

Wiring changes to existing methods (all in `supabase-data.ts` + `store.ts`):
1. **Nelly persists her evidence**: `sally.ts#buildLiveHints` already computes the band — thread it through so `completeSallyConversation` writes `maintenance_requests.price_band`. If absent at dispatch time, `dispatchQuotesForRequest` computes and writes it (same `estimatePriceBand` call — one shared helper).
2. **George proposes at acceptance**: at the end of `acceptQuoteTx` (and the warranty-routing work-order insert), load the winning tradie's `tradie_availability_windows` + their future `scheduled_for` bookings, call `proposeSlots(..., new Date())`, store on `work_orders.proposed_slots`, append an events row (`actor_id:'george'`, payload `{slots}` — event_type reuses `schedule`? **No** — no FSM event; write it as a `quote`-style aggregate? Keep it simple: payload-only note on the existing accept event is *not* visible enough, so append `aggregate_type:'work_order', event_type:'slot_proposed'` — `work_order` is already a legal aggregate_type (0001) and non-request aggregates don't feed `projectState`, mirroring how quote events already work).
3. **Tradie confirms**: `confirmSlot` validates the slot ∈ proposed_slots, sets `work_orders.scheduled_for`, appends `slot_confirmed` (aggregate work_order, actor tradie). Jobs panel: scheduled jobs show George's 3 slots as one-tap buttons.
4. **Tenant sees it**: renter tracker already renders event steps — extend `getRequestStatusForContact` to join the work order and inject a "George: booked Thu 2–4 pm" step when `scheduled_for` is set.
5. **Quinn compiles on completion**: at the end of `invoiceJob`, load this org's completed-job facts (existing trust/comparables queries already fetch most of this), run `compileInsights`, upsert-append new rows to `crew_insights` (dedupe on `(agent, scope, metrics->>'cohortKey')` so re-invoicing doesn't spam).
6. **Job Spec on invoice**: `invoiceJob` assembles `buildJobSpec(...)` and writes `work_orders.job_spec`.

## 4. UI

- **`/properties/[id]` — Crew Room section** (server component + plain rendering, same bundle rules: no `@1pacent/core` in client files): the attributed feed, newest first, each item as `[avatar-chip Agent] headline — detail · time`. Crew chips use initials + role tooltips from `CREW`. Insights relevant to this property's categories surface inline.
- **`/dashboard` — "Your crew today"** strip above the portfolio: latest portfolio feed items + Quinn's newest insight. This is the first thing a demo shows.
- **`/t/[token]` — "Your crew" summary**: counts per agent (Sally: N leads · Nelly: N suggested quotes, accuracy ±x% · George: N slots awaiting your confirm · Penny: N invoiced) + slot-confirm buttons in the jobs panel.
- **`/r/[token]`** — tracker steps gain agent names ("Sally logged this", "Leo approved under your landlord's standing instruction", "George booked Thu 2–4 pm").
- **Property page passport area** — completed work orders expose "Job Spec" (rendered summary + raw JSON download). Copy: "Every job leaves a machine-readable record — the property's permanent operating manual."
- Standing-instructions reframe: retitle the v4 policy card "Standing instructions to your crew" (copy-only change).

## 5. Demo readiness (so the Crew Room is never empty)

Extend `seed-demo.ts` + a non-destructive `backfill-demo-v5.ts` (same skip-if-exists discipline as v3's): 4–6 *closed* work orders with realistic quote/invoice pairs across categories and dates, so on first open Nelly has published accuracy, Quinn has 2 insights, one warranty is open, and the feed has history. Without this the flagship page demos empty — treat seed quality as a launch requirement, not a nicety.

## 6. Build order

1. Migration 0014 + core modules + tests (`pnpm -r typecheck && pnpm -r test` green).
2. Nelly persistence + George proposal/confirm + data-layer feed methods (demo store parity throughout).
3. Quinn compile-on-invoice + Job Spec on invoice.
4. UI: Crew Room section, dashboard strip, tradie crew summary, tracker names, spec download, policy retitle.
5. Seed/backfill for demo readiness; run backfill against live.
6. **Live E2E** (same discipline as v4's verified pass): raise issue → watch feed attribute Sally/Leo/Nelly → quotes in → policy auto-accept shows as Leo → George's slots appear → confirm slot as tradie → tenant tracker shows window → complete + invoice → Quinn insight lands + Job Spec attached + Nelly accuracy updates. Clean up by explicit IDs only (v4 lesson: no unscoped deletes, route cleanup through scoped app code).
7. Typecheck, tests, production build, commit, push, confirm Vercel READY, spot-check live routes.

## 7. Non-goals restated (build discipline)

No LLM in Quinn/insights (deterministic templates only). No FSM changes. No telephony/payments/Sparky/Mia (PRODUCT_BRIEF_v5 §6). No robot hardware anything — the Job Spec *is* the robot deliverable.
