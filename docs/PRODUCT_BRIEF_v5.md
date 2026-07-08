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

## 4. Who feels what on day one (Crew Room)

| Persona | Before | After |
|---|---|---|
| **Renter** | Reports issue, waits, wonders | Watches the crew handle it: named agents, real slot, live tracker — "it felt like a concierge, not a portal" |
| **Landlord / owner-occupier** | Approves blind quotes, repeat callouts | Reads the feed, sets standing instructions once; warranty guard and policy do the taps; every decision arrives pre-explained with evidence |
| **Tradie** *(pays)* | Buys a "missed-call answering" tool | Employs a crew: Sally answers, Nelly drafts accurate quotes that improve monthly, George fills the calendar, arrives already briefed by the property's history |
| **Property manager** *(pays)* | Triage machine | Portfolio Crew Room: one feed across 41 properties, batchable compliance flagged, "1 needs you" instead of 41 |

## 5. Business model (unchanged from v4, sharpened by the crew)

Tradie and PM pay subscriptions; landlord and renter are why those subscriptions are worth buying. The crew reframing raises willingness-to-pay: a missed-call tool competes at $49/mo; **a staff of six that gets measurably better every month** anchors against a part-time office admin's salary. Per-crew-member packaging (Sally+Nelly base; George, Penny, Mia as add-ons) gives a natural expansion path, and Quinn's published accuracy/savings numbers are the retention engine — the product demonstrates its own ROI in the feed.

## 6. Non-goals for the first Crew Room release

- No real telephony, no real payment provider (carried from v3/v4; Penny stays honest about being a stub).
- No Sparky/Authority-Documents RAG yet (needs the standards corpus licensed/ingested properly; phase 2 — but Job Specs are designed so Sparky can later ground on them).
- No Mia (review/social) yet — needs completed-job volume to be meaningful.
- No free-form "chat with the crew" for landlords in v1 — the feed + standing instructions *is* the management interface; a conversational layer over it is phase 2 once the feed's vocabulary is established.
- No robots. The robot-readiness is a data artifact (Job Spec), not a hardware program — deliberately.

See `docs/DEVELOPER_BRIEF_v5.md` for the end-to-end buildable spec.
