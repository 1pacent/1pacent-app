# 1pacent MVP Intake Flow

This milestone makes the customer app feel like a guided booking flow while n8n remains the workflow execution layer.

## Uber Ride Pattern Mapped To 1pacent

| Uber step | 1pacent equivalent | Primary persona | n8n responsibility |
| --- | --- | --- | --- |
| Log in | Identify the user, persona, and property relationship | Tenant, owner, landlord, PM, tradie, public customer | Resolve relationship IDs, property scenario, approval path |
| Where to? | What service is needed? Sally triages issue, urgency, warranty, and availability | Tenant, owner, public customer | Work-order intake, Wally warranty check, availability capture |
| Select vehicle | Pick a service option from matched quote choices | Owner or landlord | Quote matching, trust score, cost score, tradie availability |
| Request | Confirm selected option | Owner or landlord | Quote approval, George schedule lock, notification |
| Wait for driver | Wait for tradie acceptance or auto-accept | Tradie, owner, tenant | Auto/manual accept policy, booking monitor |
| Open GBox | Active booked job | All related parties | Job status, audit trail, next-step orchestration |

## Modular Product Surfaces

The Uber-style product model separates the customer app, driver app, admin panel, and analytics layer. For 1pacent, those modules map as follows.

| Uber-style module | 1pacent module | MVP purpose |
| --- | --- | --- |
| Passenger app | Customer/property app | Tenants, owners, landlords, public customers, and PMs create, approve, and track maintenance workflows. |
| Driver app | Tradie workbench | Tradies manage availability, accept/manual-review jobs, submit quote details, collect evidence, and complete work. |
| Admin panel | Property manager/admin console | PMs and ops users review queues, exceptions, approvals, workflow failures, payments, and compliance status. |
| Analytics | Trust, SLA, payment, and workflow analytics | Track quote confidence, tradie reliability, warranty outcomes, response times, completion evidence, payment conversion, and exceptions. |

## Modular Workflow Mapping

| Uber module | 1pacent equivalent | n8n or system owner |
| --- | --- | --- |
| Sign up | Persona onboarding and relationship resolution | Auth/session plus Postgres relationship records |
| Aggregation | Sally triage and service classification | Sally workflow, trade/job type rules, Wally warranty check |
| Scheduler | Requester and tradie availability windows | George scheduling and calendar workflows |
| Promo | Discounts, warranty coverage, landlord charge policy | Future pricing/commercial workflows |
| Matching | Three quote options with availability, trust, cost, and confidence | Quote option workflow, tradie skills, trust score, commercial terms |
| Notification | Tenant/owner/landlord/tradie confirmations | n8n notifications, email/SMS/push bridge |
| Tracking | Job status, booking state, evidence, completion, invoice/payment state | Customer job status workflow |
| Payment | Invoice and payment request | Penny/payment workflows |
| Review | Tenant/owner feedback and trust score learning | Tenant feedback and trust score workflows |

## Intake UAT Acceptance Criteria

- Login selects a persona and the app derives the default property path from that persona.
- Tenant and owner-occupied requests both submit stable relationship IDs, not anonymous public payloads.
- Sally chat posts to the Sally n8n webhook and carries the logged-in persona/property context.
- Guided intake captures service need, urgency, requester availability, and property location in a small number of decisions.
- Intake payload requires warranty/repeat issue checks before non-warranty quote options are offered.
- Quote options are fetched from n8n, include availability/trust/confidence signals, and are not calculated in Flutter.
- Owner or landlord can approve a selected option in-app, which calls the n8n approval workflow.
- Tenant sees quote options/status but does not approve landlord-owned rental work.
- Successful approval transitions to an active job status link.
- Customer, tradie, admin, and analytics concerns stay separated so the Flutter app does not absorb workflow execution logic.

## Next Phase After Intake

- Tradie accept/auto-accept toggle and tradie job workbench.
- Parts, time, before/after photos, completion evidence, warranty record, and compliance report generation.
- Tenant or owner completion acknowledgement.
- Invoice notification and payment link through Penny/payment workflows.
- Admin exception queue for failed warranty checks, low-confidence matches, no availability overlap, and payment issues.
