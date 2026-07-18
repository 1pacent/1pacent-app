-- v8 R4c: ANY party may hold the proof of purchase — landlord, PM (via the
-- Record) or the tradie who bought the unit on the way to site (via the job).
-- The tradie's copy rides the work order like the id-plate details and is
-- copied onto the asset at settle; a receipt already on the asset is never
-- overwritten by a later job.
alter table work_orders add column if not exists receipt_data_url text;
alter table work_orders add column if not exists asset_purchased_at date;
alter table work_orders add column if not exists asset_warranty_months integer;
