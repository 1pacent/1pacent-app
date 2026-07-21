# Zaivo — Property Manager Platform Integrations v1

*How Zaivo connects to a PM's existing platform to import their portfolio,
keep property counts in sync with their subscription tier, and (optionally)
write job outcomes back — while remaining the future maintenance platform, not
a plugin to theirs. Companion to `apps/web/src/lib/integrations/*`.*

> **Knowledge caveat:** exact endpoints/fields per vendor must be confirmed
> against each provider's *current* partner API docs (they change and most
> require partner approval). This document sets the architecture and the field
> mapping contract; the reference connector (PropertyMe-shaped) is the model.

---

## 1. The AU PM platform landscape & API capability review

| Platform | Market | API | Auth | Reads we need | Webhooks | Write-back | Partner approval |
|---|---|---|---|---|---|---|---|
| **PropertyMe** | Largest AU cloud PM | REST developer API | OAuth2 | properties, contacts, tenancies, maintenance/jobs | Partial (poll fallback) | Maintenance notes/jobs | Yes (developer program) |
| **Property Tree** (MRI) | Major cloud PM | MRI Platform / Property Tree API | OAuth2 / key | properties, tenancies, contacts, work orders | Some (via MRI platform) | Work orders | Yes (MRI partner) |
| **Console Cloud** | Major cloud PM | Console API | OAuth2 / key | properties, contacts, maintenance | Limited | Maintenance | Yes |
| **Reapit** | Agency + PM | Foundations API (well-documented) | OAuth2 | properties, contacts, tenancies | Yes (good) | Actions/notes | Yes (developer portal) |
| **Ailo / Managed / Kolmeo** | Newer, API-forward | REST | OAuth2 | properties, maintenance | Yes | Maintenance | Yes |

**Takeaways that shaped the design:**
- **OAuth2 is the norm; all require partner approval.** So connections are
  provisioned per-PM with vendor-issued credentials — stored **encrypted**.
- **Webhook coverage is uneven.** We therefore never rely on webhooks alone:
  every provider gets **scheduled reconciliation** as the source of truth,
  with webhooks as an accelerator when available.
- **Read is universally available; write-back varies and is intrusive.**
  Hence write-back is **off by default** and narrowly scoped to a maintenance
  note/outcome — never financial or tenancy mutation.

## 2. Design principles (non-negotiable)

1. **Zaivo is the future maintenance platform, not a plugin.** Default is
   **read-only import**. Nothing is written back to their system unless the PM
   explicitly flips **write-back ON** per connection. Write-back default =
   **DISABLED**, and even then is limited to a job-completion note/outcome.
2. **Minimum-necessary data. Never import:** date of birth, identity documents
   (licence/passport), or financial information (bank details, rent ledgers,
   arrears, payment methods, income). Enforced by a **field allowlist** — the
   mapper drops anything not on it, so a provider adding a new field can't leak
   PII by default.
3. **Encrypt credentials and tenant data at rest.** API credentials/tokens are
   AES-256-GCM encrypted (`INTEGRATION_ENC_KEY`); any imported tenant contact
   used for access coordination is stored encrypted and minimised.
4. **Property count feeds the tier.** Every sync recomputes the PM's actual
   property count and checks it against their subscription `property_cap`;
   over-cap raises a nudge/event (never silently blocks jobs).
5. **Disconnection & deletion are first-class.** A PM can disconnect (stop
   sync, purge credentials) and request deletion (purge imported external data
   and the credential record) — an auditable workflow.

## 3. Architecture

```
  PM's platform (PropertyMe / Property Tree / Console / Reapit / …)
        │  OAuth2 (partner creds, encrypted at rest)
        ▼
  ┌─────────────── Zaivo Integration layer ───────────────┐
  │  Connector (per provider) — implements PmConnector      │
  │    listProperties() → ExternalProperty[]  (READ)        │
  │    (optional) pushJobOutcome()            (WRITE-BACK)  │
  │                     │                                   │
  │   PII allowlist mapper  ── drops DOB / ID / financial   │
  │                     ▼                                   │
  │   Sync orchestrator:                                    │
  │     • bulk import (initial)                             │
  │     • webhook ingest (accelerator, if available)        │
  │     • scheduled reconciliation (source of truth)        │
  │     • property-count → tier-cap check                   │
  └──────────────────────────┬────────────────────────────┘
                             ▼
              properties (external_ref, source) + pm_integrations
```

**Three sync modes, layered:**
- **Bulk import** (on connect): pull the full portfolio → map → upsert
  `properties` with `external_ref` + `source`.
- **Webhooks** (`/api/integrations/[provider]/webhook`): near-real-time
  property created/updated/archived, when the vendor supports them.
- **Scheduled reconciliation** (cron): the authority — re-pull, diff, add new,
  mark archived, recompute count vs cap. Catches anything webhooks missed.

## 4. Data mapping (the allowlist)

`ExternalProperty` — the **only** shape that crosses the boundary:

| Zaivo field | From PM platform | Notes |
|---|---|---|
| `externalId` | property id | join key for reconciliation |
| `addressLine1`, `suburb`, `state`, `postcode` | property address | matched to Geoscape/GNAF where possible |
| `propertyType` | dwelling type | optional |
| `managedFromDate` | management start | optional |
| `maintenanceContactName` (encrypted) | on-site/tenant contact | **only** a name for access coordination |
| `maintenanceContactPhone` (encrypted) | contact phone | minimised; access coordination only |

**Explicitly dropped, always:** date of birth, identity/licence/passport
numbers, bank/payment details, rent amount, arrears, ledgers, owner financials,
income, any field not on the allowlist above.

## 5. Lifecycle & safety workflows

- **Connect:** operator/PM supplies vendor-approved credentials → encrypted →
  `pm_integrations` row (`status: connected`, `write_back_enabled: false`) →
  bulk import runs.
- **Write-back toggle:** off by default; PM/operator can enable per connection.
  When on, only a **job-completion outcome/note** is pushed — never tenancy or
  money. `maybeWriteBack()` no-ops unless the flag is on.
- **Reconcile (scheduled):** diff + cap check; emits
  `integration_reconciled` / `over_cap_detected` events.
- **Disconnect:** `status: disconnected`, credentials purged, sync stops;
  imported properties retained (they may have live jobs) unless deletion is
  also requested.
- **Delete (GDPR/APP-style):** purge the credential record and the imported
  external mapping/tenant data; an auditable `integration_deleted` event.

## 6. Status

Built (this release): schema, `PmConnector` interface, AES-256-GCM credential
encryption, PII allowlist mapper, sync/reconcile/cap-check orchestrator,
webhook endpoint, connect/disconnect/delete service, write-back gate (default
OFF), and a **PropertyMe-shaped reference connector**. Other providers are
registered stubs with documented endpoints.

Needs vendor partner credentials to go live per provider: finalise each
connector's field mapping and OAuth against the provider's current API, obtain
partner approval, set `INTEGRATION_ENC_KEY`. No live vendor connection is
active yet.
