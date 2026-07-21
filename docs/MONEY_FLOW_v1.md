# Zaivo — Money Flow & Payments v1

*How money moves: the job hold → capture-on-verify → payout-less-fee. And how
PM subscriptions bill. Companion to the code in `apps/web/src/lib/payments.ts`
(job payments) and `lib/stripe-billing.ts` + `lib/billing.ts` (subscriptions).*

---

## 1. The two money streams

Zaivo has **two independent money flows**, both on Stripe, and **Zaivo never
holds client funds** — a licensed PSP holds the rails at every step.

1. **Job payments** — per-repair, event-driven. The payer's card is
   *authorized* (held) at booking and *captured* only on verify; the tradie is
   paid same-day, less our transaction fee. (This section is the answer to
   "hold the transaction amount and charge the final payment less our fee.")
2. **PM subscriptions** — recurring monthly, per the tier the PM selects.

---

## 2. Job payments — hold, then capture-less-fee

The mechanism is a Stripe **manual-capture PaymentIntent** (an authorization
hold), captured on the payer's verify. No money leaves the payer until the
work is confirmed done, and a surprise bill is structurally impossible.

```
BOOKING                 WORK DONE + EVIDENCE        PAYER TAPS "VERIFY"
   │                          │                            │
   ▼                          ▼                            ▼
 authorize hold          (no money moves;            CAPTURE the hold
 (PaymentIntent,          tradie cannot mark          ─────────────────►
  capture_method=          "done" until photo         then TRANSFER to tradie
  manual)                  evidence gates pass)        = captured − 5% fee
   │                                                        │
   │  card is held, not charged                             ▼
   └───────────────────────────────────────────────►  tradie paid SAME DAY
                                                        Zaivo keeps 5% (fee)
```

**Step by step (as built in `payments.ts` / `supabase-data.ts`):**

1. **Booking → authorize.** `psp.authorize({ amountCents, … })` creates a
   PaymentIntent with `capture_method: "manual"`. This places a **hold** on
   the payer's card for the job amount. **No money moves.** The `payments` row
   is written `status: authorized`, and `platform_fee_cents` is recorded up
   front (`splitPayment(amount)` → 5%).
2. **Scope changes (variance).** If on-site scope grows beyond the playbook
   threshold, the work pauses and the payer approves; the hold is raised
   (`increment_authorization`, or a new slice). Below threshold: auto-applied
   and logged. The occupant never sees amounts.
3. **Milestones (multi-day jobs).** e.g. hot-water replacement authorizes a
   30% deposit at confirmation and the balance on verify (`paymentScheduleFor`),
   each its own slice — never one long hold.
4. **Evidence gate.** The tradie **cannot** trigger settlement until the
   playbook's required before/after/certificate photos are on the record. This
   is enforced by the projector, not by trust.
5. **Verify → capture.** The payer (or occupant, or their Autopilot rule) taps
   Verify. `psp.capture(pspRef)` **captures the hold** — now the money actually
   moves off the card. The `payments` row goes `captured`/`settled`.
6. **Payout-less-fee → transfer.** Zaivo **retains the 5% transaction fee** and
   `psp.transfer({ amountCents: payout, destination })` sends the remainder to
   the tradie's connected account, **same day**. `splitPayment` computes it:
   `platformFeeCents = round(amount × 5%)`, `tradiePayoutCents = amount −
   platformFeeCents`. The customer paid one clean price; the tradie received
   the remainder; Zaivo kept 5%.
7. **Fast-Pay (optional).** If the tradie opted in, a 2% factoring fee comes
   off *their* payout (not the customer), funding partner carries the risk.
8. **Decline/cancel.** If the job is declined before capture, `psp.void(pspRef)`
   releases the hold — the payer was never charged.

**No-custody guarantee.** Between authorize and capture the funds are *held on
the payer's own card by Stripe*, not in a Zaivo account. At capture, Stripe
moves money and (via Connect) transfers the tradie's share directly. Zaivo's
balance only ever holds its own fee.

**Funding ladder (same-day pay even when the payer's card isn't the source).**
`decideFunding` (core) chooses: payer card → PM trust balance → landlord
"pay now" one-tap handoff → captured-awaiting-funds. The tradie is paid
same-day; who ultimately funds it is resolved behind the scenes.

**Simulated vs live.** With no `STRIPE_SECRET_KEY`, `SimulatedPsp` runs the
identical lifecycle in-ledger (demo parity). `StripePsp` activates with the
key. Go-live also needs Stripe **Connect** onboarding so each tradie has a
`destination` account for transfers.

---

## 3. PM subscriptions — recurring monthly

The tier catalogue is the DB (`billing_tiers`), provisioned to Stripe as a
**Product + recurring Price** (keyed by SKU `lookup_key`) — see
`lib/stripe-billing.ts`. When a PM selects a tier:

```
PM selects tier ──► Stripe Checkout / Subscription (against that Price)
                         │
                         ▼
                 Stripe bills monthly, handles proration, retries (dunning)
                         │  webhook
                         ▼
       pm_subscriptions row (local truth) ◄── invoice.paid / subscription.updated
                         │
                         ▼
                 mirror to HubSpot deal (CRM/MRR reporting)
```

- **Stripe is the billing system of record** (the only thing that can charge a
  recurring card). The DB is the catalogue source of truth; HubSpot is the CRM
  mirror.
- **Monthly amount** = base fee + per-property × cap (the tier's flat Price).
- **Proration & dunning** are Stripe's job (upgrade mid-month → prorated;
  failed card → Stripe retries + emails).

**Status / gap.** The catalogue + provisioning are built. The **PM checkout +
webhook lifecycle** (create Subscription on select; `invoice.paid`,
`customer.subscription.updated`, `past_due` → update `pm_subscriptions`) is the
next release and needs live `STRIPE_SECRET_KEY`. Today, selecting a tier
records the choice + a HubSpot deal but does not yet charge.

---

## 4. What Zaivo touches, in one line

Zaivo authorizes a hold on the payer's card, releases it only when the work is
verified with evidence, captures it, keeps 5%, and pays the tradie the rest the
same day — and bills PMs a recurring monthly subscription for the platform.
Client funds are never in a Zaivo account; Stripe holds the rails throughout.
