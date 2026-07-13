# 1Pacent — Product Strategy v8: The Green Button

*A ground-up reconception. v7's twin-panel portal ships and proved the ledger, the crew, and the invariants. v8 keeps those foundations — the event-sourced ledger, deterministic core, Hermes, Honcho, n8n — and throws away the entire way people meet them. No more portals. No more dashboards-with-a-chatbot. v8 is a dispatch network you press.*

---

## 1. The one-sentence product

**Press the button, and the job runs itself — while the address remembers everything.**

Uber didn't make taxis easier to book; it deleted uncertainty. Who's coming, when, what it costs, whether to trust them, how to pay, what happened — all answered before the rider could ask. v8 does the same deletion for property maintenance, and adds the thing Uber never had: **a permanent asset that appreciates with every job**. A ride evaporates when it ends. A repair becomes a line in the address's record — an asset age, a warranty, a certificate, a price point, a trust edge — forever.

That asymmetry is the whole company. The ride was the product; here, **the record is the product and the job is the acquisition channel.**

## 2. What we delete (the v7 autopsy)

| v7 shipped | Why it dies in v8 |
|---|---|
| Twin-panel "Talk / Board" portal | Nobody wants a second workplace. Chat-as-front-door forces users to *compose* their need. Uber has no chat. |
| Cards refreshed every 15s | Polling a page is a dashboard behaviour. v8 state is **pushed** — to the screen if it's open, to the lock screen if it isn't. |
| Tokenised links as the whole identity model | Right for guests, wrong for regulars. Tradies and owners live here daily; they get real (passwordless) accounts. Tokens survive as guest passes. |
| Sally as the primary surface | The AI stops performing and starts working. The crew acts silently inside playbooks and surfaces only **Moments** — one-tap decisions. Voice/chat demotes to a hold-to-talk button for when a human wants to say something. |
| Web-first desktop layout | Every persona is on a phone at the moment of need: the renter under the sink, the tradie in the van, the owner in a meeting, the PM walking a property. **Thumb-first PWA, map-native, one primary action per screen.** |

**What survives untouched:** AI proposes → humans tap → core executes. Events are truth. The data layer is the security boundary. The degraded-mode ladder. These are why the network can be trusted with money and compliance; v8 makes them *feel* like Uber instead of reading like an audit.

## 3. Personas, pain, and the relationship graph

Four personas, one graph, and the insight v8 elevates: **the owner-occupier is a first-class demand persona, not an afterthought.** Rentals bring recurring compliance revenue; owner-occupiers bring volume, density, and consumer habit. Same button, same tradies, same address graph.

```
                    ┌──────────── trust, price, availability ────────────┐
   RENTER ──lives in──► ADDRESS ◄──owns── OWNER / OWNER-OCCUPIER         │
     │                    ▲  ▲                       │                   │
     │ reports            │  └──manages── PM (×N addresses)             │
     ▼                    │                          │ dispatches       ▼
   "something's wrong"    └────── every job writes ──┴──────────► TRADIE (goes online)
```

| Persona | The pain, verbatim | The v8 answer |
|---|---|---|
| **Renter** | "I don't know who's coming, when, or if I'm being ignored." | Press the button → live job screen with a face, a licence badge, an ETA, and a price already approved. Never chases anyone again. |
| **Owner-occupier** | "I don't know who to trust or what it should cost; I call around for days." | Same button. Upfront price band from real network invoices, verified tradie, card on file, done. |
| **Landlord** | "Every repair is five phone calls, an invoice mystery, and a compliance worry I discover at listing time." | Autopilot rules + Moments. He configures once ("approve under $500, warranty-first, licence-verified only") and thereafter decides from his lock screen in one tap. His asset record builds itself. |
| **PM** | "40 doors, 3 apps, 200 emails; I'm a switchboard between tenants, owners and tradies." | The Dispatch Deck: every job a live tile streaming state; exceptions-only workflow; George batches same-suburb compliance runs into one negotiated route. |
| **Tradie** | "I miss calls on the tools, quote at 9pm, chase invoices for 60 days." | Go **Online** like a driver. Jobs ping with price, address, and a property briefing. One tap accepts; George routes the day; evidence camera closes the job; **paid same day**. The entire back office evaporates. |

The relationships are the product's physics: a renter's report needs the owner's money and the tradie's hands, threaded through the PM's accountability. Every legacy tool serves *one* node and makes the others worse. v8's unit of design is the **thread between them** — one shared job, seen from four angles.

## 4. The engagement model: Button → Job Screen → Record

Three objects. That's the entire UI ontology.

### 4.1 The Button (intent capture, zero friction)

One oversized green button: **"Something needs fixing."** Tap → camera opens first (photos are the highest-density signal), hold-to-talk second, typing last. Sally (Hermes) triages from image+voice in the background: category, urgency (VIC statutory list — deterministic, never the model), playbook, price band from the Cost Index, earliest verified slots. Twenty seconds after the tap, the user sees:

> **Leaking mixer tap** · plumbing · not urgent
> Fixed price **$180–$240** — based on 23 real jobs near you
> Earliest: **tomorrow 8–10am** · licence-verified · warranty included
> **[ Book it ]**

No quotes to wait for on standard jobs. Uber doesn't make you collect three fares. Nelly prices from rate cards + the Cost Index inside playbook bounds; the 3-quote round survives *only* for non-standard scopes (and runs as a background race with a countdown, not a homework assignment).

### 4.2 The Job Screen (the shared live object)

The trip screen, reinvented for trades. **All parties open the same job and see the same truth from their own angle** — map with the tradie's live position (once en route), the status arc (booked → confirmed → on the way → on site → done → verified → paid), the people rail (faces, roles, licence badges), the money line (authorized → captured), and the evidence strip filling with photos as work happens. Powered by realtime push; if it changes in the world, it changes on the glass within a second.

The renter sees ETA and "no cost to you." The owner sees the price and the warranty. The PM sees the SLA clock. The tradie sees navigation, site briefing (asset history: *"HWS is a 2016 Rheem, gas meter left side"* — arrive already knowing the site), and their payout. Same object, four projections.

### 4.3 The Record (the address remembers)

Every finished job writes to the **Address Record**: the asset touched and its age, the invoice against the estimate, the photos, the warranty countdown, the certificate if it was a compliance job, the tradie's trust delta. The record view is beautiful and boring — a property's medical file. Owners check it monthly; buyers, accountants, insurers will pay for it (§7). It requires **zero data entry**: it is exhaust from jobs. That's the moat mechanic — value nobody had to type in.

### 4.4 Moments (decisions come to you)

Anything needing a human lands as a **Moment**: a push notification answerable in one tap without opening the app. *"3 quotes in for the fence — Leo recommends Sarah, $410, working shown. Approve?"* / *"George proposes Thu 2–4pm — suit?"* / *"Gas checks due at 3 Fitzroy properties — batch them for ~$85/each?"* Approve from the lock screen; the ledger records a human actor, as ever. The app is for watching and exploring; **Moments are for deciding.** Most owners will live entirely on Moments and the monthly Pulse digest — and that's success, not failure of engagement.

## 5. Playbooks: standard process, AI execution

Consistency of execution comes from **Playbooks** — codified, versioned run-sheets per job category (leak, gas check, HWS replacement, electrical fault…), each defining: intake questions Sally must resolve, urgency class, pricing model (fixed-band / rate-card / quote-race), evidence gates (arrival photo, before/after, certificate upload), compliance hooks (which certificate this files), warranty defaults, and payout trigger. Playbooks are the franchise manual; the crew are the operators:

- **Sally** (intake & concierge) — multimodal triage, guest handling, the voice on the phone line every tradie forwards their missed calls to.
- **Nelly** (pricing) — price bands from the Cost Index, auto-quote within tradie-set bounds, variance protocol (on-site scope change → one-tap payer approval, tracked to trust).
- **George** (dispatch & logistics) — the ride-matching core, built on *offer-don't-assume*: acceptance is the truth (Uber never knows a driver is free either). Ping matched Online tradies, first accept wins, cascade on silence; platform jobs make our ledger the calendar; opt-in Google Calendar sync (read-busy, then full diary management) is the earned tier, with Maps travel-time routing, Runs, and the 20-minutes-out ping.
- **Leo** (trust & compliance) — licence/insurance verification and expiry watch, warranty-first interception (*"this is covered — no charge, no approval needed"*), certificate filing, quote-ranking rationale.
- **Penny** (money) — card **authorization** at booking (no custody: Stripe holds the rails and the regulatory licence, we never touch funds), **capture on verified completion**, same-day tradie transfer; milestone capture for multi-day playbooks; receipts. Investor-clean: no client monies, no trust account, factoring risk (Fast-Pay) carried by a funding partner.

All five are **named Hermes agents with versioned skills** — a better quoting skill ships to every suburb at once. **Honcho** gives each of them theory-of-mind about each person: the renter who's anxious about strangers gets the tradie's photo and licence before the doorbell; the tradie who hates paperwork gets voice-first evidence capture; the owner who reads nothing gets three-word Moments. Honcho never stores money, dates, assets or compliance — the ledger is truth; Honcho is *bedside manner*. **n8n** remains the deterministic spine under everything: every notification, payment webhook, calendar write, licence re-check, review request and digest is a header-auth'd, event-logged workflow with no public ingress and no reasoning.

The invariant, restated for v8: **playbooks decide what must happen, humans decide what may happen, the crew makes both effortless, n8n makes both durable.**

## 6. Onboarding: value before identity

Nobody fills in a form to feel value. Onboarding *is* the first use:

- **Renter:** scans the QR magnet (or the PM's link) → button → first job booked. Account is a phone-OTP created *after* the booking confirmation ("save your job to your number").
- **Owner-occupier:** types an address → we show what the network already knows (median costs nearby, verified tradies in their suburb, typical response times) → first job → the Address Record starts itself.
- **Landlord:** claims the address → **Compliance Radar lights up instantly** (the free-tier hook: their red/amber items in 60 seconds, prefilled from jurisdiction rules) → sets three Autopilot sliders → done. The upgrade wall stays exactly where Monetisation.md put it: the first real maintenance event.
- **PM:** forwards their rent-roll CSV (or just CCs maintenance@1pacent.com on tenant emails for a week — we build the portfolio from traffic) → the Dispatch Deck materialises → batch offers appear the same day. The demo closer remains "here are your 37 non-compliant doors."
- **Tradie:** ABN + licence photo → Leo verifies against registers → **verified badge in minutes** → Sally interviews them for their rate card in one 3-minute voice conversation ("what do you charge to call out? swap a tap? hourly?") → toggle **Online** → first ping. A tradie should go from download to first paid job inside one day.

## 7. The moat, restated as a flywheel with a second orbit

**First orbit (the job loop):** more jobs → better Cost Index → truer upfront prices → higher booking conversion → more jobs for tradies → more tradies online → faster ETAs → more jobs. Classic liquidity flywheel; emergency plumbing and PM compliance runs are the density wedges (per the Moat Analysis — urgent, repeat, price-insensitive).

**Second orbit (the address loop), which Uber never had:** every job deepens the Address Record → the record powers products *beyond the immediate need* — the Property Data Pack at sale/tax time, the "verified maintained" insurance attestation, compliance evidence packs, maintenance financing against known assets, energy-upgrade eligibility (that 2016 gas HWS is a heat-pump rebate candidate) → those products bring owners in *without a breakage* → their addresses join the graph before the first job. Data products stay honest: planning estimates never masquerade as tax schedules; aggregates are k-anonymised; per-property data leaves only on the owner's explicit opt-in.

Switching costs compound in both orbits: the tradie's money flow, calendar, trust score and job history live here; the owner's asset record and warranty ledger live here; the PM's compliance history lives here. Copying the UI is a weekend. Copying ten thousand invoices attached to addresses is not.

**Monetisation rides the existing ladder** (unchanged from Monetisation.md, now with better teeth): free Compliance Radar → Landlord Pro/Portfolio per-property → Agency per-door → the transaction layer that v8's capture-on-verify rail finally unlocks: 1.2% on payments, 2–2.5% Fast-Pay, compliance-booking referral margin, financing origination later. v8's real-time payment rail is what turns the fintech phase from slideware into a switch we flip.

## 8. Brand & interface language: "Hi-Vis"

The design system is called **Hi-Vis** — the aesthetic of a well-run site. Deep bottle-green field (the existing brand), **hi-vis gold reserved exclusively for the one action that matters on each screen**, white type, big radii, huge thumb targets. Dark-first (vans at 6am, hallways at 10pm). Motion is the product's heartbeat: the status arc breathes while a job is live; the map is the background of the world. Photography over icons: real faces, real sites, real evidence. Copy sounds like a good foreman — short, certain, warm: *"John's 12 minutes out."* *"Charged only when you say it's done."* *"Saved $290 — warranty had it."*

Signature moments to build the brand on: the **green button press** (haptic + arc ignition), the **licence badge flip** (tap a tradie's face → verified licence, insurance, jobs done, accuracy), the **payout thunk** (tradie marks done, renter verifies, money lands — same day), and the **record scroll** (a property's life, beautifully laid out, zero typing).

## 9. What we do NOT build (v8 discipline)

- No feeds, no social, no gamification beyond the trust score that already exists.
- No generic chat surface as primary UI. Hold-to-talk exists inside a job and inside onboarding; that's it.
- No marketplace bidding wars visible to consumers; the race happens backstage with a countdown.
- No new jurisdiction rules engines — VIC ships, the engine stays pluggable.
- No native apps in phase one — a PWA with push covers every persona; native follows density.

## 10. Success, measured like a network

- **Time-to-value:** renter tap → booked < 3 min; tradie download → first paid job < 1 day; landlord claim → compliance picture < 60 s.
- **Liquidity:** % of standard jobs booked with upfront price (no quote round) > 70%; median dispatch-to-accept < 10 min in wedge suburbs.
- **Trust in the rail:** % of job value on capture-on-verify rails > 80%; tradie same-day payout rate > 95%; disputes < 1% with evidence packs resolving > 90% of them.
- **The moat metric:** addresses with ≥ 3 ledger events (the record is alive) — this number *is* the company.
- **Autopilot depth:** % of owner decisions taken from a Moment without opening the app > 60%.

*Companion: `DEVELOPER_BRIEF_v8.md` — the buildable slice, the realtime architecture, and how Hermes, Honcho and n8n carry it.*
