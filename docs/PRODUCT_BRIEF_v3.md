# 1Pacent — Product Brief v3.0 (ground-up rebuild)

**Prepared:** 2026-07-08
**Status:** Supersedes `DEVELOPER_BRIEF_v2` and the vault's `Developer Brief - Fable 5 - Sally MVP.md` — this brief reconciles both product framings (rental-compliance marketplace and tradie-first AI receptionist) into one platform, informed by a full audit of the previous build's actual working logic vs. its unbuilt scaffolding.

---

## 0. What changed and why this brief exists

Two prior directions were explored for this product, in parallel, without ever being reconciled:

- **Frame A** (`DEVELOPER_BRIEF_v2`, currently built): a rental-compliance app — landlord/agency accounts, tenant intake, one-tap approval. Treats the tradie as a downstream fulfilment detail.
- **Frame B** (vault `Developer Brief - Fable 5 - Sally MVP.md`): a single electrician's own AI receptionist — Sally answers *their* missed calls, drafts *their* quotes, no landlord, no marketplace.

The actual demand, restated by the person who owns this decision: **both, unified.** A renter or owner raises an issue and talks to Sally. Sally's conversation must, by the end of the call, answer the three things every home-services customer actually wants to know — *when can someone come, what will it cost, can I trust them* — the same three questions Uber answered for taxis. That job then needs **3 real quotes** from tradies, each auto-populated from the tradie's own configured rate card (not invented by AI), ranked by trust/cost/availability, so the landlord can approve one in seconds. The property manager, where one exists, is **informed of the decision, not required to make it** — triage is automated away. And the tradie who does the job isn't just a fulfilment resource: they get their **own AI-driven business assistant** — the same Sally-class technology, pointed at their own phone number, their own customers, their own invoicing — so joining the platform is valuable to them even before a single marketplace lead arrives.

This brief also draws on a forensic read of the **previous build's 131 individual n8n workflows** (`docs/tradie-import/`) — not its architecture diagrams, its actual Code node logic. That read found something important: **the real moat components were already partially built and validated**, just never assembled into one coherent product. Specifically real and worth keeping the *shape* of:

- A genuine percentile-based, evidence-tiered pricing engine (3+ comparable jobs → 25th/75th percentile band; fewer → looser band; none → category fallback), with a confidence score blending evidence count and historical accuracy.
- A genuine weighted quote-ranking formula for presenting exactly 3 options: **trust 40% + cost 35% + availability 25%**.
- A genuine scheduling-optimisation formula weighting travel time, tradie accuracy/on-time history, and urgency.
- A genuine hard approval gate on any price/scope change ("no work proceeds until accepted").
- A genuine, real jurisdiction-sourced compliance catalogue and legislation-staleness monitor.

And equally important, what was **never actually built**, despite being named and diagrammed extensively: the entire "Trust Passport" concept (two workflows, both empty scaffolding), any real payment provider integration, any live social-media publishing, most "core shared services," invoicing, and BAS prep. Knowing precisely which parts are proven logic worth porting and which are aspirational branding that needs building from scratch, for real this time, is what makes this brief different from a re-statement of the original vision.

---

## 1. The opportunity

### 1.1 Market

~160,000–170,000 licensed electricians in Australia; the addressable segment is solo operators through ~15-person crews — heavy admin burden, minimal tech adoption, prime for an AI-first wedge. On the property side: every rental property in Victoria (and soon NSW/QLD) has statutory compliance obligations (smoke alarms, gas, electrical safety, minimum standards) that create recurring, budgeted, must-do maintenance work — a wedge with built-in urgency (compliance anxiety) that a pure consumer marketplace doesn't have.

### 1.2 Competitive landscape

| Competitor | What they are | Gap |
|---|---|---|
| Jobber, ServiceTitan, SimPRO, Buildxact | Tradie field-service management (jobs/quotes/invoices/scheduling) | No AI-first intake, no compliance-driven demand generation, no consumer-facing trust/quote marketplace — they manage a tradie's existing pipeline, they don't create new matched demand |
| Airtasker, Hipages, Oneflare | Lead-gen marketplaces for consumers | No compliance layer, no property-manager workflow, thin trust signal (reviews only, no verified licence/insurance/quote-accuracy scoring), tradie pays per-lead regardless of fit |
| PropertyMe, Property Tree, console | Property management software | No AI intake, no tradie marketplace, maintenance is a bolt-on ticketing feature, not a compliance-driven engine |
| Tapi | Rental maintenance/compliance point solution | Closest analogue on the property side, but no tradie-facing AI business tooling — one-sided |

**The gap no one is covering:** a single platform where the *same* AI-driven trust and pricing intelligence serves the renter/owner asking "who do I call," the landlord asking "which of 3 quotes do I approve," and the tradie asking "who's going to run my business admin while I'm on a roof." Everyone else picks one side of this triangle. The moat is that all three sides feed the same accumulating dataset — every completed job makes the pricing engine and trust scores better for the *next* job, on *both* the marketplace side and the tradie's own business side.

### 1.3 Why AI-driven, why now

Voice AI (ElevenLabs-class conversational agents) and cheap, fast LLM reasoning (via OpenRouter-class routing) have only recently become good enough and cheap enough to run a real-time, trustworthy intake conversation and a real-time pricing-confidence calculation inside the same phone call. That's the unlock: this wasn't buildable at acceptable cost or quality three years ago. First-mover advantage on "AI employee as a priced product, not a chatbot bolt-on" is real but time-limited — Jobber/ServiceTitan could replicate the pricing model once someone proves it works.

---

## 2. The three personas and their pain points

### 2.1 Renter or owner-occupier ("the customer")

| Pain | Old-world reality | 1Pacent answer |
|---|---|---|
| "I don't know who to trust" | Google search, hope | Every tradie shown has a verified licence/insurance status and a real, job-earned trust score — not a self-reported star rating |
| "Will they actually show up, and when?" | Radio silence until the day-of | Sally gives an ETA *band* on the call itself, a confirmed window within minutes of a tradie accepting |
| "I don't know what this should cost" | Call three tradies, wait days, compare apples to oranges | Sally gives a live price *band* during the call, backed by real comparable-job data, before any tradie is even contacted |
| "I don't know how to explain the problem" | Fumble through a phone call with a stranger | Sally asks one clear question at a time, conversationally, and never asks the customer to self-diagnose |
| "I don't want to call around" | Multiple calls, multiple explanations | One conversation, with Sally, once |
| "What actually happened after the job?" | Nothing, unless you ask | Evidence pack (before/after photos, notes) attached to the closed job, visible any time |

### 2.2 Tradie

| Pain | Old-world reality | 1Pacent answer |
|---|---|---|
| "I miss calls while I'm up a ladder" | Voicemail, lost jobs | Their own Sally-class AI answers in their business's name, captures and qualifies the lead, 24/7 |
| "Quoting takes forever" | Manual pricing from memory or a spreadsheet | Rate card configured once; every quote request auto-drafts from it, comparable-job pricing shows them if they're under/over market |
| "I don't get paid fast enough" | Chase invoices manually | Automated payment requests, status tracking, follow-up reminders (fintech layer, phased) |
| "Marketplace leads waste my time" | Race-to-the-bottom lead-gen platforms, pay per lead regardless of fit | 1Pacent leads are pre-qualified by Sally before a tradie ever sees them, and matched by trust/skill fit, not first-click |
| "Building my own trust score from scratch on every platform" | Reviews live on Google, on Hipages, nowhere unified | One portable trust profile, driven by real job outcomes (on-time rate, quote accuracy, completion rate) not just star ratings |

### 2.3 Property manager / landlord

| Pain | Old-world reality | 1Pacent answer |
|---|---|---|
| "Is this property compliant?" | Spreadsheet, memory, or nothing, until an inspector or a tribunal finds out | Traffic-light compliance dashboard, always current, sourced from real jurisdiction legislation |
| "I need to approve a quote fast, especially if it's urgent" | Phone tag between tenant, PM, landlord, tradie | One link, 3 ranked quotes, one tap |
| "Is this maintenance spend reasonable?" | No baseline to compare against | Every quote is benchmarked against real comparable-job pricing before it's even shown |
| "My property manager doesn't need to triage every single request" | PM manually routes every maintenance call | The system auto-triages (urgency, compliance category, dollar threshold) and routes straight to landlord approval when appropriate — **the PM is informed of the decision, not a mandatory checkpoint** |
| "Annual compliance work sneaks up on me" | Reactive, not proactive | Compliance-driven maintenance calendar surfaces due/overdue items and can bundle them into one scheduled visit |

---

## 3. The hero experience: the call that answers everything

> A tenant's hot water dies at 7pm. They open the property's `/r/<token>` link (or scan a fridge-magnet QR code) and start talking to Sally — text or voice, ElevenLabs-quality, natural. Sally asks what's wrong, how urgent it feels, when someone could get access. Within the same conversation, **before Sally even says goodbye**, she tells the tenant: *"This sounds like an urgent hot-water failure, which is fast-tracked under Victorian rental law. Typical cost for this job in your area is $180–$340. I'm getting you 3 quotes from verified, insured electricians now — expect the first response within about 40 minutes."* The tenant didn't have to call anyone. The landlord's phone buzzes minutes later with three ranked, real quotes — trust score, price, and earliest slot for each — and approves one with a single tap. The tradie who wins gets the job in their own app, invoices from the same platform, and the whole loop closes with an evidence pack and a trust-score update, all without a property manager ever being asked to make a decision.

This is the product. Every other feature exists to make this loop faster, cheaper, and more trustworthy over time. The three questions Sally must answer *live, on the call* are the design constraint for everything below:

### 3.1 "When can someone come?" — live ETA

Sally cannot literally check three tradies' calendars mid-sentence without an unacceptable pause, so the answer is **tiered, honestly**:
1. **Immediate (on the call):** a *typical response window*, computed from real historical data for this trade + category + urgency + suburb (the same shape as the old system's availability scoring) — e.g. "electricians in Fitzroy typically respond to urgent faults within an hour."
2. **Within minutes (async, post-call):** once the 3-quote dispatch fires and a tradie responds with a real slot, the tenant/landlord get a **confirmed** window, not an estimate.
3. **On acceptance:** the slot is locked and calendared automatically the moment the landlord approves a quote — no back-and-forth.

### 3.2 "How much will it cost?" — live price band

A two-tier pricing engine, carried forward from the one part of the old system that was genuinely well-built:
- **Tier 1 (instant, on the call):** a percentile-based estimate from comparable completed jobs (same trade, similar category/description, adjustable by evidence count — 3+ comparables gets a tight 25th–75th percentile band; fewer gets a looser band; zero gets a documented category fallback). This is **not an LLM guess** — it's a deterministic query over real job history, the same design as the old `Nelly` pricing tool, and it is the number Sally is allowed to say out loud.
- **Tier 2 (within the hour, real):** each tradie who's invited to quote has their **own configured rate card** (call-out fee, hourly rate, standard job pricing) auto-populate a draft quote; they confirm or adjust before it's sent. This is the binding number, never the AI's.
- **Tier 3 (after the job):** the actual invoiced amount is compared against the confirmed quote, feeding both that tradie's trust score and the comparable-job dataset every future estimate draws from — the moat compounds with every job, automatically, with no manual retraining step required.

### 3.3 "Can I trust them?" — live and per-tradie trust signal

Two layers, because "trust" needs an answer even before specific tradies are chosen:
- **Platform floor (instant, on the call):** every tradie on the platform is licence- and insurance-verified before they can quote at all — Sally can say that unconditionally, for any trade, on every call.
- **Per-tradie score (once quotes come in):** a real, computed trust score — not the old system's unbuilt "Passport" concept, and not a naive single-review average (the old system's one *working* trust formula would let a single 5-star rating instantly max out a score, with no minimum-sample gating and no decay). The new formula must weight: **quote accuracy** (variance between quoted and actual cost, this platform's own data — already implemented in the current build's `computeQuoteAccuracy`/`classifyTrust`), **on-time/completion rate**, **verified licence/insurance currency**, and **review sentiment**, gated by a minimum job count before a tier is shown ("Unproven" until proven), with negative feedback triggering review rather than silently averaging away.

---

## 4. Product pillars

1. **Certainty** — a price band, an ETA band, and a confirmed slot, always visible, never "we'll call you back."
2. **Trust** — verified credentials as the floor, computed quote-accuracy and reliability as the ceiling; portable across every job the tradie does on the platform, not siloed per listing.
3. **Speed** — one conversation, three quotes within the hour, one-tap approval, auto-calendaring on acceptance.
4. **Automated triage** — urgency and dollar-threshold rules (configurable per landlord/agency, same shape as the old system's approval-rules engine) decide who needs to approve what; a property manager is looped in as an *observer* of the decision by default, not a mandatory gate, unless a rule says otherwise.
5. **Compounding intelligence, not static pricing** — every completed job sharpens the next estimate and the next trust score. This is the actual, defensible moat: not "we use AI," but the accumulated, trade-specific, outcome-verified dataset a competitor can't buy or copy on day one.
6. **A real business tool for tradies, not just a lead pipe** — the tradie-side AI assistant is valuable standalone (answers their existing customers' calls, drafts quotes from their own rates, chases their own invoices) so the platform earns its subscription even in a slow marketplace week.

---

## 5. Persona-by-persona product design

### 5.1 Renter / owner-occupier flow

1. Enter via a tokenised link or QR code — **no account, ever**, matching the "zero friction" principle validated in both prior briefs.
2. Talk to Sally (text, with ElevenLabs voice reply; a full voice-in call-answering product is the Phase 2 telephony extension — see §9).
3. Sally never gives repair/safety advice and never invents a firm price; she proposes, and deterministic rules (urgency classification, auto-approve thresholds) decide, exactly as already built in `packages/core`.
4. Sally states the price band and ETA band before ending the conversation (§3).
5. Tenant gets a status link (matches the old system's `/customer/job-status`-style timeline: booking received → quote(s) ready → approved → scheduled → complete → evidence available) — but **authenticated by a signed token**, not a bare guessable reference (a real security gap found in the old build, to be fixed by construction here, not bolted on later).

### 5.2 Landlord / owner (or self-managing owner, same flow) approval

1. Receives exactly **3 ranked quote options** (configurable 1–5, default 3 — matching the validated old design) on a single link.
2. Each option shows: tradie name, trust tier, price, earliest available slot, and a **composite ranking score** — carrying forward the validated formula `trust×0.40 + cost×0.35 + availability×0.25`, tunable per org later but sane by default.
3. One tap approves. That action, atomically: locks the calendar slot, notifies the winning tradie, notifies the two who weren't picked (with a respectful "not this time" message, not silence), and updates the property's maintenance-spend tracking against budget.
4. Landlord dashboard shows compliance traffic-lights (already built) *and* a maintenance-spend-vs-budget view, so "is this expense reasonable" has a running answer, not just a one-off band.

### 5.3 Property manager

1. Manages a **portfolio**, not a single property — sees every managed property's compliance status and open requests in one roll-up.
2. **Does not have to triage every request.** Auto-approval and auto-dispatch rules (urgent-repair statutory bypass, dollar threshold per property/landlord) fire the same way they do for a self-managing landlord; the PM is copied on the outcome, not queued as an approval step, unless the landlord/agency has explicitly configured PM sign-off for a category (e.g. above a higher dollar threshold, or non-urgent discretionary work).
3. Bulk actions: bundle multiple due compliance items at one property into a single scheduled visit (the old system's schedule-forecast/bundling logic, real and worth keeping, though its "route optimisation" was a crude suburb-string heuristic, not real mapping — build the real version, see Developer Brief).
4. Monthly/quarterly owner-report export — this is the artifact a PM hands to the landlord to justify the platform's value, and it should be one click.

### 5.4 Tradie — the AI-driven business assistant

This is the reconciliation of the two original product frames, and it is a first-class product surface, not an afterthought:

1. **Onboarding**: configure a rate card once — call-out fee, hourly rate, standard prices for common job types by category. This rate card is what auto-populates every quote draft, both from the 1Pacent marketplace *and* from the tradie's own direct customers.
2. **Their own AI receptionist**: the same Sally-class conversational agent, configured with the tradie's business name, answers calls the tradie misses — for *all* their business, not just platform-sourced leads. This is the "wow" moment from the vault's Sally MVP brief (a live test call showing a lead materialise in seconds) and it should be preserved as the onboarding centerpiece.
3. **Marketplace leads**: pre-qualified (Sally already captured urgency/category/description before the tradie ever sees it), matched by skill and current trust tier, not first-click — a tradie isn't paying for a cold, unqualified lead the way they would on a generic marketplace.
4. **Quoting**: rate-card auto-draft, tradie confirms or adjusts, submits. The platform shows the tradie how their number compares to the comparable-job price band (transparency cuts both ways — helps a tradie avoid under-quoting as much as it protects the customer from over-quoting).
5. **Job execution**: accept → schedule → on-the-way status → evidence capture (before/after photos, notes) → complete. Materials/parts logged against the job (feeds cost accuracy, not just a stock ledger — the old system only ever decremented inventory after the fact with no pre-job stock check; that's an acceptable v1 limitation, not a gap to fix urgently).
6. **Invoicing & payment**: invoice generated from confirmed quote + logged variations + materials; payment request sent; status tracked. A real payment provider (Stripe Connect, matching the Monetisation strategy's fintech phase) — the old system never actually wired one, this brief treats it as Phase 3, not Phase 1.
7. **Trust building**: every completed job's quote-vs-actual accuracy and on-time performance feeds the tradie's own portable trust score — visible to them, so it's legible *why* their score moves, not a black box.
8. **The moat, from the tradie's side**: the more jobs a tradie completes on the platform, the more accurately the platform can auto-populate their quotes and the higher their marketplace ranking climbs — switching cost compounds with usage, exactly the dynamic the old system's own internal notes correctly identified as "the moat" but never fully closed the loop on (the learning-loop *data capture* was real; the *pricing update* was implicit/lazy, at query time, not a broken promise — keep that design, it's simpler and works).

---

## 6. Trust & pricing accuracy — the system design, precisely

This is the part worth getting right in detail, because it's the actual moat.

### 6.1 Pricing intelligence

- **Inputs per job:** trade type, category, free-text description, suburb, urgency.
- **Comparable-job matching:** same trade + category, weighted similarity on description/suburb (keyword/embedding similarity, not exact match).
- **Evidence-tiered banding:**
  - ≥3 comparable completed jobs → tight band from the 25th/75th percentile of actual invoiced amounts.
  - 1–2 comparables → looser band around the median.
  - 0 comparables → a documented, trade-specific starting fallback band (not invented per-call by an LLM).
- **Confidence score:** blends evidence count and the historical quote-accuracy of the comparable pool — shown to the customer as low/medium/high, never hidden.
- **Never the ceiling:** the AI-proposed band is always superseded by the tradie's own confirmed quote once one exists. The platform explicitly never lets an LLM set a binding price — this was a real, enforced guardrail in the old system's Nelly agent and stays non-negotiable here.

### 6.2 Trust scoring

- **Floor (binary, gate to participate):** licence current, insurance current, ABN verified. No trust score exists below this floor — a tradie either meets it or can't quote.
- **Computed score (continuous, earned):**
  - Quote accuracy: `100 − |percent variance|` between confirmed quote and final invoice, averaged across completed jobs (already implemented in this codebase's `computeQuoteAccuracy`).
  - On-time rate: scheduled vs. actual arrival.
  - Completion rate: accepted jobs actually finished vs. abandoned/disputed.
  - Review sentiment: real customer feedback, gated against the same anti-gaming rules as below.
- **Anti-gaming rules, explicit** (the old system's one working formula had none of these — fix by construction):
  - Minimum job count before a tier displays publicly ("Unproven" tier below that threshold — already implemented in this codebase's `classifyTrust`).
  - Time-decay or rolling-window weighting so a tradie can't coast on old performance.
  - No single job/review can swing a tier on its own.
- **Portability:** one trust profile per tradie, visible across every job on the platform, not re-computed per listing.

### 6.3 Job-outcome learning loop

Every completed job writes: quoted amount, actual invoiced amount, scheduled time, actual time, materials used and cost. This is the same table shape the old system got right (`quote_accuracy_metrics`/`job_actuals`, real and working in the old build). The loop closes automatically and lazily: the *next* pricing-band query simply includes the new comparable, and the *next* trust-score computation simply includes the new outcome. No explicit "retrain the model" step is needed or wanted — this keeps the system auditable and debuggable, unlike an opaque ML pipeline.

---

## 7. Wedge and expansion

1. **Phase 1 wedge — VIC rental electrical.** Compliance-driven (statutory urgency categories create built-in demand and urgency), safety-critical (trust matters most where risk is highest), and the existing compliance catalogue is already built and jurisdiction-sourced.
2. **Phase 2 — VIC plumbing + general maintenance**, same platform, new trade category and rate-card templates; the pricing/trust engines are trade-agnostic by design.
3. **Phase 3 — NSW/QLD rulesets**, reusing the compliance-catalogue pattern (already proven extensible; new jurisdictions are data, not code).
4. **Phase 4 — owner-occupier home services**, beyond rentals: once the tradie-side tooling and trust dataset are mature, the same Sally-intake-to-3-quotes loop works for any homeowner, not just landlords — this is the natural widening from "rental compliance tool" to "the AI operating layer for home services," matching the "Uber moment" thesis's full ambition without needing to build it all in Phase 1.

---

## 8. Business model

Two revenue sides, feeding one dataset — property-side subscriptions fund the compliance/marketplace engine; tradie-side subscriptions fund the AI-employee product; a transaction layer monetises the money flow once both sides are liquid.

| Side | Model | Notes |
|---|---|---|
| Landlord (self-managed) | Freemium — compliance radar free, maintenance dispatch + evidence vault + Compliance Pack export paid per property/month | Free tier drives compliance-anxiety-led signups; upgrade moment is the first real maintenance event |
| Agency / property manager | Per-door SaaS, tiered by AI-triage depth | Portfolio compliance roll-up is the sales demo; PM-informed-not-triaging model is the pitch |
| Tradie | "AI Employee" subscription — their own Sally-class receptionist priced like a part-time hire, not a SaaS line item | Validated pricing thesis: no incumbent (Jobber/ServiceTitan) prices AI this way yet |
| Transaction (Phase 3+) | Payment processing take-rate, tradie fast-pay factoring, compliance-service referral margin | Only monetise once both sides transact meaningfully on-platform — do not build this before it's earned |

---

## 9. Explicit non-goals for the next build phase

Carried forward as deliberate scope cuts, informed by what the old system either never finished or over-built for no realised benefit:

- **No live phone-call telephony (Twilio) yet.** Text-first Sally with voice *replies* (already built) proves the conversational/pricing/trust loop without the added complexity of call-forwarding, PSTN, and live-call latency. Voice call-answering is a real Phase 2 feature, not a Phase 1 requirement.
- **No real payment provider integration yet.** The old system never wired one either — don't let "add Stripe" block the marketplace loop from shipping.
- **No message-template "variant" system, no agent-catalog registry with programmatic handoff routing.** Both were built in the old system and never actually used — simple DB-stored templates and a small, fixed set of named agents are enough until real need proves otherwise.
- **No AI Trust Passport as a bespoke concept.** The old system named this extensively and built none of it. Build one real, formulaic trust score (§6.2) instead of a grand unbuilt "passport."
- **No live social-media publishing for tradie reputation.** Draft-and-email-for-approval (the old system's actual behaviour) is a fine v1; a real Meta/Instagram publish integration is not urgent.
- **No BAS/tax lodgement.** Invoice-ready records and an accountant-handover export are the ceiling; nothing here ever lodges anything with the ATO.

---

## 10. Success metrics — north star

**Properties/tradies with a live, trusted quote loop closed end-to-end** (Sally intake → 3 real quotes → approval → completed job → accuracy feedback written) is the single metric that proves the whole thesis is working, on both sides of the marketplace simultaneously. Everything else — compliance-ledger properties, tradie AI-employee subscriptions, ARR — is downstream of that loop actually closing, repeatedly, without a human having to intervene in the middle of it.
