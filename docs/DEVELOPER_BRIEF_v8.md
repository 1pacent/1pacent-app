# 1Pacent — Developer Brief v8: Building The Green Button

*Buildable companion to `PRODUCT_STRATEGY_v8.md`. This is a ground-up resurfacing on kept foundations: `packages/core` (state machine, compliance engine, pricing/ranking/trust, slots, depreciation, reports), the append-only events ledger, RLS, the v7 AI gateway/Honcho/Qdrant seams, and the two live n8n workflows all carry forward. `apps/web` (the v7 portal) is retired to an admin/ops surface; the product becomes `apps/pulse` — a mobile-first realtime PWA. Standing invariants unchanged and non-negotiable: deterministic core decides, events are truth, AI proposes → humans tap → core executes, the data layer is the security boundary, demo-store parity for every DataSource method, RLS on every org-scoped table.*

---

## 0. Architecture at a glance

```
 Renter/Owner/PM/Tradie phones (PWA, push, GPS, camera, hold-to-talk)
        │  Supabase Realtime (job channels)  +  Web Push (Moments)
        ▼
 apps/pulse — Next.js 15 PWA, "Hi-Vis" design system, map-native
        │  same-origin server actions / route handlers (the API tier)
        ▼
 packages/core (playbooks + state machine + money + compliance…)  ← pure, tested
 packages/agents (HERMES gateway · crew skills · HONCHO memory · Qdrant)
        │
 Supabase Postgres (ledger, RLS, Realtime, Storage evidence vault, Auth OTP)
 Stripe Connect (auth-hold → capture-on-verify → same-day transfer; no custody) — new
 n8n (deterministic side-effect spine, header-auth, no ingress)
 Google Calendar + Maps/Directions (George)               — new
```

**Realtime rule:** the ledger stays the source of truth; Realtime is a *delivery* mechanism. Every mutation goes through core + events exactly as today; clients subscribe to projections. If Realtime is down, screens fall back to refresh — the degraded ladder gains a rung, loses nothing.

## 1. Identity: accounts arrive, tokens demote to guest passes

- **Supabase Auth, passwordless only** (SMS/email OTP). New tables: `users` ↔ `contacts` linkage (`contacts.user_id uuid null`), `persona_profiles` (a user may be owner AND tradie). RLS moves from service-role-only to genuine `auth.uid()` policies for user-scoped reads; the API tier keeps service-role for orchestration.
- **Tokens survive** for guests and deep links (renter QR, approval links, quote invites) — unchanged mechanics, now optionally "claimable" into an account (`access_tokens.claimed_by_user_id`).
- Migration `0017_identity_and_realtime.sql`: the linkage columns, `push_subscriptions` (Web Push endpoint per user/persona), `tradie_presence` (online flag, last_lat/lng, updated_at — the "go online" toggle), `jobs_read_model` **view** (not table) for the Deck.

## 2. Playbooks — `packages/core/src/playbooks/`

The standard-process layer. Pure data + pure functions, versioned, unit-tested:

```ts
export interface Playbook {
  key: PlaybookKey;                    // "tap_leak" | "gas_check" | "hws_replace" | ...
  version: number;
  category: RequestCategory;           // maps to the existing state machine
  urgencyClass: "statutory_urgent" | "priority" | "routine";
  intake: { requiredSlots: IntakeSlot[]; photoPrompts: string[] };   // what Sally must resolve
  pricing:
    | { model: "fixed_band"; source: "cost_index" }                  // bookable upfront
    | { model: "rate_card" }                                          // tradie's own card
    | { model: "quote_race"; invitees: 3; countdownMinutes: number }; // non-standard scopes
  evidenceGates: EvidenceGate[];       // arrival_photo | before | after | certificate | customer_signoff
  compliance?: { filesCertificate: RequirementKey };
  warrantyDefaultMonths: number;
  payout: { trigger: "verified"; sameDay: true };
  varianceProtocol: { thresholdPct: number };  // above this, on-site change needs a payer Moment
}
```

`runPlaybookStep(playbook, jobState, event)` validates gates before the state machine will accept `submit_evidence`/`invoice` — evidence-gating becomes a core rule, not UI hope. Ship 6 playbooks: `tap_leak`, `hws_replace`, `gas_check`, `smoke_alarm_check`, `electrical_fault`, `general_quote_race` (the fallback). Tests: gate enforcement, pricing-model selection, variance threshold math.

## 3. The realtime job object

- **Channel per job:** `job:{requestId}` (Supabase Realtime broadcast + postgres_changes on `events` filtered by aggregate). Server actions already write events; a thin `notifyJobChannel()` in the API tier broadcasts the new projection after commit.
- **`JobProjection`** (in `data-types.ts`, built by a shared projector both stores use — the v7 canvas-parity trick, kept): `{ id, playbookKey, state, arc: ArcStep[], parties: PartyBadge[], money: { heldCents, releasedCents, priceBandCents? }, eta?: { lat, lng, minutes }, evidence: EvidenceItem[], moments: Moment[] }`. Four **projections-by-persona** derive from one function with a `viewer` argument (renter never sees owner cost fields — enforced in the projector, tested).
- **Presence/ETA:** tradie app posts location every 30s while a job is `on the way` (`tradie_presence`); George computes ETA via Maps Directions and fires the 20-minutes-out ping (n8n workflow, below).
- **Moments = decisions as push.** `moments` view derives from DB state exactly like v7 canvas cards (no backing table; LLM-off safe). Web Push payload carries the moment id + one-tap action URL (a signed action token → server action → core). Answering from the lock screen writes a human actor to the ledger, same as ever.

## 4. Money — authorization holds via Stripe Connect (no custody, ever)

**Regulatory posture, stated in code and copy:** 1Pacent never holds funds. Stripe (licensed PSP) is the money-holder; we are the marketplace on top. "Held" in the UI means a **card authorization** (no money has moved); "released" means **capture + instant Transfer** to the tradie's connected account. No trust account, no client monies, no AFSL-triggering custody on our balance sheet — confirm the structure with counsel, but this is the standard AU marketplace pattern.

- `packages/core/src/money/payment-plan.ts`: pure payment-plan machine per playbook — `authorized → captured → transferred | voided | disputed`, mirrored by `payments` + `payouts` tables (0018), events on the `work_order` aggregate.
- **Wedge jobs (R1–R2) complete in hours** — authorize at booking, capture on `verify` with evidence gates satisfied, transfer same day. Standard 7-day auth windows cover the entire wedge universe; if a job slips past the window, n8n re-authorizes (payer notified, one-tap).
- **Multi-day jobs (R3+) use milestone capture, not one long hold:** deposit captured at booking (materials), progress captures per playbook milestone, balance authorized near completion and captured on verify. v8 deliberately stays in consumer-repair scope — VIC's domestic-building deposit caps and the >$10k regime are a hard boundary we do not cross in this programme.
- Variance protocol: on-site increase = incremental authorization approved by a payer Moment before work continues.
- **Fast-Pay** (landlord pays on terms, tradie paid today) is factoring carried by a funding partner's balance sheet; we take origination margin only. Platform carries no credit risk.
- n8n owns webhook ingestion (`V8-STRIPE-WEBHOOKS` → internal header-auth route) so payment truth always lands in the ledger even if the app tier hiccups.
- **Demo parity:** demo store simulates the full authorize→capture→transfer lifecycle so every flow demos without Stripe keys; `PAYMENTS=off` keeps v7's invoice-only path.

## 5. The crew on Hermes + Honcho (both now default-on)

- **Hermes** (`HERMES_URL` set in all environments): five named agents — `sally`, `nelly`, `george`, `leo`, `penny` — each a thin skill manifest over the v7 gateway (`packages/agents/src/crew/{name}.ts`: system prompt, toolset, model pin, skill version). All reasoning through the gateway; OpenRouter remains the tested fallback rung. New capability: **multimodal intake** — Sally's triage accepts photo attachments (vision model via gateway) feeding the playbook's `requiredSlots`.
- **Honcho** (`HONCHO_BASE_URL` set): workspace per org, peer per contact, session per conversation — the v7 backend wired live. Used for tone/preferences/anxieties injected into crew prompts (`memoryContext`), guest-to-account continuity, and tradie working-style. The code-level guardrail stands and stays unit-tested: money/date/compliance/asset facts are refused at the boundary; the ledger answers facts.
- **George's availability model — offer, don't assume.** Layer 1 (R1): ping/accept is ground truth — matched *Online* tradies get the offer, first accept wins, countdown cascade on silence; consumer slots are proposals confirmed by acceptance, so R1 needs no calendar integration at all. Layer 2 (R1): platform-booked jobs live in our ledger — for active tradies we *are* the calendar, improving with density. Layer 3 (R2, opt-in): Google/Outlook OAuth **read-busy first** (avoid collisions); write access (George creates events, buffers, travel legs via Maps Directions) is the earned tier for tradies who hand George the diary. Auto-accept rules (bounded, opt-in, revocable — the auto-quote pattern) make booking truly instant for tradies who dial it up. Run building stays pure (`packages/core/src/scheduling/runs.ts`); API calls live in the API tier.

## 6. n8n — the spine, enumerated (internal-only, header-auth, no reasoning)

Existing: `1PACENT-SALLY-DISPATCH-QUOTES`, `-DISPATCH-NOTIFY`. New catalogue, all committed to `n8n/workflows/` and verified by real execution:

| Workflow | Trigger | Does |
|---|---|---|
| `V8-JOB-PING` | API tier on dispatch | Push/SMS the job offer to matched online tradies |
| `V8-ON-THE-WAY` | George (ETA ≤ 20 min) | Customer ping with live ETA + tradie card |
| `V8-MOMENT-FANOUT` | API tier on moment creation | Web Push + SMS fallback for decisions |
| `V8-STRIPE-WEBHOOKS` | Stripe events | Forward to internal ledger route (transport only) |
| `V8-PAYOUT-RECEIPT` | payment released | Receipts to payer + tradie; review request T+1 day |
| `V8-LICENCE-WATCH` | weekly cron | Re-verify tradie licences/insurance; expiring → Leo flags, badge suspends |
| `V8-COMPLIANCE-TICKLER` | daily cron | 60/30/7-day obligation digests (the v6 deferral, landed) |
| `V8-MONTHLY-PULSE` | monthly cron | Owner digest: spend, saves, record growth, horizon items |
| `V8-LEGISLATION-MONITOR` | monthly cron | VIC ruleset hash-watch → catalogue review flag |

Every execution logs to the events ledger. n8n gains no public ingress and no DB superuser — the audit rules stand.

## 7. `apps/pulse` — the PWA and the Hi-Vis system

- Next.js 15 App Router, `manifest.json` + service worker (push + offline shell), thumb-first layouts, dark-first. **Hi-Vis tokens:** deep-green field `#0B1A16`…, hi-vis gold `#FFD60A` *only* on the single primary action per screen, status-arc motion component, big radii, 44px+ targets. Map: Mapbox GL (or Google) as the world-background on live screens.
- Route skeleton: `/(fix)` the Button + intake sheet → `/job/[id]` the shared Job Screen (persona projection resolved server-side) → `/record/[propertyId]` the Address Record → `/deck` (PM) → `/trade` (Online toggle, pings, Run view, evidence camera) → `/own` (Autopilot sliders, Pulse). Guest token routes render the same components with a guest banner.
- Component contract: every screen = one server component fetching a projection + one client leaf subscribing to its channel. No client ever computes money/state (api_contracts rule).
- The v7 `apps/web` remains deployed as `/ops` (internal dashboard, test-links, workspace fallback) until parity, then sunsets to admin.

## 8. Build order (three releases, each demoable end-to-end)

**R1 — The Uber Slice (the money shot).** 0017 + playbooks + Job projection/channel + the Button (photo/voice intake via gateway) + fixed-band booking with simulated auth-hold + tradie Online/ping/accept + live arc + evidence gates + verify → simulated capture/transfer → **Address Record write**. Demo: renter books a tap fix; John's phone pings; owner watches the arc; record gains an asset. LLM-off run: button falls back to structured intake; everything else identical.

**R2 — Autopilot & the Deck.** Moments over Web Push with one-tap signed actions; owner Autopilot (the v4 policy engine resurfaced as three sliders); PM Deck (live tiles = job channels multiplexed); George Runs + Calendar/Maps; batch compliance runs writing certificates (v7 mechanics, new surface); Honcho tone injection.

**R3 — Real money & the second orbit.** Stripe Connect live (auth-holds, capture-on-verify, same-day transfers, variance protocol, milestone capture for multi-day playbooks); Penny's chasing retired in favour of capture-on-verify; Fast-Pay + payment-fee rails per Monetisation.md; Data Pack / insurer attestation surfaces on the Record; onboarding funnels instrumented against §10 metrics.

## 9. Verification bar (per release, live)

- The five v7 invariants re-proven on `apps/pulse`: ledger grep zero model-attributed mutations; LLM-off full function; scope checks per persona projection (renter token/JWT cannot elicit owner money fields — projector-tested); demo/Supabase parity suite; typecheck + tests + build green.
- New for v8: **realtime latency** (event commit → other party's glass < 2s, measured); **push round-trip** (Moment answered from lock screen writes correct human actor); **payment ledger** reconciles to Stripe test-clock to the cent; an auth that lapses re-authorizes cleanly; **playbook gates** provably block `invoice` without required evidence (unit + live); George's ETA ping fires from a simulated GPS track.
- Wedge pilot checklist: 10 tradies Online in one suburb cluster, 3 PMs on the Deck, first 50 capture-on-verify jobs, dispute rate and same-day-payout rate reported against §10 targets.
