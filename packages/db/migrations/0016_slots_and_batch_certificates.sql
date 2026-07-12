-- Delta for instances where an earlier (partial) 0015 was applied on
-- 2026-07-08: George's confirmed-slot columns, invoiced_at for the spending
-- period filter, and the compliance-batch → certificate linkage. Idempotent
-- (IF NOT EXISTS) so it is a no-op on databases created from the full 0015.

alter table work_orders add column if not exists scheduled_start_at timestamptz;
alter table work_orders add column if not exists scheduled_end_at timestamptz;
alter table work_orders add column if not exists invoiced_at timestamptz;
alter table maintenance_requests add column if not exists compliance_requirement_key text;
