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
        id = New-NodeId
        name = $Name
        webhookId = New-NodeId
    }
}

function New-ExecuteWorkflowTriggerNode($Name, $X, $Y) {
    return @{
        parameters = @{ inputSource = "passthrough" }
        type = "n8n-nodes-base.executeWorkflowTrigger"
        typeVersion = 1.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = $Name
    }
}

function New-CodeNode($Name, $Code, $X, $Y) {
    return @{
        parameters = @{ jsCode = $Code }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
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
        id = New-NodeId
        name = $Name
        credentials = @{ postgres = $postgresCredential }
    }
}

function New-HttpRequestNode($Name, $Method, $Url, $X, $Y, $JsonBody = $null) {
    $params = @{
        method = $Method
        url = $Url
        options = @{ timeout = 30000 }
    }
    if ($JsonBody) {
        $params.sendBody = $true
        $params.contentType = "json"
        $params.specifyBody = "json"
        $params.jsonBody = $JsonBody
    }
    return @{
        parameters = $params
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = $Name
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
        id = New-NodeId
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

$buildSqlCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw;

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }
  return '';
}

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}

function minutes(value, fallbackHours) {
  const n = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  if (Number.isFinite(n)) return Math.round(n);
  const h = Number(String(fallbackHours ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(h) ? Math.round(h * 60) : null;
}

function normaliseMaterials(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return value.split(/\n|,/).map((line) => {
      const text = line.trim();
      if (!text) return null;
      const match = text.match(/^(\d+(?:\.\d+)?)\s*x?\s+(.+)$/i);
      return {
        description: match ? match[2].trim() : text,
        quantity: match ? Number(match[1]) : 1,
      };
    }).filter(Boolean);
  }
  return [];
}

const jobId = first(body.job_id);
const leadId = first(body.lead_id);
const quoteId = first(body.quote_id);
const scheduleSlotId = first(body.schedule_slot_id);
const tradieId = first(body.tradie_id);
const actualDurationMinutes = minutes(first(body.actual_duration_minutes, body.labour_minutes), body.labour_hours);
const actualTravelMinutes = minutes(first(body.actual_travel_minutes, body.travel_minutes), body.travel_hours);
const finalInvoiceAmount = first(body.final_invoice_amount, body.final_amount, body.invoice_amount);
const confirmedQuote = first(body.confirmed_quote, body.confirmed_quote_amount, body.quote_amount);
const initialEstimate = first(body.initial_estimate, body.estimated_price_band);
const estimatedLabourHours = first(body.estimated_labour_hours);
const actualLabourHours = actualDurationMinutes === null ? first(body.actual_labour_hours, body.labour_hours) : (actualDurationMinutes / 60).toFixed(2);
const estimatedMaterialsCost = first(body.estimated_materials_cost);
const actualMaterialsCost = first(body.actual_materials_cost, body.materials_cost);
const varianceReason = first(body.variance_reason, body.completion_notes, body.tradie_notes);
const completionNotes = first(body.completion_notes, body.tradie_notes, body.notes);
const customerNotes = first(body.customer_notes);
const materials = normaliseMaterials(first(body.materials, body.parts, body.parts_used));

const missing = [];
if (!jobId && !leadId && !quoteId) missing.push('job_id_or_lead_id_or_quote_id');
if (actualDurationMinutes === null) missing.push('actual_duration_minutes');
if (actualTravelMinutes === null) missing.push('actual_travel_minutes');
if (!finalInvoiceAmount) missing.push('final_invoice_amount');
if (!varianceReason) missing.push('variance_reason');

const estimateNumber = Number(String(initialEstimate || '').match(/\d+(?:\.\d+)?/)?.[0] || NaN);
const quoteNumber = Number(String(confirmedQuote || '').replace(/[^0-9.]/g, ''));
const invoiceNumber = Number(String(finalInvoiceAmount || '').replace(/[^0-9.]/g, ''));
const quoteVariance = Number.isFinite(quoteNumber) && Number.isFinite(invoiceNumber) ? invoiceNumber - quoteNumber : null;
const quoteVariancePercent = Number.isFinite(quoteNumber) && quoteNumber !== 0 && quoteVariance !== null ? (quoteVariance / quoteNumber) * 100 : null;
const estimateVariance = Number.isFinite(estimateNumber) && Number.isFinite(invoiceNumber) ? invoiceNumber - estimateNumber : null;
const accuracyScore = quoteVariancePercent === null ? null : Math.max(0, Math.min(100, 100 - Math.abs(quoteVariancePercent)));

const materialSql = materials.map((material) => {
  const description = first(material.description, material.name, material.item, 'Material');
  const quantity = Number(first(material.quantity, material.qty, 1));
  const unitCost = first(material.unit_cost, material.unitCost);
  const totalCost = first(material.total_cost, material.totalCost, Number.isFinite(quantity) && unitCost ? Number(unitCost) * quantity : '');
  return `
INSERT INTO inventory_items (sku, name, category, quantity_on_hand, reorder_level, unit_cost)
VALUES (${sql(material.sku)}, ${sql(description)}, ${sql(material.category || 'job_material')}, 0, 0, ${num(unitCost)})
ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, unit_cost = COALESCE(EXCLUDED.unit_cost, inventory_items.unit_cost), updated_at = now();

WITH item AS (
  SELECT id FROM inventory_items
  WHERE (${sql(material.sku)} IS NOT NULL AND sku = ${sql(material.sku)})
     OR lower(name) = lower(${sql(description)})
  ORDER BY updated_at DESC
  LIMIT 1
),
update_inventory AS (
  UPDATE inventory_items
  SET quantity_on_hand = quantity_on_hand - ${Number.isFinite(quantity) ? quantity : 1}, updated_at = now()
  WHERE id = (SELECT id FROM item)
)
INSERT INTO job_materials (job_id, inventory_item_id, description, quantity, unit_cost, total_cost)
VALUES (${sql(jobId)}, (SELECT id FROM item), ${sql(description)}, ${Number.isFinite(quantity) ? quantity : 1}, ${num(unitCost)}, ${num(totalCost)});
`;
}).join('\n');

const query = `
CREATE TABLE IF NOT EXISTS job_actuals (
  id uuid primary key default gen_random_uuid(),
  job_id text,
  lead_id text references leads(id),
  quote_id text references quotes(id),
  tradie_id text references tradies(id),
  actual_start timestamptz,
  actual_end timestamptz,
  actual_duration_minutes integer,
  actual_travel_minutes integer,
  late_minutes integer,
  completion_notes text,
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS quote_accuracy_metrics (
  id uuid primary key default gen_random_uuid(),
  lead_id text references leads(id),
  quote_id text,
  trade_type text,
  initial_estimate text,
  confirmed_quote text,
  revised_quote text,
  final_invoice text,
  estimated_labour_hours numeric,
  actual_labour_hours numeric,
  estimated_materials_cost numeric,
  actual_materials_cost numeric,
  variance_reason text,
  accuracy_score numeric,
  created_at timestamptz not null default now()
);

WITH resolved AS (
  SELECT
    COALESCE(${sql(jobId)}, j.id, 'JOB-' || to_char(now(), 'YYYY-HH24MISS')) AS job_id,
    COALESCE(${sql(leadId)}, j.lead_id, q.lead_id) AS lead_id,
    q.id AS quote_id,
    COALESCE(${sql(tradieId)}, ss.tradie_id) AS tradie_id,
    COALESCE(l.trade_type, ${sql(body.trade_type)}) AS trade_type,
    ss.estimated_duration_minutes,
    ss.estimated_travel_minutes,
    q.current_amount,
    q.original_amount,
    j.customer_id
  FROM (SELECT 1) seed
  LEFT JOIN jobs j ON (${sql(jobId)} IS NOT NULL AND j.id = ${sql(jobId)}) OR (${sql(leadId)} IS NOT NULL AND j.lead_id = ${sql(leadId)}) OR (${sql(quoteId)} IS NOT NULL AND j.quote_id = ${sql(quoteId)})
  LEFT JOIN quotes q ON q.id = COALESCE(j.quote_id, ${sql(quoteId)}) OR q.id = (SELECT quote_id FROM quote_versions WHERE id = ${sql(quoteId)} LIMIT 1)
  LEFT JOIN leads l ON l.id = COALESCE(${sql(leadId)}, j.lead_id, q.lead_id)
  LEFT JOIN job_schedule_slots ss ON (${sql(scheduleSlotId)} IS NOT NULL AND ss.id = ${sql(scheduleSlotId)}) OR ss.job_id = j.id OR ss.lead_id = l.id
  ORDER BY j.updated_at DESC NULLS LAST, ss.updated_at DESC NULLS LAST
  LIMIT 1
),
upsert_job AS (
  INSERT INTO jobs (id, lead_id, quote_id, customer_id, status, completed_at, updated_at)
  SELECT job_id, lead_id, quote_id, customer_id, 'Job Complete - Actuals Captured', now(), now()
  FROM resolved
  ON CONFLICT (id) DO UPDATE SET
    lead_id = COALESCE(EXCLUDED.lead_id, jobs.lead_id),
    quote_id = COALESCE(EXCLUDED.quote_id, jobs.quote_id),
    customer_id = COALESCE(EXCLUDED.customer_id, jobs.customer_id),
    status = 'Job Complete - Actuals Captured',
    completed_at = COALESCE(jobs.completed_at, now()),
    updated_at = now()
  RETURNING id, lead_id, quote_id, customer_id
),
insert_actual AS (
  INSERT INTO job_actuals (
    job_id, lead_id, quote_id, tradie_id, actual_start, actual_end,
    actual_duration_minutes, actual_travel_minutes, late_minutes, completion_notes
  )
  SELECT
    job_id,
    lead_id,
    quote_id,
    tradie_id,
    ${sql(body.actual_start)},
    ${sql(body.actual_end)},
    ${actualDurationMinutes === null ? 'NULL' : actualDurationMinutes},
    ${actualTravelMinutes === null ? 'NULL' : actualTravelMinutes},
    ${num(body.late_minutes)},
    ${sql(completionNotes)}
  FROM resolved
  RETURNING id
),
insert_quote_accuracy AS (
  INSERT INTO quote_accuracy_metrics (
    lead_id, quote_id, trade_type, initial_estimate, confirmed_quote, revised_quote, final_invoice,
    estimated_labour_hours, actual_labour_hours, estimated_materials_cost, actual_materials_cost,
    variance_reason, accuracy_score
  )
  SELECT
    lead_id,
    quote_id,
    trade_type,
    COALESCE(${sql(initialEstimate)}, original_amount),
    COALESCE(${sql(confirmedQuote)}, current_amount),
    ${sql(body.revised_quote)},
    ${sql(finalInvoiceAmount)},
    COALESCE(${num(estimatedLabourHours)}, estimated_duration_minutes / 60.0),
    ${num(actualLabourHours)},
    ${num(estimatedMaterialsCost)},
    ${num(actualMaterialsCost)},
    ${sql(varianceReason)},
    ${accuracyScore === null ? 'NULL' : accuracyScore.toFixed(2)}
  FROM resolved
  RETURNING id
),
update_schedule AS (
  UPDATE job_schedule_slots
  SET status = 'completed_actuals_captured', updated_at = now()
  WHERE (${sql(scheduleSlotId)} IS NOT NULL AND id = ${sql(scheduleSlotId)})
     OR job_id = (SELECT job_id FROM resolved)
  RETURNING id
),
insert_workflow_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'job', job_id, 'job_actuals_captured', ${jsonSql({
    ...body,
    missing_information: missing,
    quote_variance: quoteVariance,
    quote_variance_percent: quoteVariancePercent,
    estimate_variance: estimateVariance,
    accuracy_score: accuracyScore,
    material_count: materials.length,
  })}
  FROM resolved
),
insert_agent_memory AS (
  INSERT INTO agent_memory (agent_key, agent_name, lead_id, job_id, memory_type, summary, payload)
  SELECT
    'george_foreman',
    'George Foreman',
    lead_id,
    job_id,
    'job_actuals_feedback',
    ${sql(`Actuals captured. Duration ${actualDurationMinutes ?? 'unknown'} minutes, travel ${actualTravelMinutes ?? 'unknown'} minutes, final invoice ${finalInvoiceAmount || 'unknown'}.`)},
    ${jsonSql({ ...body, quote_variance: quoteVariance, quote_variance_percent: quoteVariancePercent, accuracy_score: accuracyScore })}
  FROM resolved
),
insert_knowledge AS (
  INSERT INTO agent_knowledge_items (
    agent_key, collection_key, source_type, source_id, title, content, tags, trade_type,
    entity_type, entity_id, confidence, usefulness_score, payload
  )
  SELECT
    'quintino',
    'skills_intelligence',
    'job_actuals',
    job_id,
    'Job actuals captured for learning',
    ${sql(`Captured job actuals for future quote and schedule learning. Variance reason: ${varianceReason || 'not provided'}.`)},
    ARRAY['job_actuals','quote_accuracy','scheduling_feedback','moat'],
    trade_type,
    'job',
    job_id,
    0.85,
    CASE WHEN ${quoteVariancePercent === null ? 'NULL' : Math.abs(quoteVariancePercent).toFixed(2)} IS NULL THEN 5 ELSE LEAST(10, GREATEST(5, ${quoteVariancePercent === null ? '0' : Math.abs(quoteVariancePercent).toFixed(2)} / 5)) END,
    ${jsonSql({ ...body, quote_variance: quoteVariance, quote_variance_percent: quoteVariancePercent, accuracy_score: accuracyScore })}
  FROM resolved
)
SELECT jsonb_build_object(
  'success', ${missing.length ? 'false' : 'true'},
  'status', CASE WHEN ${missing.length ? 'true' : 'false'} THEN 'actuals_captured_with_missing_information' ELSE 'actuals_captured' END,
  'job_id', (SELECT job_id FROM resolved),
  'lead_id', (SELECT lead_id FROM resolved),
  'quote_id', (SELECT quote_id FROM resolved),
  'actual_duration_minutes', ${actualDurationMinutes === null ? 'NULL' : actualDurationMinutes},
  'actual_travel_minutes', ${actualTravelMinutes === null ? 'NULL' : actualTravelMinutes},
  'final_invoice_amount', ${sql(finalInvoiceAmount)},
  'quote_variance', ${quoteVariance === null ? 'NULL' : quoteVariance.toFixed(2)},
  'quote_variance_percent', ${quoteVariancePercent === null ? 'NULL' : quoteVariancePercent.toFixed(2)},
  'accuracy_score', ${accuracyScore === null ? 'NULL' : accuracyScore.toFixed(2)},
  'material_count', ${materials.length},
  'missing_information', ${jsonSql(missing)},
  'learning_events_created', true,
  'next_action', 'Quintino audit triggered to assess skill and workflow improvements.'
) AS actuals_capture_result;

${materialSql}
`;

return [{ json: { sql: query, missing_information: missing } }];
'@

$prepareAuditCode = @'
const result = items[0]?.json?.actuals_capture_result || items[0]?.json || {};
return [{
  json: {
    scope: 'job_actuals_learning_loop',
    trigger: 'job_actuals_captured',
    job_id: result.job_id || '',
    lead_id: result.lead_id || '',
    quote_id: result.quote_id || '',
  },
}];
'@

$buildResponseCode = @'
const actuals = $('Save Actuals And Learning Data').first().json?.actuals_capture_result || {};
const audit = items[0]?.json || {};
return [{
  json: {
    ...actuals,
    quintino_audit_triggered: true,
    quintino_audit_status: audit.status || audit.agent || 'triggered',
    quintino_snapshot_key: audit.snapshot_key || '',
  },
}];
'@

$toolNormaliseCode = @'
const raw = items[0]?.json ?? {};
return [{
  json: {
    job_id: raw.job_id || '',
    lead_id: raw.lead_id || '',
    quote_id: raw.quote_id || '',
    schedule_slot_id: raw.schedule_slot_id || '',
    tradie_id: raw.tradie_id || '',
    actual_duration_minutes: raw.actual_duration_minutes || raw.labour_minutes || '',
    actual_travel_minutes: raw.actual_travel_minutes || raw.travel_minutes || '',
    final_invoice_amount: raw.final_invoice_amount || raw.invoice_amount || '',
    confirmed_quote: raw.confirmed_quote || raw.quote_amount || '',
    initial_estimate: raw.initial_estimate || '',
    actual_materials_cost: raw.actual_materials_cost || raw.materials_cost || '',
    materials: raw.materials || raw.parts || [],
    variance_reason: raw.variance_reason || raw.completion_notes || '',
    completion_notes: raw.completion_notes || raw.tradie_notes || '',
    customer_notes: raw.customer_notes || '',
  },
}];
'@

$nodes = @(
    (New-WebhookNode "Job Actuals Capture Webhook" "jobs/actuals/capture" "POST" 0 0),
    (New-CodeNode "Build Actuals SQL" $buildSqlCode 260 0),
    (New-PostgresNode "Save Actuals And Learning Data" 520 0),
    (New-CodeNode "Prepare Quintino Audit Trigger" $prepareAuditCode 780 0),
    (New-HttpRequestNode "Trigger Quintino Audit" "POST" "http://localhost:5678/webhook/agents/quintino/skills-audit" 1040 0 "={{ JSON.stringify(`$json) }}"),
    (New-CodeNode "Build Actuals Response" $buildResponseCode 1300 0),
    (New-RespondNode "Respond Actuals Captured" '={{ JSON.stringify($json) }}' 1560 0)
)

$connections = @{
    "Job Actuals Capture Webhook" = @{ main = @(, @(@{ node = "Build Actuals SQL"; type = "main"; index = 0 })) }
    "Build Actuals SQL" = @{ main = @(, @(@{ node = "Save Actuals And Learning Data"; type = "main"; index = 0 })) }
    "Save Actuals And Learning Data" = @{ main = @(, @(@{ node = "Prepare Quintino Audit Trigger"; type = "main"; index = 0 })) }
    "Prepare Quintino Audit Trigger" = @{ main = @(, @(@{ node = "Trigger Quintino Audit"; type = "main"; index = 0 })) }
    "Trigger Quintino Audit" = @{ main = @(, @(@{ node = "Build Actuals Response"; type = "main"; index = 0 })) }
    "Build Actuals Response" = @{ main = @(, @(@{ node = "Respond Actuals Captured"; type = "main"; index = 0 })) }
}

$actualsWorkflow = Upsert-WorkflowByName "TRADIE-JOBS-046-Capture-Job-Actuals-Learning-Loop" $nodes $connections

$toolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Job Actuals Tool Is Called" 0 0),
    (New-CodeNode "Normalise Job Actuals Tool Input" $toolNormaliseCode 260 0),
    (New-HttpRequestNode "Call Job Actuals Endpoint" "POST" "http://localhost:5678/webhook/jobs/actuals/capture" 520 0 "={{ JSON.stringify(`$json) }}")
)

$toolConnections = @{
    "When Job Actuals Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Job Actuals Tool Input"; type = "main"; index = 0 })) }
    "Normalise Job Actuals Tool Input" = @{ main = @(, @(@{ node = "Call Job Actuals Endpoint"; type = "main"; index = 0 })) }
}

$toolWorkflow = Upsert-WorkflowByName "TRADIE-TOOL-Job-Actuals-Capture" $toolNodes $toolConnections

@{
    actuals_workflow = $actualsWorkflow | Select-Object name,id,active
    tool_workflow = $toolWorkflow | Select-Object name,id,active
    endpoint = "$BaseUrl/webhook/jobs/actuals/capture"
} | ConvertTo-Json -Depth 10
