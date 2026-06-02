# 1pacent-app

Flutter app and n8n workflow deployment assets for the 1pacent tradie/rental maintenance MVP.

## Key Paths

- `lib/` - Flutter app code.
- `docs/` - API contracts and UAT readiness notes.
- `n8n/` - source-controlled n8n deployment scripts, workflow runbook, and database schema.

## Vercel

Vercel builds the Flutter web app with `scripts/vercel-build.sh`.

Expected Vercel settings:

- Build command: `bash scripts/vercel-build.sh`
- Output directory: `build/web`
- Install command: handled by `vercel.json`
