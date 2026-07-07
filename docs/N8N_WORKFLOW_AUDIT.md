# n8n workflow audit — export of 2026-07-07

Source: full export from the production n8n instance (190 workflows,
1.6 MB). Raw export versioned at `n8n/export/n8n-workflows-2026-07-07.json`.
This extends Developer Brief v2 §1 with evidence from the live instance —
the original audit saw 39 deploy scripts; the instance actually runs
**~120 active workflows**.

## Headline findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| W1 | **Every webhook is unauthenticated.** All ~120 active webhook endpoints have no `authentication` set. Confirms and *extends* B2. | `auth=NONE` on 100 % of webhook nodes | Launch-blocker (known: B2) |
| W2 | **Approver identity from request body, live in production.** `TRADIE-RENTAL-106-Approve-Quote-Option-Lock-Slot` reads `body.approved_by` (fallback: `body.landlord_name`, then literally `'landlord'`) on a public unauthenticated endpoint. | node "Build Rental Quote Option Approval SQL" | Launch-blocker (known: B2) |
| W3 | **The LLM fills in the approver field.** `TRADIE-AGENT-923-Quintino` passes `$fromAI('approved_by', 'approver if promoted')` — the model literally writes the approval attribution. Same pattern in the message-template lifecycle tool. | `$fromAI('approved_by', …)` in agent tool wiring | High — AI-as-approver antipattern |
| W4 | **72 workflows execute string-concatenated SQL** built in JS code nodes (`postgres` node running `={{$json.sql}}`), reachable from unauthenticated public webhooks. The only injection defence is a hand-rolled `''` escape helper repeated per workflow. | e.g. TRADIE-RENTAL-101/103/106, CORE-9xx series | High |
| W5 | **Fake auth endpoints are live.** `1Pacent-Auth-Login` accepts *any* email/password and returns a hand-assembled pseudo-JWT (`…'.demo'`); `1Pacent-Auth-Register`/`-Refresh` are the same class of stub. If any client trusts these tokens, authentication is decorative. | node "BuildAuthLogin": “Demo auth - accept any email/password” | High |
| W6 | **The 21 `1Pacent-*` webhooks are mostly mock stubs**, not a backend: hardcoded `quote_amount: 420.00`, `tradie_name: "Mike's Electrical"`, keyword-`if` "Sally" chat. They exist to make the Flutter demo look alive. | 1Pacent-Landlord-Approval, 1Pacent-Sally-Chat, etc. | Medium — informs salvage: little to port |
| W7 | **Three unrelated products share the instance**: ~25 workflows for ai4boards, sanctumboard-agedcare, AGENTPAYS, plus a personal assistant with Telegram/hermes wiring. A breach of any one exposes all. | workflow names | Medium — isolation/blast radius |
| W8 | **Six `TEST-*` scratch workflows are ACTIVE** on the production instance. | TEST-UNIQUE/EXPR/BARE/HB/OBJ/OBJ2 | Low — hygiene |
| W9 | Duplicate workflows exist in active+inactive pairs (e.g. RENTAL-100 ×3, QUOTES-025 ×2, George-Calendar ×2), so behaviour depends on which copy owns the webhook path. | duplicate names in export | Low — hygiene |

**What is done right:** no API keys or bearer tokens are embedded in
workflow JSON — external calls (e.g. ElevenLabs) use n8n's credential
store by reference (`httpHeaderAuth`), exactly the pattern the brief said
to preserve. Internal hostnames appear only as two Contabo VPS names and
docker-network IPs.

## Immediate server actions (do these on the VPS, ~1 hour)

1. **Deactivate the six `TEST-*` workflows and the fake auth trio**
   (`1Pacent-Auth-Login/-Register/-Refresh`) today. Nothing legitimate
   uses them; they are pure attack surface.
2. **Take n8n off the public internet**: firewall the webhook port to the
   API tier / localhost, or at minimum enable header-auth on every active
   webhook. (Brief v2 sprint-0, still outstanding on the instance.)
3. Deactivate the ~25 non-1Pacent workflows or move them to a separate
   n8n instance so products don't share a blast radius.
4. Rotate the n8n credential-store secrets (ElevenLabs, Postgres,
   Google Calendar) once the instance is locked down — they've been
   reachable behind unauthenticated endpoints for months.

## Disposition map (aligned with brief v2 §3)

| Workflow group | Count | Disposition | Where it goes in v2 |
|---|---|---|---|
| `1Pacent-*` mock stubs (auth, quotes, jobs, notifications) | 21 | **DISCARD** | Replaced by the real API tier + `packages/core`; nothing worth porting — they return hardcoded fixtures |
| `TRADIE-RENTAL-100–112` | 13 | **PORT the logic, retire the transport** | Intake/approval rules → `packages/core` (done: state machine + approval rules); quote-option approval → magic-link flow; legislation monitor → keep as internal scheduled n8n job (it has no public surface once webhooks close) |
| `TRADIE-SALLY-120-ElevenLabs-Voice-Token` | 1 | **PORT pattern** | Token-mint endpoint in the API tier; key stays server-side (already the good pattern) |
| Sally call-end, Leo/approval, Penny payments (`PAYMENTS-060–063`) | ~6 | **KEEP minimal, internal-only** | Deterministic side-effect workers called by the API tier; Penny's "AI agent" wrapper is unnecessary — the payment ops are CRUD |
| Agent platform (`CORE-9xx` memory/knowledge/skills/MCP, Quintino, Nelly, Mia, Sparky, George) | ~60 | **PARK** (deactivate webhooks, keep JSON) | Phase 2+ per brief §6; re-home reasoning in a future `packages/agents`, not in n8n |
| Authority documents / Qdrant RAG (`CORE-020–027`) | 9 | **PARK** | Phase 2 (RAG is out of MVP scope) |
| Legislation version monitor (`RENTAL-111/112`) | 2 | **KEEP internal** | Genuinely valuable for the compliance moat: monthly check that VIC rules haven't changed; wire its output to the compliance catalogue review process |
| Other products (ai4boards, sanctumboard, AGENTPAYS, personal assistant) | ~25 | **OUT OF SCOPE** | Separate instance/repo |
| `TEST-*` | 6 | **DELETE** | — |

## How this shaped the v2 codebase

- The intake/approval/urgency rules embedded in RENTAL-101/106 now live
  as tested pure functions in `packages/core` (`approvals/rules.ts`,
  `requests/urgency.ts`, state machine with actor guards) — the approver
  can never again arrive as a body string, and `auto_approve` can only be
  fired by the system.
- The per-workflow hand-rolled SQL builders are replaced by parameterised
  queries behind the API tier; the `events` table trigger makes audit
  rows tamper-proof.
- The defensive `first(...)` fallback helper seen in every code node is
  ported as `firstOf()` in `packages/core/src/parse.ts`.
- n8n's remaining role is exactly what it's good at: internal, scheduled,
  deterministic side effects (legislation monitor, notification fan-out)
  with **no public ingress**.

## Addendum (2026-07-07): two new workflows added

`1PACENT-SALLY-DISPATCH-QUOTES` and `1PACENT-SALLY-DISPATCH-NOTIFY` were
created on this instance via the Public API, following exactly the pattern
this audit recommended: header-auth webhooks, no reasoning, no DB writes,
API-tier-triggered only. See `n8n/workflows/README.md` for full detail.

Before creating them, this instance's workflow list was checked via the
Public API for path collisions with the ~120 existing workflows (the
`X-N8N-API-KEY` used only had visibility into 14 workflows — the
`1Pacent-*`/`TRADIE-*`/`RENTAL-*` workflows from this audit belong to a
*different* n8n user account on the same instance, being manually
re-imported by the project owner at time of writing; n8n scopes workflow
visibility per-owning-user even on Community edition, not per-instance). No
collision was found against the visible set. Whoever finishes the
re-import of the audited workflows should independently confirm neither
`/webhook/1pacent-sally-dispatch-quotes` nor
`/webhook/1pacent-sally-dispatch-notify` collides with a re-imported path.
