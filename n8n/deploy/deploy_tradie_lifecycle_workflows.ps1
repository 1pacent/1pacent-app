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

$gmailCredential = @{
    id = "Ar5b8h8vd29IBh1g"
    name = "Gmail account"
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
        id = [guid]::NewGuid().ToString()
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

function Update-WorkflowByName($WorkflowName, $Nodes, $Connections) {
    $all = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows?limit=100" -Headers $Headers -Method Get
    $existing = $all.data | Where-Object { $_.name -eq $WorkflowName } | Select-Object -First 1
    if (-not $existing) {
        throw "Workflow not found: $WorkflowName"
    }

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
    return $updated
}

$quoteCode = @'
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

const now = new Date();
const quoteId = first(body.quote_id, `QUOTE-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const leadId = first(body.lead_id, body.reference, 'LEAD-UNKNOWN');
const customerName = first(body.customer_name, 'Customer');
const customerEmail = first(body.customer_email, body.email);
const jobDescription = first(body.job_description, body.description);
const bookingWindow = first(body.booking_window, body.preferred_time, 'To be confirmed');
const confirmedAmount = first(body.confirmed_quote_amount, body.quote_amount, body.amount);
const inclusions = first(body.inclusions, 'Labour and standard materials as confirmed by the tradie.');
const exclusions = first(body.exclusions, 'Unforeseen additional work, specialist materials, and variations are excluded unless approved.');
const validUntil = first(body.valid_until, '7 days from issue');
const acceptanceUrl = `https://vmi3305336.contaboserver.net/webhook/quotes/accept?quote_id=${encodeURIComponent(quoteId)}&lead_id=${encodeURIComponent(leadId)}&customer_email=${encodeURIComponent(customerEmail)}&customer_name=${encodeURIComponent(customerName)}&accepted=true`;

const missing = [];
if (!customerEmail) missing.push('customer_email');
if (!jobDescription) missing.push('job_description');
if (!confirmedAmount) missing.push('confirmed_quote_amount');

return [{
  json: {
    quote_id: quoteId,
    lead_id: leadId,
    status: missing.length ? 'Quote Needs Info' : 'Quote Sent Awaiting Acceptance',
    customer_name: customerName,
    customer_email: customerEmail,
    job_description: jobDescription,
    booking_window: bookingWindow,
    confirmed_quote_amount: confirmedAmount,
    inclusions,
    exclusions,
    valid_until: validUntil,
    acceptance_url: acceptanceUrl,
    missing_information: missing,
    internal_subject: `Quote ready ${quoteId} for ${customerName}`,
    internal_message: [
      `Quote ID: ${quoteId}`,
      `Lead ID: ${leadId}`,
      `Customer: ${customerName}`,
      `Email: ${customerEmail || 'Missing'}`,
      `Amount: ${confirmedAmount || 'Missing'}`,
      `Booking window: ${bookingWindow}`,
      `Job: ${jobDescription || 'Missing'}`,
      `Status: ${missing.length ? 'Needs info before sending' : 'Sent to customer'}`,
    ].join('\n'),
    customer_subject: `Your quote from 1pacent: ${quoteId}`,
    customer_message: [
      `Hi ${customerName},`,
      '',
      'Thanks for speaking with Sally. The tradie has reviewed the request and confirmed the quote details below.',
      '',
      `Quote reference: ${quoteId}`,
      `Job: ${jobDescription}`,
      `Booking window: ${bookingWindow}`,
      `Confirmed quote: ${confirmedAmount}`,
      `Inclusions: ${inclusions}`,
      `Exclusions/assumptions: ${exclusions}`,
      `Valid until: ${validUntil}`,
      '',
      `To accept this quote, open this link: ${acceptanceUrl}`,
      '',
      'No work will proceed until the quote is accepted.',
      'Need to change your booking request? Call Sally back and quote your lead or quote reference.',
      '',
      'Thanks,',
      '1pacent',
    ].join('\n'),
  },
}];
'@

$acceptCode = @'
const raw = items[0]?.json ?? {};
const q = raw.query ?? raw.body ?? raw;
const accepted = String(q.accepted ?? 'true').toLowerCase() === 'true';
const quoteId = q.quote_id || 'QUOTE-UNKNOWN';
const leadId = q.lead_id || 'LEAD-UNKNOWN';
const customerName = q.customer_name || 'Customer';
const customerEmail = q.customer_email || q.email || '';
const status = accepted ? 'Quote Accepted - Ready To Schedule Job' : 'Quote Declined';
const job_id = accepted ? `JOB-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}` : '';

return [{
  json: {
    quote_id: quoteId,
    lead_id: leadId,
    customer_name: customerName,
    customer_email: customerEmail,
    accepted,
    job_id,
    status,
    internal_subject: `${status}: ${quoteId}`,
    internal_message: [
      `Quote ID: ${quoteId}`,
      `Lead ID: ${leadId}`,
      `Customer: ${customerName}`,
      `Email: ${customerEmail}`,
      `Accepted: ${accepted}`,
      `Next action: ${accepted ? 'Schedule/confirm job and prepare job pack' : 'Follow up or close opportunity'}`,
    ].join('\n'),
    customer_subject: accepted ? `Quote accepted: ${quoteId}` : `Quote response received: ${quoteId}`,
    customer_message: [
      `Hi ${customerName},`,
      '',
      accepted
        ? `Thanks, we have recorded your acceptance for quote ${quoteId}. The team will confirm the job schedule next.`
        : `Thanks, we have recorded your response for quote ${quoteId}.`,
      '',
      'Thanks,',
      '1pacent',
    ].join('\n'),
  },
}];
'@

$completeCode = @'
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

function text(value) {
  if (Array.isArray(value)) return value.map((v) => typeof v === 'object' ? JSON.stringify(v) : String(v)).join('\n');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value || '');
}

const now = new Date();
const jobId = first(body.job_id, `JOB-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const invoiceId = first(body.invoice_id, `INV-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const customerName = first(body.customer_name, 'Customer');
const customerEmail = first(body.customer_email, body.email);
const parts = first(body.parts, body.materials, []);
const labourHours = first(body.labour_hours, body.hours);
const finalAmount = first(body.final_amount, body.invoice_amount);
const completionNotes = first(body.completion_notes, body.notes);

const missing = [];
if (!customerEmail) missing.push('customer_email');
if (!finalAmount) missing.push('final_amount');

return [{
  json: {
    job_id: jobId,
    invoice_id: invoiceId,
    lead_id: first(body.lead_id, ''),
    quote_id: first(body.quote_id, ''),
    status: missing.length ? 'Job Complete - Invoice Needs Info' : 'Job Complete - Invoice Sent',
    customer_name: customerName,
    customer_email: customerEmail,
    parts_used: text(parts),
    labour_hours: labourHours,
    final_amount: finalAmount,
    completion_notes: completionNotes,
    missing_information: missing,
    internal_subject: `Job complete ${jobId} / invoice ${invoiceId}`,
    internal_message: [
      `Job ID: ${jobId}`,
      `Invoice ID: ${invoiceId}`,
      `Customer: ${customerName}`,
      `Email: ${customerEmail || 'Missing'}`,
      `Labour hours: ${labourHours || 'Not provided'}`,
      `Parts/materials: ${text(parts) || 'Not provided'}`,
      `Final amount: ${finalAmount || 'Missing'}`,
      `Completion notes: ${completionNotes || 'None'}`,
      `Status: ${missing.length ? 'Needs invoice info' : 'Invoice sent'}`,
    ].join('\n'),
    customer_subject: `Job complete and invoice summary: ${invoiceId}`,
    customer_message: [
      `Hi ${customerName},`,
      '',
      'Thanks again for choosing 1pacent. Your job has been marked complete.',
      '',
      `Job reference: ${jobId}`,
      `Invoice reference: ${invoiceId}`,
      `Completion notes: ${completionNotes || 'Completed as agreed.'}`,
      `Parts/materials recorded: ${text(parts) || 'None recorded'}`,
      `Labour hours: ${labourHours || 'To be confirmed'}`,
      `Invoice amount: ${finalAmount || 'To be confirmed'}`,
      '',
      'Please keep this email for your records. A formal accounting invoice can be issued from the connected accounting system once configured.',
      'Need to ask a question or change anything? Call Sally back and quote your job or invoice reference.',
      '',
      'Thanks,',
      '1pacent',
    ].join('\n'),
  },
}]; 
'@

$variationCode = @'
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

const now = new Date();
const variationId = first(body.variation_id, `VAR-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const leadId = first(body.lead_id, 'LEAD-UNKNOWN');
const quoteId = first(body.quote_id, 'QUOTE-UNKNOWN');
const jobId = first(body.job_id, '');
const customerName = first(body.customer_name, 'Customer');
const customerEmail = first(body.customer_email, body.email);
const originalAmount = first(body.original_quote_amount, body.original_amount, 'Original amount not provided');
const revisedAmount = first(body.revised_quote_amount, body.confirmed_quote_amount, body.amount);
const reason = first(body.reason, body.variation_reason, 'Scope changed after tradie review.');
const siteVisitNotes = first(body.site_visit_notes, body.notes, '');
const inclusions = first(body.inclusions, 'Updated labour/materials as confirmed by the tradie.');
const exclusions = first(body.exclusions, 'Any further unforeseen work requires separate approval.');
const acceptanceUrl = `https://vmi3305336.contaboserver.net/webhook/quotes/accept?quote_id=${encodeURIComponent(variationId)}&lead_id=${encodeURIComponent(leadId)}&customer_email=${encodeURIComponent(customerEmail)}&customer_name=${encodeURIComponent(customerName)}&accepted=true`;

const missing = [];
if (!customerEmail) missing.push('customer_email');
if (!revisedAmount) missing.push('revised_quote_amount');
if (!reason) missing.push('reason');

return [{
  json: {
    variation_id: variationId,
    lead_id: leadId,
    quote_id: quoteId,
    job_id: jobId,
    status: missing.length ? 'Variation Needs Info' : 'Revised Quote Sent Awaiting Acceptance',
    customer_name: customerName,
    customer_email: customerEmail,
    original_quote_amount: originalAmount,
    revised_quote_amount: revisedAmount,
    reason,
    site_visit_notes: siteVisitNotes,
    inclusions,
    exclusions,
    acceptance_url: acceptanceUrl,
    missing_information: missing,
    internal_subject: `Revised quote ${variationId} for ${customerName}`,
    internal_message: [
      `Variation/Revised Quote ID: ${variationId}`,
      `Original Quote ID: ${quoteId}`,
      `Lead ID: ${leadId}`,
      `Job ID: ${jobId || 'Not provided'}`,
      `Customer: ${customerName}`,
      `Email: ${customerEmail || 'Missing'}`,
      `Original amount: ${originalAmount}`,
      `Revised amount: ${revisedAmount || 'Missing'}`,
      `Reason: ${reason}`,
      `Site visit notes: ${siteVisitNotes || 'None'}`,
      `Status: ${missing.length ? 'Needs info before sending' : 'Sent to customer for acceptance'}`,
    ].join('\n'),
    customer_subject: `Revised quote from 1pacent: ${variationId}`,
    customer_message: [
      `Hi ${customerName},`,
      '',
      'Following the tradie review/site visit, the job cost or scope needs to be updated before work proceeds.',
      '',
      `Reference: ${variationId}`,
      `Original quote: ${originalAmount}`,
      `Revised quote: ${revisedAmount}`,
      `Reason: ${reason}`,
      siteVisitNotes ? `Tradie notes: ${siteVisitNotes}` : '',
      `Inclusions: ${inclusions}`,
      `Exclusions/assumptions: ${exclusions}`,
      '',
      `To accept this revised quote, open this link: ${acceptanceUrl}`,
      '',
      'No changed or additional work will proceed until the revised quote is accepted.',
      'Need to change your booking request? Call Sally back and quote your lead, quote, or revised quote reference.',
      '',
      'Thanks,',
      '1pacent',
    ].filter(Boolean).join('\n'),
  },
}]; 
'@

$quoteDatabaseSqlCode = @'
const q = items[0]?.json ?? {};
function sql(v) {
  if (v === undefined || v === null || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function jsonSql(v) {
  return `'${JSON.stringify(v ?? {}).replace(/'/g, "''")}'::jsonb`;
}
const query = `
WITH lead_row AS (
  SELECT id, customer_id FROM leads WHERE id = ${sql(q.lead_id)} LIMIT 1
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
    original_amount = EXCLUDED.original_amount,
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
    'Initial confirmed quote',
    ${sql(q.inclusions)},
    ${sql(q.exclusions)},
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
insert_workflow_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  VALUES ('quote', ${sql(q.quote_id)}, 'quote_sent', ${jsonSql(q)})
)
SELECT ${sql(q.quote_id)} AS quote_id, ${sql(q.lead_id)} AS lead_id;
`;
return [{ json: { ...q, sql: query } }];
'@

$acceptDatabaseSqlCode = @'
const a = items[0]?.json ?? {};
function sql(v) {
  if (v === undefined || v === null || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function jsonSql(v) {
  return `'${JSON.stringify(v ?? {}).replace(/'/g, "''")}'::jsonb`;
}
const jobId = a.accepted ? (a.job_id || `JOB-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`) : '';
const query = `
WITH version_row AS (
  SELECT id, quote_id, lead_id FROM quote_versions WHERE id = ${sql(a.quote_id)} LIMIT 1
),
resolved AS (
  SELECT
    COALESCE((SELECT quote_id FROM version_row), ${sql(a.quote_id)}) AS quote_id,
    COALESCE((SELECT lead_id FROM version_row), ${sql(a.lead_id)}) AS lead_id
),
update_version AS (
  UPDATE quote_versions
  SET status = ${sql(a.status)}, accepted_at = CASE WHEN ${a.accepted ? 'true' : 'false'} THEN now() ELSE accepted_at END
  WHERE id = ${sql(a.quote_id)}
  RETURNING id
),
update_quote AS (
  UPDATE quotes
  SET status = ${sql(a.status)}, accepted_at = CASE WHEN ${a.accepted ? 'true' : 'false'} THEN now() ELSE accepted_at END, updated_at = now()
  WHERE id = (SELECT quote_id FROM resolved)
  RETURNING id, lead_id, customer_id
),
upsert_job AS (
  INSERT INTO jobs (id, lead_id, quote_id, customer_id, status, updated_at)
  SELECT
    ${sql(jobId)},
    lead_id,
    id,
    customer_id,
    'Quote Accepted - Ready To Schedule Job',
    now()
  FROM update_quote
  WHERE ${a.accepted ? 'true' : 'false'}
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()
  RETURNING id
),
insert_workflow_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  VALUES ('quote', (SELECT quote_id FROM resolved), CASE WHEN ${a.accepted ? 'true' : 'false'} THEN 'quote_accepted' ELSE 'quote_declined' END, ${jsonSql(a)})
)
SELECT (SELECT quote_id FROM resolved) AS quote_id, (SELECT id FROM upsert_job) AS job_id;
`;
return [{ json: { ...a, job_id: jobId, sql: query } }];
'@

$variationDatabaseSqlCode = @'
const v = items[0]?.json ?? {};
function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}
const query = `
WITH version_number AS (
  SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
  FROM quote_versions
  WHERE quote_id = ${sql(v.quote_id)}
),
update_quote AS (
  UPDATE quotes
  SET status = ${sql(v.status)}, current_amount = ${sql(v.revised_quote_amount)}, updated_at = now()
  WHERE id = ${sql(v.quote_id)}
  RETURNING id
),
insert_version AS (
  INSERT INTO quote_versions (
    id, quote_id, lead_id, version_number, amount, reason, inclusions,
    exclusions, acceptance_url, status
  )
  SELECT
    ${sql(v.variation_id)},
    ${sql(v.quote_id)},
    ${sql(v.lead_id)},
    next_version,
    ${sql(v.revised_quote_amount)},
    ${sql(v.reason)},
    ${sql(v.inclusions)},
    ${sql(v.exclusions)},
    ${sql(v.acceptance_url)},
    ${sql(v.status)}
  FROM version_number
  ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    reason = EXCLUDED.reason,
    inclusions = EXCLUDED.inclusions,
    exclusions = EXCLUDED.exclusions,
    acceptance_url = EXCLUDED.acceptance_url,
    status = EXCLUDED.status
  RETURNING id
),
insert_workflow_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  VALUES ('quote_version', ${sql(v.variation_id)}, 'revised_quote_sent', ${jsonSql(v)})
)
SELECT ${sql(v.variation_id)} AS variation_id, ${sql(v.quote_id)} AS quote_id;
`;
return [{ json: { ...v, sql: query } }];
'@

$completeDatabaseSqlCode = @'
const c = items[0]?.json ?? {};
function sql(v) {
  if (v === undefined || v === null || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function jsonSql(v) {
  return `'${JSON.stringify(v ?? {}).replace(/'/g, "''")}'::jsonb`;
}
function numberOrNull(v) {
  const n = Number.parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}
const parts = String(c.parts_used || '')
  .split('\n')
  .map((p) => p.trim())
  .filter(Boolean);
const materialInserts = parts.map((part) => {
  const match = part.match(/^(\d+(?:\.\d+)?)\s*x?\s+(.+)$/i);
  const quantity = match ? Number.parseFloat(match[1]) : 1;
  const description = match ? match[2].trim() : part;
  return `
INSERT INTO inventory_items (name, quantity_on_hand, reorder_level)
SELECT ${sql(description)}, 0, 0
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_items WHERE lower(name) = lower(${sql(description)})
);

UPDATE inventory_items
SET quantity_on_hand = quantity_on_hand - ${quantity}, updated_at = now()
WHERE id = (
  SELECT id FROM inventory_items WHERE lower(name) = lower(${sql(description)}) LIMIT 1
);

INSERT INTO job_materials (job_id, inventory_item_id, description, quantity)
VALUES (
  ${sql(c.job_id)},
  (SELECT id FROM inventory_items WHERE lower(name) = lower(${sql(description)}) LIMIT 1),
  ${sql(description)},
  ${quantity}
);
`;
}).join('\n');
const query = `
WITH quote_row AS (
  SELECT q.id, q.lead_id, q.customer_id
  FROM quotes q
  WHERE q.id = ${sql(c.quote_id)}
     OR q.id = (SELECT quote_id FROM quote_versions WHERE id = ${sql(c.quote_id)} LIMIT 1)
  LIMIT 1
),
upsert_job AS (
  INSERT INTO jobs (id, lead_id, quote_id, customer_id, status, completed_at, updated_at)
  SELECT
    ${sql(c.job_id)},
    COALESCE(${sql(c.lead_id)}, lead_id),
    id,
    customer_id,
    ${sql(c.status)},
    now(),
    now()
  FROM quote_row
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    completed_at = now(),
    updated_at = now()
  RETURNING id
),
upsert_invoice AS (
  INSERT INTO invoices (id, job_id, quote_id, customer_id, status, amount, sent_at, updated_at)
  SELECT
    ${sql(c.invoice_id)},
    ${sql(c.job_id)},
    id,
    customer_id,
    ${sql(c.status)},
    ${sql(c.final_amount)},
    now(),
    now()
  FROM quote_row
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    amount = EXCLUDED.amount,
    sent_at = now(),
    updated_at = now()
  RETURNING id
),
insert_workflow_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  VALUES ('job', ${sql(c.job_id)}, 'job_completed_invoice_sent', ${jsonSql(c)})
)
SELECT ${sql(c.job_id)} AS job_id, ${sql(c.invoice_id)} AS invoice_id;
${materialInserts}
`;
return [{ json: { ...c, sql: query } }];
'@

$quoteNodes = @(
    (New-WebhookNode "Confirmed Quote Webhook" "quotes/confirm-costs" "POST" 0 0),
    (New-CodeNode "Prepare Confirmed Quote" $quoteCode 260 0),
    (New-CodeNode "Build Quote Database SQL" $quoteDatabaseSqlCode 540 -220),
    (New-PostgresNode "Save Quote to Postgres" 820 -220),
    (New-GmailNode "Email Internal Quote Alert" "mac@1pacent.com" '={{$json.internal_subject}}' '={{$json.internal_message}}' 540 0),
    (New-GmailNode "Email Customer Quote" '={{$json.customer_email}}' '={{$json.customer_subject}}' '={{$json.customer_message}}' 820 0),
    (New-RespondNode "Respond Quote Sent" '={{ { success: true, quote_id: $json.quote_id, lead_id: $json.lead_id, status: $json.status, acceptance_url: $json.acceptance_url, missing_information: $json.missing_information } }}' 1100 0)
)
$quoteConnections = @{
    "Confirmed Quote Webhook" = @{ main = @(, @(@{ node = "Prepare Confirmed Quote"; type = "main"; index = 0 })) }
    "Prepare Confirmed Quote" = @{ main = @(, @(@{ node = "Build Quote Database SQL"; type = "main"; index = 0 }, @{ node = "Email Internal Quote Alert"; type = "main"; index = 0 }, @{ node = "Email Customer Quote"; type = "main"; index = 0 }, @{ node = "Respond Quote Sent"; type = "main"; index = 0 })) }
    "Build Quote Database SQL" = @{ main = @(, @(@{ node = "Save Quote to Postgres"; type = "main"; index = 0 })) }
}

$acceptNodes = @(
    (New-WebhookNode "Quote Acceptance Webhook" "quotes/accept" "GET" 0 0),
    (New-CodeNode "Process Quote Acceptance" $acceptCode 260 0),
    (New-CodeNode "Build Acceptance Database SQL" $acceptDatabaseSqlCode 540 -220),
    (New-PostgresNode "Save Acceptance to Postgres" 820 -220),
    (New-GmailNode "Email Internal Acceptance Alert" "mac@1pacent.com" '={{$json.internal_subject}}' '={{$json.internal_message}}' 540 0),
    (New-GmailNode "Email Customer Acceptance Confirmation" '={{$json.customer_email}}' '={{$json.customer_subject}}' '={{$json.customer_message}}' 820 0),
    (New-RespondNode "Respond Acceptance" '={{ { success: true, quote_id: $json.quote_id, lead_id: $json.lead_id, job_id: $json.job_id, accepted: $json.accepted, status: $json.status } }}' 1100 0)
)
$acceptConnections = @{
    "Quote Acceptance Webhook" = @{ main = @(, @(@{ node = "Process Quote Acceptance"; type = "main"; index = 0 })) }
    "Process Quote Acceptance" = @{ main = @(, @(@{ node = "Build Acceptance Database SQL"; type = "main"; index = 0 }, @{ node = "Email Internal Acceptance Alert"; type = "main"; index = 0 }, @{ node = "Email Customer Acceptance Confirmation"; type = "main"; index = 0 }, @{ node = "Respond Acceptance"; type = "main"; index = 0 })) }
    "Build Acceptance Database SQL" = @{ main = @(, @(@{ node = "Save Acceptance to Postgres"; type = "main"; index = 0 })) }
}

$completeNodes = @(
    (New-WebhookNode "Job Completion Webhook" "jobs/complete" "POST" 0 0),
    (New-CodeNode "Prepare Completion And Invoice" $completeCode 260 0),
    (New-CodeNode "Build Completion Database SQL" $completeDatabaseSqlCode 540 -220),
    (New-PostgresNode "Save Completion to Postgres" 820 -220),
    (New-GmailNode "Email Internal Completion Alert" "mac@1pacent.com" '={{$json.internal_subject}}' '={{$json.internal_message}}' 540 0),
    (New-GmailNode "Email Customer Invoice Summary" '={{$json.customer_email}}' '={{$json.customer_subject}}' '={{$json.customer_message}}' 820 0),
    (New-RespondNode "Respond Job Complete" '={{ { success: true, job_id: $json.job_id, invoice_id: $json.invoice_id, status: $json.status, missing_information: $json.missing_information } }}' 1100 0)
)
$completeConnections = @{
    "Job Completion Webhook" = @{ main = @(, @(@{ node = "Prepare Completion And Invoice"; type = "main"; index = 0 })) }
    "Prepare Completion And Invoice" = @{ main = @(, @(@{ node = "Build Completion Database SQL"; type = "main"; index = 0 }, @{ node = "Email Internal Completion Alert"; type = "main"; index = 0 }, @{ node = "Email Customer Invoice Summary"; type = "main"; index = 0 }, @{ node = "Respond Job Complete"; type = "main"; index = 0 })) }
    "Build Completion Database SQL" = @{ main = @(, @(@{ node = "Save Completion to Postgres"; type = "main"; index = 0 })) }
}

$variationNodes = @(
    (New-WebhookNode "Variation Webhook" "jobs/variations/manage" "POST" 0 0),
    (New-CodeNode "Prepare Revised Quote" $variationCode 260 0),
    (New-CodeNode "Build Variation Database SQL" $variationDatabaseSqlCode 540 -220),
    (New-PostgresNode "Save Variation to Postgres" 820 -220),
    (New-GmailNode "Email Internal Variation Alert" "mac@1pacent.com" '={{$json.internal_subject}}' '={{$json.internal_message}}' 540 0),
    (New-GmailNode "Email Customer Revised Quote" '={{$json.customer_email}}' '={{$json.customer_subject}}' '={{$json.customer_message}}' 820 0),
    (New-RespondNode "Respond Variation" '={{ { success: true, variation_id: $json.variation_id, quote_id: $json.quote_id, lead_id: $json.lead_id, status: $json.status, acceptance_url: $json.acceptance_url, missing_information: $json.missing_information } }}' 1100 0)
)
$variationConnections = @{
    "Variation Webhook" = @{ main = @(, @(@{ node = "Prepare Revised Quote"; type = "main"; index = 0 })) }
    "Prepare Revised Quote" = @{ main = @(, @(@{ node = "Build Variation Database SQL"; type = "main"; index = 0 }, @{ node = "Email Internal Variation Alert"; type = "main"; index = 0 }, @{ node = "Email Customer Revised Quote"; type = "main"; index = 0 }, @{ node = "Respond Variation"; type = "main"; index = 0 })) }
    "Build Variation Database SQL" = @{ main = @(, @(@{ node = "Save Variation to Postgres"; type = "main"; index = 0 })) }
}

$results = @()
$results += Update-WorkflowByName "TRADIE-QUOTES-020-Generate-Estimate" $quoteNodes $quoteConnections
$results += Update-WorkflowByName "TRADIE-QUOTES-025-Approve-Quote-Convert-To-Job" $acceptNodes $acceptConnections
$results += Update-WorkflowByName "TRADIE-JOBS-042-Manage-Variation" $variationNodes $variationConnections
$results += Update-WorkflowByName "TRADIE-JOBS-045-Complete-Job" $completeNodes $completeConnections

foreach ($wf in $results) {
    Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($wf.id)/activate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
}

$results | Select-Object name,id,active,nodes | ConvertTo-Json -Depth 8
