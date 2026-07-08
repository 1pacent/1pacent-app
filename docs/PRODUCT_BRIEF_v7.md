# 1Pacent — Product Brief v7: Hermes as the AI Layer

*Delta on `PRODUCT_DESIGN_v6.md` — the Talk/See/Do engagement model, the three-layer architecture, and every invariant stand. v7 names the components of Layer 2 and makes the AI layer itself an owned, controlled asset instead of a vendor API call.*

## 1. What changes: Layer 2 gets an operating system

v6 defined Layer 2 as "Sally, persona-scoped, tool-calling." v7 specifies *what runs her*:

```
Layer 2 — THE AI, decomposed
┌─────────────────────────────────────────────────────────────────┐
│  HERMES — the agent runtime (owned, self-hosted)                │
│  · All LLM model access flows through Hermes: one place to      │
│    swap models, cap spend, log every token, A/B reasoning.      │
│  · Named agents (sally) with versioned SKILLS — Quintino's      │
│    "operating experience → versioned capability library" idea   │
│    from the archive becomes Hermes skill management.            │
│  · MCP servers: 1Pacent's graph-scoped tools are exposed to     │
│    Hermes as an MCP toolset — Hermes agents can grow new        │
│    capabilities without app redeploys, but every tool still     │
│    executes inside the 1Pacent API tier (the security boundary  │
│    does not move).                                              │
├─────────────────────────────────────────────────────────────────┤
│  HONCHO — the memory substrate                                  │
│  · Per-person theory-of-mind memory (preferences, tone, context │
│    across sessions) lives in Honcho: peers = contacts,          │
│    sessions = sally_conversations.                              │
│  · HARD RULE: Honcho never stores or answers facts about money, │
│    dates, assets, or compliance. The database is the source of  │
│    truth; Honcho makes Sally feel like she knows you.           │
├─────────────────────────────────────────────────────────────────┤
│  QDRANT — the vector store (example: semantic knowledge)        │
│  · Sally's memory-chunk retrieval and, later, the Authority-    │
│    Documents corpus (archive CORE-020..027) — the Sparky        │
│    grounding — live in Qdrant collections per org.              │
└─────────────────────────────────────────────────────────────────┘
```

**Why this matters commercially:** the AI layer stops being a per-call vendor dependency and becomes owned infrastructure with three compounding properties — *skills improve centrally* (a better quoting skill ships to every tenant org at once), *model access is a dial not a rewrite* (Hermes routes to whatever model wins this quarter), and *the memory asset accrues* (Honcho's per-person models deepen the "she knows me" moat that pgvector-similarity alone can't reach — the honest gap `SALLY_MEMORY.md` already documented).

## 2. What does not change

- **DB records are the source of truth. Always.** Sally's factual answers come from graph-scoped tools over Postgres; Honcho and Qdrant are context and recall, never authority. If Honcho said one thing and the ledger says another, the ledger wins silently.
- **AI proposes → cards decide → core executes.** Hermes never mutates state; its tools are read-scoped except the deliberately scarce set (raise ticket, draft), and all approvals/payments/dispatch stay card actions with human actors in the event log.
- **The degraded-mode ladder** gains a rung and gets stronger: Hermes down → direct model fallback keeps Sally alive; all AI down → canvas + workspace unaffected. Honcho down → Sally is politely generic, never wrong. Qdrant down → pgvector serves recall. Every dependency is an enhancer, none is a single point of failure.

## 3. Rollout honesty (what the first build ships)

The adapter seams ship **live and tested** with environment-switched providers: `HERMES_URL` set → all reasoning routes through Hermes (OpenAI-compatible endpoint preferred, `/agents/sally/invoke` supported); unset → direct OpenRouter, identical behaviour. Same pattern for `HONCHO_*` and `QDRANT_URL`. This is not a mock — it is the same architecture the degraded-mode ladder demands, and it means the demo runs today and flips to the owned stack the moment those services are exposed with credentials. See `DEVELOPER_BRIEF_v7.md`.
