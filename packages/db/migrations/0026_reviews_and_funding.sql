-- v8 R6: feedback into the trust score + the same-day funding ladder.

-- Reviews (archive: TRADIE-RENTAL-102-Tenant-Feedback-Trust-Score): one per
-- job, written by the payer or occupant after verification; the tradie
-- BUSINESS may respond once. Feeds scoreTrustWithFeedback (70% accuracy /
-- 30% feedback, ramped by volume).
create table if not exists job_reviews (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  request_id         uuid not null references maintenance_requests(id) on delete cascade,
  work_order_id      uuid references work_orders(id),
  tradie_contact_id  uuid not null references contacts(id),
  rating             integer not null check (rating between 1 and 5),
  comment            text,
  reviewer_role      text not null check (reviewer_role in ('occupant', 'payer')),
  response           text,
  responded_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (request_id)
);
create index if not exists job_reviews_tradie on job_reviews (tradie_contact_id, created_at desc);
alter table job_reviews enable row level security;
create policy job_reviews_org_isolation on job_reviews for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));

-- The property's trust balance (rent held by the PM). Settlement's funding
-- ladder reads it: sufficient → fund same-day from trust; short → the
-- obligation hands to the owner as a one-tap pay-now Moment.
alter table properties add column if not exists trust_balance_cents bigint not null default 0;
