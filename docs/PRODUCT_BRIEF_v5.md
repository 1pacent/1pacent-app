# 1Pacent — Product Brief v5: The Property Employs the Crew

*Builds on v4 (Property Passport — the property, not the person, is the account) and on a forensic re-read of `docs/tradie-import/` — 131 workflow exports that turn out to contain not a feature list but an **organisation chart**: a named AI workforce that was designed in detail and never built.*

---

## 1. What the archive actually contains

The prior audits (`N8N_WORKFLOW_AUDIT.md`) correctly parked the `TRADIE-*` agent platform as "Phase 2+" and correctly noted the transport was unsalvageable (unauthenticated webhooks, string-built SQL, LLM-attributed approvals). What they under-weighted is the **design intent** recoverable from the agent system prompts:

| Agent | Planned role (verbatim intent from the prompts) | Status in today's build |
|---|---|---|
| **Sally** | The *only* customer-facing voice/chat agent; everyone else works behind her | ✅ Built (chat, memory, live price/ETA, two operating modes) |
| **George Foreman** | Scheduling operations: slot recommendation, calendar booking, daily foreman brief, two-week optimiser | ❌ Unbuilt — availability windows exist, but nothing proposes or books a slot |
| **Nelly** | Quote intelligence: price bands from historical actuals, confidence, evidence counts, assumptions, risk flags, quote-vs-actual learning loop | ⚠️ Half-built — the percentile pricing engine and comparables exist (`packages/core/pricing`); the *learning loop visibility* and evidence trail don't |
| **Penny** | Payments and faster cashflow: request payment, track status, respectful overdue follow-up | ⚠️ Stubbed — v4 auto-records payment at invoice (documented simplification) |
| **Mia** | Reputation growth: review requests at the right moment, social drafts from completed jobs, strict PII guardrails | ❌ Unbuilt |
| **Sparky** | Electrical SME for *qualified tradies only*, grounded in an Authority-Documents RAG (AS/NZS standards, legislation) — explicitly not a DIY assistant | ❌ Unbuilt (Qdrant RAG workflows parked) |
| **Quintino** | The meta-agent: analyses every other agent's history + quote-vs-actual + travel time + friction signals and compiles it into a **version-managed Skills library** — "turn operating experience into the moat" | ❌ Unbuilt — and this is the single most valuable idea in the archive |

Plus three designed learning loops (`QUOTES-021` quote accuracy, `JOBS-046` job actuals → Quintino audit, `TRUST-071` review/reputation), a `RENTAL-110` Warranty Repeat-Issue Guard (v4 built this), and a `RENTAL-109` Two-Week Schedule Optimiser (unbuilt).

**The synthesis:** v4 gave the property a permanent record. The archive designed a workforce. Neither is the product. The product is what happens when you put them together:

> **Every property on the network employs an AI crew. The passport is what the crew knows; the crew is what the passport can do; the human tradie is the crew's hands — today. In ten years the hands are interchangeable. Whoever owns the crew and the record owns the industry.**

---

## 2. The disruption thesis, stated the way Uber's would have been

Uber's actual move was not "taxis in an app." It was **separating the trust relationship from the physical asset**: riders trusted the platform, not the driver or the car, which made drivers and cars interchangeable and let supply scale without trust having to be rebuilt per-vehicle.

The maintenance industry's equivalent separation is coming, and nobody in real estate is building for it:

**Separate the *operation* of maintenance from the *execution* of maintenance.**

- The **operation** — knowing what's wrong, what it should cost, who's accountable, when it can happen, whether it's under warranty, whether it's compliant, whether it was done right — is knowledge work. AI does this now. That's the crew.
- The **execution** — hands on the tools — is done by a licensed human today. Over 5–10 years the executor gets progressively abstracted: a licensed tradie → a less-experienced tradie guided by the SME agent and the property's job history → a human supervising semi-autonomous tools → a humanoid robot performing routine, non-licensed tasks (filter swaps, smoke-alarm battery/inspection rounds, gutter clearing, paint touch-ups) with a licensed human signing off remotely.

Here is the part that matters commercially: **a robot cannot fix a property it knows nothing about.** The binding constraint on robotic maintenance will not be actuators — it will be *context*: which hot water system, installed when, behind which panel, failing how, under whose warranty, governed by which standard. That context is exactly what the Property Passport accumulates as a byproduct of every job, and what no account-centric competitor retains past a tenancy change.

So the 10-year asset being built, job by job, is a **machine-readable corpus of real maintenance operations per physical property** — the training set and instruction set for whoever's hands do the work. Every job the platform completes today emits a structured **Job Spec** (asset, fault, steps taken, parts, durations, evidence, outcome). Today that's an audit-grade handover pack that makes the next human faster. In 2032 it's the work order a robot executes. Same artifact. We just start recording it now, while it's nearly free to do so.

**The moat compounds three ways, and only together:**
1. **The record** (passport): survives churn, per-property, per-asset — v4, live.
2. **The judgement** (crew + Quintino's skills library): every quote-vs-actual, every schedule that slipped, every warranty catch becomes versioned, reusable operating capability — the archive's best idea, unbuilt.
3. **The corpus** (job specs): the operation's knowledge in executor-neutral form — new in v5.

A competitor can copy the app in a quarter. They cannot copy ten years of per-property operating history, and by the time robots need it, it's unreproducible.

---

## 3. Three product concepts, ranked

Ranked on the four axes requested — innovation, ability to implement now, user experience, monetisation. **#1 is the recommendation.**

### #1 — The Crew Room *(recommended: build this)*

**One sentence:** Make the AI workforce *visible and accountable* — every property (and every tradie business) gets a Crew Room where named agents do the work in front of you, explain their reasoning with evidence, and take standing instructions instead of requiring taps.

**Why this is the "why didn't I think of that":** Every AI product hides its automation behind spinners and toasts. The trust problem in maintenance — the industry's *actual* pain — isn't solved by automation, it's solved by **legible** automation. When a landlord sees, in one feed:

> **Nelly** priced this at $180–$320 — from 14 comparable jobs on this network, high confidence
> **Guard** caught this one: the March hot-water repair is still under John's warranty — routed back to him, $0, no quote round
> **George** proposed Thu 2–4pm from John's live availability; the tenant confirmed
> **Policy** auto-approved: under your $300 standing instruction — you did nothing
> **Quinn** noted: electrical estimates on this network ran 9% low last month — bands widened

…the product stops being "software with AI features" and becomes *staff you can watch working*. Nobody asks "can I trust the AI?" about an employee whose every decision arrives with its evidence attached. The interaction model inverts: instead of the human operating an app, the human **manages a crew** — reads the feed, adjusts standing instructions (the v4 policy engine, reframed as instructions to the crew), and intervenes only on exceptions.

**What it is concretely:**
- The append-only event log (already the source of truth, already attributed by actor) is surfaced as a **crew feed**, per property and per portfolio, where each system actor is a named crew member with its reasoning payload rendered in plain language.
- **George becomes real**: proposes actual time slots from tradie availability windows and existing bookings at dispatch time; the tradie confirms one tap; the tenant's tracker shows a real window, not a phrase.
- **Nelly becomes accountable**: every price band she states persists its evidence (comparable count, band, confidence) onto the request and into the feed; every invoice closes her loop and updates her published accuracy.
- **Quinn (Quintino) becomes visible**: a nightly/triggered insight pass over quote-vs-actual and cycle-time data writes plain-language insights into the feed — the learning loop the archive designed, finally observable.
- **Every completed job emits a Job Spec** — the robot-ready structured artifact (§2) — attached to the work order and the asset, visible in the passport.
- The tradie's portal gets the same treatment from their side: their crew (Sally answering, Nelly drafting, George booking, Penny chasing) working *for their business*.

**Scores:** Innovation: high — legible-AI-workforce as the product is genuinely unoccupied ground in this industry. Implementability: **highest of the three** — it's 70% a re-presentation of engines that already exist and verified-live, plus one real new capability (George). UX: the wow is immediate and demo-able in 90 seconds. Monetisation: strengthens both existing paid seats (tradie pays for a crew, not a "receptionist"; PM pays for a workforce running their portfolio) and prices naturally per crew-member-enabled.

### #2 — The Self-Maintaining Property

**One sentence:** The property raises its own work orders — asset ages, failure curves, and the compliance calendar generate planned work before things break, batched into suburb routes at negotiated rates; the tenant never reports the issue because it never happens.

Uses the asset registry (v4), compliance engine (v1), batching (v4), and pricing engine to shift the whole model from reactive to planned. The robot angle is strong here too: cheap quarterly robot/drone inspection rounds eventually feed the twin. **Why #2 not #1:** with the current volume of asset data, "predictive" is honest only for compliance-calendar and age-based items — real but thin; it risks demoing as "scheduled maintenance with a nice story." It is, however, the natural *next* release on top of the Crew Room (it's just Quinn + George given initiative), and should be positioned in the roadmap, not built first.

**Scores:** Innovation: high conceptually, medium in honest v1 scope. Implementability: high. UX: good but quiet — the product's best moments are invisible by design, which is hard to demo. Monetisation: strong for PM tier (planned-work % and savings reporting).

### #3 — The Maintenance Exchange

**One sentence:** Every job becomes a standardised, machine-readable contract (Nelly's band, George's slot, warranty terms, trust requirements) listed on a real-time clearing market where any qualified executor — a tradie today, a robot fleet operator in 2032 — can fill it; PM compliance batches trade as blocks.

This is the biggest idea and the truest endgame of the executor-abstraction thesis: if Job Specs are standard and trust travels with the network, work can clear like a market. **Why #3:** it's a two-sided liquidity business — the hardest cold-start in startups — and demos poorly with three seeded tradies. Everything in #1 (specs, trust, bands, slots) is a prerequisite anyway. Build #1, let the network densify, then the Exchange is a pricing-and-matching layer on data that already exists.

**Scores:** Innovation: highest. Implementability now: lowest (not technically — commercially). UX: excellent at liquidity, empty-marketplace-awful before it. Monetisation: best at scale (take rate), zero before liquidity.

**Sequencing:** these are not alternatives — they're one roadmap. **Crew Room (now) → Self-Maintaining Property (next 2 releases) → Exchange (when network density earns it).** Build #1.

---

## 4. The experience, per persona — how one issue actually flows

The Crew Room is not a page; it's the *same crew seen from four seats*. Here is one issue traced end-to-end, plus each seat's recurring experience.

### 4.1 Renter — Maya, 12 Rose St ("I never chased anyone")

1. **Raise it in one place, no account.** Scans the switchboard QR (or her saved link) → chats with Sally: *"the hot water's gone cold again."* Sally already knows the property — its assets, its history, Maya herself (memory recalls her preferred access times from last time).
2. **The three questions get answered during the conversation, not after.** While Maya types, the crew works behind Sally:
   - **Leo checks the warranty ledger first.** March hot-water repair by John Snow, 12-month warranty open → Sally says it *on the spot*: "Good news — this is covered by the warranty on the March repair. I'm sending John back at no cost, and your landlord doesn't need to approve anything."
   - **If no warranty:** Nelly prices it live from real comparables → Sally states the band and the evidence ("usually lands between $180–$320 on this network — that's from 14 similar jobs") and the ETA from real response history ("someone typically responds within a couple of hours"). Urgent categories (VIC urgent-repairs list) bypass approval automatically — Sally says that too.
3. **Then the promise stays visible.** The tracker on the same page fills in live, each step signed by who did it: *Sally logged it → Leo approved under your landlord's standing instruction → Nelly opened the quote round → George booked **Thu 2–4 pm** (a real slot from the tradie's live calendar, not "we'll be in touch") → John started → John says it's done → **Confirm it's fixed** (Maya's one tap).* 
4. **Each issue is better than the last** — Sally remembers more, Nelly's band is tighter, the stated ETA is truer, and a warranty catch means the whole flow above collapses to "John's coming back Thursday, free."

### 4.2 Landlord — Mark, owner ("one decision a month, pre-explained")

- **One-time setup:** standing instructions to the crew — *auto-approve under $300 any tradie; under $800 if trust ≥ 80; never gas/electrical without me.* (This is the v4 policy engine wearing its real name.)
- **The common case — no decision at all.** Feed entry: *"Leo auto-approved John's $240 quote under your $300 instruction — top-ranked of 3, dispatched. You did nothing."*
- **The warranty case — explicitly not an approval.** This is the distinction the product must render, not bury: warranty claims never ask the landlord anything. Feed entry: *"Leo caught this one — March repair still under John's warranty until 14 Mar. Routed back to him. **Saved ~$290** (the median quote for this category)."* Savings are quantified per catch and totalled on the property's passport — the landlord's running proof of what the record is worth.
- **The genuine decision — one moment, one recommendation.** When a quote round finishes *above* policy, the landlord gets a single decision screen (property page, or the emailed one-tap link): the **recommended option on top** — "Top pick: John, $460 total · trust 92 · can start Thursday" — with the ranking's why stated (trust 40% / cost 35% / availability 25%) and the other two quotes beneath it, one tap to accept any. Not three raw PDFs to study; a ranked recommendation with its working shown.
- **Over time:** Quinn's insights arrive in the same feed — *"hot water system is 9 years into a 10–12 year life; a planned shoulder-season replacement typically runs ~40% under emergency pricing"* — which is exactly where concept #2 (Self-Maintaining Property) grows from, one insight at a time.

### 4.3 Property manager — Jordan, 41 properties ("two lanes, one feed, 1 needs me")

The PM's Crew Room is the portfolio view with maintenance split into its two real lanes:

- **Reactive lane** — tenant-raised issues across all 41 properties in one attributed feed, each in its live state. The PM is *informed, not gating* (unchanged principle): landlord decisions happen without them, and the feed's summary line is the whole job: **"38 handled by the crew · 2 with landlords · 1 needs you."**
- **Proactive lane — the regulatory calendar, worked by the crew.** The VIC compliance engine already knows every property's recurring obligations (smoke alarms yearly, gas 2-yearly, electrical 2-yearly, pool barriers…). The proactive lane shows them as upcoming work, and where 2+ properties share a requirement + suburb + ~30-day window, the crew flags the batch: *"14 gas safety checks due in Fitzroy/Collingwood within 45 days — **one route, one negotiated rate**."* One tap opens the batched quote round; George sequences the route; the compliance certificates land back on each property's passport as the jobs close.
- **The report writes itself.** Quinn totals the quarter — batched-vs-standalone savings, warranty catches, median cycle time — which is the PM's own retention pitch to their landlord clients, generated as a byproduct.

### 4.4 Tradie — John Snow ("a staff of six for the price of a tool")

- **Sally answers his phone** — marketplace jobs *and* his own customers via his lead link, capturing scope in his business's name while he's on the tools.
- **Nelly drafts every quote** from his rate card + the property's history, and publishes his accuracy back to him ("your electrical estimates ran 4% low last month — bands adjusted"). He confirms or edits; he never starts from a blank field.
- **George fills the calendar**: when John wins a job, three real slots from his availability are proposed automatically; he taps one; the tenant's tracker updates itself. No phone tag — ever. (This is also the machine-to-machine seam the PM batching rides on.)
- **Penny invoices at completion**, warranty terms captured in the same screen, and his trust score — earned once, portable across the network — gets him first look at the batch routes.
- **He arrives already briefed**: the property's asset registry and prior Job Specs on his job card. Less diagnosing, more jobs per day.

### 4.5 Where the moat turns every loop

Every completed job simultaneously: tightens Nelly's price bands (comparables +1) → updates the tradie's trust score → adds an asset/warranty to the passport → emits a Job Spec into the corpus → feeds Quinn an accuracy/cycle-time fact. Four personas each acting in their own interest, all depositing into the same compounding record. That's the flywheel — visible, in the feed, every time.

## 5. Business model (unchanged from v4, sharpened by the crew)

Tradie and PM pay subscriptions; landlord and renter are why those subscriptions are worth buying. The crew reframing raises willingness-to-pay: a missed-call tool competes at $49/mo; **a staff of six that gets measurably better every month** anchors against a part-time office admin's salary. Per-crew-member packaging (Sally+Nelly base; George, Penny, Mia as add-ons) gives a natural expansion path, and Quinn's published accuracy/savings numbers are the retention engine — the product demonstrates its own ROI in the feed.

## 6. Non-goals for the first Crew Room release

- No real telephony, no real payment provider (carried from v3/v4; Penny stays honest about being a stub).
- No Sparky/Authority-Documents RAG yet (needs the standards corpus licensed/ingested properly; phase 2 — but Job Specs are designed so Sparky can later ground on them).
- No Mia (review/social) yet — needs completed-job volume to be meaningful.
- No free-form "chat with the crew" for landlords in v1 — the feed + standing instructions *is* the management interface; a conversational layer over it is phase 2 once the feed's vocabulary is established.
- No robots. The robot-readiness is a data artifact (Job Spec), not a hardware program — deliberately.

See `docs/DEVELOPER_BRIEF_v5.md` for the end-to-end buildable spec.
