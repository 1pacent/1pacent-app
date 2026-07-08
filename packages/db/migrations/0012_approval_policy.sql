-- Developer Brief v4 §3: a real approval-policy rule set, evaluated once
-- quotes actually exist (not the intake-time $0-estimate check), so a
-- landlord can genuinely "pre-approve anything under $X" against a real
-- price and a real tradie trust score.

create table approval_policy_rules (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  property_id        uuid not null references properties(id) on delete cascade,
  priority           integer not null default 0,
  max_total_cents    bigint check (max_total_cents >= 0),
  min_trust_score    integer check (min_trust_score between 0 and 100),
  exclude_categories text[] not null default '{}',
  enabled            boolean not null default true,
  created_at         timestamptz not null default now()
);
create index on approval_policy_rules (org_id, property_id, priority);

alter table approval_policy_rules enable row level security;
create policy approval_policy_rules_org_isolation on approval_policy_rules for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));
