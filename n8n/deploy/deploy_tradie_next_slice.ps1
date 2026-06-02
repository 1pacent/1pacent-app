$ErrorActionPreference = "Stop"

$BaseUrl = "https://vmi3305336.contaboserver.net"
$ApiKey = $env:N8N_API_KEY
if (-not $ApiKey) {
    throw "Set N8N_API_KEY in the environment before running this script."
}

$Headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "accept" = "application/json"
}

$postgresCredential = @{
    id = "fTq1Q3oE59B59Y0Y"
    name = "Tradie App Postgres"
}

function New-WebhookNode($Name, $Path, $Method, $X, $Y) {
    return @{
        parameters = @{
            httpMethod = $Method
            path = $Path
            responseMode = "responseNode"
            options = @{}
        }
        type = "n8n-nodes-base.webhook"
        typeVersion = 2.1
        position = @([int]$X, [int]$Y)
        id = [guid]::NewGuid().ToString()
        name = $Name
        webhookId = [guid]::NewGuid().ToString()
    }
}

function New-CodeNode($Name, $Code, $X, $Y) {
    return @{
        parameters = @{ jsCode = $Code }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @([int]$X, [int]$Y)
        id = [guid]::NewGuid().ToString()
        name = $Name
    }
}

function New-PostgresNode($Name, $X, $Y) {
    return @{
        parameters = @{
            operation = "executeQuery"
            query = '={{$json.sql}}'
            options = @{}
        }
        type = "n8n-nodes-base.postgres"
        typeVersion = 2.6
        position = @([int]$X, [int]$Y)
        id = [guid]::NewGuid().ToString()
        name = $Name
        credentials = @{ postgres = $postgresCredential }
    }
}

function New-RespondNode($Name, $Body, $X, $Y) {
    return @{
        parameters = @{
            respondWith = "json"
            responseBody = $Body
            options = @{}
        }
        type = "n8n-nodes-base.respondToWebhook"
        typeVersion = 1.5
        position = @([int]$X, [int]$Y)
        id = [guid]::NewGuid().ToString()
        name = $Name
    }
}

function Upsert-WorkflowByName($WorkflowName, $Nodes, $Connections) {
    $all = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows?limit=100" -Headers $Headers -Method Get
    $existing = $all.data | Where-Object { $_.name -eq $WorkflowName } | Select-Object -First 1
    $payload = @{
        name = $WorkflowName
        nodes = $Nodes
        connections = $Connections
        settings = @{
            executionOrder = "v1"
            timezone = "Australia/Sydney"
            callerPolicy = "workflowsFromSameOwner"
            availableInMCP = $true
        }
    }
    $body = $payload | ConvertTo-Json -Depth 100

    if ($existing) {
        $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($existing.id)" -Headers $Headers -Method Put -Body $body -ContentType "application/json"
    } else {
        $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows" -Headers $Headers -Method Post -Body $body -ContentType "application/json"
    }
    Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($updated.id)/activate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
    return $updated
}

$statusLookupCode = @'
const raw = items[0]?.json ?? {};
const source = raw.query ?? raw.body ?? raw;
const reference = source.reference || source.lead_id || source.quote_id || source.job_id || source.invoice_id || source.customer_email || source.email || '';

function sql(value) {
  if (!value) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const query = `
WITH matched_leads AS (
  SELECT DISTINCT l.id
  FROM leads l
  LEFT JOIN customers c ON c.id = l.customer_id
  LEFT JOIN quotes q ON q.lead_id = l.id
  LEFT JOIN quote_versions qv ON qv.lead_id = l.id
  LEFT JOIN jobs j ON j.lead_id = l.id
  LEFT JOIN job_schedule_slots ss ON ss.lead_id = l.id OR ss.job_id = j.id
  LEFT JOIN invoices i ON i.job_id = j.id
  WHERE ${sql(reference)} IN (l.id, q.id, qv.id, j.id, ss.id, i.id, c.email, c.phone)
),
lead_rows AS (
  SELECT l.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
  FROM leads l
  LEFT JOIN customers c ON c.id = l.customer_id
  WHERE l.id IN (SELECT id FROM matched_leads)
),
quote_rows AS (
  SELECT q.* FROM quotes q WHERE q.lead_id IN (SELECT id FROM matched_leads)
),
quote_version_rows AS (
  SELECT qv.* FROM quote_versions qv WHERE qv.lead_id IN (SELECT id FROM matched_leads)
),
job_rows AS (
  SELECT j.* FROM jobs j WHERE j.lead_id IN (SELECT id FROM matched_leads)
),
schedule_rows AS (
  SELECT
    ss.*,
    t.name AS tradie_name,
    (ss.scheduled_start AT TIME ZONE 'Australia/Sydney') AS scheduled_start_local,
    (ss.scheduled_end AT TIME ZONE 'Australia/Sydney') AS scheduled_end_local
  FROM job_schedule_slots ss
  LEFT JOIN tradies t ON t.id = ss.tradie_id
  WHERE ss.lead_id IN (SELECT id FROM matched_leads)
     OR ss.job_id IN (SELECT id FROM job_rows)
),
invoice_rows AS (
  SELECT i.* FROM invoices i WHERE i.job_id IN (SELECT id FROM job_rows)
),
event_rows AS (
  SELECT event_type, entity_type, entity_id, created_at
  FROM workflow_events
  WHERE entity_id IN (
    SELECT id FROM matched_leads
    UNION SELECT id FROM quote_rows
    UNION SELECT id FROM quote_version_rows
    UNION SELECT id FROM job_rows
    UNION SELECT id FROM schedule_rows
    UNION SELECT id FROM invoice_rows
  )
  ORDER BY created_at ASC
)
SELECT jsonb_build_object(
  'success', EXISTS (SELECT 1 FROM matched_leads),
  'reference', ${sql(reference)},
  'leads', COALESCE((SELECT jsonb_agg(to_jsonb(lead_rows)) FROM lead_rows), '[]'::jsonb),
  'quotes', COALESCE((SELECT jsonb_agg(to_jsonb(quote_rows)) FROM quote_rows), '[]'::jsonb),
  'quote_versions', COALESCE((SELECT jsonb_agg(to_jsonb(quote_version_rows)) FROM quote_version_rows), '[]'::jsonb),
  'jobs', COALESCE((SELECT jsonb_agg(to_jsonb(job_rows)) FROM job_rows), '[]'::jsonb),
  'schedule_slots', COALESCE((SELECT jsonb_agg(to_jsonb(schedule_rows)) FROM schedule_rows), '[]'::jsonb),
  'invoices', COALESCE((SELECT jsonb_agg(to_jsonb(invoice_rows)) FROM invoice_rows), '[]'::jsonb),
  'timeline', COALESCE((SELECT jsonb_agg(to_jsonb(event_rows)) FROM event_rows), '[]'::jsonb)
) AS status;
`;

return [{ json: { reference, sql: query } }];
'@

$dashboardCode = @'
const query = `
SELECT jsonb_build_object(
  'generated_at', now(),
  'counts', jsonb_build_object(
    'customers', (SELECT count(*) FROM customers),
    'leads', (SELECT count(*) FROM leads),
    'quotes', (SELECT count(*) FROM quotes),
    'quote_versions', (SELECT count(*) FROM quote_versions),
    'jobs', (SELECT count(*) FROM jobs),
    'invoices', (SELECT count(*) FROM invoices),
    'inventory_items', (SELECT count(*) FROM inventory_items)
  ),
  'lead_statuses', COALESCE((SELECT jsonb_object_agg(status, count) FROM (SELECT status, count(*) FROM leads GROUP BY status) s), '{}'::jsonb),
  'quote_statuses', COALESCE((SELECT jsonb_object_agg(status, count) FROM (SELECT status, count(*) FROM quotes GROUP BY status) s), '{}'::jsonb),
  'job_statuses', COALESCE((SELECT jsonb_object_agg(status, count) FROM (SELECT status, count(*) FROM jobs GROUP BY status) s), '{}'::jsonb),
  'low_or_negative_inventory', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', name, 'quantity_on_hand', quantity_on_hand, 'reorder_level', reorder_level))
    FROM inventory_items
    WHERE quantity_on_hand <= reorder_level
  ), '[]'::jsonb),
  'recent_events', COALESCE((
    SELECT jsonb_agg(to_jsonb(e))
    FROM (
      SELECT event_type, entity_type, entity_id, created_at
      FROM workflow_events
      ORDER BY created_at DESC
      LIMIT 20
    ) e
  ), '[]'::jsonb)
) AS dashboard;
`;
return [{ json: { sql: query } }];
'@

$nellyCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw;

function moneyNumber(value) {
  const n = Number.parseFloat(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const labourHours = Number.parseFloat(body.labour_hours ?? body.estimated_labour_hours ?? 0) || 0;
const labourRate = Number.parseFloat(body.labour_rate ?? 120) || 120;
const calloutFee = moneyNumber(body.callout_fee ?? 150);
const materialsCost = moneyNumber(body.materials_cost ?? body.parts_cost ?? 0);
const desiredMarginPercent = Number.parseFloat(body.desired_margin_percent ?? 30) || 30;
const riskBufferPercent = Number.parseFloat(body.risk_buffer_percent ?? 10) || 10;

const labourCost = labourHours * labourRate;
const baseCost = calloutFee + labourCost + materialsCost;
const riskBuffer = baseCost * (riskBufferPercent / 100);
const subtotal = baseCost + riskBuffer;
const recommended = subtotal / (1 - desiredMarginPercent / 100);
const low = Math.round(recommended * 0.9);
const high = Math.round(recommended * 1.15);

const missing = [];
if (!body.lead_id) missing.push('lead_id');
if (!body.job_description) missing.push('job_description');
if (!labourHours) missing.push('labour_hours');
if (!materialsCost) missing.push('materials_cost');

const review = {
  agent: 'Nelly',
  status: missing.length ? 'quote_review_needs_info' : 'quote_review_ready',
  lead_id: body.lead_id || '',
  quote_id: body.quote_id || '',
  job_description: body.job_description || '',
  labour_hours: labourHours,
  labour_rate: labourRate,
  callout_fee: calloutFee,
  materials_cost: materialsCost,
  desired_margin_percent: desiredMarginPercent,
  risk_buffer_percent: riskBufferPercent,
  recommended_quote_amount: `$${Math.round(recommended)} incl GST estimate placeholder`,
  recommended_price_band: `$${low}-$${high}`,
  assumptions: [
    'Pricing is an internal recommendation only.',
    'Tradie must confirm scope and final price before customer acceptance.',
    'Unexpected variations require a revised quote and customer acceptance.',
  ],
  missing_information: missing,
};

return [{ json: review }];
'@

$statusNodes = @(
    (New-WebhookNode "Status Lookup Webhook" "status/lookup" "GET" 0 0),
    (New-CodeNode "Build Status Lookup SQL" $statusLookupCode 260 0),
    (New-PostgresNode "Read Status From Postgres" 520 0),
    (New-RespondNode "Respond Status" '={{$json.status}}' 780 0)
)
$statusConnections = @{
    "Status Lookup Webhook" = @{ main = @(, @(@{ node = "Build Status Lookup SQL"; type = "main"; index = 0 })) }
    "Build Status Lookup SQL" = @{ main = @(, @(@{ node = "Read Status From Postgres"; type = "main"; index = 0 })) }
    "Read Status From Postgres" = @{ main = @(, @(@{ node = "Respond Status"; type = "main"; index = 0 })) }
}

$dashboardNodes = @(
    (New-WebhookNode "Dashboard Summary Webhook" "reports/status-summary" "GET" 0 0),
    (New-CodeNode "Build Dashboard SQL" $dashboardCode 260 0),
    (New-PostgresNode "Read Dashboard From Postgres" 520 0),
    (New-RespondNode "Respond Dashboard" '={{$json.dashboard}}' 780 0)
)
$dashboardConnections = @{
    "Dashboard Summary Webhook" = @{ main = @(, @(@{ node = "Build Dashboard SQL"; type = "main"; index = 0 })) }
    "Build Dashboard SQL" = @{ main = @(, @(@{ node = "Read Dashboard From Postgres"; type = "main"; index = 0 })) }
    "Read Dashboard From Postgres" = @{ main = @(, @(@{ node = "Respond Dashboard"; type = "main"; index = 0 })) }
}

$nellyNodes = @(
    (New-WebhookNode "Nelly Quote Review Webhook" "agents/nelly/quote-review" "POST" 0 0),
    (New-CodeNode "Nelly Quote Review" $nellyCode 260 0),
    (New-RespondNode "Respond Nelly Review" '={{$json}}' 520 0)
)
$nellyConnections = @{
    "Nelly Quote Review Webhook" = @{ main = @(, @(@{ node = "Nelly Quote Review"; type = "main"; index = 0 })) }
    "Nelly Quote Review" = @{ main = @(, @(@{ node = "Respond Nelly Review"; type = "main"; index = 0 })) }
}

$results = @()
$results += Upsert-WorkflowByName "TRADIE-COMMS-091-Status-Lookup" $statusNodes $statusConnections
$results += Upsert-WorkflowByName "TRADIE-REPORTS-001-Status-Summary-Dashboard" $dashboardNodes $dashboardConnections
$results += Upsert-WorkflowByName "TRADIE-QUOTES-019-Nelly-Quote-Review" $nellyNodes $nellyConnections

$results | Select-Object name,id,active | ConvertTo-Json -Depth 5
