# 1pacent App Architecture

1pacent is a rental maintenance and compliance orchestration platform with an Uber-style customer/tradie experience.

## Product framing

The app is not just a consumer tradie marketplace. The first commercial wedge is property-manager-led rental maintenance, landlord approvals, tenant scheduling, compliance evidence, quote accuracy, warranties, and faster payment.

## Runtime roles

- Flutter app: customer, tenant, landlord, property manager, and tradie experience.
- n8n: workflow orchestration, specialist internal agents, tools, and source-of-truth execution.
- Postgres: operational source of truth.
- Qdrant: semantic Authority Document and SME knowledge retrieval.
- ElevenLabs: Sally voice/chat agent for customer-facing intake.
- Caddy/VPS: web hosting and reverse proxy.

## Agent split

- Sally: the only customer-facing triage agent, hosted in ElevenLabs. Sally calls n8n tools for price, scheduling, warranty, lead/work-order creation, quote options, approval, and status.
- George: scheduling optimisation in n8n.
- Wally: warranty/repeat issue guardrails in n8n.
- Sparky: electrical SME support in n8n.
- Nelly: quote intelligence in n8n.
- Penny: payments and invoice workflow in n8n.
- Patricia: property manager workflow support in n8n.
- Leo: landlord approval workflow support in n8n.
- Quintino: skills, lifecycle management, improvement recommendations, and moat intelligence.

## Hosting target

- `app.1pacent.com`: Flutter web app.
- `api.1pacent.com`: API/n8n-facing backend edge later.
- `admin.1pacent.com`: admin console.
- `n8n.1pacent.com`: n8n editor/runtime.
- `www.1pacent.com`: public website.
