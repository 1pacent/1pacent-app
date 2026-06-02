# n8n Workflows

This directory is the source-controlled home for 1pacent n8n workflow deployment assets.

## Layout

- `deploy/` - PowerShell scripts that create or update n8n workflows through the n8n API.
- `deploy/setup_tradie_postgres_vps.sh` - VPS helper for provisioning the Tradie App Postgres service.
- `database/tradie_app_schema.sql` - database schema used by the tradie/rental workflow stack.

Secrets and OAuth client files are intentionally not stored here.

## Deploying Workflows

Run deployment scripts from PowerShell with `N8N_API_KEY` set:

```powershell
$env:N8N_API_KEY = "..."
.\n8n\deploy\deploy_rental_property_management_foundation.ps1
.\n8n\deploy\deploy_customer_job_status.ps1
.\n8n\deploy\deploy_george_calendar_booking_workflow.ps1
.\n8n\deploy\deploy_sally_elevenlabs_voice_bridge.ps1
```

The deployment scripts upsert workflows by name, activate them, and should keep published n8n workflows aligned with GitHub.

Sally voice requires `ELEVENLABS_API_KEY` to be set on the n8n server
environment. The Flutter app calls
`POST /webhook/agents/sally/conversation-token`; n8n uses the server-side key to
request a short-lived ElevenLabs WebRTC token for the Sally agent. Do not put the
ElevenLabs API key in Flutter or client-side Vercel environment variables.

## VPS Database Setup

On the VPS:

```bash
cd /opt/n8n
chmod +x setup_tradie_postgres_vps.sh
./setup_tradie_postgres_vps.sh
```

The n8n Postgres credential should use:

```text
Host: tradie-postgres
Port: 5432
Database: tradie_app
User: tradie_app
SSL: disabled
```

## UAT-Critical Scripts

For the Flutter MVP UAT path, these scripts are currently the most important:

- `deploy_rental_property_management_foundation.ps1`
- `deploy_customer_job_status.ps1`
- `deploy_george_calendar_booking_workflow.ps1`
- `deploy_admin_ops_console_summary.ps1`
- `deploy_sally_elevenlabs_voice_bridge.ps1`

They cover intake, warranty/repeat checks, requester/tradie availability matching, quote options, approval, scheduling, customer job status, and the property-manager operations dashboard.
