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

## Next Phase After Intake

- Tradie accept/auto-accept toggle and tradie job workbench.
- Parts, time, before/after photos, completion evidence, warranty record, and compliance report generation.
- Tenant or owner completion acknowledgement.
- Invoice notification and payment link through Penny/payment workflows.
- Admin exception queue for failed warranty checks, low-confidence matches, no availability overlap, and payment issues.
