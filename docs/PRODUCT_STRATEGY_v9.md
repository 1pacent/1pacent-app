# Zaivo — Product Strategy & Status v9

*The single sync-back reference. If a working session is lost, start here.*

**Company:** 1Pacent Pty Ltd (Victoria, Australia) · **Product/brand:** Zaivo
**Live:** https://www.zaivo.com.au (customer site) · admin.zaivo.com.au (operator console)
**Status date:** 2026-07-20 · **Supersedes:** PRODUCT_STRATEGY_v8.md
**One line:** *Press the button, and the job runs itself — while the address remembers everything.*

---

## 0. What changed since v8 (read this first)

v8 defined the "Green Button" dispatch network and shipped it. v9 is not a
reconception — it is the **commercial and moat articulation** of the built
product, plus the corrections learned from operating it:

- The whole of v8's build (R1–R8.3) is **shipped and live** on zaivo.com.au.
- We now say out loud what the company actually is: **not a maintenance
  marketplace that clips transaction fees — an *address-record compounding
  engine* whose acquisition channel happens to be getting repairs done.**
  Transaction fees exist in the model; they are not the thesis.
- The monetisation is settled: **PM subscription ($2/property/month, tiered)
  + a transaction fee that covers payment rails. Tradies are NOT charged at
  launch** — we subsidise supply to build the network, and monetise tradie
  automation later once they depend on it.
- The pricing insight from independent review is now doctrine: **our
  per-property model already removes the "$499/month is too much for a
  30-door agency" objection** (a 30-door agency pays $60/month), *and* the
  labour it removes is worth multiples of the fee — so the strategic job is
  to make that saving **visible monthly on the PM dashboard**, which both
  proves the ROI and creates room to price on value, not on cost.

---

## 1. What Zaivo is (and is deliberately not)

**Is:** a four-sided network that turns every property repair into a
permanent, verified entry on the *address's* record — asset installed, its
age, the warranty clock, the compliance certificate, the price paid, the
evidence photos, the trust edge earned. The repair is the event; **the
record is the product.**

**Is not:** a lead-gen directory (hipages), a job-ticketing SaaS (Property
Tree / Console maintenance modules), or a pure transaction marketplace
(Airtasker). Those capture a fee on a moment and forget it. Zaivo captures
the moment *and keeps the asset it created.*

**Why the distinction is the whole company.** A marketplace's value is linear
in transactions this month. Zaivo's value **compounds**: every job makes the
address record more complete, the price index sharper, the trust graph
truer, and the switching cost higher. A ride evaporates; a repair becomes an
asset that a landlord, a buyer, an insurer, and an investor will each pay to
see. **The job is the acquisition channel; the record is the moat.**

---

## 2. The four personas, their pain today, and Zaivo's answer

| Persona | The pain today (verbatim) | Zaivo's answer |
|---|---|---|
| **Renter** | "I reported it a week ago and I have no idea if anything's happening." | Press the button, snap a photo. See a face, a licence badge, a live ETA, one shared screen: booked → on the way → on site → done. Pays nothing, ever. |
| **Owner-occupier** | "I don't know a good tradie and I don't know if the price is fair." | Fixed price from *real completed jobs nearby* before committing; licence-verified tradie online now; money moves only on their verify. A first-class demand persona — volume + consumer habit. |
| **Landlord / investor** | "I'm handed surprise invoices and I'm chasing my PM for status; at sale I have no maintenance history." | Autopilot: approve under $X, only trust-score ≥ Y, safety work always asks. Everything logged with the rule that allowed it. At sale/tax/insurance: a one-tap Data Pack of the whole history. |
| **Property Manager** | "My team's day is chasing three quotes and chasing the landlord for approval — for every single job." | The Deck: one screen, dispatch runs, house-tradie defaults, same-day pay, and the approval chase **deleted** by the landlord's own Autopilot rules. |
| **Tradie (supply)** | "Back-office at 9pm, paid in 60 days, quoting into the void." | Go Online like a driver. Jobs ping with price, address, and a property briefing. One tap. Paid **same day** on verify. No chasing, no invoicing. |

The relationship graph (one address, many roles — a person can be an
owner-occupier of one property and a landlord of another):

```
   RENTER ──lives in──► ADDRESS ◄──owns── OWNER / LANDLORD / INVESTOR
     │                    ▲  ▲                       │
     │ reports            │  └──manages── PM (× many addresses)
     ▼                    │                          │ dispatches
  "something's wrong"     └──── every job writes ────┴────────► TRADIE (online)
```

---

## 3. How the network actually works (the built flow)

1. **Intake — the Button.** Renter/owner presses it, adds a photo + a
   sentence. AI triage (Sally) *proposes* a category; a deterministic
   **playbook table** decides the job type, the evidence gates, the pricing
   model, and the urgency class. (AI never decides money or compliance — it
   proposes, the core executes.)
2. **Pricing — honest by construction.** Standard jobs (leaking tap, gas
   check, smoke alarm) are priced from the network's **Cost Index** — the
   median of real invoices for that exact job nearby, shown *with its
   evidence count and confidence*. Non-standard jobs (e.g. hot-water-system
   replacement) run a **quote race**: matched specialists price it, ranked on
   trust + price + speed.
3. **Trade-matched dispatch (R8.1).** Only tradies whose trade covers the
   category are ever invited — a plumber never sees an electrical job. The
   **handyman rule**: a general-maintenance tradie may take any *small*
   fixed-price job that files no certificate; specialist and certificate work
   stays with specialists. Ranked Online-first, then by rolling quote
   accuracy. House tradies (a PM's own defaults) get first pick on small jobs.
4. **Approval — the chase, deleted.** The landlord sets **Autopilot** once
   (spend cap, trust floor, safety-always-asks). Anything inside the rules
   just happens, logged with the rule that allowed it. Anything outside lands
   as a **one-tap Moment** on their lock screen. Statutory urgent repairs
   (VIC RTA list) bypass the queue as the law provides.
5. **The job, live.** One screen everyone shares. Photo evidence gates the
   work — the tradie physically cannot mark "done" until the required
   before/after/certificate photos are on the record. On-site scope increases
   inside the threshold auto-apply and log; bigger ones **pause the work** and
   go to the payer as an approve/decline Moment. A surprise bill is
   structurally impossible.
6. **Money — no custody, capture on verify.** Booking places a card
   authorization (a hold; no money moves). On the payer's **Verify** tap, the
   payment captures and the tradie is paid **same day** (funding ladder:
   payer card → PM trust balance → landlord "pay now" handoff → awaiting
   funds). A licensed PSP (Stripe) holds the rails; Zaivo never holds client
   money.
7. **The record writes itself.** Asset + age, warranty months, certificate,
   price-vs-estimate, trust edge — all written to the **Address Record** as
   exhaust from the job. Zero data entry. Compile to a **Data Pack** on one
   tap at sale/tax/insurance time.

Supporting cast (all live): **Felix** — the Zaivo concierge (web widget,
email fixitfelix@agentmail.to, Telegram @Felix1pacent_bot) greets and
triages, reads the ledger read-only, proposes-and-seeks-approval for any
change. **George** — silent scheduling/runs. **Honcho** — tone memory only,
never facts. **n8n** — schedules + transport, no reasoning.

---

## 4. The moat: why the Address Record compounds

Every completed job deposits five durable assets against the property, and
each one is worth money to a *different* customer:

| What the record captures | Who pays to see it, and why |
|---|---|
| **Asset register** — what's installed, when, by whom | **Buyers & their conveyancers** at sale: a verified maintenance history de-risks the purchase (the "medical file for the property"). |
| **Warranty clock** — every part, its term, the receipt (from tradie, landlord, or PM) | **Owners & landlords**: never pay twice for in-warranty work; claim before expiry. |
| **Compliance certificates** — gas, smoke alarm, pool barrier, with due dates | **PMs & landlords**: statutory duty discharged and *provable*; the tickler chases the next one automatically. |
| **Price & trust history** — real invoices, quote-vs-final accuracy per tradie | **The network itself**: sharper Cost Index, truer dispatch ranking — the flywheel. And **investors** underwriting maintenance spend. |
| **Evidence trail** — before/after photos, who-approved-what-when | **Insurers** (claims, and eventually risk pricing) and **dispute resolution** — the record decides. |

The moat is not the software; it is the **accumulated, verified,
address-anchored history that no competitor can backfill.** A new entrant can
copy the Button in a month. They cannot copy three years of every gas
certificate, warranty, and price point on 40,000 Melbourne addresses. The
data gets deeper and the switching cost gets higher with every job — and
because the record belongs to the *address*, it survives a tenant moving, a
landlord selling, or a PM changing agencies.

---

## 5. Adoption risk across a four-sided network — and how we address it

Four-sided networks fail from **empty sides** (cold-start) and from **any one
side's friction**. Our defences, side by side:

**The cold-start problem (all sides at once).** We don't launch a city; we
launch **a suburb cluster around one design-partner PM**. The join flow
captures leads street-by-street and we light a suburb only when it has
trade coverage per category. The operator concierge-runs the first ~20 jobs
by hand (watching the console, Felix on questions). This is the classic
"come for the tool, stay for the network" wedge — and the tool (the Button +
the record) delivers value at N=1, before any network exists.

| Side | Its adoption risk | How Zaivo removes it |
|---|---|---|
| **Renter** | Won't download an app for a twice-a-year need. | **No app, no account** — a magic link / QR, press the button. Lowest-friction onboarding in the category; this is a competitive advantage, kept permanently. |
| **Owner-occupier** | Doesn't trust an unknown tradie or price. | Fixed price from real jobs + licence badge + live tracking + verify-to-pay. Trust is *shown*, not claimed. |
| **Landlord** | Fears losing control / surprise bills. | Autopilot gives *more* control than today (explicit rules, full log) with *less* effort. Money never moves without their rule or their tap. |
| **PM** | Switching cost; "another system." | Value at first job (approval chase deleted); house-tradies keep their trusted people; per-property pricing means a small agency risks $40–100/month, not $500. See §6–7. |
| **Tradie** | Won't quote into a void or wait 60 days. | Free to join (no fee at launch), jobs pinged with price + brief, **same-day pay**, trade-matched so every ping is relevant. Supply is *subsidised* on purpose. |

**The sequencing that makes it converge:** PM (design partner) brings a
portfolio of addresses and their landlords → that density makes it worth a
handful of local tradies going Online → live tradies make the Button real for
renters and owner-occupiers in those same suburbs → job volume deepens the
record and the Cost Index → which makes the next PM's pitch easier. One PM is
the keystone; everything else is pulled in behind them.

---

## 6. Monetisation model

**Principle: charge the side that captures the operational saving (PMs), rails
-cost pass-through on money, and subsidise the side we need to grow (tradies)
— for now.**

### 6.1 Property Manager subscription — the primary revenue line

Per-property, per-month, in cohort tiers (live in code as `PRD-1P-004-*`,
mirrored to HubSpot). **$2 / property / month:**

| Tier (SKU) | Properties under mgmt | AUD / month |
|---|---|---|
| PRD-1P-004-20 | up to 20 | $40 |
| PRD-1P-004-50 | up to 50 | $100 |
| PRD-1P-004-100 | up to 100 | $200 |
| PRD-1P-004-200 | up to 200 | $400 |
| PRD-1P-004-300 | up to 300 | $600 |
| PRD-1P-004-400 | up to 400 | $800 |
| PRD-1P-004-500 | up to 500 | $1,000 |
| PRD-1P-004-1000 | up to 1,000 | $2,000 |

**Why per-property beats flat tiers.** The independent review flagged that
80%+ of agencies are small operators (20–50 doors) who balk at a flat
$499/month. Per-property **structurally solves this**: a 30-door agency pays
$60/month, a 50-door agency $100/month — an easy "yes" — while a 500-door
agency pays $1,000/month and a 1,000-door group $2,000. Adoption-friendly at
the bottom, revenue-scaling at the top, and honest (you pay for what you use).

### 6.2 Transaction fee — payment-rail cost pass-through

A percentage of settled job value, taken at transfer, to cover Stripe/PSP
processing and same-day payout costs. **Target: 5%.**

> ⚠️ **Reconciliation flag (must decide + align code):** the *shipped code*
> currently retains **1.2%** (`PLATFORM_FEE_BPS = 120` in
> `packages/core/src/money/payment-plan.ts`). The business intent per this
> strategy is **5%** (rails + margin). Before Stripe go-live, either update
> the constant to 500 bps or confirm 1.2% is deliberate. This doc treats 5%
> as the decision; the code is the single thing blocking it.

### 6.3 Fast-Pay — optional tradie accelerator (live)

A tradie may opt into money-*today* factoring; the factoring fee (2%) comes
off *their* payout, platform fee unchanged. Margin, not risk — the factoring
risk sits with a funding partner.

### 6.4 Tradies pay nothing — for now (deliberate)

At launch tradies are **free**: no subscription, no lead fee. We are buying
supply density. **Later**, once tradies depend on Zaivo for scheduling,
same-day pay, the property briefings, and their trust score / ranking, we
introduce a tradie business tier (the automation they'd otherwise pay a
bookkeeper + a scheduler + a factoring desk for). Not at startup — an empty
tradie side kills the network.

### 6.5 The record, monetised later (the real upside)

Data Packs at point of sale, insurer risk feeds, investor portfolio
underwriting — all downstream of the moat in §4. Not priced yet; noted so we
never accidentally give the asset away. The Address Record's terms already
bind data to the address and release it only on the owner's explicit opt-in.

---

## 7. The PM value equation — "don't leave money on the table"

The strategic point from the independent review, made concrete: **our fee
must be visibly dwarfed by the labour we remove**, and that saving must show
up on the PM's own dashboard every month.

### 7.1 The saving, per maintenance job (conservative)

A single maintenance job in a traditional agency consumes property-officer
time across: sourcing/chasing ~3 quotes, chasing the landlord for approval
(multiple touchpoints, days of delay), coordinating tenant access, then
follow-up, invoice handling and reconciliation.

| Step removed by Zaivo | Typical PM admin time |
|---|---|
| Chase 3 quotes | 30–45 min |
| Chase landlord approval | 15–30 min |
| Coordinate access + status updates | 15 min |
| Invoice handling + reconciliation | 15 min |
| **Total per job** | **~1.25–1.75 hrs** |

At a loaded property-admin cost of ~$40/hr, that's **~$50–70 of labour per
job removed.** A rental averages ~4–8 maintenance events/year (≈0.5/month).

**Per property, per month:** ≈ 0.5 jobs × $60 saved ≈ **$30 of labour
removed — against a $2 fee. ~15× ROI.** Even on deliberately pessimistic
inputs (2 jobs/yr, $45/job) it is **~$7.50 saved vs $2 — still ~4×.**

**Conclusion:** the current ladder is not the ceiling on value — it's an
adoption price. Once the saving is *provable on the dashboard*, there is
clear headroom to (a) hold price and win on obvious ROI, or (b) introduce
value/premium tiers priced on hours-saved rather than per-property cost. We
do not discount to compete; we make the saving impossible to miss.

### 7.2 Committed build — the PM Savings Ledger (roadmap, high priority)

To make §7.1 real and defensible, the PM Deck gains a **Savings This Month**
panel that computes, from the ledger (not marketing estimates):

- **Jobs run through Zaivo** this month.
- **Estimated PM hours saved** = jobs × a configurable per-job minutes model
  (quotes + approval + coordination + reconciliation), shown with the model
  so it's auditable, never a black box.
- **$ labour saved** = hours × the agency's loaded admin rate (they set it).
- **Approval touchpoints eliminated** = count of Autopilot auto-approvals
  that would otherwise have been a landlord chase.
- **Days-to-resolution** vs an industry baseline.
- **Your Zaivo fee this month** shown right beside it — so the ratio
  (savings ÷ fee) is visible every month. The pitch proves itself in
  production data.

This panel is the single most important commercial feature not yet built.
It converts the value thesis from a slide into a number the PM sees monthly.

---

## 8. Build status — what's live (R1 → R8.3)

All shipped to production (Vercel `1pacent-app`, live Supabase, zaivo.com.au):

- **R1** Green Button intake, playbooks, no-custody payment machine, Go
  Online / ping / first-accept-wins, live Job Screen, capture-on-verify.
- **R2** Web-Push Moments, one-tap signed actions, Owner Autopilot, PM Deck
  batch runs, George Runs, Honcho tone, compliance/pulse crons.
- **R3** Stripe PSP seam (manual-capture, no custody), payment slices,
  milestone capture, variance protocol, Fast-Pay, Data Pack.
- **R3.5** Parts-to-job, time-actuals learning loop, trust score (money+time),
  "trust blue" theme.
- **R4** Customer site, `/api/join`, HubSpot mirror, operator console
  (`/admin`), host routing.
- **R5** Geoscape address lookup; crews (staff act for a business).
- **R6** Per-persona performance views; feedback→score; same-day funding
  ladder incl. landlord "pay now" handoff.
- **R7** PM subscription cohorts from HubSpot (`PRD-1P-004-*`); house tradies.
- **R8** Dedicated **hermes-1pacent** stack — Felix concierge (email +
  Telegram + web), read-only DB, approval-gated.
- **R8.1** Trade-matched dispatch (handyman rule), seat-visible quote races,
  honest quoting copy.
- **R8.2** Domain **zaivo.com.au** live; username/password operator login;
  coming-soon shutter.
- **R8.3** Zaivo rebrand sweep; **Terms of Use** (VIC-governed, liability
  limited subject to ACL/RTA, AI-may-be-incorrect disclaimer; © 2026
  1Pacent); **persona-aware join** (renter/owner-multi-role/landlord/PM/
  tradie; ABN lookup seam; suburb chips).

**Known gaps before commercial launch** (the real backlog):
1. **Stripe go-live** — real payment sheet + Connect onboarding for tradie
   payouts; confirm the **1.2%→5%** fee (§6.2).
2. **SMS delivery of links** — the renter's link should arrive by text, not
   only email (the app-download killer feature).
3. **Accounts** — Supabase Auth OTP so leads become logins and returning
   PMs/tradies skip links (schema seams exist: `contacts.user_id`,
   `access_tokens.claimed_by_user_id`).
4. **PM Savings Ledger** (§7.2) — the commercial proof feature.
5. **ABR GUID** — free ABN autocomplete is built but needs the registration
   GUID set in env.

---

## 9. Architecture reference (sync-back facts)

- **Repo:** github.com/1pacent/1pacent-app · **Docs:** here + vault
  `1pacent/starlord-command-vault` → `10 - Projects/1pacent/docs`.
- **Stack:** Next.js 15 (App Router, pnpm monorepo) — `packages/core` (pure,
  tested rules: playbooks, trust, trade-match, money), `packages/agents`,
  `packages/db` (migrations 0001–0028), `apps/web`. Deploy: Vercel as
  mac@1pacent.com. DB: live Supabase. Payments: Stripe seam (simulated until
  keys). Shared **n8n** (one instance for the whole VPS).
- **Dual DataSource parity:** demo store + Supabase store implement one
  interface; a shared projector enforces money visibility structurally
  (occupants never see amounts).
- **AI seams:** `aiClient()` = raw OpenRouter for structured pipelines
  (Sally/triage — never routed through the agent, which contaminates
  structured output); **Felix** = the hermes-1pacent gateway concierge.
- **Hosts:** zaivo.com.au (site), admin.zaivo.com.au (console),
  api.1pacent.com/hermes (Felix). VPS 75.119.151.166.
- **Legal:** operating entity **1Pacent Pty Ltd**, Victoria; governing law
  VIC; ACL/RTA non-excludable rights preserved; AI outputs disclaimed.

---

## 10. The thesis in one paragraph (for when you forget why)

Everyone else is trying to make property repairs a *marketplace* and clip the
transaction. That's the linear business, and we run it too — PM subscriptions
and a rails fee pay the bills. But the **company** is the compounding one:
every repair we coordinate writes a permanent, verified line into the
*address's* record, and that record is the thing landlords, buyers, insurers
and investors will each pay to trust. We give renters a frictionless button,
give tradies same-day pay for free to seed supply, delete the PM's
quote-and-approval chase so the saving dwarfs our fee, and let the landlord
keep control with less effort — and every one of those interactions deposits
another brick in a moat no competitor can backfill. Press the button, and the
job runs itself — while the address remembers everything, forever.
