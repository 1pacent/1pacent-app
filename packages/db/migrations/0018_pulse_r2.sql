-- Developer Brief v8 R2 (Autopilot & the Deck): one-tap Moment actions over
-- Web Push, the subscription's home path, and George's calendar read-busy seam.

-- Moment actions: single-use signed tokens minted at push time. A lock-screen
-- tap resolves the token, executes ONE pre-specified decision as the human
-- actor it was minted for, and burns. The payload names the decision; the
-- token is the signature.
alter table access_tokens drop constraint access_tokens_scope_check;
alter table access_tokens add constraint access_tokens_scope_check
  check (scope in (
    'tenant_intake', 'request_status', 'landlord_approval', 'tradie_job',
    'tradie_portal', 'pm_portfolio', 'tradie_lead_intake', 'owner_portal',
    'moment_action'
  ));
alter table access_tokens add column if not exists payload jsonb;

-- Where this subscriber's app lives (their token path). The push payload
-- deep-links relative to it. NOTE: link-as-capability model — the path holds
-- the same secret as the link the person was sent; the row adds no new class
-- of exposure beyond the push endpoint secret already stored here.
alter table push_subscriptions add column if not exists home_path text;

-- George layer 3 (opt-in, earned): external calendar read-busy first.
-- Tokens arrive via the tradie's explicit OAuth grant; absent a row (or an
-- access token), George plans from the ledger alone — offer-don't-assume
-- stays the ground truth.
create table if not exists tradie_calendar (
  tradie_contact_id uuid primary key references contacts(id) on delete cascade,
  org_id            uuid not null references orgs(id) on delete cascade,
  provider          text not null default 'google' check (provider in ('google', 'outlook')),
  access_token      text,
  refresh_token     text,
  read_busy         boolean not null default true,
  write_access      boolean not null default false,
  updated_at        timestamptz not null default now()
);
alter table tradie_calendar enable row level security;
create policy tradie_calendar_org_isolation on tradie_calendar for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));
