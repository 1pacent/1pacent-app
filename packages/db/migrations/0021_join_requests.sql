-- Customer-facing site (v8 R4a): onboarding leads. Pre-org by nature — a
-- join request exists before any tenancy/graph position does. Service-role
-- only (RLS enabled, no member policies); surfaced on the admin dashboard
-- and mirrored to HubSpot when a token is configured.

create table if not exists join_requests (
  id          uuid primary key default gen_random_uuid(),
  persona     text not null check (persona in ('renter', 'owner', 'landlord', 'pm', 'tradie')),
  full_name   text not null,
  email       text not null,
  phone       text,
  suburb      text,
  message     text,
  hubspot_id  text,
  created_at  timestamptz not null default now()
);
create index if not exists join_requests_created on join_requests (created_at desc);
alter table join_requests enable row level security;
