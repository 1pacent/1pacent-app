-- Persona-aware onboarding (v8 R8.3). The join form now captures what the
-- network actually needs from each persona to do its job — split names, a
-- tradie's business identity + trades + service suburbs, a landlord/owner's
-- properties, a PM's agency + portfolio size — without becoming a burden.
-- All nullable and additive; the pre-org join_requests lead table stays the
-- single intake row, with the persona-specific payload in structured columns
-- plus a jsonb catch-all for lists (suburbs, properties).

alter table join_requests add column if not exists first_name text;
alter table join_requests add column if not exists last_name  text;
-- One person can hold several roles (I own my home AND I'm a landlord).
alter table join_requests add column if not exists roles text[];

-- Tradie / PM business identity.
alter table join_requests add column if not exists company_name text;
alter table join_requests add column if not exists abn          text;
-- Tradie: the trades they cover (matches core TRADE_TYPES) + suburbs served.
alter table join_requests add column if not exists trade_types    text[];
alter table join_requests add column if not exists service_suburbs text[];
-- PM: portfolio size (drives which PRD-1P-004 cohort they'll land on).
alter table join_requests add column if not exists properties_under_mgmt int;

-- Landlord / owner: the properties they want on the network. Each entry is
-- { addressText, gnafPid, suburb, role: 'owner_occupier'|'rental' }.
alter table join_requests add column if not exists properties jsonb;

-- Free-form structured extras that don't warrant their own column yet.
alter table join_requests add column if not exists detail jsonb;
