-- Developer Brief v3 additions: tradie rate cards (drive auto-populated quotes,
-- never AI-invented prices), availability windows (feed the scheduling/ETA
-- score), and a property-manager role that is informed of decisions by
-- default rather than gating them (docs/PRODUCT_BRIEF_v3.md §5.3).

-- ---------------------------------------------------------------------------
-- Rate cards
-- ---------------------------------------------------------------------------

create table tradie_rate_cards (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references orgs(id) on delete cascade,
  tradie_contact_id   uuid not null references contacts(id),
  call_out_fee_cents  bigint not null check (call_out_fee_cents >= 0),
  hourly_rate_cents   bigint not null check (hourly_rate_cents >= 0),
  updated_at          timestamptz not null default now()
);
create unique index on tradie_rate_cards (tradie_contact_id);

-- Standard job-type prices layered on top of the base rate card (e.g. "power
-- point install: $180 flat"). category matches @1pacent/core's RequestCategory
-- (validated at the application layer, not a DB check constraint, since the
-- category list lives in packages/core and shouldn't be duplicated in SQL).
create table tradie_rate_card_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  rate_card_id     uuid not null references tradie_rate_cards(id) on delete cascade,
  category         text not null,
  flat_price_cents bigint check (flat_price_cents >= 0),
  typical_minutes  integer check (typical_minutes > 0)
);
create index on tradie_rate_card_items (rate_card_id, category);

-- ---------------------------------------------------------------------------
-- Availability (day-of-week + time-of-day bands — deliberately simple, not a
-- full calendar sync; feeds the availability/ETA score only)
-- ---------------------------------------------------------------------------

create table tradie_availability_windows (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  tradie_contact_id uuid not null references contacts(id),
  day_of_week       integer not null check (day_of_week between 0 and 6),
  start_time        time not null,
  end_time          time not null,
  check (start_time < end_time)
);
create index on tradie_availability_windows (tradie_contact_id, day_of_week);

-- ---------------------------------------------------------------------------
-- Property manager role
-- ---------------------------------------------------------------------------

alter table contacts drop constraint contacts_kind_check;
alter table contacts add constraint contacts_kind_check
  check (kind in ('tenant', 'tradie', 'owner', 'property_manager'));

alter table properties add column pm_contact_id uuid references contacts(id);
alter table properties add column pm_approval_required boolean not null default false;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'tradie_rate_cards', 'tradie_rate_card_items', 'tradie_availability_windows'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_org_isolation on %I for all
         using (org_id in (select app_user_org_ids()))
         with check (org_id in (select app_user_org_ids()))', t, t);
  end loop;
end;
$$;
