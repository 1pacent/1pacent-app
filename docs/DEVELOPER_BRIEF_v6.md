# 1Pacent — Developer Brief v6: Talk / See / Do

Buildable companion to `docs/PRODUCT_DESIGN_v6.md`. Extends the live codebase (post-`1bcd1bd`); consumes `DEVELOPER_BRIEF_v5.md` items where noted rather than duplicating them. Everything here respects the standing invariants: deterministic core decides, events are the source of truth, no `@1pacent/core` imports in client components, demo-store parity for every `DataSource` method, RLS on every org-scoped table.

## 0. Ground truth / existing seams this builds on

- `TOKEN_SCOPES` (`packages/core/src/tokens.ts`) and per-scope TTLs — the graph-position mechanism already exists; v6 adds one scope.
- `SallyOperatingContext` (`packages/agents/src/sally/prompts.ts`) is already a discriminated union (`tenant_intake` | `tradie_lead_capture`) — v6 extends it to 5 members.
- The OpenRouter client already does structured extraction via strict JSON schema; **it does not yet do tool/function calling** — that's the one genuinely new capability in `packages/agents`.
- Every decision surface the canvas needs already exists as a server action (approve/decline, accept quote, confirm slot*, confirm fixed, invoice, batch dispatch*) — (*) = v5 items, built as part of this programme.
- Cards therefore need **no new state machine and almost no new tables**: they are projections of existing state, plus one table for generated report artifacts.

## 1. Migration `0015_talk_see_do.sql`

```sql
-- v6: landlord seat, Sally session modes, report artifacts, auto-quote opt-in.

-- Landlord/owner portal seat (graph position for ownership-scoped sessions)
alter table access_tokens drop constraint access_tokens_scope_check;
alter table access_tokens add constraint access_tokens_scope_check check (scope in
  ('tenant_intake','request_status','landlord_approval','tradie_job','tradie_portal',
   'pm_portfolio','tradie_lead_intake','owner_portal'));
-- aggregate_id = owner contact_id; properties resolved via properties.owner_contact_id (0013)

-- Sally sessions carry their persona mode (today: implicit tenant / tradie-lead)
alter table sally_conversations add column mode text not null default 'tenant_intake'
  check (mode in ('tenant_intake','tradie_lead_capture','owner_portal','pm_portfolio','tradie_portal'));

create table generated_reports (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  kind        text not null check (kind in
                ('property_data_pack','spending_summary','obligations_calendar',
                 'pm_quarterly','compliance_pack','accuracy_report')),
  subject_id  uuid,                -- property_id / contact_id the report is about
  audience_contact_id uuid references contacts(id),
  payload     jsonb not null,      -- the full structured report; rendering is a view concern
  created_at  timestamptz not null default now()
);
create index on generated_reports (org_id, kind, created_at desc);
alter table generated_reports enable row level security;
create policy generated_reports_org_isolation on generated_reports for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));

-- Tradie auto-quote opt-in (bounded, revocable, per rate card)
alter table tradie_rate_cards add column auto_quote_enabled boolean not null default false;
alter table tradie_rate_cards add column auto_quote_max_total_cents bigint check (auto_quote_max_total_cents >= 0);
```

Token scope additions in `packages/core/src/tokens.ts`: `owner_portal` (TTL 24 × 365 — a durable seat, same class as `tradie_portal`/`pm_portfolio`).

## 2. `packages/agents` — Sally learns tools (the one new AI capability)

### 2.1 Tool registry

```ts
// src/sally/tools.ts
export interface SallyToolDefinition {
  name: string;
  description: string;                    // what the model sees
  parameters: Record<string, unknown>;    // JSON schema, strict mode (all fields required/nullable)
  modes: readonly SallyMode[];            // which personas may even see this tool
}
export interface SallyToolCall { name: string; arguments: Record<string, unknown> }
export interface SallyToolResult { name: string; result: unknown }
```

`OpenRouterClient` gains `chatWithTools(messages, tools): Promise<{ reply?: string; toolCalls?: SallyToolCall[] }>` using OpenAI-format function calling (OpenRouter passes it through for the models we use). Loop in the orchestrator: model → toolCalls → execute (API tier) → append tool results → model → final reply. Max 3 tool rounds per turn, hard cap. Tests: mocked client, verify tool filtering by mode, round cap, and that unknown tool names are rejected.

**Execution stays in the API tier**: `packages/agents` defines tool *shapes* only. `apps/web/src/lib/sally-tools.ts` binds each name to a `DataSource` call with the session's token scope baked in — the model cannot name a property/portfolio it wasn't given. This is the "data layer is the security boundary" rule made concrete.

### 2.2 Tool catalogue v1 (deliberately small)

| Tool | Modes | Backing method | Mutates? |
|---|---|---|---|
| `get_my_requests` | tenant | `getRequestStatusForContact` | no |
| `get_property_compliance` | tenant, owner, pm | existing compliance projection (tenant: status only, no cost fields — separate narrow view type) | no |
| `get_spending_summary` | owner, pm | **new** `getSpendingSummary` | no |
| `get_asset_horizon` | owner, pm | **new** `getAssetHorizon` | no |
| `get_obligations_calendar` | pm, owner | **new** `getObligationsCalendar` | no |
| `generate_report` | owner, pm, tradie | **new** `generateReport(kind, subjectId)` → writes `generated_reports`, returns id | writes a report row only |
| `get_my_jobs` / `get_my_accuracy` | tradie | `listTradieJobs` / trust+insights queries | no |
| `draft_quote` | tradie | **new** `saveQuoteDraft` (draft only — submission is a card action) | draft only |

Approvals, payments, dispatch, slot-confirm are **not tools** — Design §2.1. Sally's prompt for each mode states this: *"you can show the card; the human taps it."*

### 2.3 Mode extension

`SallyOperatingContext` gains `owner_portal`, `pm_portfolio`, `tradie_portal` members (identity line, audience guardrails, tool table injected into the system prompt, handoff rules). `SALLY_PROMPT_VERSION` → `sally-v3`. The classifier distinction (episode vs enquiry) is *not* a separate model call: the tool loop handles it naturally — an episode turn produces no tool calls and flows into the existing extraction path unchanged.

## 3. `packages/core` additions (pure, tested)

- `src/depreciation/estimate.ts` — curated effective-life table (small: the ~12 asset categories we track), diminishing-value + prime-cost annual estimates from `installed_at` + replacement cost (median from comparables). Every output carries `disclaimer: "planning_estimate"` — the honesty constraint from Design §1.1 is enforced in the type, not just the copy.
- `src/reports/spending.ts` — `summariseSpending(completedJobs, period)` → by-category totals + vs-median deltas (medians passed in; core stays IO-free).
- `src/reports/obligations.ts` — `buildObligationsCalendar(properties[], horizon)` — wraps the existing compliance engine over a portfolio, returns per-month obligations with batchable groups (reuses `computeBatchableCompliance`).
- Tests for all three; fixed dates, no `Date.now()`.

## 4. Data layer

New `DataSource` methods (Supabase + demo parity, as always):

```ts
// Canvas — THE central new read model
getCanvasCards(token: string): Promise<CanvasCard[]>;
// CanvasCard = { id, kind, title, body, at, state: 'needs_you'|'live'|'done'|'info',
//   data: <typed per kind>, actions: CanvasAction[], workspaceHref: string }
// kinds v1: ticket_status | approval | warranty_catch | slot_confirm | confirm_fixed
//   | obligations | batch_offer | report | insight | crew_activity
// Derivation is deterministic per scope: e.g. owner_portal → pending approvals on owned
//   properties + open tickets + horizon items + latest reports; NO table backs cards.

// Reports & analytics
getSpendingSummary(scopeToken: string, periodMonths: number): Promise<SpendingSummary>;
getAssetHorizon(scopeToken: string): Promise<AssetHorizonItem[]>;
getObligationsCalendar(scopeToken: string, horizonDays: number): Promise<ObligationsCalendar>;
generateReport(scopeToken: string, kind: ReportKind, subjectId?: string): Promise<{ ok: boolean; reportId?: string }>;
getReport(scopeToken: string, reportId: string): Promise<GeneratedReportView | null>;

// Owner seat
getOwnerPortalContext(token: string): Promise<OwnerPortalContext | null>;
mintOwnerPortalLink(ownerContactId: string): Promise<MintLinkResult>;   // + test-links panel row

// Tradie auto-quote
setAutoQuote(tradiePortalToken: string, input: { enabled: boolean; maxTotalCents: number | null }): ...
saveQuoteDraft(tradiePortalToken: string, requestId: string, draft: {...}): ...
```

**Auto-quote hook**: in `dispatchQuotesForRequest`, after inserting each invite, if the tradie's rate card has `auto_quote_enabled` and a computable suggestion ≤ `auto_quote_max_total_cents`, call the existing `submitQuoteByToken` path internally (actor attribution `nelly:auto-quote`, event payload marks it) — which also means the v4 approval-policy trigger can complete a *fully zero-human* happy path: tenant → warranty/policy → auto-quote → auto-accept → George slot. That chain is the demo's money shot; it must remain fully attributed in the feed.

## 5. UI — the shell

- `apps/web/src/components/twin-panel.tsx` (server) + `canvas.tsx` / `talk-panel.tsx` (client leaves, plain-prop rule): left = existing Sally chat component generalised by mode; right = card list rendered from `getCanvasCards`, refreshed after every card action and on a 15 s interval (`router.refresh()`; SSE is phase 2 — say so honestly in the UI copy, "updates every few seconds").
- Routes: `/r/[token]`, `/t/[token]`, `/pm/[token]` upgrade to the shell; **new `/o/[token]`** (owner). Mobile: CSS-only tab switch Talk/Board. Existing pages remain as the Workspace; every card carries `workspaceHref`.
- Card components per kind — reuse the v4/v5 action components (approval panel, slot buttons, confirm-fixed, batch button) *inside* cards rather than rebuilding them.
- LLM-down banner: `talk-panel` catches action failure / a `GET /api/sally/health` probe and renders the honest banner from Design §2.2; canvas and workspace are untouched by definition.

## 6. n8n additions (internal-only, header-auth, no reasoning — per audit rules)

1. `1PACENT-COMPLIANCE-TICKLER` — scheduled daily; calls an internal API route that computes 60/30/7-day upcoming obligations per org and sends the digest via Resend. n8n does transport only.
2. `1PACENT-LEGISLATION-MONITOR` — monthly; resurrects archive `RENTAL-111/112` intent: fetch the VIC ruleset sources, hash-compare, email a "review the catalogue" flag on change.
3. `1PACENT-PENNY-FOLLOWUP` — scheduled; finds invoiced-unpaid work orders past N days, creates a **draft** follow-up (writes a `send-approval` card via the API), never sends autonomously.
Commit workflow JSON to `n8n/workflows/` as with the SALLY pair; verify with real executions.

## 7. Build order

1. **0015 + core modules + agents tool-calling** (all pure/tested; `pnpm -r typecheck && test` green).
2. **Canvas read model** (`getCanvasCards` both stores) + shell UI on `/r` first (renter is the simplest card set) — visual checkpoint.
3. **Owner seat** (`/o/[token]`, mint link, owner cards incl. approval/warranty/horizon) — this is the richest canvas; checkpoint with user.
4. **Sally tools** wired per mode (renter + owner first, then PM, then tradie).
5. **PM canvas** (obligations/batch cards — consumes v5 §3.1 batch dispatch) + **tradie canvas** (day/draft/accuracy/auto-quote settings).
6. **Reports** (`generateReport` kinds: data pack, spending, obligations, accuracy) + download rendering.
7. **n8n trio** + live execution verification.
8. **Live E2E** (v4/v5 discipline): the zero-human happy path end-to-end on live infra; degraded-mode check (kill `OPENROUTER_API_KEY` in a local run → canvas/workspace fully functional, banner correct); scoping check (renter token asking landlord questions gets structurally empty answers). Cleanup by explicit IDs only.
9. Typecheck, tests, build, commit, push, Vercel READY, live spot-checks.

## 8. Verification acceptance list (what "done" means)

- [ ] Every card action writes an event with a **human** actor; grep the ledger after E2E: zero mutations attributed to a model.
- [ ] Renter/owner/PM/tradie each: one episode + two free-flow questions answered **from tools** (assert via events/log that a tool ran; no tool → Sally must say she can't answer, not improvise).
- [ ] Auto-quote fires only within bounds, fully attributed, and the zero-human chain completes on live Supabase.
- [ ] LLM-off mode: all four personas can complete their core loop via canvas + workspace alone.
- [ ] `generated_reports.payload` for the data pack contains the honesty fields (`planning_estimate` disclaimers) — checked in a unit test, not just copy.
