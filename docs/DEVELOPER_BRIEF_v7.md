# 1Pacent — Developer Brief v7: Build Talk/See/Do on the Hermes AI layer

Executes `DEVELOPER_BRIEF_v6.md` with the AI layer specified by `PRODUCT_BRIEF_v7.md`. This is the build document for the working, sellable demo. Standing invariants unchanged (deterministic core, events as truth, demo-store parity, no core imports in client components, RLS everywhere).

## 1. The AI gateway (`packages/agents/src/gateway/`)

```ts
export interface AiGateway {
  chat(params: ChatParams): Promise<string>;
  chatWithTools(params: ChatParams & { tools: ToolDefinition[] }): Promise<ToolTurn>;
  // ToolTurn = { reply?: string; toolCalls?: { name; arguments }[] }
}
```

- **`HermesProvider`** — `HERMES_URL` (+ optional `HERMES_API_KEY`). Two wire modes:
  - `HERMES_OPENAI_COMPAT=1` → `POST {url}/v1/chat/completions` with `tools` (OpenAI function-calling shape) — full tool loop through Hermes-managed models.
  - default → `POST {url}/agents/{HERMES_AGENT:-sally}/invoke` (the invoke API n8n already uses); plain chat only, tool turns fall back to the direct provider (logged, honest).
- **`OpenRouterProvider`** — wraps the existing `OpenRouterClient`; gains `chatWithTools` via the standard `tools`/`tool_calls` chat-completions fields.
- **`resolveGateway()`** — Hermes if configured, else OpenRouter; on Hermes transport failure, one retry then fallback with a `console.warn` (degraded-rung behaviour, never a user-facing error).

## 2. Memory & vectors

- **`MemoryBackend`** interface over today's write/retrieve chunk flow. `HonchoBackend` (`HONCHO_API_KEY`, `HONCHO_BASE_URL`, workspace per org, peer per contact, session per conversation): `writeFacts()` → Honcho messages; `recall(query)` → dialectic-style query. Guardrail *in code*: facts tagged `money|date|compliance|asset` are refused at the backend boundary (unit-tested), enforcing "DB is truth".
- **`VectorBackend`**: `QdrantBackend` (`QDRANT_URL`, `QDRANT_API_KEY`; collection `sally_memory_{orgless}`; ensure-collection on first write; cosine, 1536-dim) vs default `PgVectorBackend` (current RPC). Selection by env; retrieval interface unchanged for callers.

## 3. Everything else — as `DEVELOPER_BRIEF_v6.md`, with this build's scope line

**In:** migration 0015; owner seat `/o/[token]` + mint link; Sally modes ×5 with per-mode toolsets (tools: `get_my_requests`, `get_property_compliance`, `get_spending_summary`, `get_asset_horizon`, `get_obligations_calendar`, `get_my_jobs`, `get_my_accuracy`); canvas read model + twin-panel shell on `/r`, `/o`, `/pm`, `/t`; George slot proposal at accept + `confirmSlot`; PM batch dispatch (v5 §3.1); tradie auto-quote (settings + dispatch hook, attributed `nelly:auto-quote`); core modules `depreciation/estimate`, `reports/spending`, `reports/obligations`, `scheduling/slots`; Property Data Pack via `generated_reports`.

**Deferred (next pass, unchanged in v6 spec):** n8n tickler/legislation/penny trio; SSE canvas (15 s refresh ships); `draft_quote` tool; Mia/Sparky; report kinds beyond the data pack.

## 4. Verification (the sellable bar)

Per persona, live against Supabase: renter episode + 2 free-flow tool answers; owner spending/horizon/approval cards + decision tap; PM obligations → batch dispatch → certificates path; tradie day/accuracy + an auto-quote firing within bounds. Then: ledger grep — zero model-attributed mutations; LLM-off run — canvas/workspace fully functional; scope check — renter token cannot elicit owner data (structurally empty tool results). Typecheck, tests, build, deploy, production spot-check.
