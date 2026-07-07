# 1PACENT-SALLY-\* workflows

Two workflows, built and verified live on 2026-07-07 against
`n8n.1pacent.com`. Both are **active**, header-auth protected, and were
each fired with a real test payload and confirmed to send real emails via
Resend (execution logs showed a genuine Resend email `id` in the response,
not just a 200 from the webhook).

| Workflow | id | Webhook path | Trigger |
|---|---|---|---|
| `1PACENT-SALLY-DISPATCH-QUOTES` | `E8iQ2S3a0iH9jFdY` | `/webhook/1pacent-sally-dispatch-quotes` | API tier, after inserting 3 `quotes` rows + issuing `tradie_job` tokens (`DataSource.dispatchQuotesForRequest`, called from `apps/web/src/lib/sally.ts`) |
| `1PACENT-SALLY-DISPATCH-NOTIFY` | `pVBNZol8fL2vxchG` | `/webhook/1pacent-sally-dispatch-notify` | API tier, after the accept-quote transaction commits (`apps/web/src/app/properties/[id]/actions.ts`) |

## Design

Both are pure notification workers — no database writes, no reasoning.
The API tier has already committed all state (quotes created, tokens
issued, request transitioned, accept/decline recorded) *before* calling
either webhook. If the n8n call fails, the DB state is still correct; only
the email notification is lost, and the caller logs a warning rather than
failing the request (see `apps/web/src/lib/n8n.ts`). This matches
`docs/ARCHITECTURE.md` rule 5: n8n does deterministic side effects only,
triggered by the API tier, never the reverse.

## Auth

Both webhooks require the `1Pacent Internal Auth` credential (n8n
credential id `oBZ6GRQ3zAFbDeqs`, httpHeaderAuth, header `X-Internal-Auth`)
— the value must match `N8N_INTERNAL_AUTH_TOKEN` in `apps/web/.env.local` /
the Vercel env. Requests without the correct header get rejected before any
node runs.

## Email sending

Both use the `1Pacent Resend` credential (id `d1WYNVTKjTiVqp0y`,
httpHeaderAuth, header `Authorization: Bearer <RESEND_API_KEY>`) to call
`https://api.resend.com/emails` directly via an HTTP Request node — no
dedicated Resend node exists in this n8n instance, so the header-auth +
HTTP Request pattern is used instead. The `from` address is
`onboarding@resend.dev`, Resend's always-available sandbox sender; swap for
a verified domain address once one exists.

## `DISPATCH-QUOTES` flow

`Webhook` → `Split Invites` (splits `body.invites[]` into one item per
tradie) → `Send Quote Request Email` (HTTP Request to Resend, one call per
item) → `Respond`.

## `DISPATCH-NOTIFY` flow

`Webhook` branches into two parallel paths — `Send Accepted Email` (single
call, using `body.accepted`) and `Split Declined` → `Send Declined Email`
(one call per item in `body.declined[]`) — which rejoin at a `Merge` node
before `Respond`.

## Regenerating these credentials/workflows from scratch

If this instance is ever rebuilt, recreate via the n8n Public API:

```bash
# 1. Header-auth credential for the webhook
curl -X POST "$N8N_URL/api/v1/credentials" -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" -d '{"name":"1Pacent Internal Auth","type":"httpHeaderAuth","data":{"name":"X-Internal-Auth","value":"'"$N8N_INTERNAL_AUTH_TOKEN"'","allowedDomains":""}}'

# 2. Header-auth credential for Resend
curl -X POST "$N8N_URL/api/v1/credentials" -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" -d '{"name":"1Pacent Resend","type":"httpHeaderAuth","data":{"name":"Authorization","value":"Bearer '"$RESEND_API_KEY"'","allowedDomains":""}}'

# 3. Import the workflow JSON in this directory, update the credential ids
#    to match the freshly-created ones above, POST to /api/v1/workflows,
#    then POST /api/v1/workflows/<id>/activate for each.
```

## Naming convention / instance hygiene

`n8n.1pacent.com` hosts unrelated products (`ai4boards-*`, a Telegram bot,
and — per `docs/N8N_WORKFLOW_AUDIT.md` — ~25 others under different n8n
user accounts on the same instance). The `1PACENT-SALLY-` prefix is
non-negotiable for anything new here specifically to keep blast radius
identifiable. Never read, edit, or deactivate a workflow that doesn't carry
a `1Pacent-`/`TRADIE-`/`RENTAL-`/`1PACENT-` prefix — it belongs to a
different product sharing this server.
