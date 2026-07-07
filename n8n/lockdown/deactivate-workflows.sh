#!/usr/bin/env bash
# 1Pacent n8n lockdown — deactivates risky workflows on the production
# instance. Generated from the 2026-07-07 export; IDs are the instance's
# real workflow IDs. See docs/N8N_WORKFLOW_AUDIT.md for the rationale.
#
# Run ON THE VPS. Two modes:
#   API mode (preferred, no restart needed):
#     N8N_URL=https://<your-n8n-host> N8N_API_KEY=<key> ./deactivate-workflows.sh [tier1|tier2|tier3|all]
#     (create the key in n8n: Settings -> n8n API)
#   CLI mode (no API key; requires n8n CLI on the host/container):
#     MODE=cli ./deactivate-workflows.sh [tier1|tier2|tier3|all]
#     (if dockerised: docker exec -it <n8n-container> bash, then run inside,
#      or set CLI_PREFIX='docker exec <n8n-container>')
#
# Default is tier1 only. Nothing is deleted — deactivated workflows keep
# their JSON and can be re-enabled from the n8n UI.
set -euo pipefail

TIER="${1:-tier1}"
MODE="${MODE:-api}"
CLI_PREFIX="${CLI_PREFIX:-}"

# Tier 1 — pure attack surface, deactivate immediately:
#   6 TEST-* scratch workflows + the fake auth trio that accepts any
#   email/password and mints pseudo-JWTs.
TIER1=(
  "UmoJQFqNuglbQxrh:TEST-UNIQUE"
  "2ZaEUQrnK9ZbUIL1:TEST-EXPR"
  "skoHUQSH84Zv6dLA:TEST-BARE"
  "40k12NwoIlM0fDFx:TEST-HB"
  "B01DqoD972FKPz54:TEST-OBJ"
  "WuOQkwCyxGYTSjNY:TEST-OBJ2"
  "E3mO3Xk20jIKBojW:1Pacent-Auth-Login"
  "v6qYYMRR4Z1gMKGN:1Pacent-Auth-Register"
  "7wqARcSQmbaGQuQk:1Pacent-Auth-Refresh"
)

# Tier 2 — unrelated products sharing the instance (ai4boards,
# sanctumboard aged-care, personal assistant). Deactivate here, or better,
# migrate them to their own instance first if they're in production use.
TIER2=(
  "8okviZpfplRvhjt0:ai4boards-02-paper-quality-review"
  "WIn6Q5g6m6L4ElQK:ai4boards-03-meeting-cycle"
  "FROHM2b35a2qh2ye:ai4boards-04-director-briefing"
  "ARMcCXfw2xZgwOAl:ai4boards-06-notification-dispatcher"
  "1JWebAGe5iPUMEul:ai4boards-09-authority-monitoring"
  "0aQdeANNyJEOBtIM:Telegram-Pam-Board-AI"
  "Q1aAZz2c0u9to1kI:AI4BOARDS-001-Board-Meeting-Prep"
  "yh3eT2Xu2qNxvMlj:sanctumboard-agedcare-regulatory-rag"
  "BiSUfPRAfrejMIYV:sanctumboard-agedcare-clinical-governance"
  "LpWlT0oxlsKPedmQ:sanctumboard-agedcare-incident-dashboard"
  "RWHPH4NRrJOkvCVK:sanctumboard-agedcare-iat-governance"
  "L90NtA7rCoenNpQv:sanctumboard-agedcare-minute-generator"
  "eRX5cJscyE2eYXIW:sanctumboard-agedcare-compliance-tracker"
  "kl85rszRxTOJu73J:sanctumboard-agedcare-director-duty-audit"
  "85DMULl4RUbzJ2ti:sanctumboard-agedcare-assurance-dashboard"
)

# Tier 3 — the 1Pacent mock-stub webhooks that served the old Flutter
# demo (hardcoded fixtures). Deactivate once nothing demos against them;
# the new Next.js app never calls them.
TIER3=(
  "e1uRtV42szoE3oOQ:1Pacent-Job-Status"
  "BJOWwCXFR8FlfAam:1Pacent-Sally-Chat"
  "btj87mIHaroKQlTZ:1Pacent-Fetch-Quotes"
  "G2wyhqO69DKTbuoa:1Pacent-Landlord-Approval"
  "rL9jZaSU4GASTXpE:1Pacent-Warranty-Review"
  "5PHi8NA0fuVrPQMo:1Pacent-Trust-Passport"
  "afjQpAYbiK5woG2x:1Pacent-Accept-Quote"
  "XC2RIJQO5rKRFw04:1Pacent-Decline-Quote"
  "KU7StwBOoYQCltEu:1Pacent-Initiate-Payment"
  "NpzD4IPpM7VVVXK1:1Pacent-Submit-Review"
  "ieHoD3LarTVJw1YO:1Pacent-Update-Availability"
  "8OJzBlF0NnWOLAeN:1Pacent-Tradie-Jobs"
  "IZE780pviw9k9F0R:1Pacent-Submit-Quote"
  "ZgE5MlyLrVPeZLvE:1Pacent-Fetch-Notifications"
  "u0wWFIfIjBLJzlKu:1Pacent-Mark-Notifications-Read"
  "BlTaPsapaPrkQzU4:1Pacent-Upload-Photo"
  "v89jZsXzptJL2SJ6:1Pacent-PM-Fetch-Jobs"
)

case "$TIER" in
  tier1) TARGETS=("${TIER1[@]}") ;;
  tier2) TARGETS=("${TIER2[@]}") ;;
  tier3) TARGETS=("${TIER3[@]}") ;;
  all)   TARGETS=("${TIER1[@]}" "${TIER2[@]}" "${TIER3[@]}") ;;
  *) echo "usage: $0 [tier1|tier2|tier3|all]"; exit 1 ;;
esac

deactivate_api() {
  local id="$1" name="$2"
  local code
  code=$(curl -s -o /tmp/n8n-deactivate-resp.json -w '%{http_code}' \
    -X POST "${N8N_URL%/}/api/v1/workflows/${id}/deactivate" \
    -H "X-N8N-API-KEY: ${N8N_API_KEY}")
  if [[ "$code" == "200" ]]; then
    echo "deactivated  ${name} (${id})"
  else
    echo "FAILED ${code}  ${name} (${id}) — $(cat /tmp/n8n-deactivate-resp.json)"
  fi
}

deactivate_cli() {
  local id="$1" name="$2"
  if ${CLI_PREFIX} n8n update:workflow --id "$id" --active=false; then
    echo "deactivated  ${name} (${id})"
  else
    echo "FAILED  ${name} (${id})"
  fi
}

for entry in "${TARGETS[@]}"; do
  id="${entry%%:*}"
  name="${entry#*:}"
  if [[ "$MODE" == "cli" ]]; then
    deactivate_cli "$id" "$name"
  else
    : "${N8N_URL:?set N8N_URL, e.g. https://your-n8n-host}"
    : "${N8N_API_KEY:?set N8N_API_KEY (n8n Settings -> n8n API)}"
    deactivate_api "$id" "$name"
  fi
done

if [[ "$MODE" == "cli" ]]; then
  echo
  echo "NOTE: after CLI changes, restart n8n so active webhooks re-register:"
  echo "  docker restart <n8n-container>   (or systemctl restart n8n)"
fi
