-- Billing catalogue (v9 R9): ONE editable source of truth for PM subscription
-- tiers, owned by the operator console, provisioned OUT to Stripe (the billing
-- engine) and mirrored to HubSpot (CRM). SKU is the join key across all three
-- systems (billing_tiers.sku = Stripe price lookup_key = HubSpot hs_sku).
--
-- Money model (operator-confirmed 2026-07-21):
--   monthly charge = base_fee_cents + per_property_cents * property_cap
--   (base 0 on seed → identical to the shipped $2/property ladder; the
--    operator may set a base fee per tier in the console)
--   transaction fee = billing_settings.transaction_fee_bps (500 = 5%),
--   deducted from settled job value (tradie receives the remainder).

create table if not exists billing_tiers (
  id                 uuid primary key default gen_random_uuid(),
  sku                text not null unique,
  name               text not null,
  description        text,
  base_fee_cents     integer not null default 0 check (base_fee_cents >= 0),
  per_property_cents integer not null default 200 check (per_property_cents >= 0),
  property_cap       integer not null check (property_cap > 0),
  active             boolean not null default true,
  sort_order         integer not null default 0,
  stripe_product_id  text,
  stripe_price_id    text,
  hubspot_product_id text,
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index if not exists billing_tiers_active on billing_tiers (active, sort_order);
alter table billing_tiers enable row level security; -- service-role only (operator console)

-- Singleton settings row (id fixed to 1).
create table if not exists billing_settings (
  id                    integer primary key default 1 check (id = 1),
  transaction_fee_bps   integer not null default 500 check (transaction_fee_bps between 0 and 10000),
  fastpay_fee_bps       integer not null default 200 check (fastpay_fee_bps between 0 and 10000),
  currency              text not null default 'aud',
  updated_at            timestamptz not null default now()
);
alter table billing_settings enable row level security;
insert into billing_settings (id) values (1) on conflict (id) do nothing;

-- Seed the shipped ladder (PRD-1P-004-*): base 0, $2/property, caps 20..1000.
-- monthly = 0 + 200 * cap  →  $40 .. $2000, exactly as today.
insert into billing_tiers (sku, name, description, base_fee_cents, per_property_cents, property_cap, sort_order)
values
  ('PRD-1P-004-20',   '20 - Properties Under Management',   'For boutique agencies — up to 20 doors.',           0, 200, 20,   1),
  ('PRD-1P-004-50',   '50 - Properties Under Management',   'Growing agencies — up to 50 doors.',                0, 200, 50,   2),
  ('PRD-1P-004-100',  '100 - Properties Under Management',  'Established agencies — up to 100 doors.',           0, 200, 100,  3),
  ('PRD-1P-004-200',  '200 - Properties Under Management',  'Multi-office agencies — up to 200 doors.',          0, 200, 200,  4),
  ('PRD-1P-004-300',  '300 - Properties Under Management',  'Regional networks — up to 300 doors.',              0, 200, 300,  5),
  ('PRD-1P-004-400',  '400 - Properties Under Management',  'Large networks — up to 400 doors.',                 0, 200, 400,  6),
  ('PRD-1P-004-500',  '500 - Properties Under Management',  'Enterprise — up to 500 doors.',                     0, 200, 500,  7),
  ('PRD-1P-004-1000', '1000 - Properties Under Management', 'Institutional portfolios — up to 1,000 doors.',     0, 200, 1000, 8)
on conflict (sku) do nothing;
