-- v8 R7: the PM's commercial relationship with the platform.
--
-- Subscription cohort (HubSpot products PRD-1P-004-*): the PM picks the
-- properties-under-management band; mirrored to HubSpot as a deal when the
-- token allows, and surfaced on the operator console with actual PUM.
create table if not exists pm_subscriptions (
  pm_contact_id       uuid primary key references contacts(id) on delete cascade,
  org_id              uuid not null references orgs(id) on delete cascade,
  sku                 text not null,
  name                text not null,
  price_cents         bigint not null check (price_cents >= 0),
  property_cap        integer not null check (property_cap > 0),
  hubspot_product_id  text,
  hubspot_deal_id     text,
  selected_at         timestamptz not null default now()
);
alter table pm_subscriptions enable row level security;
create policy pm_subscriptions_org_isolation on pm_subscriptions for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));

-- House tradies: up to 3 defaults for small jobs (the PM's own handyman, an
-- onsite man, or a standing agreement). Small fixed-band jobs at the PM's
-- properties dispatch to these FIRST instead of the open network.
create table if not exists pm_preferred_tradies (
  pm_contact_id      uuid not null references contacts(id) on delete cascade,
  tradie_contact_id  uuid not null references contacts(id) on delete cascade,
  org_id             uuid not null references orgs(id) on delete cascade,
  priority           integer not null check (priority between 1 and 3),
  created_at         timestamptz not null default now(),
  primary key (pm_contact_id, tradie_contact_id)
);
alter table pm_preferred_tradies enable row level security;
create policy pm_preferred_tradies_org_isolation on pm_preferred_tradies for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));

-- The "small cheap job" ceiling for house dispatch, per PM.
create table if not exists pm_dispatch_prefs (
  pm_contact_id       uuid primary key references contacts(id) on delete cascade,
  org_id              uuid not null references orgs(id) on delete cascade,
  house_max_job_cents bigint not null default 30000 check (house_max_job_cents >= 0)
);
alter table pm_dispatch_prefs enable row level security;
create policy pm_dispatch_prefs_org_isolation on pm_dispatch_prefs for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));
