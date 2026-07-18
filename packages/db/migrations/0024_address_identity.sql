-- v8 R5a: verified address identity (Geoscape/G-NAF). The G-NAF PID becomes
-- the durable key of the Address Record — typo-proof, survives renumbering
-- and formatting differences. Coordinates unlock George's real ETAs.
alter table properties add column if not exists gnaf_pid text;
alter table properties add column if not exists lat double precision;
alter table properties add column if not exists lng double precision;
create index if not exists properties_gnaf on properties (gnaf_pid);

-- Leads may arrive with a verified address picked from the autocomplete.
alter table join_requests add column if not exists address_text text;
alter table join_requests add column if not exists gnaf_pid text;
