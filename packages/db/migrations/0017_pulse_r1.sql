-- Developer Brief v8 R1 (The Uber Slice): identity linkage, presence,
-- payments (authorization-hold model — 1Pacent never holds funds; these rows
-- mirror the PSP's state), evidence gates, and the live-arc flags.

-- Identity: users arrive (passwordless, R1 tables only — OTP wiring is R2);
-- tokens demote to claimable guest passes.
alter table contacts add column if not exists user_id uuid;
alter table access_tokens add column if not exists claimed_by_user_id uuid;

-- Web Push subscriptions for Moments.
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  endpoint    text not null,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists push_subscriptions_endpoint on push_subscriptions (endpoint);
alter table push_subscriptions enable row level security;
create policy push_subscriptions_org_isolation on push_subscriptions for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));

-- The "go Online" toggle — availability ground truth is offer/accept, but
-- only Online tradies get pinged.
create table if not exists tradie_presence (
  tradie_contact_id uuid primary key references contacts(id) on delete cascade,
  org_id            uuid not null references orgs(id) on delete cascade,
  online            boolean not null default false,
  last_lat          double precision,
  last_lng          double precision,
  updated_at        timestamptz not null default now()
);
alter table tradie_presence enable row level security;
create policy tradie_presence_org_isolation on tradie_presence for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));

-- Payments: a mirror of the PSP's authorization/capture/transfer state.
-- No custody: platform never possesses funds; this is bookkeeping.
create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  request_id     uuid not null references maintenance_requests(id) on delete cascade,
  work_order_id  uuid references work_orders(id),
  status         text not null default 'authorized'
                   check (status in ('authorized','captured','transferred','voided','disputed')),
  amount_cents   bigint not null check (amount_cents >= 0),
  platform_fee_cents bigint,
  psp            text not null default 'simulated',  -- 'simulated' | 'stripe'
  psp_ref        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists payments_request on payments (org_id, request_id);
alter table payments enable row level security;
create policy payments_org_isolation on payments for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));

-- Evidence, gated by playbooks before completion is accepted.
create table if not exists job_evidence (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  work_order_id  uuid not null references work_orders(id) on delete cascade,
  gate           text not null,           -- arrival_photo | before | after | certificate | extra
  data_url       text,                    -- R1: compressed inline jpeg; R2 moves to Storage
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists job_evidence_wo on job_evidence (org_id, work_order_id);
alter table job_evidence enable row level security;
create policy job_evidence_org_isolation on job_evidence for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));

-- Live-arc flags + which playbook a request runs + the slot chosen at booking
-- (confirmed by tradie acceptance — offer-don't-assume).
alter table work_orders add column if not exists on_the_way_at timestamptz;
alter table maintenance_requests add column if not exists playbook_key text;
alter table maintenance_requests add column if not exists booked_start_at timestamptz;
alter table maintenance_requests add column if not exists booked_end_at timestamptz;
