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

$setupCode = @'
const query = `
CREATE TABLE IF NOT EXISTS payment_requests (
  id text primary key,
  invoice_id text references invoices(id),
  job_id text references jobs(id),
  quote_id text references quotes(id),
  customer_id uuid references customers(id),
  amount numeric,
  currency text not null default 'AUD',
  status text not null default 'payment_requested',
  provider text not null default 'internal_placeholder',
  payment_url text,
  due_at timestamptz,
  sent_at timestamptz,
  paid_at timestamptz,
  reminder_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_request_id text references payment_requests(id),
  invoice_id text references invoices(id),
  event_type text not null,
  provider text,
  amount numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_invoice_id ON payment_requests(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status, due_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_request_id ON payment_events(payment_request_id, created_at DESC);

INSERT INTO agent_definitions (agent_key, agent_name, agent_role, model_provider, model_name, active)
VALUES ('penny', 'Penny', 'Payments, invoice collection and faster-cashflow AI agent', 'google_gemini', 'models/gemini-3.1-flash-lite', true)
ON CONFLICT (agent_key) DO UPDATE SET agent_name = EXCLUDED.agent_name, agent_role = EXCLUDED.agent_role, active = true, updated_at = now();

INSERT INTO agent_business_rules (agent_key, rule_group, rule_order, rule_text, active)
VALUES
  ('penny', 'mission', 10, 'Penny owns payment requests, payment follow-up, payment status, and cashflow acceleration for tradie businesses.', true),
  ('penny', 'customer_experience', 20, 'Payment requests must be clear, polite, mobile-friendly and linked to the completed job and invoice summary.', true),
  ('penny', 'guardrails', 30, 'Never mark an invoice paid without a payment event or explicit authorised payment confirmation.', true),
  ('penny', 'integrations', 40, 'Use internal placeholder payment links until Stripe or another payment provider is configured. Keep provider IDs separate from internal invoice and job IDs.', true)
ON CONFLICT DO NOTHING;

INSERT INTO business_skills (
  skill_key, skill_name, capability, category, description, best_practice, guardrails,
  inputs, outputs, owner_agent_key, version, status, tags, source_type, usefulness_score
)
VALUES (
  'skill_fast_payment_request',
  'Fast Payment Request',
  'Payments',
  'payments',
  'Send clear payment requests immediately after job completion and track payment speed.',
  'Use job, invoice, amount, due date and customer contact details. Provide a mobile-friendly payment link and keep the tone polite and direct. Track sent_at, paid_at and days-to-pay.',
  'Do not claim payment is complete until provider confirmation or authorised manual confirmation is received.',
  '{"required":["invoice_id","amount","customer_email"]}'::jsonb,
  '{"returns":["payment_request_id","payment_url","status","cashflow_metric"]}'::jsonb,
  'penny',
  1,
  'active',
  ARRAY['payments','cashflow','invoice','customer_experience'],
  'system_seed',
  8
)
ON CONFLICT (skill_key) DO UPDATE SET status = 'active', updated_at = now();

INSERT INTO agent_skill_assignments (agent_key, skill_key, priority, active)
VALUES ('penny', 'skill_fast_payment_request', 10, true)
ON CONFLICT (agent_key, skill_key) DO UPDATE SET priority = EXCLUDED.priority, active = true, updated_at = now();

SELECT jsonb_build_object('success', true, 'agent_key', 'penny', 'note', 'Penny payments foundation is ready.') AS setup_result;
`;
return [{ json: { sql: query } }];
'@

$requestPaymentCode = @'
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

function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const invoiceId = first(body.invoice_id);
const jobId = first(body.job_id);
const quoteId = first(body.quote_id);
const requestedAmount = first(body.amount, body.invoice_amount, body.final_invoice_amount);
const dueDays = Number(first(body.due_days, 7)) || 7;
const paymentRequestId = first(body.payment_request_id, `PAY-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const provider = first(body.provider, 'internal_placeholder');
const paymentUrl = first(body.payment_url, `https://app.1pacent.com/pay/${encodeURIComponent(paymentRequestId)}`);

const query = `
WITH invoice_context AS (
  SELECT
    i.id AS invoice_id,
    i.job_id,
    i.quote_id,
    i.customer_id,
    i.amount AS invoice_amount,
    i.status AS invoice_status,
    i.sent_at,
    j.lead_id,
    l.job_description,
    c.name AS customer_name,
    c.email AS customer_email,
    c.phone AS customer_phone
  FROM invoices i
  LEFT JOIN jobs j ON j.id = i.job_id
  LEFT JOIN leads l ON l.id = j.lead_id
  LEFT JOIN customers c ON c.id = i.customer_id
  WHERE (${sql(invoiceId)} IS NOT NULL AND i.id = ${sql(invoiceId)})
     OR (${sql(jobId)} IS NOT NULL AND i.job_id = ${sql(jobId)})
     OR (${sql(quoteId)} IS NOT NULL AND i.quote_id = ${sql(quoteId)})
  ORDER BY i.sent_at DESC NULLS LAST, i.updated_at DESC
  LIMIT 1
),
resolved AS (
  SELECT
    COALESCE(invoice_id, ${sql(invoiceId)}) AS invoice_id,
    COALESCE(job_id, ${sql(jobId)}) AS job_id,
    COALESCE(quote_id, ${sql(quoteId)}) AS quote_id,
    customer_id,
    lead_id,
    customer_name,
    customer_email,
    customer_phone,
    job_description,
    COALESCE(${num(requestedAmount)}, NULLIF(regexp_replace(coalesce(invoice_amount, ''), '[^0-9.]', '', 'g'), '')::numeric) AS amount
  FROM invoice_context
),
upsert_payment_request AS (
  INSERT INTO payment_requests (
    id, invoice_id, job_id, quote_id, customer_id, amount, currency, status, provider, payment_url, due_at, sent_at, payload, updated_at
  )
  SELECT
    ${sql(paymentRequestId)},
    invoice_id,
    job_id,
    quote_id,
    customer_id,
    amount,
    'AUD',
    'payment_requested',
    ${sql(provider)},
    ${sql(paymentUrl)},
    now() + (${dueDays} || ' days')::interval,
    now(),
    ${jsonSql(body)},
    now()
  FROM resolved
  ON CONFLICT (id) DO UPDATE SET
    status = 'payment_requested',
    amount = EXCLUDED.amount,
    payment_url = EXCLUDED.payment_url,
    due_at = EXCLUDED.due_at,
    sent_at = now(),
    updated_at = now()
  RETURNING *
),
update_invoice AS (
  UPDATE invoices
  SET status = 'Payment Requested', updated_at = now()
  WHERE id = (SELECT invoice_id FROM resolved)
  RETURNING id
),
insert_event AS (
  INSERT INTO payment_events (payment_request_id, invoice_id, event_type, provider, amount, payload)
  SELECT id, invoice_id, 'payment_request_sent', provider, amount, to_jsonb(upsert_payment_request)
  FROM upsert_payment_request
),
insert_workflow_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'payment_request', id, 'payment_request_sent', to_jsonb(upsert_payment_request)
  FROM upsert_payment_request
),
insert_memory AS (
  INSERT INTO agent_memory (agent_key, agent_name, lead_id, job_id, memory_type, summary, payload)
  SELECT
    'penny',
    'Penny',
    (SELECT lead_id FROM resolved),
    job_id,
    'payment_request',
    'Payment request sent for invoice ' || invoice_id || ' amount ' || chr(36) || amount || '.',
    to_jsonb(upsert_payment_request)
  FROM upsert_payment_request
),
active_payment_template AS (
  SELECT
    mt.template_key,
    mt.version,
    mt.subject_template,
    mt.body_template
  FROM message_templates mt
  WHERE mt.template_key = 'payment_request_email'
    AND mt.status = 'active'
    AND mt.active = true
  ORDER BY mt.version DESC
  LIMIT 1
)
SELECT jsonb_build_object(
  'success', true,
  'status', 'payment_requested',
  'payment_request_id', p.id,
  'invoice_id', p.invoice_id,
  'job_id', p.job_id,
  'quote_id', p.quote_id,
  'amount', p.amount,
  'currency', p.currency,
  'payment_url', p.payment_url,
  'due_at', p.due_at,
  'customer_name', (SELECT customer_name FROM resolved),
  'customer_email', (SELECT customer_email FROM resolved),
  'customer_email_safe', COALESCE((SELECT customer_email FROM resolved), 'mac@1pacent.com'),
  'job_description', (SELECT job_description FROM resolved),
  'template_key', (SELECT template_key FROM active_payment_template),
  'template_version', (SELECT version FROM active_payment_template),
  'template_subject', (SELECT subject_template FROM active_payment_template),
  'template_body', (SELECT body_template FROM active_payment_template)
) AS payment_request
FROM upsert_payment_request p;
`;
return [{ json: { sql: query } }];
'@

$formatPaymentEmailCode = @'
const p = items[0]?.json?.payment_request || items[0]?.json || {};
const amount = p.amount ? `$${p.amount}` : 'the invoice amount';
const name = p.customer_name || 'there';
const trackingUrl = p.payment_request_id
  ? `https://app.1pacent.com/job-status?payment_request_id=${encodeURIComponent(p.payment_request_id)}`
  : `https://app.1pacent.com/job-status?invoice_id=${encodeURIComponent(p.invoice_id || '')}`;
const variables = {
  customer_name: name,
  invoice_id: p.invoice_id || '',
  job_id: p.job_id || '',
  quote_id: p.quote_id || '',
  payment_request_id: p.payment_request_id || '',
  amount,
  currency: p.currency || 'AUD',
  payment_url: p.payment_url || '',
  tracking_url: trackingUrl,
  due_at: p.due_at || '',
  job_description: p.job_description || '',
};
function renderTemplate(text) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null ? '' : String(value);
  });
}
const fallbackSubject = `Payment request for your 1pacent invoice ${p.invoice_id || ''}`;
const fallbackMessage = [
  `Hi ${name},`,
  '',
  'Thanks again for choosing 1pacent. Your invoice summary is ready for payment.',
  '',
  `Invoice reference: ${p.invoice_id || ''}`,
  `Job reference: ${p.job_id || ''}`,
  `Amount due: ${amount}`,
  '',
  `Pay here: ${p.payment_url || ''}`,
  `Track your request here: ${trackingUrl}`,
  '',
  'This payment link is currently a secure placeholder while payment provider integration is being configured. If you have any questions, call Sally and quote your invoice reference.',
  '',
  'Thanks,',
  '1pacent',
].join('\n');
return [{
  json: {
    ...p,
    customer_tracking_url: trackingUrl,
    message_template_key: p.template_key || 'fallback_payment_request_email',
    message_template_version: p.template_version || null,
    internal_subject: `Payment request sent: ${p.payment_request_id || ''}`,
    internal_message: [
      `Payment request: ${p.payment_request_id || ''}`,
      `Invoice: ${p.invoice_id || ''}`,
      `Job: ${p.job_id || ''}`,
      `Customer: ${p.customer_name || ''}`,
      `Email: ${p.customer_email || 'Missing'}`,
      `Amount: ${amount}`,
      `Payment URL: ${p.payment_url || ''}`,
      `Status: ${p.status || 'payment_requested'}`,
      `Template: ${p.template_key || 'fallback'} v${p.template_version || ''}`,
    ].join('\n'),
    customer_subject: p.template_subject ? renderTemplate(p.template_subject) : fallbackSubject,
    customer_message: p.template_body ? renderTemplate(p.template_body) : fallbackMessage,
  },
}];
'@

$recordPaymentCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw.query ?? raw;

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

function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const paymentRequestId = first(body.payment_request_id, body.request_id);
const invoiceId = first(body.invoice_id);
const provider = first(body.provider, 'manual');
const providerPaymentId = first(body.provider_payment_id, body.payment_intent_id, body.transaction_id);
const amount = first(body.amount);

const query = `
WITH target AS (
  SELECT *
  FROM payment_requests
  WHERE (${sql(paymentRequestId)} IS NOT NULL AND id = ${sql(paymentRequestId)})
     OR (${sql(invoiceId)} IS NOT NULL AND invoice_id = ${sql(invoiceId)})
  ORDER BY created_at DESC
  LIMIT 1
),
updated_payment AS (
  UPDATE payment_requests
  SET status = 'paid',
      paid_at = now(),
      provider = ${sql(provider)},
      amount = COALESCE(${num(amount)}, amount),
      payload = payload || ${jsonSql({ provider_payment_id: providerPaymentId, raw: body })},
      updated_at = now()
  WHERE id = (SELECT id FROM target)
  RETURNING *
),
updated_invoice AS (
  UPDATE invoices
  SET status = 'Paid',
      paid_at = now(),
      updated_at = now()
  WHERE id = (SELECT invoice_id FROM updated_payment)
  RETURNING *
),
insert_event AS (
  INSERT INTO payment_events (payment_request_id, invoice_id, event_type, provider, amount, payload)
  SELECT id, invoice_id, 'payment_paid', provider, amount, ${jsonSql(body)}
  FROM updated_payment
),
insert_workflow_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'payment_request', id, 'payment_paid', to_jsonb(updated_payment)
  FROM updated_payment
),
insert_memory AS (
  INSERT INTO agent_memory (agent_key, agent_name, job_id, memory_type, summary, payload)
  SELECT
    'penny',
    'Penny',
    job_id,
    'payment_paid',
    'Payment received for invoice ' || invoice_id || ' amount ' || chr(36) || amount || '.',
    to_jsonb(updated_payment)
  FROM updated_payment
)
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'success', true,
      'status', 'paid',
      'payment_request_id', id,
      'invoice_id', invoice_id,
      'job_id', job_id,
      'quote_id', quote_id,
      'amount', amount,
      'paid_at', paid_at,
      'provider', provider
    )
    FROM updated_payment
  ),
  jsonb_build_object(
    'success', false,
    'status', 'not_found',
    'message', 'No payment request matched the supplied payment_request_id or invoice_id.',
    'payment_request_id', ${sql(paymentRequestId)},
    'invoice_id', ${sql(invoiceId)}
  )
) AS payment_result;
`;
return [{ json: { sql: query } }];
'@

$statusCode = @'
const raw = items[0]?.json ?? {};
const q = raw.query ?? raw.body ?? raw;
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
const reference = first(q.payment_request_id, q.request_id, q.invoice_id, q.job_id);
const query = `
WITH matched AS (
  SELECT pr.*, i.status AS invoice_status, i.paid_at AS invoice_paid_at
  FROM payment_requests pr
  LEFT JOIN invoices i ON i.id = pr.invoice_id
  WHERE pr.id = ${sql(reference)}
     OR pr.invoice_id = ${sql(reference)}
     OR pr.job_id = ${sql(reference)}
  ORDER BY pr.created_at DESC
  LIMIT 5
),
events AS (
  SELECT pe.*
  FROM payment_events pe
  WHERE pe.payment_request_id IN (SELECT id FROM matched)
  ORDER BY pe.created_at DESC
)
SELECT jsonb_build_object(
  'success', true,
  'reference', ${sql(reference)},
  'payment_requests', COALESCE((SELECT jsonb_agg(to_jsonb(matched)) FROM matched), '[]'::jsonb),
  'events', COALESCE((SELECT jsonb_agg(to_jsonb(events)) FROM events), '[]'::jsonb)
) AS payment_status;
`;
return [{ json: { sql: query } }];
'@

$setupNodes = @(
    (New-WebhookNode "Penny Setup Webhook" "payments/penny/setup" "POST" 0 0),
    (New-CodeNode "Build Penny Setup SQL" $setupCode 260 0),
    (New-PostgresNode "Setup Penny Payments" 520 0),
    (New-RespondNode "Respond Penny Setup" '={{$json.setup_result || $json}}' 780 0)
)
$setupConnections = @{
    "Penny Setup Webhook" = @{ main = @(, @(@{ node = "Build Penny Setup SQL"; type = "main"; index = 0 })) }
    "Build Penny Setup SQL" = @{ main = @(, @(@{ node = "Setup Penny Payments"; type = "main"; index = 0 })) }
    "Setup Penny Payments" = @{ main = @(, @(@{ node = "Respond Penny Setup"; type = "main"; index = 0 })) }
}
$setup = Upsert-WorkflowByName "TRADIE-PAYMENTS-060-Penny-Setup" $setupNodes $setupConnections

$requestNodes = @(
    (New-WebhookNode "Request Payment Webhook" "payments/request" "POST" 0 0),
    (New-CodeNode "Build Payment Request SQL" $requestPaymentCode 260 0),
    (New-PostgresNode "Save Payment Request" 520 0),
    (New-CodeNode "Prepare Payment Request Email" $formatPaymentEmailCode 780 0),
    (New-GmailNode "Email Customer Payment Request" '={{$json.customer_email_safe}}' '={{$json.customer_subject}}' '={{$json.customer_message}}' 1040 -120),
    (New-GmailNode "Email Internal Payment Alert" "mac@1pacent.com" '={{$json.internal_subject}}' '={{$json.internal_message}}' 1040 120),
    (New-RespondNode "Respond Payment Request" '={{ { success: true, status: $json.status, payment_request_id: $json.payment_request_id, invoice_id: $json.invoice_id, job_id: $json.job_id, amount: $json.amount, currency: $json.currency, payment_url: $json.payment_url, due_at: $json.due_at } }}' 1300 0)
)
$requestConnections = @{
    "Request Payment Webhook" = @{ main = @(, @(@{ node = "Build Payment Request SQL"; type = "main"; index = 0 })) }
    "Build Payment Request SQL" = @{ main = @(, @(@{ node = "Save Payment Request"; type = "main"; index = 0 })) }
    "Save Payment Request" = @{ main = @(, @(@{ node = "Prepare Payment Request Email"; type = "main"; index = 0 })) }
    "Prepare Payment Request Email" = @{ main = @(, @(
        @{ node = "Email Customer Payment Request"; type = "main"; index = 0 },
        @{ node = "Email Internal Payment Alert"; type = "main"; index = 0 },
        @{ node = "Respond Payment Request"; type = "main"; index = 0 }
    )) }
}
$request = Upsert-WorkflowByName "TRADIE-PAYMENTS-061-Request-Payment" $requestNodes $requestConnections

$recordNodes = @(
    (New-WebhookNode "Record Payment Webhook" "payments/record" "POST" 0 0),
    (New-CodeNode "Build Record Payment SQL" $recordPaymentCode 260 0),
    (New-PostgresNode "Save Payment Received" 520 0),
    (New-RespondNode "Respond Payment Recorded" '={{$json.payment_result || $json}}' 780 0)
)
$recordConnections = @{
    "Record Payment Webhook" = @{ main = @(, @(@{ node = "Build Record Payment SQL"; type = "main"; index = 0 })) }
    "Build Record Payment SQL" = @{ main = @(, @(@{ node = "Save Payment Received"; type = "main"; index = 0 })) }
    "Save Payment Received" = @{ main = @(, @(@{ node = "Respond Payment Recorded"; type = "main"; index = 0 })) }
}
$record = Upsert-WorkflowByName "TRADIE-PAYMENTS-062-Record-Payment" $recordNodes $recordConnections

$statusNodes = @(
    (New-WebhookNode "Payment Status Webhook" "payments/status" "GET" 0 0),
    (New-CodeNode "Build Payment Status SQL" $statusCode 260 0),
    (New-PostgresNode "Load Payment Status" 520 0),
    (New-RespondNode "Respond Payment Status" '={{$json.payment_status || $json}}' 780 0)
)
$statusConnections = @{
    "Payment Status Webhook" = @{ main = @(, @(@{ node = "Build Payment Status SQL"; type = "main"; index = 0 })) }
    "Build Payment Status SQL" = @{ main = @(, @(@{ node = "Load Payment Status"; type = "main"; index = 0 })) }
    "Load Payment Status" = @{ main = @(, @(@{ node = "Respond Payment Status"; type = "main"; index = 0 })) }
}
$status = Upsert-WorkflowByName "TRADIE-PAYMENTS-063-Payment-Status" $statusNodes $statusConnections

@{
    setup_workflow = $setup | Select-Object name,id,active
    request_workflow = $request | Select-Object name,id,active
    record_workflow = $record | Select-Object name,id,active
    status_workflow = $status | Select-Object name,id,active
    endpoints = @{
        setup = "$BaseUrl/webhook/payments/penny/setup"
        request = "$BaseUrl/webhook/payments/request"
        record = "$BaseUrl/webhook/payments/record"
        status = "$BaseUrl/webhook/payments/status"
    }
} | ConvertTo-Json -Depth 10
