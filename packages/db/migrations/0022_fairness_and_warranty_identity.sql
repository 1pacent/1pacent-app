-- v8 R4b: variance fairness + warranty identity.
--
-- Fairness: a variance claim carries photo evidence — the tradie's
-- protection (documented cause) and the payer's (reviewable claim).
alter table variances add column if not exists photo_data_url text;

-- The tradie records WHAT was fitted (id-plate truth) while on site; the
-- settle step copies it onto the Address Record's asset.
alter table work_orders add column if not exists asset_manufacturer text;
alter table work_orders add column if not exists asset_model text;
alter table work_orders add column if not exists asset_serial text;

-- Warranty identity on the asset itself: manufacturer/model/serial from the
-- tradie; proof-of-purchase + manufacturer warranty from the payer. The
-- workmanship warranty (work_orders.warranty_expires_at) stays separate —
-- two different promises from two different parties.
alter table property_assets add column if not exists manufacturer text;
alter table property_assets add column if not exists model text;
alter table property_assets add column if not exists serial_number text;
alter table property_assets add column if not exists receipt_data_url text;
alter table property_assets add column if not exists purchased_at date;
alter table property_assets add column if not exists manufacturer_warranty_months integer;
