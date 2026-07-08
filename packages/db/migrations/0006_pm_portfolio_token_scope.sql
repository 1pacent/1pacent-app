-- New token scope: a property manager's durable portfolio view — informed
-- of landlord decisions across their managed properties, not a mandatory
-- approval gate by default (docs/PRODUCT_BRIEF_v3.md §5.3). Matches
-- packages/core/src/tokens.ts's TOKEN_SCOPES.

alter table access_tokens drop constraint access_tokens_scope_check;
alter table access_tokens add constraint access_tokens_scope_check
  check (scope in ('tenant_intake', 'request_status', 'landlord_approval', 'tradie_job', 'tradie_portal', 'pm_portfolio'));
