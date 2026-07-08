-- Developer Brief v4 §2: the permanent per-property asset registry, and
-- warranty tracking on completed jobs -- the flagship Property Passport
-- mechanic. Populated as a byproduct of a tradie invoicing a completed job
-- (see 0010), not extra landlord admin.

create table property_assets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  category     text not null, -- RequestCategory, validated app-side (matches tradie_rate_card_items convention)
  label        text not null,
  installed_at date,
  created_at   timestamptz not null default now()
);
create index on property_assets (org_id, property_id, category);

alter table work_orders add constraint work_orders_asset_id_fkey
  foreign key (asset_id) references property_assets(id);
alter table work_orders add column warranty_expires_at timestamptz;

-- Set when a new request is routed as a warranty claim back to the
-- original tradie instead of the 3-quote marketplace.
alter table maintenance_requests add column warranty_claim_of_work_order_id uuid references work_orders(id);

alter table property_assets enable row level security;
create policy property_assets_org_isolation on property_assets for all
  using (org_id in (select app_user_org_ids()))
  with check (org_id in (select app_user_org_ids()));
