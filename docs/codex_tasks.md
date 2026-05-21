# Codex Task Backlog

## Sprint 1: App foundation

- Confirm Flutter project builds for web.
- Implement Start Job form.
- Add payload builder and unit tests for rental work-order intake.
- Add job status screen wired to n8n.
- Add Sally chat screen wired to n8n text endpoint.

## Sprint 2: Trust and scheduling

- Add tenant availability capture.
- Show landlord approval state.
- Show matched quote options: cost, availability, trust score.
- Show Tradie Trust Passport.
- Add warranty/repeat issue banner when Wally or Sparky flags a job.

## Sprint 3: Payments and completion

- Add quote acceptance screen.
- Add invoice/payment status screen.
- Add job evidence summary.
- Add review request flow.

## Guardrails

- Do not hardcode secrets.
- Keep API contracts in `docs/api_contracts.md` aligned with n8n workflows.
- Build reusable modules for customer, tenant, landlord, property manager, and tradie personas.
- Treat Postgres as the source of truth and n8n as the orchestration layer.
