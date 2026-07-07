-- Sally: conversational intake + real 3-tradie quote marketplace + memory.
--
-- Design notes (see docs/SALLY_MEMORY.md for the full writeup):
--   * `quotes` is a NEW table, not an overload of `work_orders`. work_orders
--     has a 1:1 shape with itself (quote_cents vs invoice_cents on the SAME
--     row is exactly what trust-scoring needs); cramming 3 candidate
--     tradies into work_orders would mean filtering the 2 non-winners back
--     out everywhere. accept_quote (packages/core state machine) fires once
--     on the *request* aggregate regardless of how many competing quotes
--     exist, so there's no FSM reason to route candidates through
--     work_orders.
--   * Quote lifecycle gets its own event aggregate_type ('quote', added to
--     packages/core's AGGREGATE_TYPES + the check constraint below) so the
--     request's canonical REQUEST_EVENTS stream stays untouched by
--     quote_invited/quote_submitted/quote_accepted/quote_declined events.
--   * sally_messages (raw transcript) is never embedded — only curated,
--     summarized facts go into sally_memory_chunks. PII minimization: a
--     curated fact list can't leak unrelated PII into a similarity search
--     the way raw transcript chunks could.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Quotes (3-tradie marketplace)
-- ---------------------------------------------------------------------------

create table quotes (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  request_id         uuid not null references maintenance_requests(id) on delete cascade,
  tradie_contact_id  uuid not null references contacts(id),
  status             text not null default 'invited'
                       check (status in ('invited', 'submitted', 'declined', 'expired', 'accepted', 'not_selected')),
  quote_cents        bigint check (quote_cents >= 0),
  call_out_fee_cents bigint check (call_out_fee_cents >= 0),
  note               text,
  submitted_at       timestamptz,
  created_at         timestamptz not null default now()
);
create index on quotes (org_id, request_id);
create index on quotes (org_id, tradie_contact_id);

-- work_orders gains a call-out fee (mirrors quotes) and a back-reference to
-- the accepted quote, populated when a quote is accepted.
alter table work_orders add column call_out_fee_cents bigint check (call_out_fee_cents >= 0);
alter table work_orders add column quote_id uuid references quotes(id);

-- events.aggregate_type must accept 'quote' to match packages/core's
-- AGGREGATE_TYPES. The check constraint from 0001_init.sql was unnamed, so
-- Postgres auto-named it <table>_<column>_check.
alter table events drop constraint events_aggregate_type_check;
alter table events add constraint events_aggregate_type_check
  check (aggregate_type in ('maintenance_request', 'work_order', 'property', 'compliance_item', 'quote'));

-- ---------------------------------------------------------------------------
-- Sally conversation + memory
-- ---------------------------------------------------------------------------

create table sally_conversations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  contact_id  uuid not null references contacts(id),
  property_id uuid not null references properties(id),
  request_id  uuid references maintenance_requests(id),
  status      text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index on sally_conversations (org_id, contact_id);

-- Raw transcript — audit-only. Never embedded; see design notes above.
create table sally_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  conversation_id uuid not null references sally_conversations(id) on delete cascade,
  role            text not null check (role in ('tenant', 'sally', 'system')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index on sally_messages (org_id, conversation_id, created_at);

-- Curated, embedded memory. Written once per conversation (end-of-conversation
-- summarization), never per-turn — cheapest, avoids embedding churn on
-- partial/abandoned chats.
create table sally_memory_chunks (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references orgs(id) on delete cascade,
  contact_id              uuid not null references contacts(id),
  property_id             uuid references properties(id), -- set when scope_level='property'
  scope_level             text not null check (scope_level in ('contact', 'property')),
  chunk_type              text not null check (chunk_type in ('fact', 'preference', 'summary')),
  content                 text not null, -- curated fact, NOT raw transcript
  embedding               vector(1536) not null,
  source_conversation_id  uuid references sally_conversations(id),
  created_at              timestamptz not null default now()
);
create index on sally_memory_chunks (org_id, contact_id);
create index sally_memory_chunks_embedding_idx on sally_memory_chunks
  using ivfflat (embedding vector_cosine_ops);
-- NOTE: ivfflat chosen defensively. Before relying on this at scale, run
-- `select extversion from pg_extension where extname = 'vector'` against the
-- live project; if >=0.5.0, hnsw is available and preferable (better recall,
-- no `lists` tuning) — see docs/SALLY_MEMORY.md for the upgrade path.

-- pgvector similarity search via RPC (supabase-js can't express the `<=>`
-- operator through its query builder). Called with the service-role client,
-- which already bypasses RLS, so no SECURITY DEFINER needed. query_embedding
-- is passed as a text array literal ("[0.1,0.2,...]") to sidestep JS-driver
-- vector-type coercion ambiguity, then cast here.
create or replace function match_sally_memory(
  query_embedding text,
  match_contact_id uuid,
  match_count int default 5
) returns table (content text, similarity float)
language sql stable as $$
  select content, 1 - (embedding <=> query_embedding::vector) as similarity
  from sally_memory_chunks
  where contact_id = match_contact_id
  order by embedding <=> query_embedding::vector
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Trust scoring (read-time view — see packages/core/src/trust/scoring.ts for
-- the canonical per-job formula; this view is a read-time convenience only)
-- ---------------------------------------------------------------------------

create view tradie_trust_scores as
select
  wo.org_id,
  wo.tradie_contact_id,
  count(*) filter (where wo.invoice_cents is not null) as completed_jobs,
  avg((wo.invoice_cents - wo.quote_cents)::numeric / nullif(wo.quote_cents, 0))
    filter (where wo.invoice_cents is not null and wo.quote_cents > 0) as avg_signed_variance_pct,
  avg(abs(wo.invoice_cents - wo.quote_cents)::numeric / nullif(wo.quote_cents, 0))
    filter (where wo.invoice_cents is not null and wo.quote_cents > 0) as avg_abs_variance_pct
from work_orders wo
where wo.tradie_contact_id is not null
group by wo.org_id, wo.tradie_contact_id;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'quotes', 'sally_conversations', 'sally_messages', 'sally_memory_chunks'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_org_isolation on %I for all
         using (org_id in (select app_user_org_ids()))
         with check (org_id in (select app_user_org_ids()))', t, t);
  end loop;
end;
$$;
