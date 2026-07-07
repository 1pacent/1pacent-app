# Sally's memory — design, rationale, and current limitations

Sally's long-term memory is the moat the compliance catalogue can't be on
its own: the catalogue is public legislation, freely copyable by any
competitor. What a competitor *can't* copy on day one is an accumulated,
per-tenant/per-property history of how jobs actually went — recurring
issues, access preferences, and (via `tradie_trust_scores`) which tradies
quote accurately. This document specifies how that memory is stored,
retrieved, written, and what's still a known gap.

## Why pgvector on Supabase, not a standalone vector DB

Qdrant (or a similar dedicated vector engine) was the other option on the
table. pgvector won because:

- **Zero new infrastructure.** The Postgres project is already running,
  already backed up, already RLS-scoped by `org_id`. A second database to
  provision, secure, and keep in sync would be a second thing to get wrong.
- **Embeddings live next to the data they're about.** A `sally_memory_chunks`
  row references `contact_id`/`property_id`/`source_conversation_id` via
  normal foreign keys — joins, cascading deletes, and RLS all work exactly
  like every other table in this schema. A separate vector store would need
  its own consistency story (what happens to a Qdrant point when the
  Postgres contact row is deleted?).
- **This is demo/early-stage scale.** pgvector's `ivfflat`/`hnsw` indexes
  handle the volumes this product will see for a long time. Move to a
  dedicated engine only if/when retrieval latency or index size actually
  becomes a measured problem — not speculatively.

## Schema

Three tables, added in `packages/db/migrations/0003_sally_quotes_and_memory.sql`:

- **`sally_conversations`** — one row per Sally chat session. `status`
  (`active`/`completed`/`abandoned`), links to `contact_id`, `property_id`,
  and (once Sally hands off) `request_id`.
- **`sally_messages`** — the raw transcript, append-style. Audit-only.
  **Never embedded.**
- **`sally_memory_chunks`** — the actual memory. `content` is a curated,
  short (≤400 char) fact/preference/summary — never a transcript dump.
  `embedding vector(1536)`. Scoped by `contact_id` always, and additionally
  by `property_id` when `scope_level='property'` (a fact about the property
  itself — "the hot water system is in the laundry" — outlives any one
  tenancy and should attach to the property, not just the person who
  happened to mention it).

## Why curated facts, not raw transcript embeddings

This is a deliberate PII-minimization choice, not just a cost optimization.
Embedding raw conversation chunks means a similarity search can surface
*anything* the tenant ever said, including incidental PII that has nothing
to do with why the memory was retrieved — a phone number mentioned in
passing, a throwaway comment about being away next week. A curated fact
list ("prefers morning access") is reviewable, deletable, and bounded: you
can look at every row in `sally_memory_chunks` for a contact and know
exactly what the system "remembers" about them, in plain English. Raw
transcript stays in `sally_messages` for audit/dispute-resolution purposes,
governed by ordinary RLS, but is structurally excluded from ever being
vectorized or surfaced back into a prompt.

This is the same "sanitised data to agents" principle the broader platform
design already commits to (`docs/ARCHITECTURE.md`, and the AI Employee
architecture notes in the planning vault) — applied here specifically to
memory rather than to live agent tool calls.

## Write path: end of conversation only

Memory is written once, when a conversation completes (`sally.ts`'s
`tryCompleteConversation` → `writeMemorySafely`), not after every turn.
Reasons:

- **Cost.** Per-turn summarization + embedding would multiply LLM/embedding
  calls by conversation length for no benefit — nothing worth remembering
  is knowable mid-conversation.
- **Signal quality.** A whole-conversation summary can identify what's
  actually durable ("this is the second time they've mentioned the shower
  drain") versus what was just intake noise. A per-turn write can't make
  that judgement.
- **Abandoned chats don't pollute memory.** If a tenant starts typing and
  leaves, nothing gets written. Only conversations that reach
  `completeSallyConversation` (i.e. Sally judged she had enough to hand
  off) produce memory.

The extraction prompt (`packages/agents/src/memory/summarize.ts`) is
explicit: up to 10 facts, durable only (not the one-off fault just
reported — that's already captured by the maintenance request itself), no
raw PII, each a short standalone sentence.

## Read path: retrieval and injection

On each Sally turn (`packages/agents/src/sally/chat.ts` via
`sally.ts`'s `sendSallyMessage`):

1. The tenant's latest message is embedded.
2. `DataSource.retrieveSallyMemory(contactId, queryEmbedding)` runs a
   cosine-similarity query scoped to that contact (Supabase: the
   `match_sally_memory` SQL function, using pgvector's `<=>` operator;
   demo mode: an in-JS cosine-similarity scan over the in-memory array —
   see "Demo-mode parity" below).
3. The top 5 matches are formatted (`formatMemoryContext`, a pure string
   formatter, no I/O) into a bulleted block and appended to Sally's system
   prompt for that turn only — never persisted back into the prompt
   template itself.

Retrieval always fails soft: if the embedding call or the DB query throws,
`sendSallyMessage` logs a warning and continues the conversation without
memory context rather than blocking the turn. A tenant should never see an
error because memory retrieval had a bad moment.

## Deliberate architecture choice: no DB access inside `packages/agents`

`packages/agents` never opens a database connection. It does two kinds of
I/O only: LLM chat completions and embedding calls, both to OpenRouter,
both via the injectable-`fetch` `OpenRouterClient`. The actual pgvector
query and the actual `INSERT INTO sally_memory_chunks` live in
`apps/web/src/lib/supabase-data.ts` — the one place in the codebase that
already owns the Supabase service-role client. This keeps `packages/agents`
consistent with `packages/core`'s "zero I/O, fully mockable" testing ethos
for anything that *can* be pure, while accepting that LLM/embedding calls
inherently can't be. It also means there is exactly one place to audit for
"does this code bypass RLS correctly" — the existing `supabase-data.ts`
scoping discipline (`resolveToken`, explicit `org_id`/`contact_id` filters
on every query) — rather than two.

## Embedding provider: the one assumption that needed a spike

At design time it was unconfirmed whether OpenRouter's `/embeddings`
endpoint (`openai/text-embedding-3-small`, 1536-dim) actually works — it's
primarily a chat-completions proxy. **Spike result: as of this build, the
OpenRouter API key provided returned `401 "User not found"` on every
endpoint, including `/auth/key` and `/chat/completions`, not just
`/embeddings`** — so the embeddings-endpoint question itself is still
unresolved pending a working key. `packages/agents/src/memory/embed.ts` is
built provider-swappable specifically because of this uncertainty:
`createOpenRouterEmbedder(client, model)` is the default;
`createOpenAiCompatibleEmbedder({ apiKey, baseUrl, model })` is a drop-in
fallback (same `EmbedFn` shape) if OpenRouter's embeddings don't pan out
once a live key is available. Swapping providers is a one-line change at
the call site in `apps/web/src/lib/sally.ts`, nothing downstream needs to
change.

**Action needed before memory is verified live:** re-run the embeddings
spike (`POST https://openrouter.ai/api/v1/embeddings`) once a working
`OPENROUTER_API_KEY` is in place, and confirm the 1536-dim assumption
matches whatever model actually gets used — the `vector(1536)` column width
is hard-coded to `text-embedding-3-small`'s dimension and would need a new
migration to change.

## pgvector index choice

The migration creates an `ivfflat` index defensively. `hnsw` (better
recall, no `lists` parameter to tune) needs pgvector ≥0.5.0. Before trusting
index performance at any real scale, run:

```sql
select extversion from pg_extension where extname = 'vector';
```

against the live Supabase project and switch to `hnsw` if the version
supports it. At current (near-zero) row counts this doesn't matter yet —
noted here so it isn't forgotten once it does.

## Demo-mode parity

`apps/web/src/lib/store.ts` (the in-memory `DataSource` used when Supabase
isn't configured) implements the identical `DataSource` memory methods
against plain arrays, including a hand-rolled cosine-similarity function —
so the whole Sally + memory loop is demoable without a live Supabase
project, using whatever embeddings the configured provider returns. Nothing
about the memory *feature* depends on Supabase being live; only the
*persistence* does.

## What's explicitly out of scope for this pass

- **No forgetting/expiry policy.** Memory chunks accumulate indefinitely.
  A real product needs a retention/deletion story (tenant-initiated
  "forget me", automatic decay of stale preferences) before this ships
  beyond a demo.
- **No dedup/consolidation.** If the same fact is extracted twice across
  two conversations, both rows persist. A background job to merge/dedupe
  is future work.
- **No cross-org memory sharing**, even for the same physical tradie
  working across multiple agencies' orgs — memory is strictly `org_id`
  + `contact_id` scoped, matching every other table's isolation model.
- **No mid-conversation timeout → abandonment transition.** A conversation
  stays `active` until it either completes or the process simply stops
  hearing from the client; nothing currently sweeps stale `active` rows to
  `abandoned`.

## Comparison to Honcho, honestly

Honcho's actual architecture centers on per-user, continuously-updated
"theory of mind" representations built from conversation history, with
its own storage layer (Postgres + pgvector in recent versions) and a
dedicated reasoning pass to maintain those representations over time. What's
built here is a much smaller slice of that idea: curated fact extraction
plus similarity retrieval, no continuously-maintained user model, no
dedicated reasoning pass beyond the end-of-conversation summarization call.
It's fair to describe this as "Honcho-*inspired*" (retrieval-augmented,
per-person memory instead of stateless chat) but not as a Honcho-equivalent
system — the theory-of-mind modeling and consolidation logic that makes
Honcho's memory a moat in its own right isn't reproduced here. If memory
depth becomes a competitive priority, that's the gap to close next, not a
switch to a different vector store.
