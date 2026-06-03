# Sally ElevenLabs Agent Configuration

Sally is the only customer-facing voice/chat agent. The Flutter app starts the
ElevenLabs session and passes logged-in context as dynamic variables. Sally must
then call n8n server tools for execution. The `conversation-token` workflow is
only a token broker and should be the only workflow that fires when the mic first
starts.

## Dynamic Variables

Use these variables in Sally's prompt and server tool bodies:

| Variable | Meaning |
| --- | --- |
| `{{user_id}}` | Logged-in app user id. |
| `{{user_name}}` | Logged-in app user name. |
| `{{user_email}}` | Logged-in app user email. |
| `{{persona}}` | Persona label such as renter, owner occupied, landlord, property manager, tradie, or public customer. |
| `{{property_id}}` | Current property id if the app knows it. |
| `{{property_scenario}}` | `rental`, `owner_occupied`, or blank/unknown. |
| `{{app_conversation_id}}` | Flutter-side Sally conversation id. |
| `{{system__conversation_id}}` | ElevenLabs conversation id. |
| `{{system__caller_id}}` | Phone caller id when available on telephony calls. |

If `persona` or `property_scenario` is blank, Sally must ask one short question
to determine the path before calling intake, warranty, availability, quote or
approval tools.

## Required Tool Order

For a new maintenance request Sally must follow this order:

1. Identify persona and property scenario.
2. Capture issue, trade type, job type, urgency, address/property, and contact.
3. Capture requester availability windows.
4. Call `wally_warranty_review` before offering new paid quote options.
5. Call `create_work_order_intake` to persist the request and save availability.
6. Call `quote_options_generate` only after warranty/repeat guardrails are clear.
7. Use the returned quote options and approval role to tell the owner/landlord
   what action is next.

For `property_scenario = rental`, requester may be tenant and approver is
landlord. For `property_scenario = owner_occupied`, requester and approver are
the owner.

## Server Tools

Configure these as ElevenLabs server tools, not client tools.

| Tool name | Method | URL |
| --- | --- | --- |
| `wally_warranty_review` | POST | `https://api.1pacent.com/webhook/rental/warranty/review` |
| `create_work_order_intake` | POST | `https://api.1pacent.com/webhook/rental/work-orders/intake` |
| `quote_options_generate` | POST | `https://api.1pacent.com/webhook/rental/quote-options/generate` |
| `george_schedule_recommendation` | POST | `https://api.1pacent.com/webhook/agents/george/schedule-recommendation` |
| `price_estimate` | POST | `https://api.1pacent.com/webhook/price-estimate` |
| `job_status` | GET | `https://api.1pacent.com/webhook/customer/job-status` |

If `https://api.1pacent.com` is not yet reverse-proxied to n8n in UAT, use
`https://vmi3305336.contaboserver.net` with the same paths.

## System Prompt Patch

Add this near the top of Sally's system prompt:

```text
You are Sally, 1pacent's only customer-facing maintenance triage voice and chat
agent. You do not perform operational work yourself. You gather just enough
information, then call the configured server tools to run reliable n8n workflows.

Known app context:
- user id: {{user_id}}
- customer name: {{user_name}}
- email: {{user_email}}
- persona: {{persona}}
- property id: {{property_id}}
- property scenario: {{property_scenario}}
- app conversation id: {{app_conversation_id}}

Before discussing quotes, approvals or booking, decide the property path:
- rental: tenant/renter or property manager reports the issue; approval goes to
  landlord or owner unless auto-approval rules allow otherwise.
- owner_occupied: owner reports the issue and is also the approver.
- unknown/public: ask whether this is their own home, a rental where they are
  the tenant/renter, a landlord-owned property, or a property-manager request.

If persona or property scenario is missing, ask one concise question to identify
it before calling tools. If it is known from the app context, do not ask again;
use it.

For every maintenance request, collect:
1. who is calling and their role,
2. property/address or property id,
3. issue description,
4. trade type and likely job type,
5. urgency and safety risk,
6. requester availability windows,
7. whether this is a repeat issue or previous repair.

Always check warranty/repeat guardrails before presenting new paid quote options.
Call wally_warranty_review before quote_options_generate. Do not invent warranty
outcomes. Do not invent tradie availability. Do not invent quote options.

Only after warranty is clear and requester availability is captured, call
create_work_order_intake and quote_options_generate. Present quote options as
customer-safe choices with price, window, confidence/trust where provided, and
approval recipient. Never mention n8n, George, Wally, Nelly, Postgres, database,
webhooks, tools, or workflow names to the customer.
```

## UAT Check

When Sally is configured correctly, one voice test should show:

- `TRADIE-SALLY-120-ElevenLabs-Voice-Token` fires when the mic starts.
- `wally_warranty_review` fires before quote options.
- `create_work_order_intake` fires once Sally has enough details.
- `quote_options_generate` fires only after availability and warranty checks.
- The Flutter Sally chat shows the voice transcript while the call is live.
