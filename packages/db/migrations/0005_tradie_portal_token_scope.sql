-- New token scope: a tradie's durable "login" link (rate card settings now;
-- doubles as the entry point for their own AI receptionist later — see
-- docs/DEVELOPER_BRIEF_v3.md §5). Matches packages/core/src/tokens.ts's
-- TOKEN_SCOPES.

alter table access_tokens drop constraint access_tokens_scope_check;
alter table access_tokens add constraint access_tokens_scope_check
  check (scope in ('tenant_intake', 'request_status', 'landlord_approval', 'tradie_job', 'tradie_portal'));
