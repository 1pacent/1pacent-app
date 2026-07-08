-- The tradie's own AI business assistant (docs/DEVELOPER_BRIEF_v3.md §5) —
-- Sally answering a tradie's OWN missed calls, for their OWN customers, not
-- just marketplace-sourced tenant requests. A tradie's own customer isn't a
-- rental tenant of a managed property, so this is a new, lighter aggregate
-- alongside maintenance_requests rather than forcing it through the
-- property-scoped rental model.

alter table contacts drop constraint contacts_kind_check;
alter table contacts add constraint contacts_kind_check
  check (kind in ('tenant', 'tradie', 'owner', 'property_manager', 'customer'));

create table tradie_leads (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  tradie_contact_id  uuid not null references contacts(id),
  customer_contact_id uuid not null references contacts(id),
  title              text not null,
  description        text not null default '',
  category           text not null default 'other',
  status             text not null default 'new' check (status in ('new', 'quoted', 'accepted', 'closed')),
  suggested_quote_cents        bigint check (suggested_quote_cents >= 0),
  suggested_call_out_fee_cents bigint check (suggested_call_out_fee_cents >= 0),
  created_at         timestamptz not null default now()
);
create index on tradie_leads (org_id, tradie_contact_id);

-- Sally conversations gain an alternate target: a tradie's own lead instead
-- of a property's maintenance request. Exactly one of
-- (property_id, tradie_lead_id) is meaningful per conversation — property_id
-- for tenant intake, tradie_contact_id+tradie_lead_id for tradie lead capture.
alter table sally_conversations alter column property_id drop not null;
alter table sally_conversations add column tradie_contact_id uuid references contacts(id);
alter table sally_conversations add column tradie_lead_id uuid references tradie_leads(id);

alter table tradie_leads enable row level security;
create policy tradie_leads_org_isolation on tradie_leads for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));
