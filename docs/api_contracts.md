# API Contracts

These contracts describe how the Flutter app should call the orchestration layer. The production base URL will move to `https://api.1pacent.com`; during early testing use the VPS fallback URL.

## Create rental work order

`POST /webhook/rental/work-orders/intake`

```json
{
  "source": "customer_app",
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
  ]
}
```

Expected response includes work order id, approval status, warranty/safety guardrails, and next action.

## Job status

`POST /webhook/customer/job-status`

```json
{
  "work_order_id": "WO-2026-000001"
}
```

## Sally chat

`POST /webhook/agents/sally/chat`

```json
{
  "conversation_id": "conv_123",
  "customer_id": "customer_123",
  "message": "I need an electrician",
  "channel": "app_chat"
}
```

## Warranty and electrical SME review

`POST /webhook/rental/warranty/review-with-sparky`

Used by workflows when a rental maintenance issue may be a repeat issue, warranty issue, or electrical safety issue.
