# 1Pacent — Product Design v6: The Ledger, the Conversation, and the Canvas

*Supersedes the framing of v5 without discarding its content. v5's Crew Room ships as designed — but as one surface of this, not the product. This document is the detailed product design; `docs/DEVELOPER_BRIEF_v6.md` is its buildable companion.*

---

## 1. The strategic inversion

Every brief so far treated AI as the product and data as the byproduct. That's backwards, and the correction changes what gets built first and what gets sold:

```
Layer 0 — THE LEDGER (the moat, the asset, the eventual company)
          Append-only events · quotes vs actuals · asset registry with ages
          · warranty terms · compliance certificates · Job Specs · trust history
          — per property, per asset, per tradie, forever.

Layer 1 — THE PROCESS SPINE (reliability, traceability, audit)
          The API tier + packages/core state machine (every transition validated,
          actor-guarded, logged) and n8n as the durable side-effect worker:
          notifications, scheduled monitors, report jobs. Deterministic. No LLM.
          Works when the AI is down.

Layer 2 — THE AI (the automation & interface layer)
          Sally as the single conversational front door for every persona;
          the crew as legible attribution; answers scoped by the knowledge graph.
          Proposes, narrates, never decides.
```

**The invariant that makes the whole design trustworthy: AI proposes → cards decide → core executes.** No approval, payment, or dispatch is ever performed by a model. Sally surfaces a card; a human taps it; `packages/core` validates the transition. This is already how the codebase works (the v2 audit made it law); v6 elevates it from an engineering rule to the product's visible personality.

### 1.1 What Layer 0 is worth — the data products

The ledger generates four sellable artifacts, none of which any account-centric competitor can produce because none of them retain data past a relationship change:

| Data product | Buyer | What it is | Honesty constraints |
|---|---|---|---|
| **Property Data Pack** | Investor / landlord / buyer at sale | Asset register with verified ages & install dates, full maintenance history with costs, open warranty ledger, compliance certificates, cost-vs-network-median comparison, depreciation-ready asset data | Depreciation figures are **planning estimates from a curated effective-life table** — an ATO-defensible capital-works schedule requires a registered quantity surveyor. The pack is the verified data feed that makes the QS/accountant's job trivial (and a QS partnership is itself a channel). Never call it a tax schedule. |
| **Cost Index** | Insurers, lenders, proptech, and Nelly herself | Estimate-vs-actual truth per category × region: what "replace a hot water system in 3065" *actually* costs, from invoices, not quotes | Aggregates only, k-anonymised; a licensing product, never raw rows |
| **Insurer feed** | Insurers | (a) anonymised aggregate risk data (asset age vs incident curves); (b) **opt-in per-property** "verified maintained" attestation for premium discounts | Per-property data leaves the platform only on explicit owner opt-in; the discount is the owner's incentive to opt in |
| **Compliance Evidence Pack** | PM / landlord facing audit or dispute | Every statutory check, when, by whom, with certificate evidence, exportable | Already the v1 vision; now generated from the ledger rather than assembled by hand |

Every persona's daily engagement (Layers 1–2) exists to *feed Layer 0 as a byproduct of solving their problem*. That's the flywheel, stated plainly.

---

## 2. The engagement model: Talk / See / Do

One app shell, three surfaces, every persona:

```
┌────────────────────────────┬─────────────────────────────────────┐
│  TALK (left panel)         │  SEE + ACT (right panel — Canvas)   │
│                            │                                     │
│  Sally — one agent,        │  A live stream of typed CARDS:      │
│  persona-scoped by the     │  · tickets & their live status      │
│  knowledge graph.          │  · things needing YOUR decision     │
│  Episodes ("water leak")   │    (approve / confirm slot /        │
│  AND free-flow questions   │     confirm fixed / send batch)     │
│  ("what's due next         │  · reports & packs Sally generates  │
│   quarter?")               │  · crew activity (v5 feed)          │
│                            │  Actions live HERE, not in chat.    │
├────────────────────────────┴─────────────────────────────────────┤
│  DO (Workspace — beneath / behind)                                │
│  The full manual UI: dashboard, property pages, portals, forms.   │
│  Every card deep-links into it. 100% functional with the AI off.  │
└───────────────────────────────────────────────────────────────────┘
```

On mobile, Talk and Canvas become two tabs of the same session. The Workspace is always reachable from any card ("open in workspace").

### 2.1 Why actions live on the canvas, not in the chat

Three reasons, each load-bearing:

1. **Audit integrity.** The v2 finding that killed the old system was approver identity arriving from a message body / an LLM field (`$fromAI('approved_by',…)`). If Sally could execute "yes approve it," we'd have rebuilt that hole with better UX. A card tap is an authenticated, token-scoped, deterministic action — the event log records a human, never a model.
2. **Legibility.** A decision rendered as a card with its evidence (ranked quotes, trust scores, the working) is inspectable in a way a chat bubble never is. The card *is* the explanation.
3. **Degradation.** Cards are computed from database state, not from the conversation. The LLM being down removes the left panel's convenience — it cannot remove a single capability.

### 2.2 The degraded-mode ladder (a feature, not a fallback)

| Mode | Talk | Canvas | Workspace |
|---|---|---|---|
| Full | ✅ | ✅ live | ✅ |
| LLM down / slow | Honest banner: *"Sally's offline — everything below still works."* | ✅ unchanged (cards are deterministic projections of DB state) | ✅ unchanged |
| No app at all | — | — | Token links by email (existing `/a`, `/q` flows) still transact |

This ladder is only cheap because the architecture already works this way. Sell it: *"our AI can be down and your maintenance still runs"* is a sentence no AI-first competitor can say.

---

## 3. Graph-scoped conversation — the mechanism

Every session begins from a tokenised link (or the internal dashboard). The token's scope is a **position in the knowledge graph**, and that position assembles three things *before the model sees a word*:

1. **Identity & audience** — tenant of tenancy T at property P / owner of properties P1…Pn / manager of portfolio M1…M41 / tradie business B. Sally's greeting, vocabulary, and guardrails come from this (the existing `SallyOperatingContext` union, extended from 2 modes to 5).
2. **Retrieval scope** — which slice of the graph her tools may read. **Enforced in the data layer, not the prompt**: every tool is a thin wrapper over a `DataSource` method that filters by the token's relationships. Prompt scoping is a courtesy; data scoping is the security boundary. A renter's Sally *cannot* read landlord spending because the query can't, not because the prompt says don't.
3. **Toolset** — the persona's verbs (catalogue in §4). Mutating tools are deliberately scarce: raise a ticket (renter), save a quote draft (tradie), preview a batch (PM). Approvals, payments, dispatch, slot confirmation are **not tools** — they are card actions.

**Answer discipline:** free-flow questions are never answered from model memory. Sally classifies the turn (episode vs enquiry), calls a scoped tool, gets rows back, and *narrates the result* — while the same result lands on the canvas as a card carrying the underlying data. If the tools return nothing, she says so. Structured facts come from SQL through scoped tools; the pgvector memory remains what it is today — conversational context ("you prefer morning access"), never a source of facts about money, dates, or compliance.

---

## 4. The experience, per persona — both panels, in detail

### 4.1 Renter (tenancy-scoped)

**Episode:** *"I have a water leak under the kitchen sink."*
- **Left:** Sally scopes it (3–4 turns, photos in phase 2). Mid-conversation the crew answers the three questions live: Leo's warranty check first (*"covered by March's repair — John's coming back, free, no approval needed"*), else Nelly's evidenced band + real response ETA. Urgent categories: statutory fast-track, said out loud.
- **Right, as it happens:** a **Ticket card** appears (state: quote round), then updates itself: → *3 quotes in* → *approved (under your landlord's standing instruction)* → **Slot card**: "George proposes Thu 2–4 pm — suits?" (accept / suggest another) → *John's on the way Thursday* → **Confirm-fixed card** after completion (one tap; this is the `verify` transition).

**Free-flow, weeks later:** *"is the smoke alarm here actually compliant?"* → compliance tool (scoped to her property) → **Compliance card**: green, last checked 12 Mar, next due Mar next year, certificate attached. *"what happened with my leak?"* → Ticket card resurfaces with history. She can ask anything about *her tenancy and her property's tenant-relevant state* — and structurally nothing else.

### 4.2 Landlord / owner-occupier (ownership-scoped) — *new dedicated portal*

Today landlords use the open dashboard; v6 gives them their own tokenised seat (`/o/[token]`) because graph-scoping requires a graph position.

**Free-flow:** *"what have I spent on Rose St this year?"* → **Spending card**: by category, vs network median from the Cost Index (*"your plumbing spend is 12% under the 3065 median"*). *"anything I should plan for?"* → **Asset horizon card**: HWS at year 9 of 10–12, planned replacement ≈ 40% under emergency pricing, one button: *"get planned quotes in September"*. *"get me the data pack for my accountant"* → **Property Data Pack card**: generated, downloadable, honest framing (§1.1).

**Decisions arrive as cards whether or not he's chatting:** the **Approval card** (recommended option on top with the ranking's working, other quotes beneath, one tap) and the **Warranty-catch card** (*"no decision needed — saved ~$290"*, running total on the passport). Standing instructions are edited on a card (the v4 policy engine); Sally can *walk him through* setting them but the save is a card action.

### 4.3 Property manager (portfolio-scoped)

**Free-flow:** *"what's due across the portfolio next quarter?"* → **Obligations card**: the regulatory calendar (gas 2-yearly, smoke annual, electrical 2-yearly…) computed per property, rolled up, batchables flagged — *"14 gas checks, Fitzroy, 45-day window"* with **Get this batch quoted** on the card. *"which properties are red right now?"* → **Red-list card**, each row deep-linking to the property workspace. *"how did we do vs last quarter?"* → **Quinn's quarterly card**: batched-vs-standalone savings, warranty catches, median cycle time — the PM's own client-retention report, generated.
**Reactive lane:** the portfolio feed with the only line that matters on top: *"38 handled by the crew · 2 with landlords · 1 needs you."*

### 4.4 Tradie (business-scoped) — the paying seat, made whole

- *"what's my day look like?"* → **Day card** (George): jobs in route order, property briefings attached (asset history, prior Job Specs — arrive already knowing the site).
- *"draft the quote for the Rose St job"* → **Quote-draft card** (Nelly): from his rate card + comparables, with her assumptions listed; he edits/sends on the card.
- **Auto-quote (the subscription's teeth):** a tradie can enable *auto-submit my standard quote* per category — when a matching invite lands, Nelly submits from the rate card within his configured bounds, instantly. He wins jobs while on the tools. (Opt-in, bounded, revocable, every auto-submission attributed and visible — this is the "dynamically creates the quote on behalf of the subscribed tradie" loop, closed.)
- *"chase the Smith invoice"* → Penny drafts the respectful follow-up → **Send-approval card** (outbound comms are human-approved — same guardrail class as money).
- *"how accurate was I last month?"* → **Accuracy card**: his estimate-vs-actual trend, what it's doing to his trust score and ranking.

### 4.5 The Workspace, formalised

The Workspace is not new build — it's what already exists (dashboard, property pages, portals, `/a`/`/q` links), promoted to a named design layer with two rules: **(1) every canvas card deep-links to its workspace page; (2) no capability is ever chat-only or card-only.** The workspace is the floor the whole experience stands on when anything above it fails.

---

## 5. n8n's formal role (the process spine, stated)

n8n owns what it's actually good at, all internal-only, header-auth, no public ingress, no reasoning (audit rules stand):

| Job | Cadence | Source |
|---|---|---|
| Notification fan-out (quote invites, win/lose, approvals) | event-driven from API tier | live today |
| **Compliance tickler** — upcoming obligations digest to PM/landlord, 60/30/7 days | scheduled | new |
| **Legislation version monitor** — VIC ruleset change watch → flags catalogue review | monthly | resurrect archive `RENTAL-111/112`, the audit's own recommendation |
| **Penny's follow-up cadence** — overdue invoice chase schedule (drafts to approval cards, never auto-send) | scheduled | new |
| Report generation (data packs, quarterly PM reports) | on-demand jobs | new |

Every n8n execution logs to the events ledger — the traceability the user experience never shows but the audit story depends on.

## 6. What this changes about the roadmap

v5's three concepts survive intact but re-anchor: the **Crew Room feed becomes a card type on the canvas** (not a destination); the **Self-Maintaining Property** is the obligations calendar + asset horizon cards given initiative; the **Exchange** waits for density, unchanged. The build order (developer brief): the shell + canvas + graph-scoped Sally tools first, because every other feature now renders *into* that model.
