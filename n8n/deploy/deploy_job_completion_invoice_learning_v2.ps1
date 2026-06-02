$ErrorActionPreference = "Stop"

$BaseUrl = "https://vmi3305336.contaboserver.net"
$ApiKey = $env:N8N_API_KEY
if (-not $ApiKey) { throw "Set N8N_API_KEY in the environment before running this script." }

$Headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "accept" = "application/json"
}

$gmailCredential = @{
    id = "Ar5b8h8vd29IBh1g"
    name = "Gmail account"
}

$postgresCredential = @{
    id = "fTq1Q3oE59B59Y0Y"
    name = "Tradie App Postgres"
}

function New-NodeId { return [guid]::NewGuid().ToString() }

function New-WebhookNode($X, $Y) {
    return @{
        parameters = @{
            httpMethod = "POST"
            path = "jobs/complete"
            responseMode = "responseNode"
            options = @{}
        }
        type = "n8n-nodes-base.webhook"
        typeVersion = 2.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Job Completion Webhook"
        webhookId = New-NodeId
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

function New-GmailNode($Name, $SendTo, $Subject, $Message, $X, $Y) {
    return @{
        parameters = @{
            sendTo = $SendTo
            subject = $Subject
            emailType = "text"
            message = $Message
            options = @{}
        }
        type = "n8n-nodes-base.gmail"
        typeVersion = 2.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = $Name
        credentials = @{ gmailOAuth2 = $gmailCredential }
    }
}

function New-RespondNode($Body, $X, $Y) {
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
        name = "Respond Job Complete"
    }
}

function Upsert-WorkflowByName($WorkflowName, $Nodes, $Connections) {
    $all = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows?limit=100" -Headers $Headers -Method Get
    $existing = $all.data | Where-Object { $_.name -eq $WorkflowName } | Select-Object -First 1
    if (-not $existing) { throw "Workflow not found: $WorkflowName" }
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
    $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($existing.id)" -Headers $Headers -Method Put -Body $body -ContentType "application/json"
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

function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

function minutes(value, fallbackHours) {
  const n = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  if (Number.isFinite(n)) return Math.round(n);
  const h = Number(String(fallbackHours ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(h) ? Math.round(h * 60) : null;
}

function moneyNumber(value) {
  const n = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
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

const now = new Date();
const jobId = first(body.job_id);
const leadId = first(body.lead_id);
const quoteId = first(body.quote_id);
const scheduleSlotId = first(body.schedule_slot_id);
const invoiceId = first(body.invoice_id, `INV-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const tradieId = first(body.tradie_id);
const actualDurationMinutes = minutes(first(body.actual_duration_minutes, body.labour_minutes), body.labour_hours);
const actualTravelMinutes = minutes(first(body.actual_travel_minutes, body.travel_minutes), body.travel_hours);
const finalInvoiceAmount = first(body.final_invoice_amount, body.final_amount, body.invoice_amount);
const confirmedQuote = first(body.confirmed_quote, body.confirmed_quote_amount, body.quote_amount);
const initialEstimate = first(body.initial_estimate, body.estimated_price_band);
const actualMaterialsCost = first(body.actual_materials_cost, body.materials_cost);
const estimatedMaterialsCost = first(body.estimated_materials_cost);
const completionNotes = first(body.completion_notes, body.tradie_notes, body.notes, 'Completed as agreed.');
const varianceReason = first(body.variance_reason, completionNotes);
const customerNotes = first(body.customer_notes);
const parts = normaliseMaterials(first(body.materials, body.parts, body.parts_used));
const actualLabourHours = actualDurationMinutes === null ? first(body.actual_labour_hours, body.labour_hours) : (actualDurationMinutes / 60).toFixed(2);

const missing = [];
if (!jobId && !leadId && !quoteId) missing.push('job_id_or_lead_id_or_quote_id');
if (actualDurationMinutes === null) missing.push('actual_duration_minutes');
if (actualTravelMinutes === null) missing.push('actual_travel_minutes');
if (!finalInvoiceAmount) missing.push('final_invoice_amount');

const quoteNumber = moneyNumber(confirmedQuote);
const invoiceNumber = moneyNumber(finalInvoiceAmount);
const quoteVariance = quoteNumber !== null && invoiceNumber !== null ? invoiceNumber - quoteNumber : null;
const quoteVariancePercent = quoteNumber !== null && quoteNumber !== 0 && quoteVariance !== null ? (quoteVariance / quoteNumber) * 100 : null;
const accuracyScore = quoteVariancePercent === null ? null : Math.max(0, Math.min(100, 100 - Math.abs(quoteVariancePercent)));

const materialCtes = parts.map((material, index) => {
  const description = first(material.description, material.name, material.item, 'Material');
  const quantity = Number(first(material.quantity, material.qty, 1));
  const unitCost = first(material.unit_cost, material.unitCost);
  const totalCost = first(material.total_cost, material.totalCost, Number.isFinite(quantity) && unitCost ? Number(unitCost) * quantity : '');
  const sku = first(material.sku, `AUTO-${description.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`);
  return `
material_item_${index} AS (
  INSERT INTO inventory_items (sku, name, category, quantity_on_hand, reorder_level, unit_cost)
  VALUES (${sql(sku)}, ${sql(description)}, ${sql(material.category || 'job_material')}, 0, 0, ${num(unitCost)})
  ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, unit_cost = COALESCE(EXCLUDED.unit_cost, inventory_items.unit_cost), updated_at = now()
  RETURNING id
),
material_inventory_update_${index} AS (
  UPDATE inventory_items
  SET quantity_on_hand = quantity_on_hand - ${Number.isFinite(quantity) ? quantity : 1}, updated_at = now()
  WHERE id = (SELECT id FROM material_item_${index})
  RETURNING id
),
job_material_${index} AS (
  INSERT INTO job_materials (job_id, inventory_item_id, description, quantity, unit_cost, total_cost)
  SELECT (SELECT job_id FROM resolved), (SELECT id FROM material_item_${index}), ${sql(description)}, ${Number.isFinite(quantity) ? quantity : 1}, ${num(unitCost)}, ${num(totalCost)}
  RETURNING id
)
`;
}).join(',\n');

const requestPayload = {
  ...body,
  invoice_id: invoiceId,
  missing_information: missing,
  quote_variance: quoteVariance,
  quote_variance_percent: quoteVariancePercent,
  accuracy_score: accuracyScore,
  material_count: parts.length,
};

const query = `
WITH resolved AS (
  SELECT
    COALESCE(${sql(jobId)}, j.id, 'JOB-' || to_char(now(), 'YYYY-HH24MISS')) AS job_id,
    COALESCE(${sql(leadId)}, j.lead_id, q.lead_id) AS lead_id,
    COALESCE(${sql(quoteId)}, j.quote_id, q.id) AS quote_id,
    COALESCE(${sql(tradieId)}, ss.tradie_id) AS tradie_id,
    COALESCE(l.trade_type, ${sql(body.trade_type)}, 'unknown') AS trade_type,
    COALESCE(j.customer_id, q.customer_id, l.customer_id) AS customer_id,
    COALESCE(c.name, ${sql(body.customer_name)}, 'Customer') AS customer_name,
    COALESCE(c.email, ${sql(body.customer_email)}, ${sql(body.email)}) AS customer_email,
    COALESCE(ss.estimated_duration_minutes, ${num(body.estimated_duration_minutes)}) AS estimated_duration_minutes,
    COALESCE(ss.estimated_travel_minutes, ${num(body.estimated_travel_minutes)}) AS estimated_travel_minutes,
    COALESCE(q.current_amount, ${sql(confirmedQuote)}) AS current_amount,
    COALESCE(q.original_amount, ${sql(initialEstimate)}) AS original_amount
  FROM (SELECT 1) seed
  LEFT JOIN jobs j ON (${sql(jobId)} IS NOT NULL AND j.id = ${sql(jobId)}) OR (${sql(leadId)} IS NOT NULL AND j.lead_id = ${sql(leadId)}) OR (${sql(quoteId)} IS NOT NULL AND j.quote_id = ${sql(quoteId)})
  LEFT JOIN quotes q ON q.id = COALESCE(${sql(quoteId)}, j.quote_id)
  LEFT JOIN leads l ON l.id = COALESCE(${sql(leadId)}, j.lead_id, q.lead_id)
  LEFT JOIN customers c ON c.id = COALESCE(j.customer_id, q.customer_id, l.customer_id)
  LEFT JOIN job_schedule_slots ss ON (${sql(scheduleSlotId)} IS NOT NULL AND ss.id = ${sql(scheduleSlotId)}) OR ss.job_id = j.id OR ss.quote_id = q.id
  ORDER BY j.updated_at DESC NULLS LAST, ss.updated_at DESC NULLS LAST
  LIMIT 1
),
upsert_job AS (
  INSERT INTO jobs (id, lead_id, quote_id, customer_id, status, completed_at, updated_at)
  SELECT job_id, lead_id, quote_id, customer_id, 'Job Complete - Invoice Sent', now(), now()
  FROM resolved
  ON CONFLICT (id) DO UPDATE SET
    lead_id = COALESCE(EXCLUDED.lead_id, jobs.lead_id),
    quote_id = COALESCE(EXCLUDED.quote_id, jobs.quote_id),
    customer_id = COALESCE(EXCLUDED.customer_id, jobs.customer_id),
    status = 'Job Complete - Invoice Sent',
    completed_at = COALESCE(jobs.completed_at, now()),
    updated_at = now()
  RETURNING id
),
upsert_invoice AS (
  INSERT INTO invoices (id, job_id, quote_id, customer_id, status, amount, sent_at, updated_at)
  SELECT ${sql(invoiceId)}, job_id, quote_id, customer_id, 'Invoice Summary Sent', ${sql(finalInvoiceAmount)}, now(), now()
  FROM resolved
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, amount = EXCLUDED.amount, sent_at = now(), updated_at = now()
  RETURNING id
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
    COALESCE(${num(body.estimated_labour_hours)}, estimated_duration_minutes / 60.0),
    ${num(actualLabourHours)},
    ${num(estimatedMaterialsCost)},
    ${num(actualMaterialsCost)},
    ${sql(varianceReason)},
    ${accuracyScore === null ? 'NULL' : accuracyScore.toFixed(2)}
  FROM resolved
),
update_schedule AS (
  UPDATE job_schedule_slots
  SET status = 'completed_actuals_captured', updated_at = now()
  WHERE (${sql(scheduleSlotId)} IS NOT NULL AND id = ${sql(scheduleSlotId)})
     OR job_id = (SELECT job_id FROM resolved)
  RETURNING id
),
update_quote AS (
  UPDATE quotes
  SET status = 'Job Complete - Invoice Sent', updated_at = now()
  WHERE id = (SELECT quote_id FROM resolved)
  RETURNING id
),
update_lead AS (
  UPDATE leads
  SET status = 'Job Complete - Invoice Sent', next_action = 'review_invoice_and_customer_feedback', updated_at = now()
  WHERE id = (SELECT lead_id FROM resolved)
  RETURNING id
),
insert_workflow_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'job', job_id, 'job_completed_invoice_sent', ${jsonSql(requestPayload)}
  FROM resolved
),
insert_george_memory AS (
  INSERT INTO agent_memory (agent_key, agent_name, lead_id, job_id, memory_type, summary, payload)
  SELECT
    'george_foreman',
    'George Foreman',
    lead_id,
    job_id,
    'job_actuals_feedback',
    ${sql(`Actuals captured. Duration ${actualDurationMinutes ?? 'unknown'} minutes, travel ${actualTravelMinutes ?? 'unknown'} minutes, final invoice ${finalInvoiceAmount || 'unknown'}.`)},
    ${jsonSql(requestPayload)}
  FROM resolved
),
insert_nelly_memory AS (
  INSERT INTO agent_memory (agent_key, agent_name, lead_id, job_id, memory_type, summary, payload)
  SELECT
    'nelly',
    'Nelly',
    lead_id,
    job_id,
    'quote_vs_actual',
    ${sql(`Quote-vs-actual captured. Quote variance ${quoteVariance ?? 'unknown'}, accuracy ${accuracyScore === null ? 'unknown' : accuracyScore.toFixed(2)}.`)},
    ${jsonSql(requestPayload)}
  FROM resolved
),
insert_nelly_knowledge AS (
  INSERT INTO agent_knowledge_items (
    agent_key, collection_key, source_type, source_id, title, content, tags, trade_type,
    entity_type, entity_id, confidence, usefulness_score, payload
  )
  SELECT
    'nelly',
    'quote_intelligence',
    'job_completion',
    job_id,
    'Quote actuals captured for completed job',
    ${sql(`Completed job actuals captured for quote intelligence. Confirmed quote ${confirmedQuote || 'unknown'}, final invoice ${finalInvoiceAmount || 'unknown'}, variance reason: ${varianceReason || 'not provided'}.`)},
    ARRAY['quote_actuals','pricing','materials','invoice','moat'],
    trade_type,
    'job',
    job_id,
    0.9,
    CASE WHEN ${accuracyScore === null ? 'NULL' : accuracyScore.toFixed(2)} IS NULL THEN 6 ELSE LEAST(10, GREATEST(6, ${accuracyScore === null ? '0' : accuracyScore.toFixed(2)} / 10)) END,
    ${jsonSql(requestPayload)}
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
    'job_completion',
    job_id,
    'Completed job actuals captured',
    ${sql(`Completed job actuals captured for pricing, inventory and schedule optimisation. Variance reason: ${varianceReason || 'not provided'}.`)},
    ARRAY['job_completion','quote_accuracy','inventory','scheduling_feedback','moat'],
    trade_type,
    'job',
    job_id,
    0.9,
    CASE WHEN ${quoteVariancePercent === null ? 'NULL' : Math.abs(quoteVariancePercent).toFixed(2)} IS NULL THEN 6 ELSE LEAST(10, GREATEST(6, ${quoteVariancePercent === null ? '0' : Math.abs(quoteVariancePercent).toFixed(2)} / 4)) END,
    ${jsonSql(requestPayload)}
  FROM resolved
)
${materialCtes ? ',' + materialCtes : ''}
,
active_completion_template AS (
  SELECT template_key, version, subject_template, body_template
  FROM message_templates
  WHERE template_key = 'job_complete_invoice_summary_email'
    AND status = 'active'
    AND active = true
  ORDER BY version DESC
  LIMIT 1
)
SELECT jsonb_build_object(
  'success', ${missing.length ? 'false' : 'true'},
  'status', CASE WHEN ${missing.length ? 'true' : 'false'} THEN 'job_completed_with_missing_information' ELSE 'job_completed_invoice_sent' END,
  'job_id', (SELECT job_id FROM resolved),
  'lead_id', (SELECT lead_id FROM resolved),
  'quote_id', (SELECT quote_id FROM resolved),
  'invoice_id', ${sql(invoiceId)},
  'customer_name', (SELECT customer_name FROM resolved),
  'customer_email', (SELECT customer_email FROM resolved),
  'customer_email_safe', COALESCE((SELECT customer_email FROM resolved), 'mac@1pacent.com'),
  'actual_duration_minutes', ${actualDurationMinutes === null ? 'NULL' : actualDurationMinutes},
  'actual_travel_minutes', ${actualTravelMinutes === null ? 'NULL' : actualTravelMinutes},
  'final_invoice_amount', ${sql(finalInvoiceAmount)},
  'quote_variance', ${quoteVariance === null ? 'NULL' : quoteVariance.toFixed(2)},
  'quote_variance_percent', ${quoteVariancePercent === null ? 'NULL' : quoteVariancePercent.toFixed(2)},
  'accuracy_score', ${accuracyScore === null ? 'NULL' : accuracyScore.toFixed(2)},
  'material_count', ${parts.length},
  'completion_notes', ${sql(completionNotes)},
  'customer_notes', ${sql(customerNotes)},
  'missing_information', ${jsonSql(missing)},
  'template_key', (SELECT template_key FROM active_completion_template),
  'template_version', (SELECT version FROM active_completion_template),
  'template_subject', (SELECT subject_template FROM active_completion_template),
  'template_body', (SELECT body_template FROM active_completion_template)
) AS completion_result;
`;

return [{ json: { sql: query } }];
'@

$emailCode = @'
const result = items[0]?.json?.completion_result || items[0]?.json || {};
const amount = result.final_invoice_amount ? `$${result.final_invoice_amount}` : 'To be confirmed';
const customerName = result.customer_name || 'there';
const customerEmail = result.customer_email_safe || 'mac@1pacent.com';
const notes = result.completion_notes || 'Completed as agreed.';
const trackingUrl = result.lead_id
  ? `https://app.1pacent.com/job-status?lead_id=${encodeURIComponent(result.lead_id)}`
  : `https://app.1pacent.com/job-status?job_id=${encodeURIComponent(result.job_id || '')}`;
const variables = {
  customer_name: customerName,
  job_id: result.job_id || '',
  invoice_id: result.invoice_id || '',
  quote_id: result.quote_id || '',
  final_invoice_amount: amount,
  completion_notes: notes,
  materials_summary: result.material_count ? `${result.material_count} material line item(s) recorded` : 'No separate material line items recorded',
  tracking_url: trackingUrl,
};
function renderTemplate(text) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null ? '' : String(value);
  });
}
const fallbackSubject = `Job complete and invoice summary: ${result.invoice_id || ''}`;
const fallbackMessage = [
  `Hi ${customerName},`,
  '',
  'Thanks again for choosing 1pacent. Your job has been marked complete.',
  '',
  `Job reference: ${result.job_id || ''}`,
  `Invoice reference: ${result.invoice_id || ''}`,
  `Completion notes: ${notes}`,
  `Labour time recorded: ${result.actual_duration_minutes ?? 'To be confirmed'} minutes`,
  `Invoice amount: ${amount}`,
  '',
  `Track your request here: ${trackingUrl}`,
  '',
  'Please keep this email for your records. If you have any questions, call Sally back and quote your job or invoice reference.',
  '',
  'Thanks,',
  '1pacent',
].join('\n');

return [{
  json: {
    ...result,
    customer_email_safe: customerEmail,
    customer_tracking_url: trackingUrl,
    message_template_key: result.template_key || 'fallback_job_complete_invoice_summary_email',
    message_template_version: result.template_version || null,
    internal_subject: `Job complete and invoice summary sent: ${result.job_id || ''}`,
    internal_message: [
      `Job ID: ${result.job_id || ''}`,
      `Lead ID: ${result.lead_id || ''}`,
      `Quote ID: ${result.quote_id || ''}`,
      `Invoice ID: ${result.invoice_id || ''}`,
      `Customer: ${result.customer_name || ''}`,
      `Customer email: ${result.customer_email || 'Missing - sent fallback internally'}`,
      `Final invoice: ${amount}`,
      `Duration minutes: ${result.actual_duration_minutes ?? ''}`,
      `Travel minutes: ${result.actual_travel_minutes ?? ''}`,
      `Quote variance: ${result.quote_variance ?? ''}`,
      `Accuracy score: ${result.accuracy_score ?? ''}`,
      `Materials count: ${result.material_count ?? 0}`,
      `Missing: ${(result.missing_information || []).join(', ') || 'None'}`,
    ].join('\n'),
    customer_subject: result.template_subject ? renderTemplate(result.template_subject) : fallbackSubject,
    customer_message: result.template_body ? renderTemplate(result.template_body) : fallbackMessage,
  },
}];
'@

$nodes = @(
    (New-WebhookNode 0 0),
    (New-CodeNode "Build Completion Invoice SQL" $buildSqlCode 260 0),
    (New-PostgresNode "Save Completion Invoice And Learning" 520 0),
    (New-CodeNode "Prepare Completion Emails" $emailCode 780 0),
    (New-GmailNode "Email Customer Invoice Summary" '={{$json.customer_email_safe}}' '={{$json.customer_subject}}' '={{$json.customer_message}}' 1040 -120),
    (New-GmailNode "Email Internal Completion Alert" "mac@1pacent.com" '={{$json.internal_subject}}' '={{$json.internal_message}}' 1040 120),
    (New-RespondNode '={{ { success: $json.success, status: $json.status, job_id: $json.job_id, lead_id: $json.lead_id, quote_id: $json.quote_id, invoice_id: $json.invoice_id, final_invoice_amount: $json.final_invoice_amount, quote_variance: $json.quote_variance, accuracy_score: $json.accuracy_score, material_count: $json.material_count, missing_information: $json.missing_information } }}' 1300 0)
)

$connections = @{
    "Job Completion Webhook" = @{ main = @(, @(@{ node = "Build Completion Invoice SQL"; type = "main"; index = 0 })) }
    "Build Completion Invoice SQL" = @{ main = @(, @(@{ node = "Save Completion Invoice And Learning"; type = "main"; index = 0 })) }
    "Save Completion Invoice And Learning" = @{ main = @(, @(@{ node = "Prepare Completion Emails"; type = "main"; index = 0 })) }
    "Prepare Completion Emails" = @{ main = @(, @(
        @{ node = "Email Customer Invoice Summary"; type = "main"; index = 0 },
        @{ node = "Email Internal Completion Alert"; type = "main"; index = 0 },
        @{ node = "Respond Job Complete"; type = "main"; index = 0 }
    )) }
}

$workflow = Upsert-WorkflowByName "TRADIE-JOBS-045-Complete-Job" $nodes $connections

@{
    workflow = $workflow | Select-Object name,id,active
    endpoint = "$BaseUrl/webhook/jobs/complete"
    purpose = "Job completion, invoice summary, materials capture, quote accuracy, and moat learning"
} | ConvertTo-Json -Depth 8
