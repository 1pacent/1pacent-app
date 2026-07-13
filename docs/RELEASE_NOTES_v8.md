# v8 build log — release notes & implementation deltas

Working log against `DEVELOPER_BRIEF_v8.md` §8. Each release records what
shipped, where the implementation deliberately deviates from the brief, and
what ops steps are outstanding. Written so any session can pick the build up
cold.

## R1 — The Uber Slice (shipped 2026-07-12, commit 96cd741 + fixes)

Green Button intake (photo/voice → triage → priced preview), 6 playbooks with
evidence gates in core, payment-plan machine (simulated PSP, no custody),
Go Online / ping / first-accept-wins, live Job Screen with the status arc,
capture-on-verify → same-day (simulated) transfer → Address Record write.
Migration `0017_pulse_r1` applied to live Supabase.

**Deviation:** the pulse app lives at `apps/web/src/app/p/*` rather than a
separate `apps/pulse` workspace — same shell, faster to ship, `/ops` split
can happen when the surfaces genuinely diverge.

## R2 — Autopilot & the Deck (shipped 2026-07-13)

- **Moments over Web Push** — `push_subscriptions` (0017) + `home_path`
  (0018); `apps/web/public/sw.js`; `lib/push.ts` fan-out; enable-push cards
  on /p/own, /p/trade, /p/deck. Pushes fire on: job ping (booking), booked
  confirmation (accept), on-the-way, verify moment (completion), tickler +
  monthly pulse (n8n crons).
- **One-tap signed actions** — new `moment_action` token scope (single-use,
  72 h, payload names exactly one decision for one human). Notification
  action buttons POST `/api/act/{token}` from the service worker; GET with
  `?choice=` serves SMS/e-mail fallback links. Verify-and-settle refactored
  into a shared core (`verifySettleCore` / `demoVerifySettle`) so the lock
  screen tap and the Job Screen tap run identical settlement.
- **Owner Autopilot** — the v4 policy engine resurfaced as three sliders
  (spend cap, trust floor, safety switch) on /p/own; writes one
  `approval_policy_rules` row per property at priority −100; gas/dangerous
  electrical/smoke-alarm work always needs a human while the safety switch
  is on. Ledger event `policy_updated` records the human actor.
- **PM Deck batch runs** — the v7 `dispatchComplianceBatch` surfaced as
  "Batch & save" cards on /p/deck; certificates still file on completion.
- **George Runs** — `packages/core/src/scheduling/runs.ts` (pure, tested):
  slot-anchored day plan, suburb-heuristic travel legs, conflicts flagged
  loudly instead of silently re-booked. Run view on /p/trade.
  `tradie_calendar` (0018) is the opt-in read-busy seam — Google freeBusy
  is queried when an access token exists, otherwise the ledger plans alone.
- **Honcho tone injection** — `recallTone()` in packages/agents: bedside
  manner only, clipped, guard-checked on the way out (a tone hint that
  smells like a ledger fact is dropped). Wired into Sally's system prompt
  as `toneContext`; no-op without `HONCHO_BASE_URL`.
- **n8n** — `V8-COMPLIANCE-TICKLER` (daily) and `V8-MONTHLY-PULSE`
  (monthly) call header-auth'd internal routes `/api/internal/tickler` and
  `/api/internal/monthly-pulse`; the routes compute digests from the ledger
  and push. PWA manifest + icons added.

**Deviations from the brief (deliberate):**
- `V8-MOMENT-FANOUT` / `V8-JOB-PING` / `V8-ON-THE-WAY` are not n8n
  workflows: the API tier owns the VAPID keys and sends Web Push directly
  (`lib/push.ts`) at the same commit points. n8n keeps the crons (schedule +
  transport, no reasoning). SMS fallback lands when an SMS provider exists.
- The on-the-way ping has no Maps-computed ETA yet — properties carry no
  coordinates. ETA plumbing exists in core (`haversineKm`,
  `etaMinutesFromDistance`); it activates when geocoding lands.
- Supabase Auth OTP (accounts) is still deferred; tokens remain the
  identity layer, `moment_action` extends them for lock-screen decisions.

**Ops still required (not automatable from this box):**
1. Apply migration `0018_pulse_r2.sql` to live Supabase
   (`pnpm --filter @1pacent/db migrate` — needs operator approval).
2. Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` to Vercel
   project env (values in the VPS root `.env`).
3. Import + activate the two new n8n workflows; ensure `APP_BASE_URL` and
   `N8N_INTERNAL_AUTH_TOKEN` are set in the n8n environment.

## R3 — Real money & the second orbit

- **Payment provider seam** — `lib/payments.ts`: `SimulatedPsp` (default,
  demo parity) and `StripePsp` behind `STRIPE_SECRET_KEY`. Auth-hold at
  booking (PaymentIntent, `capture_method=manual`), capture on verify,
  same-day Transfer to the tradie's connected account; void on decline.
  No custody at any point — Stripe holds the rails.
- **Webhooks** — `/api/stripe/webhook` verifies signatures
  (`STRIPE_WEBHOOK_SECRET`) and mirrors PSP truth into `payments` + the
  ledger; `V8-STRIPE-WEBHOOKS` n8n workflow forwards as backup transport.
- **Variance protocol** — on-site scope change → within playbook threshold
  auto-applies (logged); above it, work pauses on a payer Moment
  (one-tap approve/decline via `decide_variance`), incremental
  authorization on approval.
- **Milestone capture** — multi-day playbooks (hws_replace) capture a
  deposit at confirmation and the balance on verify (`paymentScheduleFor`
  in core, tested).
- **Fast-Pay** — tradie opt-in: transfer at capture with a 2% fee line;
  factoring risk sits with a funding partner, platform takes margin only.
- **Data Pack on the Record** — Property Data Pack generation + report
  view from /p/record for payers; insurer attestation block derives from
  verified-jobs history.
