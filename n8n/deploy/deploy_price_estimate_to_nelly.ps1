$ErrorActionPreference = "Stop"

$BaseUrl = "https://vmi3305336.contaboserver.net"
$ApiKey = $env:N8N_API_KEY
if (-not $ApiKey) { throw "Set N8N_API_KEY in the environment before running this script." }

$Headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "accept" = "application/json"
}

$postgresCredential = @{
    id = "fTq1Q3oE59B59Y0Y"
    name = "Tradie App Postgres"
}

function New-NodeId { return [guid]::NewGuid().ToString() }

$normaliseCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw;

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    return value;
  }
  return '';
}

const tradeType = String(first(body.trade_type, body.trade, body.service_type, 'electrical')).toLowerCase();
const jobDescription = first(body.job_description, body.description, body.job_request, body.issue, '');
const location = first(body.customer_suburb, body.suburb, body.address, body.location, '');
const urgency = first(body.urgency, 'normal');
const requestedAtMs = Date.now();
const requestedAt = new Date(requestedAtMs).toISOString();

return [{
  json: {
    requested_at: requestedAt,
    requested_at_ms: requestedAtMs,
    target_sla_ms: Number(first(body.target_sla_ms, 5000)) || 5000,
    lead_id: first(body.lead_id, body.reference, ''),
    quote_id: first(body.quote_id, ''),
    trade_type: tradeType,
    job_description: jobDescription,
    customer_suburb: location,
    urgency,
    materials_cost: first(body.materials_cost, body.estimated_materials_cost, ''),
    labour_hours: first(body.labour_hours, body.estimated_labour_hours, ''),
    callout_fee: first(body.callout_fee, 150),
    source_agent: 'sally',
    source_tool: 'price_estimate',
  },
}];
'@

$formatCode = @'
const rec = items[0]?.json ?? {};
const original = $('Normalise Sally Price Request').first().json || {};
const requestedAtMs = Number(original.requested_at_ms || Date.now());
const respondedAtMs = Date.now();
const responseMs = Math.max(0, respondedAtMs - requestedAtMs);
const targetSlaMs = Number(original.target_sla_ms || 5000);
const low = Number(rec.recommended_low ?? rec.price_band_low ?? 0);
const high = Number(rec.recommended_high ?? rec.price_band_high ?? 0);
const callout = Number(rec.callout_fee ?? 150);
const fallback = !low || !high;

const lowOut = fallback ? 150 : low;
const highOut = fallback ? 350 : high;

return [{
  json: {
    estimate_available: true,
    currency: 'AUD',
    price_band_low: lowOut,
    price_band_high: highOut,
    indicative_price_band: rec.indicative_price_band || `$${lowOut}-$${highOut}`,
    callout_fee: callout,
    confidence_label: rec.confidence_label || (fallback ? 'low' : 'medium'),
    confidence_score: rec.confidence_score ?? null,
    evidence_count: rec.evidence_count ?? 0,
    recommendation_key: rec.recommendation_key || null,
    pricing_note: 'This is an indicative estimate only. Final pricing must be confirmed by the tradie before any work begins.',
    customer_message: rec.customer_message || `The indicative estimate is $${lowOut}-$${highOut}. The tradie will confirm the final quote before any work begins.`,
    risk_flags: rec.risk_flags || [],
    assumptions: rec.assumptions || [
      'Indicative estimate only',
      'Final price confirmed by tradie before work begins',
    ],
    source_agent: 'Nelly',
    source_request_agent: original.source_agent || 'sally',
    requested_at: original.requested_at || new Date(requestedAtMs).toISOString(),
    responded_at: new Date(respondedAtMs).toISOString(),
    response_ms: responseMs,
    target_sla_ms: targetSlaMs,
    quote_sla_met: responseMs <= targetSlaMs,
    quote_sla_label: responseMs <= targetSlaMs ? 'on_call_sla_met' : 'on_call_sla_missed',
  },
}];
'@

$slaSqlCode = @'
const result = items[0]?.json ?? {};

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const query = `
CREATE TABLE IF NOT EXISTS quote_sla_metrics (
  id uuid primary key default gen_random_uuid(),
  recommendation_key text,
  lead_id text references leads(id),
  quote_id text,
  source_agent text not null default 'sally',
  trade_type text,
  job_description text,
  requested_at timestamptz not null default now(),
  responded_at timestamptz not null default now(),
  response_ms integer,
  target_sla_ms integer not null default 5000,
  sla_met boolean,
  confidence_score numeric,
  confidence_label text,
  evidence_count integer,
  indicative_price_band text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_quote_sla_metrics_lead ON quote_sla_metrics(lead_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_quote_sla_metrics_sla ON quote_sla_metrics(sla_met, created_at desc);

INSERT INTO quote_sla_metrics (
  recommendation_key, lead_id, quote_id, source_agent, trade_type, job_description,
  requested_at, responded_at, response_ms, target_sla_ms, sla_met,
  confidence_score, confidence_label, evidence_count, indicative_price_band, status, payload
)
VALUES (
  ${sql(result.recommendation_key)},
  ${sql(result.lead_id)},
  ${sql(result.quote_id)},
  ${sql(result.source_request_agent || 'sally')},
  ${sql(result.trade_type)},
  ${sql(result.job_description)},
  ${sql(result.requested_at)},
  ${sql(result.responded_at)},
  ${num(result.response_ms)},
  ${num(result.target_sla_ms || 5000)},
  ${result.quote_sla_met ? 'true' : 'false'},
  ${num(result.confidence_score)},
  ${sql(result.confidence_label)},
  ${num(result.evidence_count)},
  ${sql(result.indicative_price_band)},
  ${sql(result.quote_sla_label)},
  ${jsonSql(result)}
);

INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
VALUES ('price_recommendation', ${sql(result.recommendation_key || result.lead_id || 'unknown')}, 'quote_sla_measured', ${jsonSql(result)});

SELECT jsonb_build_object('success', true, 'quote_sla_met', ${result.quote_sla_met ? 'true' : 'false'}, 'response_ms', ${num(result.response_ms)}) AS quote_sla_saved;
`;

return [{ json: { ...result, sql: query } }];
'@

$nodes = @(
    @{
        parameters = @{
            httpMethod = "POST"
            path = "price-estimate"
            responseMode = "responseNode"
            options = @{}
        }
        type = "n8n-nodes-base.webhook"
        typeVersion = 2.1
        position = @(0, 0)
        id = New-NodeId
        name = "Price Estimate"
        webhookId = "209be2a6-dbc1-4d33-8fef-dc7aba696a87"
    },
    @{
        parameters = @{ jsCode = $normaliseCode }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(240, 0)
        id = New-NodeId
        name = "Normalise Sally Price Request"
    },
    @{
        parameters = @{
            method = "POST"
            url = "http://localhost:5678/webhook/agents/nelly/price-recommendation"
            sendBody = $true
            contentType = "json"
            specifyBody = "json"
            jsonBody = '={{ JSON.stringify($json) }}'
            options = @{ timeout = 30000 }
        }
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
        position = @(500, 0)
        id = New-NodeId
        name = "Ask Nelly For Price"
    },
    @{
        parameters = @{ jsCode = $formatCode }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(760, 0)
        id = New-NodeId
        name = "Format Sally Price Response"
    },
    @{
        parameters = @{ jsCode = $slaSqlCode }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(1020, 180)
        id = New-NodeId
        name = "Build Quote SLA SQL"
    },
    @{
        parameters = @{
            operation = "executeQuery"
            query = '={{$json.sql}}'
            options = @{}
        }
        type = "n8n-nodes-base.postgres"
        typeVersion = 2.6
        position = @(1280, 180)
        id = New-NodeId
        name = "Save Quote SLA Metric"
        credentials = @{ postgres = $postgresCredential }
    },
    @{
        parameters = @{
            respondWith = "json"
            responseBody = '={{$json}}'
            options = @{}
        }
        type = "n8n-nodes-base.respondToWebhook"
        typeVersion = 1.5
        position = @(1020, -80)
        id = New-NodeId
        name = "Respond to Webhook"
    }
)

$connections = @{
    "Price Estimate" = @{ main = @(, @(@{ node = "Normalise Sally Price Request"; type = "main"; index = 0 })) }
    "Normalise Sally Price Request" = @{ main = @(, @(@{ node = "Ask Nelly For Price"; type = "main"; index = 0 })) }
    "Ask Nelly For Price" = @{ main = @(, @(@{ node = "Format Sally Price Response"; type = "main"; index = 0 })) }
    "Format Sally Price Response" = @{ main = @(, @(
        @{ node = "Respond to Webhook"; type = "main"; index = 0 },
        @{ node = "Build Quote SLA SQL"; type = "main"; index = 0 }
    )) }
    "Build Quote SLA SQL" = @{ main = @(, @(@{ node = "Save Quote SLA Metric"; type = "main"; index = 0 })) }
}

$workflow = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/71U5qZcC48H2aFhm" -Headers $Headers -Method Get

$payload = @{
    name = $workflow.name
    nodes = $nodes
    connections = $connections
    settings = @{
        executionOrder = "v1"
        timezone = "Australia/Sydney"
        callerPolicy = "workflowsFromSameOwner"
        availableInMCP = $true
    }
}

$body = $payload | ConvertTo-Json -Depth 100
$updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/71U5qZcC48H2aFhm" -Headers $Headers -Method Put -Body $body -ContentType "application/json"
Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/71U5qZcC48H2aFhm/activate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null

@{
    workflow = $updated | Select-Object name,id,active
    endpoint = "$BaseUrl/webhook/price-estimate"
    backend = "$BaseUrl/webhook/agents/nelly/price-recommendation"
} | ConvertTo-Json -Depth 8
