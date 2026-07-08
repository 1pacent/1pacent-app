-- Developer Brief v4 §1: wire up the job-completion tail of the state
-- machine (scheduled -> in_progress -> evidence_pending -> verified ->
-- invoiced -> paid -> closed). No code has ever fired these transitions,
-- which means work_orders.invoice_cents has never been written against
-- live traffic -- trust scoring and comparable-jobs pricing have been
-- silently non-functional until this migration's data-layer methods land.

alter table work_orders add column completion_note text;
alter table work_orders add column asset_id uuid; -- FK added in 0011 once property_assets exists
