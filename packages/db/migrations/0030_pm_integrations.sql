-- PM platform integrations (v9 R9.2): connect a PM's existing platform
-- (PropertyMe / Property Tree / Console / Reapit / …) to import their portfolio
-- and keep property counts in sync with their subscription tier.
--
-- Safety by construction:
--   • write_back_enabled DEFAULT FALSE — Zaivo is the future maintenance
--     platform, not a plugin; nothing is written back unless explicitly on.
--   • credentials are stored ENCRYPTED (AES-256-GCM, app-side) — this column
--     only ever holds ciphertext.
--   • NO date-of-birth / identity documents / financial data is imported
--     (enforced by the app-side field allowlist).

create table if not exists pm_integrations (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,
  pm_contact_id         uuid not null,
  provider              text not null check (provider in ('propertyme','property_tree','console','reapit','ailo','other')),
  status                text not null default 'connected' check (status in ('connected','disconnected','error')),
  credentials_encrypted text,                       -- AES-256-GCM ciphertext ONLY
  external_account_id   text,
  write_back_enabled    boolean not null default false, -- OFF by default (non-negotiable)
  last_sync_at          timestamptz,
  last_error            text,
  connected_at          timestamptz not null default now(),
  disconnected_at       timestamptz,
  created_at            timestamptz not null default now(),
  unique (pm_contact_id, provider)
);
alter table pm_integrations enable row level security; -- service-role only

-- External-system provenance on imported properties (join key for
-- reconciliation; lets us dedupe and mark archived).
alter table properties add column if not exists external_ref text;
alter table properties add column if not exists external_source text;
create index if not exists properties_external on properties (external_source, external_ref);

-- Minimised, encrypted maintenance contact for imported properties (access
-- coordination only — never tenancy/financial data).
alter table properties add column if not exists maintenance_contact_encrypted text;

-- Audit log for the connection lifecycle (connect / sync / over-cap /
-- write-back toggled / disconnect / delete).
create table if not exists pm_integration_events (
  id             uuid primary key default gen_random_uuid(),
  integration_id uuid,
  pm_contact_id  uuid not null,
  provider       text not null,
  event_type     text not null,
  detail         jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists pm_integration_events_pm on pm_integration_events (pm_contact_id, created_at desc);
alter table pm_integration_events enable row level security;
