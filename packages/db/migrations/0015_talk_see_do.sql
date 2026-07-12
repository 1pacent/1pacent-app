-- Developer Brief v6 §1: landlord/owner seat, Sally session modes, report
-- artifacts, tradie auto-quote opt-in — the Talk / See / Do foundation.

-- Landlord/owner portal seat (graph position for ownership-scoped sessions).
-- aggregate_id = owner contact_id; properties resolved via
-- properties.owner_contact_id (0013).
alter table access_tokens drop constraint access_tokens_scope_check;
alter table access_tokens add constraint access_tokens_scope_check
  check (scope in (
    'tenant_intake', 'request_status', 'landlord_approval', 'tradie_job',
    'tradie_portal', 'pm_portfolio', 'tradie_lead_intake', 'owner_portal'
  ));

-- Sally sessions carry their persona mode (today: implicit tenant / tradie-lead).
alter table sally_conversations add column mode text not null default 'tenant_intake'
  check (mode in ('tenant_intake', 'tradie_lead_capture', 'owner_portal', 'pm_portfolio', 'tradie_portal'));

-- Generated report artifacts (Property Data Pack, spending summaries,
-- obligations calendars…). The payload is the full structured report;
-- rendering is a view concern.
create table generated_reports (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  kind        text not null check (kind in
                ('property_data_pack', 'spending_summary', 'obligations_calendar',
                 'pm_quarterly', 'compliance_pack', 'accuracy_report')),
  subject_id  uuid,                -- property_id / contact_id the report is about
  audience_contact_id uuid references contacts(id),
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
create index on generated_reports (org_id, kind, created_at desc);
alter table generated_reports enable row level security;
create policy generated_reports_org_isolation on generated_reports for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));

-- Tradie auto-quote opt-in (bounded, revocable, per rate card). When an
-- invite lands and the rate card can compute a suggestion within bounds,
-- Nelly submits it — attributed 'nelly:auto-quote', never silent.
alter table tradie_rate_cards add column auto_quote_enabled boolean not null default false;
alter table tradie_rate_cards add column auto_quote_max_total_cents bigint
  check (auto_quote_max_total_cents >= 0);

-- George's slot proposal (v7 §3): computed at quote-accept from the winning
-- tradie's availability windows; the tenant confirms one on a card. The
-- confirmation is an event with a human actor — never a tool call.
alter table work_orders add column proposed_slots jsonb; -- [{"startAt","endAt"}...]
alter table work_orders add column scheduled_start_at timestamptz;
alter table work_orders add column scheduled_end_at timestamptz;
-- When the invoice landed — feeds the spending summary period filter.
alter table work_orders add column invoiced_at timestamptz;

-- PM compliance batch dispatch (v5 §3.1): a batch-created request carries the
-- requirement it exists to satisfy, so invoicing its job files the certificate
-- and the traffic light turns green — the detect→quote→certificate loop closed.
alter table maintenance_requests add column compliance_requirement_key text;
