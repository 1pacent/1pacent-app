-- v8 R3.5: the learning loop and parts-to-job, resurrected from the archive
-- (TRADIE-JOBS-046-Capture-Job-Actuals, TRADIE-TOOL-Job-Actuals-Capture,
-- Nelly's materials_cost). Estimated vs actual on-site time is captured on
-- every job and feeds the blended trust score; parts a tradie books to a
-- job ride the same variance/no-surprises money rules as labour.

alter table work_orders add column if not exists on_site_started_at timestamptz;
alter table work_orders add column if not exists estimated_minutes integer;
alter table work_orders add column if not exists actual_minutes integer;

create table if not exists job_parts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  work_order_id  uuid not null references work_orders(id) on delete cascade,
  label          text not null,
  cost_cents     bigint not null check (cost_cents >= 0),
  status         text not null default 'active'
                   check (status in ('active', 'pending_approval', 'declined')),
  -- Set when this part pushed the job over the playbook's variance
  -- threshold and is waiting on (or was decided by) the payer.
  variance_id    uuid references variances(id),
  created_at     timestamptz not null default now()
);
create index if not exists job_parts_wo on job_parts (org_id, work_order_id);
alter table job_parts enable row level security;
create policy job_parts_org_isolation on job_parts for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));
