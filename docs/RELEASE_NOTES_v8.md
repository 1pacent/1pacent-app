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

## R3 — Real money & the second orbit (shipped 2026-07-13)

- **Payment provider seam** — `lib/payments.ts`: `SimulatedPsp` (default,
  demo parity) and `StripePsp` behind `STRIPE_SECRET_KEY`. Auth-hold at
  booking (PaymentIntent, `capture_method=manual`), capture on verify,
  same-day Transfer to the tradie's connected account; void on decline.
  No custody at any point — Stripe holds the rails.
- **Webhooks** — `/api/stripe/webhook` verifies signatures
  (`STRIPE_WEBHOOK_SECRET`, HMAC + 5-min tolerance) and mirrors PSP truth
  into `payments` + the ledger (never walking money truth backwards);
  `V8-STRIPE-WEBHOOKS` n8n workflow forwards as backup transport.
- **Payment slices** — `payments.kind` (primary/deposit/balance/variance);
  projections aggregate slices and report the least-settled status so
  "authorized" never reads as "paid".
- **Milestone capture** — `paymentScheduleFor` in core (tested):
  hws_replace captures a 30% deposit at confirmation (acceptance IS
  confirmation) and the balance on verify. Quote-race jobs now authorize
  their plan at quote acceptance (`ensurePaymentPlan`, both stores).
- **Variance protocol** — `variances` table + `proposeVariance` /
  `decideVariance`. Inside the playbook threshold: auto-applies, logged,
  variance slice authorized. Above it: work pauses (`mark_done` withheld
  by the projector), payer gets an in-app card AND a one-tap
  `decide_variance` Moment; approval raises the hold
  (increment_authorization, fallback new slice). Occupant projections
  structurally drop variance money.
- **Fast-Pay** — `tradie_rate_cards.fastpay_enabled` + toggle on /p/trade;
  `splitPaymentWithFastPay` (2% off the payout, platform fee unchanged,
  split recorded on the settlement event). Factoring risk is a funding
  partner's; the platform takes margin only.
- **Data Pack on the Record** — payer-only card on /p/record generates the
  Property Data Pack; generic report renderer at /p/report; maintenance
  attestation block derives from verified-jobs history (zero typing).

**Honest gaps (deliberate, documented):**
- A real Stripe authorization completes only when the payer confirms a
  payment sheet client-side; until that UI lands, intents created
  server-side await `requires_payment_method` on Stripe and the demo/
  simulated lifecycle remains the demo path. The seam, webhook ingestion,
  and ledger mirroring are live and tested.
- Stripe Connect onboarding for tradies (connected accounts) is not built;
  `transfer()` records the payout obligation and no-ops without a
  destination account.
- Negative variances (scope shrank) record but don't refund — R4.

**Verification:** 213 unit tests green (169 core, 44 agents); demo-store
E2E green end-to-end: autopilot → book → ping → accept → run → small
variance auto-applies → big variance pauses work → occupant can't see
variance money → one-tap approve (token burns on replay) → Fast-Pay →
gates → done → one-tap verify settles → arc paid → money line equals the
approved total → Data Pack generates. Build green.

**Ops (completed 2026-07-13, operator-authorized):**
1. ✅ Migrations 0018 + 0019 applied to live Supabase.
2. ✅ Vercel production env: `VAPID_*` set, site redeployed.
   (`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` remain for Stripe go-live.)
3. ✅ n8n workflows imported + activated — see the consolidation below.

## n8n consolidation (2026-07-13)

**Rule (operator-stated): the VPS runs ONE shared n8n for every application**
— `/opt/n8n`, container `n8n-n8n-1`, public at n8n.1pacent.com. Reality had
drifted: the AI4Boards stack embeds its own n8n, BOTH containers carried the
Docker DNS alias `n8n`, and the shared Caddy (attached to both networks)
resolved `n8n:5678` to the *AI4Boards* instance — so n8n.1pacent.com was
silently proxying there, which is how the live `1PACENT-SALLY-DISPATCH-*`
workflows ended up imported into the wrong instance.

What changed:
- Caddy upstreams for n8n.1pacent.com / api.1pacent.com / the contabo host /
  `:80` are now the explicit container `n8n-n8n-1:5678` (ambiguous alias
  removed from routing; `/opt/n8n/Caddyfile`).
- `1PACENT-SALLY-DISPATCH-QUOTES`/`-NOTIFY` plus their two credentials
  ("1Pacent Resend", "1Pacent Internal Auth") migrated to the shared n8n;
  the three V8 workflows imported there; all five published + active.
  Verified live: dispatch webhooks 200 with auth / 403 without; Stripe
  forwarder 200.
- One token now rules the internal seam — the "1Pacent Internal Auth"
  credential value. Synced to: Vercel `N8N_INTERNAL_AUTH_TOKEN`, VPS root
  `.env`, and the V8 cron workflows. Vercel `N8N_INTERNAL_URL` is explicitly
  `https://n8n.1pacent.com`. Verified: prod `/api/internal/tickler` and
  `/monthly-pulse` return `{ok:true}` with the token, 401 without.
- Old copies in the AI4Boards n8n deactivated (flag set; takes effect on
  that container's next restart — its other tenants were not disturbed).
- The never-started per-app n8n service removed from this repo's
  `docker-compose.yml`.
