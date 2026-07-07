# n8n lockdown runbook

Executes the "immediate server actions" from `docs/N8N_WORKFLOW_AUDIT.md`.
Everything here runs **on the VPS** (this repo can't reach the instance
directly, by design — and that's how it should stay).

## Step 1 — deactivate risky workflows (5 min)

```bash
# on the VPS, from a checkout of this repo (or scp the script over):
chmod +x n8n/lockdown/deactivate-workflows.sh

# preferred: via the n8n API (create a key: n8n UI -> Settings -> n8n API)
N8N_URL=https://<your-n8n-host> N8N_API_KEY=<key> \
  ./n8n/lockdown/deactivate-workflows.sh tier1   # TEST-* + fake auth trio

# then, when ready:
#   tier2 = ai4boards/sanctumboard/personal-assistant (migrate first if in use)
#   tier3 = legacy 1Pacent mock stubs (once nothing demos against them)
```

Deactivation is reversible from the n8n UI; nothing is deleted.

## Step 2 — take webhooks off the public internet (30 min)

Pick one (first is strongly preferred):

**A. Firewall (kills the whole class of issue):**
```bash
# allow only the API tier / your own IPs to reach n8n; adjust port (default 5678)
ufw status
ufw allow from <api-server-ip> to any port 5678 proto tcp
ufw deny 5678/tcp
# if n8n sits behind nginx/traefik on 443, restrict the vhost instead:
#   allow <api-server-ip>; deny all;   (nginx location block for /webhook*)
```

**B. Header auth on every remaining active webhook** (interim measure):
in each webhook node set Authentication -> Header Auth, one shared
credential, e.g. header `X-1Pacent-Internal` with a long random value.
The API tier sends the same header (`N8N_INTERNAL_AUTH_TOKEN` in
`apps/web/.env.example`).

## Step 3 — rotate credentials (after steps 1–2)

Rotate in the n8n credential store: ElevenLabs API key, Postgres
password(s), Google Calendar OAuth. They have sat behind unauthenticated
public endpoints; treat them as exposed.

## Step 4 — verify

```bash
# from OUTSIDE the VPS: every one of these must now fail (403/404/timeout)
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/webhook/auth/login -d '{}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/webhook/rental/work-orders/intake -d '{}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/webhook/landlord/approval -d '{}'
```

Re-export and commit to `n8n/export/` after the cleanup so the repo
reflects the locked-down state.
