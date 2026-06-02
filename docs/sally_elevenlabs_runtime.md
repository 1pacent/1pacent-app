# Sally ElevenLabs Runtime

Sally is the first and only customer-facing triage agent. Sally is hosted in
ElevenLabs, not n8n. n8n hosts the specialist operational tools and agents that
Sally calls while the customer is live on a call or chat.

## Correct Runtime Split

| Layer | Responsibility |
| --- | --- |
| ElevenLabs Sally | Natural voice/chat conversation, one-question-at-a-time intake, customer-safe wording, tool selection. |
| n8n tools | Fast deterministic execution for price estimate, availability, warranty/repeat issue checks, lead/work-order creation, quote options, approvals, notifications, and status. |
| Postgres | Source of truth for properties, people, relationships, work orders, quote options, schedules, approvals, warranty reviews, and audit events. |
| Flutter app | Persona-aware UI shell that starts Sally, shows returned state, and lets owners/landlords/tradies take actions. |

The `TRADIE-SALLY-120-ElevenLabs-Voice-Token` workflow is only a token broker so
Flutter can start a Sally WebRTC session without exposing the ElevenLabs API key.
It is not Sally and does not run Sally's reasoning.

## Tooling Recommendation

For UAT and live customer calls, keep Sally's ElevenLabs tools as direct HTTPS
webhooks to n8n. Direct webhooks are the fastest and easiest to debug path:

- fewer network hops than an MCP proxy
- clearer request/response contracts
- simpler timeout handling for live calls
- easier n8n execution tracing
- direct reuse of existing endpoints already configured in ElevenLabs

Use MCP later only if we need a unified tool registry, dynamic tool discovery,
or many tools with shared authentication and schema management. MCP is useful for
governance, but it adds another moving part for a customer who is waiting live.

## Current Sally Tool Set

| ElevenLabs tool | n8n intent | Customer-facing purpose |
| --- | --- | --- |
| `price_estimate` | Ask Nelly/price workflow for an indicative range. | Sally can give a fast estimate without inventing prices. |
| `george_schedule_recommendation` | Ask George for a preview or booking window. | Sally can offer a real available window without exposing internal scheduling. |
| `create_lead` | Persist the triaged request and trigger confirmation. | Sally records the booking request and sends confirmation once email/consent are confirmed. |

## Next Tool Contracts To Add

- `wally_warranty_review`: check repeat issue, warranty candidate, and charge recommendation before new quote options.
- `quote_options_generate`: return up to three quote options with price, availability, trust, and confidence.
- `approval_status_or_link`: return whether owner/landlord approval is required and where it should be actioned.
- `job_status`: let Sally answer "what is happening with my booking?" quickly.

## Latency Targets

| Tool type | Target |
| --- | --- |
| Price estimate | Under 2 seconds |
| Schedule preview | Under 3 seconds |
| Warranty/repeat issue review | Under 3 seconds for simple lookup; manual-review fallback if deeper review is needed |
| Create lead/work order | Under 2 seconds for acknowledgement |
| Quote option generation | Under 5 seconds; if slower, Sally should acknowledge and continue while the app/owner receives options |

## Customer Safety Rules

- Sally should never mention n8n, George, Wally, Nelly, tools, CRM, or database to customers.
- Sally should not invent prices, availability, warranty outcomes, licence details, or final confirmations.
- Sally should say the tradie confirms final scope and final price before work begins.
- Sally should collect and confirm email spelling before creating a booking request.
- Sally should call tools quietly and speak only the customer-safe response values returned by n8n.
