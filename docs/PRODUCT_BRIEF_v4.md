# 1Pacent — Product Brief v4: The Property Passport

*Supersedes nothing in v3 — extends it. Everything in v3 (Sally, the 3-quote marketplace, trust scoring, tradie rate cards, PM informed-not-gating) ships as-is. This brief adds the mechanics that make the property itself the durable asset, not the account.*

## 1. The reframe

Every piece of software in this space — including 1Pacent v3 — anchors the record to a **person's account**: a landlord, an agency, a tenant. The moment that relationship ends (tenant moves out, owner sells, agency mandate switches), the maintenance history, compliance record, and cost basis are lost or trapped.

**v4's structural change: the property is the account.** People pass through it. The record compounds.

Full narrative, worked examples, and the knowledge-graph diagram live in the two pitch artifacts produced for this brief — this document is the buildable spec.

## 2. Who pays, and why (unchanged from what was agreed — restated precisely)

| Persona | Pain solved | Pays 1Pacent | New in v4 |
|---|---|---|---|
| Tradie | Missed calls, slow quoting, chasing invoices | **Yes** — AI receptionist subscription | Job completion flow means they get paid faster and their record protects them from disputes |
| Portfolio manager | Personally triaging tradie availability & compliance | **Yes** — platform subscription | Portfolio-wide compliance batching, no manual coordination |
| Landlord / owner‑occupier | Trusting a quote, avoiding a repeat callout | No direct fee | **Warranty‑aware routing** — the flagship new mechanic |
| Renter / occupier | Not knowing when help arrives | No fee | **Live status tracker** |

## 3. What v4 actually builds (six mechanics, in dependency order)

### 3.1 Job completion & invoicing (foundation — nothing else works without this)

The state machine (`packages/core/src/requests/state-machine.ts`) already defines the full tail: `scheduled → in_progress → evidence_pending → verified → invoiced → paid → closed`. **No UI or data-layer code fires any of these transitions today.** `work_orders.invoice_cents` has never been written in production, which means trust scoring (`tradie_trust_scores` view) and comparable-jobs pricing (`getComparableJobs`) have been silently non-functional against live data since they were built. This is the first thing v4 fixes.

- Tradie portal (`/t/[token]`) gains a **My jobs** section: work orders where they're the assigned tradie.
  - `scheduled` → **Start job** button fires `start_work` → `in_progress`.
  - `in_progress` → **Mark done** form (completion note, no photo upload yet — Phase 2) fires `submit_evidence` → `evidence_pending`.
- Tenant intake page (`/r/[token]`) gains a **Confirm it's fixed** action on any request in `evidence_pending` for their property, firing `verify` → `verified`.
- Tradie portal, `verified` work orders move to an **Awaiting your invoice** list: tradie enters final invoice amount, confirms call‑out fee, and sets a **warranty period** (0–24 months) — fires `invoice` → `invoiced`.
- No payment provider exists yet (confirmed non-goal, carried from v3). Immediately after `invoice`, the system auto-fires `record_payment` → `paid` → `close` → `closed`. This is a documented simplification: real payment collection is Phase 2, not faked as more than it is.

### 3.2 Warranty tracking

- New `property_assets` table: the permanent per-property asset registry (category, label, installed date). Populated as a byproduct of the invoice step above — the tradie confirms what they worked on, not extra admin.
- `work_orders` gains `asset_id` and `warranty_expires_at`, set at the invoice step.
- **Warranty-aware routing**: when Sally completes a new conversation and a `maintenance_request` is about to be created, check for an open warranty (`work_orders.warranty_expires_at > now`, same property, same category, status `closed`). If found: skip the 3-quote marketplace entirely, route a single invite directly to the original tradie, skip the landlord approval gate (expected cost to the landlord is $0), and flag the request as a warranty claim.

### 3.3 Approval policy engine — "pre-approve anything under $X"

- New `approval_policy_rules` table, per property, ordered by priority: `max_total_cents`, `min_trust_score`, `exclude_categories` (safety override — e.g. gas/electrical always require a human).
- Pure, tested evaluator in `packages/core/src/approvals/policy.ts`.
- Trigger point: **after quotes are in**, not at intake with a fabricated $0 estimate (the current v3 bug — non-urgent categories always land in `pending_approval` regardless of price, because the auto-approve check runs before any real price exists). Once every invited quote for a request has resolved (submitted or declined), rank them, evaluate the policy against the #1 ranked quote's real price and the tradie's real trust score. Match → auto-accept, dispatch, notify — landlord does nothing. No match → falls to the existing manual `QuotesPanel` accept action, unchanged.

### 3.4 Ownership & occupancy graph

- `properties` gains `occupancy_status` (`owner_occupied` / `tenanted` / `vacant`) and `owner_contact_id`.
- Changes are recorded as events (`aggregate_type = 'property'`, already a valid type) for audit continuity — the beginning of the passport's permanent history, even before a full claim/handover UI exists (Phase 2).
- Minimal editable UI on the property page.

### 3.5 Renter live status tracker

- New `getRequestStatusForContact(token)` — reuses the existing event log (already the source of truth) and renders it as a plain-language timeline on `/r/[token]`, after the chat: reported → triaged → quotes out → approved → tradie confirmed → done.

### 3.6 PM portfolio compliance batching

- Extends `getPmPortfolioContext` (already exists): group upcoming compliance due-dates across every property the PM manages by `(requirement_key, suburb, ~30‑day window)`. Groups of 2+ get flagged **batchable** on `/pm/[token]` — the visible seed of the negotiated-rate mechanic, without needing to build actual multi-tradie route optimization yet (Phase 2).

## 4. Explicit non-goals for this pass

- Photo evidence upload / object storage integration (the `submit_evidence` transition fires; the `request_evidence` table stays unused until storage is wired up).
- Real payment collection (auto-recorded immediately after invoicing, as today's non-goal already established).
- Cross-org portable trust scores (stays org-scoped; unscoping is a deliberate future trust/security decision, not an oversight).
- Machine-to-machine tradie-availability negotiation for PM batching (the batching *detection* ships; actual automated scheduling handshake is Phase 2).
- Insurer data product, physical/listing badges, real-estate-portal integration — business/GTM moves, not code.

See `docs/DEVELOPER_BRIEF_v4.md` for schema, file-by-file build order, and test plan.
