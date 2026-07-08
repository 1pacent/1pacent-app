-- New token scope: a tradie's own shareable "talk to my business" link,
-- for their own customers — the reconciliation of the tenant-intake
-- marketplace flow and the tradie-first AI receptionist vision
-- (docs/PRODUCT_BRIEF_v3.md §5.4.2). Matches packages/core/src/tokens.ts.

alter table access_tokens drop constraint access_tokens_scope_check;
alter table access_tokens add constraint access_tokens_scope_check
  check (scope in (
    'tenant_intake', 'request_status', 'landlord_approval', 'tradie_job',
    'tradie_portal', 'pm_portfolio', 'tradie_lead_intake'
  ));
