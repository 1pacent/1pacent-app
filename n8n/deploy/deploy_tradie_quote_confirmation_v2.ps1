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

$lookupCode = @'
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

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const leadId = first(body.lead_id, body.reference);

const query = `
WITH request AS (
  SELECT ${jsonSql(body)} AS payload, ${sql(leadId)}::text AS lead_id
),
lead_row AS (
  SELECT l.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
  FROM leads l
  LEFT JOIN customers c ON c.id = l.customer_id
  WHERE l.id = (SELECT lead_id FROM request)
  LIMIT 1
)
SELECT
  (SELECT payload FROM request) AS request_payload,
  lead_row.id AS lead_id,
  lead_row.customer_id,
  lead_row.customer_name,
  lead_row.customer_email,
  lead_row.customer_phone,
  lead_row.trade_type,
  lead_row.job_description,
  lead_row.address,
  lead_row.preferred_time,
  lead_row.estimated_price_band
FROM lead_row
UNION ALL
SELECT
  (SELECT payload FROM request), (SELECT lead_id FROM request), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM lead_row);
`;

return [{ json: { sql: query } }];
'@

$prepareCode = @'
const row = items[0]?.json ?? {};
const body = row.request_payload ?? {};

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    return value;
  }
  return '';
}

function money(value) {
  if (value === undefined || value === null || value === '') return '';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : '';
}

const now = new Date();
const quoteId = first(body.quote_id, `QUOTE-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const leadId = first(body.lead_id, row.lead_id);
const customerName = first(body.customer_name, row.customer_name, 'Customer');
const customerEmail = first(body.customer_email, body.email, row.customer_email);
const customerPhone = first(body.customer_phone, body.phone, row.customer_phone);
const tradeType = first(body.trade_type, row.trade_type, 'to be confirmed');
const jobDescription = first(body.final_scope, body.job_description, body.description, row.job_description);
const bookingWindow = first(body.booking_window, body.scheduled_window, body.preferred_time, row.preferred_time, 'To be confirmed');
const quoteAmount = money(first(body.confirmed_quote_amount, body.quote_amount, body.amount));
const labourHours = money(first(body.estimated_labour_hours, body.labour_hours));
const labourAmount = money(first(body.labour_amount));
const materialsCost = money(first(body.estimated_materials_cost, body.materials_cost));
const calloutFee = money(first(body.callout_fee, 150));
const tradieId = first(body.tradie_id);
const tradieName = first(body.tradie_name, 'Assigned tradie');
const validUntil = first(body.valid_until, '7 days from issue');
const inclusions = first(body.inclusions, 'Labour, standard materials, and the agreed scope described in this quote.');
const exclusions = first(body.exclusions, 'Unforeseen additional work, specialist materials, and variations are excluded unless approved.');
const assumptions = first(body.assumptions, 'Final price is based on the scope described. Changes require approval before work continues.');
const scopeNotes = first(body.scope_notes, body.notes, '');
const initialEstimate = first(body.initial_estimate, row.estimated_price_band);
const acceptanceUrl = `https://vmi3305336.contaboserver.net/webhook/quotes/accept?quote_id=${encodeURIComponent(quoteId)}&lead_id=${encodeURIComponent(leadId)}&customer_email=${encodeURIComponent(customerEmail)}&customer_name=${encodeURIComponent(customerName)}&accepted=true`;
const trackingUrl = `https://app.1pacent.com/job-status?lead_id=${encodeURIComponent(leadId)}`;

const missing = [];
if (!leadId) missing.push('lead_id');
if (!customerEmail) missing.push('customer_email');
if (!jobDescription) missing.push('final_scope_or_job_description');
if (!quoteAmount) missing.push('confirmed_quote_amount');

const amountLabel = quoteAmount ? `$${quoteAmount}` : 'To be confirmed';
const status = missing.length ? 'Quote Needs Info' : 'Quote Sent Awaiting Acceptance';

return [{
  json: {
    quote_id: quoteId,
    lead_id: leadId,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    trade_type: tradeType,
    job_description: jobDescription,
    booking_window: bookingWindow,
    confirmed_quote_amount: quoteAmount ? String(quoteAmount) : '',
    amount_label: amountLabel,
    estimated_labour_hours: labourHours === '' ? null : labourHours,
    labour_amount: labourAmount === '' ? null : labourAmount,
    estimated_materials_cost: materialsCost === '' ? null : materialsCost,
    callout_fee: calloutFee === '' ? null : calloutFee,
    tradie_id: tradieId,
    tradie_name: tradieName,
    valid_until: validUntil,
    inclusions,
    exclusions,
    assumptions,
    scope_notes: scopeNotes,
    initial_estimate: initialEstimate,
    acceptance_url: acceptanceUrl,
    customer_tracking_url: trackingUrl,
    missing_information: missing,
    status,
    should_email_customer: missing.length === 0,
    internal_subject: `Tradie quote confirmed: ${quoteId}`,
    internal_message: [
      `Quote ID: ${quoteId}`,
      `Lead ID: ${leadId || 'Missing'}`,
      `Customer: ${customerName}`,
      `Email: ${customerEmail || 'Missing'}`,
      `Tradie: ${tradieName}`,
      `Trade: ${tradeType}`,
      `Confirmed quote: ${amountLabel}`,
      `Booking window: ${bookingWindow}`,
      `Scope: ${jobDescription || 'Missing'}`,
      `Missing: ${missing.length ? missing.join(', ') : 'None'}`,
      `Acceptance link: ${acceptanceUrl}`,
    ].join('\n'),
    customer_subject: `Your confirmed quote from 1pacent: ${quoteId}`,
    customer_message: [
      `Hi ${customerName},`,
      '',
      'Your tradie has confirmed the quote for your requested work.',
      '',
      `Quote reference: ${quoteId}`,
      `Job: ${jobDescription}`,
      `Appointment window: ${bookingWindow}`,
      `Confirmed quote: ${amountLabel}`,
      `Inclusions: ${inclusions}`,
      `Exclusions/assumptions: ${exclusions}`,
      scopeNotes ? `Notes: ${scopeNotes}` : '',
      `Valid until: ${validUntil}`,
      '',
      `To accept this quote, open this link: ${acceptanceUrl}`,
      `Track your request here: ${trackingUrl}`,
      '',
      'No work will proceed until the quote is accepted. If anything changes, call Sally back and quote your reference.',
      '',
      'Thanks,',
      '1pacent',
    ].filter(Boolean).join('\n'),
  },
}];
'@

$saveCode = @'
const q = items[0]?.json ?? {};

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

const quotePayload = {
  quote_id: q.quote_id,
  lead_id: q.lead_id,
  trade_type: q.trade_type,
  job_description: q.job_description,
  confirmed_quote_amount: q.confirmed_quote_amount,
  estimated_labour_hours: q.estimated_labour_hours,
  estimated_materials_cost: q.estimated_materials_cost,
  callout_fee: q.callout_fee,
  tradie_id: q.tradie_id,
  tradie_name: q.tradie_name,
  booking_window: q.booking_window,
  inclusions: q.inclusions,
  exclusions: q.exclusions,
  assumptions: q.assumptions,
  acceptance_url: q.acceptance_url,
  missing_information: q.missing_information,
};

const query = `
WITH lead_row AS (
  SELECT id, customer_id, trade_type, estimated_price_band
  FROM leads
  WHERE id = ${sql(q.lead_id)}
  LIMIT 1
),
upsert_quote AS (
  INSERT INTO quotes (id, lead_id, customer_id, status, original_amount, current_amount, updated_at)
  SELECT
    ${sql(q.quote_id)},
    id,
    customer_id,
    ${sql(q.status)},
    ${sql(q.confirmed_quote_amount)},
    ${sql(q.confirmed_quote_amount)},
    now()
  FROM lead_row
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    original_amount = COALESCE(quotes.original_amount, EXCLUDED.original_amount),
    current_amount = EXCLUDED.current_amount,
    updated_at = now()
  RETURNING id
),
upsert_quote_version AS (
  INSERT INTO quote_versions (
    id, quote_id, lead_id, version_number, amount, reason, inclusions,
    exclusions, acceptance_url, status
  )
  VALUES (
    ${sql(q.quote_id)},
    ${sql(q.quote_id)},
    ${sql(q.lead_id)},
    1,
    ${sql(q.confirmed_quote_amount)},
    ${sql('Tradie confirmed scope and costs')},
    ${sql(q.inclusions)},
    ${sql(q.exclusions + ' Assumptions: ' + q.assumptions)},
    ${sql(q.acceptance_url)},
    ${sql(q.status)}
  )
  ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    inclusions = EXCLUDED.inclusions,
    exclusions = EXCLUDED.exclusions,
    acceptance_url = EXCLUDED.acceptance_url,
    status = EXCLUDED.status
  RETURNING id
),
update_lead AS (
  UPDATE leads
  SET status = ${sql(q.status)}, updated_at = now()
  WHERE id = ${sql(q.lead_id)}
  RETURNING id
),
insert_quote_accuracy_baseline AS (
  INSERT INTO quote_accuracy_metrics (
    lead_id, quote_id, trade_type, initial_estimate, confirmed_quote,
    estimated_labour_hours, estimated_materials_cost, variance_reason
  )
  VALUES (
    ${sql(q.lead_id)},
    ${sql(q.quote_id)},
    ${sql(q.trade_type)},
    ${sql(q.initial_estimate)},
    ${sql(q.confirmed_quote_amount)},
    ${num(q.estimated_labour_hours)},
    ${num(q.estimated_materials_cost)},
    ${sql('Quote confirmed by tradie before customer acceptance')}
  )
),
insert_memory AS (
  INSERT INTO agent_memory (agent_key, agent_name, lead_id, memory_type, summary, payload)
  VALUES (
    'nelly',
    'Nelly',
    ${sql(q.lead_id)},
    'confirmed_quote',
    ${sql(`Confirmed quote ${q.quote_id} for ${q.trade_type}: ${q.amount_label}`)},
    ${jsonSql(quotePayload)}
  )
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  VALUES ('quote', ${sql(q.quote_id)}, 'tradie_confirmed_quote_sent', ${jsonSql(quotePayload)})
),
active_quote_template AS (
  SELECT template_key, version, subject_template, body_template
  FROM message_templates
  WHERE template_key = 'quote_confirmation_email'
    AND status = 'active'
    AND active = true
  ORDER BY version DESC
  LIMIT 1
)
SELECT
  ${sql(q.quote_id)} AS quote_id,
  ${sql(q.lead_id)} AS lead_id,
  ${sql(q.customer_name)} AS customer_name,
  ${sql(q.customer_email)} AS customer_email,
  ${sql(q.customer_phone)} AS customer_phone,
  ${sql(q.trade_type)} AS trade_type,
  ${sql(q.job_description)} AS job_description,
  ${sql(q.booking_window)} AS booking_window,
  ${sql(q.confirmed_quote_amount)} AS confirmed_quote_amount,
  ${sql(q.amount_label)} AS amount_label,
  ${sql(q.inclusions)} AS inclusions,
  ${sql(q.exclusions)} AS exclusions,
  ${sql(q.scope_notes)} AS scope_notes,
  ${sql(q.valid_until)} AS valid_until,
  ${sql(q.acceptance_url)} AS acceptance_url,
  ${sql(q.customer_tracking_url)} AS customer_tracking_url,
  ${sql(q.status)} AS status,
  ${jsonSql(q.missing_information)} AS missing_information,
  ${sql(q.internal_subject)} AS internal_subject,
  ${sql(q.internal_message)} AS internal_message,
  ${sql(q.customer_subject)} AS customer_subject,
  ${sql(q.customer_message)} AS customer_message,
  (SELECT template_key FROM active_quote_template) AS template_key,
  (SELECT version FROM active_quote_template) AS template_version,
  (SELECT subject_template FROM active_quote_template) AS template_subject,
  (SELECT body_template FROM active_quote_template) AS template_body;
`;

return [{ json: { ...q, sql: query } }];
'@

$renderQuoteEmailCode = @'
const q = items[0]?.json || {};
const variables = {
  customer_name: q.customer_name || 'there',
  quote_id: q.quote_id || '',
  job_description: q.job_description || '',
  booking_window: q.booking_window || '',
  amount_label: q.amount_label || '',
  inclusions: q.inclusions || '',
  exclusions: q.exclusions || '',
  scope_notes: q.scope_notes || '',
  valid_until: q.valid_until || '',
  acceptance_url: q.acceptance_url || '',
  tracking_url: q.customer_tracking_url || (q.quote_id ? `https://app.1pacent.com/job-status?quote_id=${encodeURIComponent(q.quote_id)}` : ''),
};
function renderTemplate(text) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null ? '' : String(value);
  });
}
return [{
  json: {
    ...q,
    message_template_key: q.template_key || 'fallback_quote_confirmation_email',
    message_template_version: q.template_version || null,
    customer_subject: q.template_subject ? renderTemplate(q.template_subject) : q.customer_subject,
    customer_message: q.template_body ? renderTemplate(q.template_body) : q.customer_message,
  },
}];
'@

$nodes = @(
    (New-WebhookNode "Tradie Confirm Quote Webhook" "quotes/confirm-costs" "POST" 0 0),
    (New-CodeNode "Build Lead Lookup SQL" $lookupCode 240 0),
    (New-PostgresNode "Load Lead And Customer" 500 0),
    (New-CodeNode "Prepare Tradie Confirmed Quote" $prepareCode 760 0),
    (New-CodeNode "Build Save Quote SQL" $saveCode 1020 -220),
    (New-PostgresNode "Save Quote And Learning Baseline" 1280 -220),
    (New-CodeNode "Render Quote Email Template" $renderQuoteEmailCode 1540 -220),
    (New-GmailNode "Email Internal Quote Alert" "mac@1pacent.com" '={{$json.internal_subject}}' '={{$json.internal_message}}' 1540 0),
    (New-GmailNode "Email Customer Quote Acceptance" '={{$json.customer_email}}' '={{$json.customer_subject}}' '={{$json.customer_message}}' 1800 -120),
    (New-RespondNode "Respond Quote Confirmation" '={{ { success: true, quote_id: $json.quote_id, lead_id: $json.lead_id, status: $json.status, acceptance_url: $json.acceptance_url, missing_information: $json.missing_information, customer_email_sent_to: $json.customer_email, amount: $json.amount_label } }}' 1800 120)
)

$connections = @{
    "Tradie Confirm Quote Webhook" = @{ main = @(, @(@{ node = "Build Lead Lookup SQL"; type = "main"; index = 0 })) }
    "Build Lead Lookup SQL" = @{ main = @(, @(@{ node = "Load Lead And Customer"; type = "main"; index = 0 })) }
    "Load Lead And Customer" = @{ main = @(, @(@{ node = "Prepare Tradie Confirmed Quote"; type = "main"; index = 0 })) }
    "Prepare Tradie Confirmed Quote" = @{ main = @(, @(@{ node = "Build Save Quote SQL"; type = "main"; index = 0 })) }
    "Build Save Quote SQL" = @{ main = @(, @(@{ node = "Save Quote And Learning Baseline"; type = "main"; index = 0 })) }
    "Save Quote And Learning Baseline" = @{ main = @(, @(@{ node = "Render Quote Email Template"; type = "main"; index = 0 })) }
    "Render Quote Email Template" = @{ main = @(, @(
        @{ node = "Email Internal Quote Alert"; type = "main"; index = 0 },
        @{ node = "Email Customer Quote Acceptance"; type = "main"; index = 0 },
        @{ node = "Respond Quote Confirmation"; type = "main"; index = 0 }
    )) }
}

$workflow = Upsert-WorkflowByName "TRADIE-QUOTES-020-Generate-Estimate" $nodes $connections

@{
    workflow = $workflow | Select-Object name,id,active
    endpoint = "$BaseUrl/webhook/quotes/confirm-costs"
    purpose = "Tradie confirmed quote, customer acceptance email, and Nelly quote baseline learning"
} | ConvertTo-Json -Depth 8
