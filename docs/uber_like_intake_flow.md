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

## UX Design Principles For Intake

The Uber UX case-study pattern is useful because it focuses on personalisation, clear user flow, low-friction testing, and evidence-based iteration. For 1pacent, the design direction is:

- Personalise the request path from the user's relationship to the property. A tenant, owner-occupier, landlord, PM, tradie, and public customer should not see the same default actions.
- Ask only for the information needed at the current decision point. Use Sally to progressively gather issue, urgency, warranty clues, access availability, and approval context.
- Show the next decision clearly. Each step should have one obvious primary action: continue, match options, request this tradie, confirm booking, or track job.
- Make matching understandable. Quote option cards should explain why they are shown: price, availability overlap, trust score, warranty status, and confidence.
- Design for exceptions without making the happy path heavy. Examples: no availability overlap, warranty candidate found, low confidence, landlord approval pending, tradie manual acceptance required.
- Keep UI modules consistent. Reuse the same card, chip, status, and action patterns across customer, tradie, admin, and analytics surfaces.
- Avoid discriminatory or unsafe matching criteria. Match on trade skill, availability, warranty obligations, licensing/compliance, location/service area, and trust evidence.
- Test the actual task flow, not just screen appearance. The UAT target is a user reaching a successful booked job with minimal confusion.

## UAT UX Metrics

| Metric | Intake target |
| --- | --- |
| Task completion | Owner-occupied user can complete intake, choose an option, and book a job in one guided path. |
| Decision clarity | Tester can explain why each quote option was offered. |
| Time to request | Tester can reach quote options without hunting through unrelated persona actions. |
| Error recovery | Tester understands what happened when warranty, availability, or approval blocks the happy path. |
| Persona correctness | Tenant cannot approve landlord-owned rental work, while owner/landlord can approve their own relevant options. |
| Workflow ownership | n8n response data drives quote/status/approval states; Flutter does not invent execution results. |

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
