# UAT Readiness Notes

## Architecture rule

The Flutter app is the GUI for customers, tenants, landlords, property managers, tradies, and public users requesting tradie services. Reliable execution belongs in n8n workflows backed by Postgres. Flutter should collect intent, call webhooks, display returned state, and let n8n own decisions.

## Safe `gamora-sprint5` salvage

Keep and adapt:

- Persona routes and screen shells.
- Job status timeline UI.
- Warranty/repeat-issue banner UI.
- Quote list and quote acceptance UI.
- Tradie quote submission UI.
- Property manager dashboard UI.
- UAT guide/test-case structure.

Refactor before merge:

- Any invoice fallback generation.
- Any hardcoded labour/material quote split.
- Any hardcoded direct VPS/IP endpoint.
- Any local matching, scheduling, warranty, trust-score, or approval calculation.
- Any webhook path not present in n8n deployment scripts or API contracts.

## Current UAT slice

- `app.1pacent.com` should be hosted by Vercel.
- `api.1pacent.com` is the app-facing n8n/API base URL.
- `n8n.1pacent.com` remains the editor/runtime host.
- Job tracking links should use `/job-status?work_order_id=...`.
- Flutter job status reads from `GET /webhook/customer/job-status`.
- Quote options and quote approval call n8n rental quote-option workflows.
- Tradie quote submission is wired to the current rental quote-option workflow using
  its `tradie_options` input until a dedicated submit-quote webhook exists.
- Property manager UAT dashboard reads `GET /webhook/admin/ops-console/summary`
  and displays the n8n/Postgres-owned work queue.
- Rental intake workflow script has been patched so requester availability is
  normalised into `tenant_availability_windows` for both rental tenants and
  owner-occupied owners. Quote options then use those stored windows when
  matching against tradie capacity.

## Next build order

1. Deploy `deploy_rental_property_management_foundation.ps1` with `N8N_API_KEY`
   so the live n8n workflows receive the availability and approval-recipient
   contract updates.
2. Fix any live webhook response gaps found during smoke testing, especially empty
   response bodies on app-facing read endpoints.
3. Add UAT seed data and scripts for one end-to-end rental-maintenance loop.
4. Run the full UAT path: intake, status link, quote generation, quote approval,
   tradie quote submission, PM queue review, and final job status.
5. Add lightweight auth/persona gating for customer, PM, landlord, and tradie
   routes once the UAT flow is stable.
6. Deploy the Flutter web build through Vercel with the final `VERCEL_HERMES_TOKEN`
   and domain environment variables.
