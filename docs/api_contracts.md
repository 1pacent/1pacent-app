# API Contracts

These contracts describe how the Flutter app calls the orchestration layer. Flutter is a persona-facing GUI only: n8n and Postgres own workflow execution, status transitions, quote matching, approvals, warranty decisions, scheduling, payments, and audit state.

Production base URL: `https://api.1pacent.com`.

## Create rental work order

`POST /webhook/rental/work-orders/intake`

```json
{
  "source": "customer_app",
  "property_scenario": "rental",
  "requester_role": "tenant",
  "approval_recipient_role": "landlord",
  "agency_id": "AGENCY-DEMO-001",
  "property_id": "PROP-DEMO-002",
  "tenant_id": "TENANT-DEMO-002",
  "landlord_id": "LANDLORD-DEMO-002",
  "trade_type": "electrical",
  "job_type": "power_point_install",
  "description": "Install two new power points in the kitchen",
  "urgency": "normal",
  "estimated_amount": 360,
  "tenant_availability": [
    "2026-05-25 09:00-11:00",
    "2026-05-25 13:00-15:00"
  ],
  "requester_availability": [
    "2026-05-25 09:00-11:00",
    "2026-05-25 13:00-15:00"
  ],
  "warranty_check_required": true,
  "quote_matching_requires_availability_overlap": true
}
```

Expected response includes work order id, approval status, warranty/safety guardrails, and next action.

The same endpoint must support `property_scenario: "owner_occupied"` with
`requester_role: "owner"`, `approval_recipient_role: "owner"`, and
`owner_availability`. For rentals, the requester may be the tenant and approval
goes to the landlord. For owner occupied homes, the owner is both requester and
approver. In both scenarios, n8n should run warranty/repeat-issue/safety checks
before quote matching and should only present quote options whose tradie windows
can match the renter/owner availability.

## Job status

`GET /webhook/customer/job-status?work_order_id=WO-2026-000001`

The Flutter tracking route accepts n8n-generated links in the form:

`https://app.1pacent.com/job-status?work_order_id=WO-2026-000001`

Expected response should include a status key, reference/work order id, description, next action, optional landlord approval status, optional scheduled window, and optional warranty/safety guardrails.

## Legacy Sally app-chat bridge

`POST /webhook/agents/sally/chat`

This endpoint is a temporary Flutter text-chat bridge for UAT. The intended
production path is that Sally runs in ElevenLabs for both voice and chat, then
Sally calls direct n8n tools such as `price_estimate`, `create_lead`, and
`george_schedule_recommendation`.

```json
{
  "conversation_id": "conv_123",
  "customer_id": "customer_123",
  "message": "I need an electrician",
  "channel": "app_chat"
}
```

## Sally ElevenLabs voice token

`POST /webhook/agents/sally/conversation-token`

Flutter calls this n8n endpoint before starting a Sally voice session. n8n then
calls ElevenLabs using the key injected into the workflow at deployment time, so
the key is never exposed in the app or Vercel build output.

```json
{
  "source": "customer_app",
  "conversation_id": "sally-uat-123",
  "agent_id": "agent_4601krtt5j3xf26ac865kpe19yvp",
  "participant_name": "UAT Owner",
  "user": {
    "id": "OWNER-UAT-001",
    "name": "UAT Owner",
    "email": "owner.uat@1pacent.com",
    "persona": "Owner occupied",
    "property_id": "PROP-UAT-OWNER-001",
    "property_scenario": "owner_occupied"
  }
}
```

Expected response:

```json
{
  "success": true,
  "status_key": "voice_token_ready",
  "conversation_token": "short-lived-token",
  "agent_id": "agent_4601krtt5j3xf26ac865kpe19yvp",
  "connection_type": "webrtc",
  "next_action": "Start the ElevenLabs WebRTC client session with conversation_token."
}
```

The n8n deployment script is
`n8n/deploy/deploy_sally_elevenlabs_voice_bridge.ps1`. Set
`ELEVENLABS_API_KEY` in the PowerShell session before running that script.

This token endpoint does not host Sally in n8n. It only allows Flutter to start
an ElevenLabs Sally session without exposing the ElevenLabs API key.

## Property manager operations summary

`GET /webhook/admin/ops-console/summary?tenant_id=TENANT-001&limit=10`

The Flutter `/pm` route renders the operational queue returned by n8n/Postgres.
Expected response may be either a root object or an `ops_console` wrapper with
`generated_at`, `tenant_id`, `pipeline`, `payments`, `scheduling`, `quotes`, and
`recent_work`.

`recent_work` should contain recent `leads`, `jobs`, and `payments`. Flutter links
rows into the n8n-backed job status route using `lead_id` or `job_id`; it does
not own counts, statuses, payment records, quote records, scheduling state, or
operator decisions.

## Warranty and electrical SME review

`POST /webhook/rental/warranty/review-with-sparky`

Used by workflows when a rental maintenance issue may be a repeat issue, warranty issue, or electrical safety issue.

## Rental quote options

`POST /webhook/rental/quote-options/generate`

```json
{
  "work_order_id": "WO-2026-000001"
}
```

Expected response includes `approval_id`, `options`, and `next_action`. Each option should include `option_id`, `quote_amount`, `tradie_id`, optional `company_id`, schedule window, and score fields that n8n/Postgres calculated.

For UAT, the tradie quote submission screen also posts to this endpoint using the workflow's `tradie_options` input. Flutter captures the tradie's proposed price and service window; n8n/Postgres still calculate option ranking, landlord approval records, and next actions.

```json
{
  "work_order_id": "WO-2026-000001",
  "tradie_options": [
    {
      "tradie_id": "TRADIE-DEMO-001",
      "company_id": "COMPANY-DEMO-001",
      "tradie_name": "Demo Electrician",
      "amount": 360,
      "scheduled_start": "2026-06-02T09:00:00",
      "scheduled_end": "2026-06-02T11:00:00",
      "source": "tradie_app_quote_submission",
      "line_items": []
    }
  ]
}
```

## Approve rental quote option

`POST /webhook/rental/quote-options/approve`

```json
{
  "approval_id": "APR-2026-000001",
  "option_id": "RQO-2026-000001-1",
  "approved_by": "app_user"
}
```

Expected response includes selected option id, work order id, schedule slot id, and next action. Flutter only confirms the user's choice; n8n updates approval, schedule, notification, and audit state.

## Contract guardrails

- Flutter may validate form completeness and render display formatting.
- Flutter must not calculate quote rankings, warranty outcomes, landlord approval state, invoice line items, payment status, tradie matching, or schedule optimisation.
- If the app needs a value for UAT, add it to an n8n response or Postgres-backed workflow rather than inventing it in Flutter.
- New screens from `gamora-sprint5` should be adapted as UI shells over these contracts, not merged with demo fallback business logic.
