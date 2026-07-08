# 1Pacent — Developer Brief v4

Companion to `docs/PRODUCT_BRIEF_v4.md`. This is the buildable spec — schema, files, build order, test plan.

## 0. Ground truth checked before writing this

- `work_orders` (0001, +cols in 0003) has `quote_cents`, `invoice_cents`, `call_out_fee_cents`, `quote_id`, `tradie_contact_id`, `status`. **`invoice_cents` is written nowhere in application code.** `tradie_trust_scores` (0007) and `getComparableJobs` both depend on it and have therefore never returned real data against live traffic.
- The state machine (`packages/core/src/requests/state-machine.ts`) already defines `scheduled → in_progress (start_work, tradie) → evidence_pending (submit_evidence, tradie) → verified (verify, tenant) → invoiced (invoice, tradie) → paid (record_payment) → closed (close)`. No code fires any of these events today. Build order 1 below wires this up — everything else depends on it.
- `events.aggregate_type` already accepts `'property'` (0001) — ownership/occupancy changes can be logged without an events migration.
- `RequestCategory` (`packages/core/src/requests/urgency.ts`) is the category vocabulary to reuse for `property_assets.category` — validated app-side, not a DB check constraint, matching the existing `tradie_rate_card_items.category` convention.
- Approval today happens **at intake**, before any quote exists, via `decideApproval({ estimateCents: 0, ... })` in `completeSallyConversation` (`supabase-data.ts`) — `estimateCents` is hardcoded `0`, so for any non-urgent category the outcome is always `request_approval`. This is why §3.3 moves the auto-approve decision to *after* quotes exist, where a real price is available. The existing intake-time gate (urgent bypass vs. everything else needs a human before quoting starts) is left as-is — it answers a different question ("should we spend time getting quotes at all") from the new post-quote policy ("given this specific quote, does it need a human").

## 1. Migration 0010 — job lifecycle wiring (no new tables, new columns only)

```sql
-- 0010_job_completion.sql
alter table work_orders add column completion_note text;
alter table work_orders add column asset_id uuid; -- FK added in 0011 after property_assets exists
```

Nothing else needed schema-side for the lifecycle itself — `start_work`/`submit_evidence`/`verify`/`invoice`/`record_payment`/`close` are all just `events` rows + `work_orders.status`/`invoice_cents` projections, exactly like every other transition in the codebase.

## 2. Migration 0011 — warranty & asset registry

```sql
-- 0011_property_assets_warranty.sql
create table property_assets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  category     text not null, -- RequestCategory, validated app-side
  label        text not null,
  installed_at date,
  created_at   timestamptz not null default now()
);
create index on property_assets (org_id, property_id, category);

alter table work_orders add constraint work_orders_asset_id_fkey
  foreign key (asset_id) references property_assets(id);
alter table work_orders add column warranty_expires_at timestamptz;

alter table maintenance_requests add column warranty_claim_of_work_order_id uuid references work_orders(id);

do $$ begin
  execute format('alter table %I enable row level security', 'property_assets');
  execute format(
    'create policy %I_org_isolation on %I for all
       using (org_id in (select app_user_org_ids()))
       with check (org_id in (select app_user_org_ids()))', 'property_assets', 'property_assets');
end $$;
```

## 3. Migration 0012 — approval policy engine

```sql
-- 0012_approval_policy.sql
create table approval_policy_rules (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  property_id        uuid not null references properties(id) on delete cascade,
  priority           integer not null default 0,
  max_total_cents    bigint check (max_total_cents >= 0),
  min_trust_score    integer check (min_trust_score between 0 and 100),
  exclude_categories text[] not null default '{}',
  enabled            boolean not null default true,
  created_at         timestamptz not null default now()
);
create index on approval_policy_rules (org_id, property_id, priority);

do $$ begin
  execute format('alter table %I enable row level security', 'approval_policy_rules');
  execute format(
    'create policy %I_org_isolation on %I for all
       using (org_id in (select app_user_org_ids()))
       with check (org_id in (select app_user_org_ids()))', 'approval_policy_rules', 'approval_policy_rules');
end $$;
```

## 4. Migration 0013 — ownership & occupancy

```sql
-- 0013_ownership_occupancy.sql
alter table properties add column occupancy_status text not null default 'tenanted'
  check (occupancy_status in ('owner_occupied', 'tenanted', 'vacant'));
alter table properties add column owner_contact_id uuid references contacts(id);
```

## 5. `packages/core` additions (pure, tested, zero I/O)

- `src/approvals/policy.ts`
  ```ts
  export interface ApprovalPolicyRule {
    maxTotalCents: number | null;
    minTrustScore: number | null;
    excludeCategories: readonly RequestCategory[];
  }
  export interface PolicyEvaluationInput {
    category: RequestCategory;
    totalCents: number;
    trustScore: number;
  }
  export interface PolicyEvaluationResult {
    autoApprove: boolean;
    matchedRuleIndex: number | null;
  }
  export function evaluateApprovalPolicy(
    rules: readonly ApprovalPolicyRule[],
    input: PolicyEvaluationInput,
  ): PolicyEvaluationResult;
  ```
  Rules evaluated in array order (caller sorts by `priority` first). A rule matches if the category isn't excluded, and `totalCents`/`trustScore` satisfy its (nullable = no constraint) thresholds. First match wins. No match → `autoApprove: false`.

- `src/warranty/match.ts`
  ```ts
  export interface WarrantyCandidate {
    workOrderId: string;
    tradieContactId: string;
    category: RequestCategory;
    warrantyExpiresAt: Date;
  }
  export function findWarrantyMatch(
    candidates: readonly WarrantyCandidate[],
    category: RequestCategory,
    now: Date,
  ): WarrantyCandidate | null;
  ```
  Picks the candidate matching `category` with the latest `warrantyExpiresAt` still `> now` (most recent applicable job). Pure, tested with fixed dates (no `Date.now()` inside — caller passes `now`).

Export both from `packages/core/src/index.ts`. Unit tests: `test/approval-policy.test.ts`, `test/warranty-match.test.ts`.

## 6. `apps/web/src/lib` — data layer

`DataSource` (`data-types.ts`) additions:

```ts
// Job lifecycle
listTradieJobs(tradiePortalToken: string): Promise<TradieJobSummary[]>;
startJob(tradiePortalToken: string, workOrderId: string): Promise<{ ok: boolean; error?: string }>;
markJobDone(tradiePortalToken: string, workOrderId: string, note: string): Promise<{ ok: boolean; error?: string }>;
confirmFixed(tenantIntakeToken: string, requestId: string): Promise<{ ok: boolean; error?: string }>;
invoiceJob(tradiePortalToken: string, workOrderId: string, input: {
  invoiceCents: number; callOutFeeCents: number; warrantyMonths: number;
  assetLabel?: string; assetCategory?: RequestCategory; assetInstalledAt?: string;
}): Promise<{ ok: boolean; error?: string }>;

// Ownership & occupancy
updatePropertyOwnership(propertyId: string, input: {
  occupancyStatus: "owner_occupied" | "tenanted" | "vacant"; ownerContactId: string | null;
}): Promise<{ ok: boolean; error?: string }>;

// Renter status tracker
getRequestStatusForContact(tenantIntakeToken: string): Promise<TenantRequestStatus[]>;

// Approval policy (dashboard-managed, per property)
getApprovalPolicy(propertyId: string): Promise<ApprovalPolicyRuleView[]>;
saveApprovalPolicy(propertyId: string, rules: ApprovalPolicyRuleInput[]): Promise<{ ok: boolean; error?: string }>;
```

`submitQuoteByToken`'s result type gains an optional field surfaced to the caller so the action layer can send the same "you got the job" email the manual accept path already sends:

```ts
{ ok: true; autoAccepted?: { requestId: string; accepted: {...}; declined: [...] } }
```

Implement in both `supabase-data.ts` (real) and `store.ts` (demo parity) — same pattern as every prior feature this session.

### Warranty routing hook

Inside `completeSallyConversation` (`supabase-data.ts`), before the existing triage/approval-decision block: query `work_orders` joined to `property_assets` for this property, status `closed`, `warranty_expires_at > now`; run `findWarrantyMatch` against the new request's category. If matched:
- Set `maintenance_requests.warranty_claim_of_work_order_id`.
- Fire `triage` then `auto_approve` (actor `system`, payload note `"Warranty claim — routed to original tradie"`) then `request_quotes` (actor `system`) directly to `quoting`, skipping the normal urgent/pending_approval branch entirely.
- Call a new `dispatchQuotesForRequest(requestId, { onlyTradieId })` overload — same function, an optional restriction that invites exactly one tradie instead of the top 3.

### Approval-policy trigger hook

Inside `submitQuoteByToken`, after writing the submitted quote: query all quotes for the request; if none remain in `invited` status (all resolved), fetch trust summaries + rank via the existing `rankQuotes`/`scoreTrust`/`scoreAvailability` (same composition already used in `properties/[id]/page.tsx` — factor the "rank this request's quotes" logic into one shared helper both call, do not duplicate it a third time), take rank 1, fetch this property's `approval_policy_rules` (priority order), call `evaluateApprovalPolicy`. Match → run the exact same accept/decline/work-order-insert sequence `acceptQuote` already performs (factor into a private helper both call) and return `autoAccepted` in the result. `/q/[token]/actions.ts` checks for `autoAccepted` and calls `triggerDispatchNotify`, same as `acceptQuoteAction` already does.

## 7. UI

- `/t/[token]` (tradie portal): **My jobs** card — three lists (Scheduled → Start job / In progress → Mark done / Awaiting your invoice → invoice form with warranty months + asset fields). New client component `jobs-panel.tsx` + actions in `actions.ts` (new file, this route doesn't have one yet).
- `/r/[token]`: new section below the chat, **Your requests** — status tracker per request (reuse the timeline styling already established for the passport pitch is *not* required here; keep it consistent with the rest of the app's existing plain Tailwind style, not the artifact's passport theme) + a **Confirm it's fixed** button on any `evidence_pending` request.
- `/properties/[id]`: small **Ownership** card (occupancy + current owner, editable) and an **Approval policy** card (list of rules, add/edit/remove, save) alongside the existing compliance/requests sections.
- `/pm/[token]`: extend the existing portfolio view with a **Batchable compliance** section — groups of 2+ properties sharing a requirement + suburb + ~30-day window.

## 8. Build order

1. Migration 0010 + job-lifecycle data-layer methods + tradie/tenant UI. **Verify live**: seed or use an existing accepted quote, walk start→done→confirm→invoice end to end, confirm `tradie_trust_scores` returns a real row for the first time.
2. Migration 0011 + warranty match logic + routing hook + landlord-facing warranty visibility on the property page. **Verify live**: invoice a job with a warranty, raise a matching new issue via Sally on the same property, confirm it routes to the original tradie only, no landlord approval step.
3. Migration 0012 + policy engine + trigger hook + dashboard policy editor. **Verify live**: set a policy, submit 3 quotes where the ranked winner satisfies it, confirm auto-accept + notify email, no manual click.
4. Migration 0013 + ownership/occupancy UI.
5. Renter status tracker.
6. PM batching view.
7. `pnpm -r typecheck && pnpm -r test`, production build, commit, push, redeploy — same discipline as every prior pass this session.
