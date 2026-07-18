# UAT Script — The Fix Button (1Pacent v8)

**Version under test:** commit `4444359` · production https://1pacent-app.vercel.app
**Duration:** ~35 minutes end-to-end. Run on a phone for the persona flows (UC2–UC7); desktop is fine for UC1/UC8/UC9.
**Roles:** you play all parts. Open each persona link in a separate browser profile/incognito window (or two devices) so sessions don't collide.

## Preconditions

| Item | Where |
|---|---|
| Renter link | `https://1pacent-app.vercel.app/p/fix/07bnbqRwljhI7iUr4sKyWZLkjIO0nr0mNMbmLFc8XNc` |
| Owner link | `https://1pacent-app.vercel.app/p/own/A0f6Dik-6e7ebSvEaOh09QksgeyxLI8hmo5iFQNWkG8` |
| PM link | `https://1pacent-app.vercel.app/p/deck/lpZR9U-u-0-4kNvBiS8RSUmaL6Iqr7_44SsqsdFrvbc` |
| Tradie link | `https://1pacent-app.vercel.app/p/trade/tB0oLK7e_Ya0BWbbtYUwmfEwIQbIANrjvSVg3t2BTtU` |
| Marketing site | `https://1pacent-app.vercel.app/site` |
| Operator console | `https://1pacent-app.vercel.app/admin` — access key: `ADMIN_ACCESS_KEY` in VPS `/opt/1pacent-app/.env` |
| Emails | quote/notification emails go to mac@1pacent.com — keep the inbox open |
| Money | simulated PSP (no Stripe keys yet): "authorized/captured/transferred" are ledger states, no real charge |

> **Known gap before you start:** migration `0021_join_requests` is NOT yet applied to live Supabase (the DB password was rotated — reset it in Supabase → Settings → Database, update `SUPABASE_DB_PASSWORD` and `DATABASE_URL` in the VPS `.env`, then `pnpm --filter @1pacent/db migrate`; or paste `packages/db/migrations/0021_join_requests.sql` into the Supabase SQL editor). Until then **UC1 step 4 records a 500** and the admin funnel card stays empty — everything else is unaffected.

Record each measure as **PASS / FAIL** plus a note. Any FAIL: screenshot + the time, so the ledger event can be found.

---

## UC1 — Customer-facing website & onboarding

*As a prospect I understand the product, trust it, and can join.*

1. Open `/site` on your phone.
2. Read the hero and scroll the six "why" cards, How-it-works, the four seats.
3. Open three FAQ entries, including "How do I know I'm getting the best price…" and "When does money actually move?".
4. In **Join the network**: pick *I own a rental*, enter a real-looking name/email/suburb, submit.
5. Try submitting again with a junk email (`abc`) — expect a friendly rejection.

**Measures of success**
- [ ] Page loads < 3 s on 4G; nothing overflows on a phone; dark navy/blue scheme throughout.
- [ ] A stranger could answer, from the page alone: what it is, why it's different, what it costs a renter, when money moves.
- [ ] FAQ accordions open/close; answers are plain-English and match the product's actual behaviour.
- [ ] Valid join → "You're in the queue ✓". *(Until 0021 is applied: expect the error message instead — record as PASS-pending-migration.)*
- [ ] Junk email → inline error, no submission.

## UC2 — Tradie goes to work

1. Open the tradie link. Tap **Turn on** for lock-screen decisions (Android/desktop Chrome; on iPhone add to Home Screen first). Toggle **Online**.
2. Note trust score card: shows ±% *quote* accuracy and (after UC5) ±% *time* accuracy.

**Measures**
- [ ] Online toggle sticks (reload the page — still Online).
- [ ] Push permission prompt appears and the card disappears once granted.

## UC3 — Renter presses the button

1. Open the renter link → the green… now **blue** button. Add a photo of any tap, type "kitchen tap dripping constantly".
2. Wait for triage → a **fixed price band** appears with "based on real jobs", earliest slots, tradies-online count.
3. Book the first slot.

**Measures**
- [ ] Triage returns a plumbing/tap playbook (not a quote round) in < 15 s.
- [ ] Price shown BEFORE commitment, with a slot and a licence-verified promise.
- [ ] Booking confirms; the job screen shows the arc at **Booked**, "no cost to you" for the renter, and no dollar amounts anywhere on the renter's view.

## UC4 — Ping → accept → on the way (the live thread)

1. Tradie device: a **Job ping** push (or the pings list) shows the payout. Accept it.
2. Renter view updates to **Confirmed** (within ~2 s if realtime, ≤ 20 s poll fallback).
3. Tradie: **On my way** → renter gets the on-the-way push; arc moves. Then **I've arrived — start the job**.

**Measures**
- [ ] First-accept wins; the offer disappears after acceptance.
- [ ] All four persona views (open owner + PM too) show the SAME arc state without manual refresh.
- [ ] Owner sees the $ amount + "Authorized — charged only when you say it's done" + the price-basis line; renter still sees no money.

## UC5 — Parts, variance, evidence, time (the no-surprises engine)

1. Tradie on the job screen: **Book a part to the job** → "Washer kit", ~10% of the job price → lands instantly, appears in the Parts panel.
2. Book another part → "Full mixer unit", ~150% of the job price → job PAUSES ("awaiting payer"); **Job's done is not tappable**.
3. Owner: approve the part (lock-screen one-tap or the card on the job screen).
4. Tradie: photo evidence for each required gate (before/after) — note "Job's done" stays blocked until gates clear.
5. **Job's done ✓**.

**Measures**
- [ ] Small part: instant, logged, no approval friction.
- [ ] Big part: work pauses; owner decides in one tap; work resumes; part shows Active.
- [ ] Renter's view lists part NAMES but never costs.
- [ ] Completion is impossible with missing evidence (button disabled with reason).
- [ ] After done: the job screen shows ⏱ actual vs estimated minutes.

## UC6 — Verify → money moves → the record

1. Owner: **Verify** (lock-screen push one-tap, or the job screen button).
2. Watch the arc reach **Paid**; owner money line = booked + both parts; tradie sees "Paid out — same day".
3. Owner: open the **Record** — the job is in history; warranty live; attestation block updated. Tap **Build the Data Pack** → open it.

**Measures**
- [ ] Money captured ONLY after the human verify tap (check the job's Full history: verify has a human actor before any settle events).
- [ ] Owner total equals booked amount + approved parts exactly.
- [ ] Record gained the job, the asset, and the warranty; Data Pack opens with sections populated.
- [ ] Tradie accuracy card now shows a time-accuracy percentage.

## UC7 — PM's Deck

1. Open the PM link: the finished job appears in tiles; any due compliance shows a **Batch & save** card.
2. If a batch card exists, dispatch it and confirm N jobs created.

**Measures**
- [ ] Deck tiles reflect live state without refresh; exceptions (needs-human) float to the top.
- [ ] Batch dispatch creates one job per door and reports the count.

## UC8 — Operator console (admin)

1. Go to `/admin` (later: `admin.<your-domain>`). Expect redirect to the login. Enter a WRONG key → rejected. Enter the real key → dashboard.
2. Read the four KPI tiles; confirm property/PM/tradie counts match reality (3 demo properties, Jordan Blake as PM, 3 tradies).
3. **Transaction pipeline**: your UC3 job moved buckets during the run — confirm it now sits in *Closed & settled* with the right $ value; open/pending counts look sane.
4. **Settled per month**: the bar + table show this month's gross, the 1.2% platform fee, any Fast-Pay 2%, and **My take** with the blended %.
5. **Properties by manager**: addresses grouped under Jordan Blake / Self-managed.
6. **Recent transactions**: your job present with value + fee.
7. **HubSpot card**: without a token it must say exactly what to configure; with `HUBSPOT_ACCESS_TOKEN` set, press **Sync contacts** and verify the contacts appear in HubSpot → Contacts.
8. Sign out → hitting `/admin` again demands the key.

**Measures**
- [ ] Wrong key never reaches data; deep-linking `/admin` unauthenticated redirects.
- [ ] Pipeline $ = what you saw as the owner (booked + parts) — to the cent.
- [ ] My-take % ≈ 1.2% (plus 2% on any Fast-Pay job you ran).
- [ ] Every number on the dashboard traces to something you did in UC3–UC6.
- [ ] HubSpot: honest unconfigured state, or a real sync count and visible CRM contacts.

## UC9 — Trust & safety spot-checks (5 min)

1. Renter link opened in a fresh browser: try to browse to the owner's page path with the renter's token — expect "This link isn't active".
2. Re-tap a used one-tap link from a notification (if you kept one) — expect "already used".
3. `/api/admin/hubspot-sync` via curl without the cookie — expect 401.

**Measures**
- [ ] Tokens are scope-locked; one-tap decisions burn on use; admin APIs refuse without the key.

---

## Sign-off

| # | Use case | PASS/FAIL | Notes |
|---|---|---|---|
| 1 | Website & onboarding | | |
| 2 | Tradie online + push | | |
| 3 | Button → priced booking | | |
| 4 | Ping → accept → live thread | | |
| 5 | Parts / variance / evidence / time | | |
| 6 | Verify → money → record | | |
| 7 | PM Deck | | |
| 8 | Operator console | | |
| 9 | Trust & safety | | |

**Exit criteria:** all 9 PASS (UC1's join may be PASS-pending-migration), zero money movement before a verify tap anywhere, and no screen ever showed a renter a dollar amount.
