# n8n workflows

`export/` holds point-in-time exports of the production n8n instance so
the workflows are finally under version control. See
`docs/N8N_WORKFLOW_AUDIT.md` for the 2026-07-07 review: findings,
immediate server actions, and the keep/port/park/discard disposition of
all 190 workflows.

Rules going forward:

- n8n is an **internal worker** — no public webhook ingress. Every
  webhook must carry header auth until the firewall closes the port.
- No agent reasoning in n8n; deterministic side effects only.
- Re-export and commit here whenever workflows change on the instance:
  `n8n export:workflow --all --output=n8n-workflows-YYYY-MM-DD.json`
