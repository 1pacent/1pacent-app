-- v8 R5b: crews. A tradie BUSINESS can field multiple staff. Staff are
-- tradie contacts employed by the business contact — they reuse everything
-- person-shaped (presence + geolocation, portal tokens, runs) while the
-- business keeps everything commercial (rate card, trust score, payouts,
-- Fast-Pay, offers). Work orders stay owned by the business; the human on
-- the van is recorded separately.
alter table contacts add column if not exists employer_contact_id uuid references contacts(id);
create index if not exists contacts_employer on contacts (employer_contact_id);

alter table work_orders add column if not exists assigned_staff_contact_id uuid references contacts(id);
