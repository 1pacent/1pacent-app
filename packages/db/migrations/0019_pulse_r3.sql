-- Developer Brief v8 R3 (Real money & the second orbit): payment slices for
-- milestone capture, the variance protocol's record, and Fast-Pay opt-in.

-- Which slice of the job's money a payments row represents. Milestone
-- playbooks carry deposit + balance rows; on-site scope changes add a
-- variance row. Still a PSP mirror — no custody, ever.
alter table payments add column if not exists kind text not null default 'primary'
  check (kind in ('primary', 'deposit', 'balance', 'variance'));
alter table payments add column if not exists fastpay_fee_cents bigint;

-- The variance protocol (v8 §4): an on-site scope change is a first-class
-- record — proposed by the tradie, decided by the payer (or auto-applied
-- inside the playbook's threshold), tracked to trust.
create table if not exists variances (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  request_id      uuid not null references maintenance_requests(id) on delete cascade,
  work_order_id   uuid not null references work_orders(id) on delete cascade,
  booked_cents    bigint not null check (booked_cents >= 0),
  new_total_cents bigint not null check (new_total_cents >= 0),
  reason          text not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'declined', 'auto_applied')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
create index if not exists variances_request on variances (org_id, request_id);
alter table variances enable row level security;
create policy variances_org_isolation on variances for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));

-- Fast-Pay opt-in lives with the tradie's other commercial settings.
alter table tradie_rate_cards add column if not exists fastpay_enabled boolean not null default false;
