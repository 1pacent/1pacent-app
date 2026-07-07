-- 1Pacent schema v2 — implements Developer Brief v2 §4 (data-model fixes).
-- Designed for Supabase (Sydney): RLS everywhere, auth.uid() for account
-- personas, tokenised access for tenants/tradies, append-only event log.
--
-- B1 remediation: every tenant-scoped table carries org_id + RLS.
-- H2 remediation: all money is bigint cents.
-- H6 remediation: events is the source of truth; status columns are projections.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Orgs & membership
-- ---------------------------------------------------------------------------

create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null check (kind in ('self_managed_landlord', 'agency')),
  created_at  timestamptz not null default now()
);

create table org_members (
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null, -- Supabase auth.users.id
  role        text not null check (role in ('owner', 'admin', 'member')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Membership lookup used by every RLS policy. SECURITY DEFINER so it can
-- read org_members regardless of the caller's row visibility.
create or replace function app_user_org_ids() returns setof uuid
language sql security definer stable set search_path = public as $$
  select org_id from org_members where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Properties, contacts, tenancies
-- ---------------------------------------------------------------------------

create table properties (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  address_line1 text not null,
  address_line2 text,
  suburb        text not null,
  state         text not null default 'VIC',
  postcode      text not null,
  jurisdiction  text not null default 'VIC' check (jurisdiction in ('VIC', 'NSW', 'QLD')),
  has_gas       boolean not null default false,
  has_pool      boolean not null default false,
  build_year    integer,
  auto_approve_cap_cents bigint not null default 0 check (auto_approve_cap_cents >= 0),
  created_at    timestamptz not null default now()
);
create index on properties (org_id);

create table contacts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  kind              text not null check (kind in ('tenant', 'tradie', 'owner')),
  full_name         text not null,
  email             text,
  phone             text,
  trade_type        text,
  licence_number    text,
  licence_expiry    date,
  insurance_expiry  date,
  created_at        timestamptz not null default now()
);
create index on contacts (org_id, kind);

create table tenancies (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  tenant_contact_id uuid not null references contacts(id),
  starts_on   date not null,
  ends_on     date,
  created_at  timestamptz not null default now()
);
create index on tenancies (org_id, property_id);

-- ---------------------------------------------------------------------------
-- Compliance (the moat)
-- ---------------------------------------------------------------------------

-- Global catalogue: not org-scoped, read-only to clients.
create table compliance_requirement_catalogue (
  key               text primary key,
  jurisdiction      text not null check (jurisdiction in ('VIC', 'NSW', 'QLD')),
  name              text not null,
  description       text not null,
  frequency_months  integer, -- null = one-off
  evidence_required text[] not null default '{}',
  legislation_ref   text not null,
  applies_when      text check (applies_when in ('has_gas', 'has_pool'))
);

create table compliance_certificates (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  property_id     uuid not null references properties(id) on delete cascade,
  requirement_key text not null references compliance_requirement_catalogue(key),
  completed_at    date not null,
  expires_at      date,
  file_path       text,          -- object storage key
  sha256          text,          -- evidence integrity (brief §4.4)
  exif            jsonb,
  uploaded_by     text,
  uploaded_at     timestamptz not null default now()
);
create index on compliance_certificates (org_id, property_id, requirement_key);

-- ---------------------------------------------------------------------------
-- Maintenance requests & work orders (status columns are projections)
-- ---------------------------------------------------------------------------

create table maintenance_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  tenancy_id    uuid references tenancies(id),
  title         text not null,
  description   text not null default '',
  category      text not null default 'other',
  is_urgent     boolean not null default false,
  status        text not null default 'reported', -- projection of events
  estimate_cents bigint check (estimate_cents >= 0),
  reported_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index on maintenance_requests (org_id, property_id, status);

create table work_orders (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  request_id         uuid not null references maintenance_requests(id) on delete cascade,
  tradie_contact_id  uuid references contacts(id),
  status             text not null default 'draft', -- projection of events
  quote_cents        bigint check (quote_cents >= 0),
  invoice_cents      bigint check (invoice_cents >= 0),
  scheduled_for      timestamptz,
  created_at         timestamptz not null default now()
);
create index on work_orders (org_id, request_id);

create table request_evidence (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  request_id   uuid not null references maintenance_requests(id) on delete cascade,
  phase        text not null check (phase in ('report', 'before', 'after')),
  file_path    text not null,
  sha256       text not null,
  exif         jsonb,
  uploaded_by  text not null,
  uploaded_at  timestamptz not null default now()
);
create index on request_evidence (org_id, request_id);

-- ---------------------------------------------------------------------------
-- Append-only event log — the source of truth
-- ---------------------------------------------------------------------------

create table events (
  id             bigint generated always as identity primary key,
  org_id         uuid not null references orgs(id) on delete restrict,
  aggregate_type text not null check (aggregate_type in
                   ('maintenance_request', 'work_order', 'property', 'compliance_item')),
  aggregate_id   uuid not null,
  event_type     text not null,
  actor_type     text not null check (actor_type in
                   ('tenant', 'landlord', 'agency_user', 'tradie', 'system')),
  actor_id       text not null,
  payload        jsonb not null default '{}',
  ai_meta        jsonb, -- {model, prompt_version, confidence} when AI-proposed
  created_at     timestamptz not null default now()
);
create index on events (org_id, aggregate_type, aggregate_id, id);

create or replace function forbid_event_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'events is append-only';
end;
$$;

create trigger events_append_only
  before update or delete on events
  for each row execute function forbid_event_mutation();

-- ---------------------------------------------------------------------------
-- Tokenised access (tenant/tradie/approval links — no accounts)
-- ---------------------------------------------------------------------------

create table access_tokens (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  token_hash   text not null unique, -- sha256 hex; raw token never stored
  scope        text not null check (scope in
                 ('tenant_intake', 'request_status', 'landlord_approval', 'tradie_job')),
  aggregate_id uuid,                 -- request/work-order/property the token unlocks
  contact_id   uuid references contacts(id),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index on access_tokens (token_hash);

-- ---------------------------------------------------------------------------
-- Row-level security (B1)
-- ---------------------------------------------------------------------------
-- Account personas (landlord/agency users) hit these tables through the
-- authenticated Supabase client: membership decides visibility.
-- Tokenised personas (tenant/tradie/approval links) NEVER query these
-- tables directly — the API tier validates the token and uses the service
-- role with explicit scoping.

alter table orgs enable row level security;
create policy org_select on orgs for select
  using (id in (select app_user_org_ids()));

alter table org_members enable row level security;
create policy org_members_select on org_members for select
  using (org_id in (select app_user_org_ids()));

-- Catalogue is global read-only reference data.
alter table compliance_requirement_catalogue enable row level security;
create policy catalogue_read on compliance_requirement_catalogue for select
  using (true);

-- Org-scoped tables: full CRUD within your own org, nothing outside it.
do $$
declare
  t text;
begin
  foreach t in array array[
    'properties', 'contacts', 'tenancies', 'compliance_certificates',
    'maintenance_requests', 'work_orders', 'request_evidence'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_org_isolation on %I for all
         using (org_id in (select app_user_org_ids()))
         with check (org_id in (select app_user_org_ids()))', t, t);
  end loop;
end;
$$;

-- Events: org members may read their org''s history; nobody inserts from
-- the client — only the API tier (service role) appends events.
alter table events enable row level security;
create policy events_select on events for select
  using (org_id in (select app_user_org_ids()));

-- Access tokens are only ever touched by the API tier (service role).
alter table access_tokens enable row level security;
