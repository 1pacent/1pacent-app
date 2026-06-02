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
            httpMethod = "GET"
            path = "quotes/accept"
            responseMode = "responseNode"
            options = @{}
        }
        type = "n8n-nodes-base.webhook"
        typeVersion = 2.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Quote Acceptance Webhook"
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

function New-HttpRequestNode($Name, $Url, $X, $Y) {
    return @{
        parameters = @{
            method = "POST"
            url = $Url
            sendBody = $true
            contentType = "json"
            specifyBody = "json"
            jsonBody = '={{ JSON.stringify($json) }}'
            options = @{ timeout = 30000 }
        }
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
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
        name = "Respond Accepted Quote"
    }
}

function Upsert-WorkflowByName($WorkflowName, $Nodes, $Connections) {
    $url = "$BaseUrl/api/v1/workflows?limit=100"
    $items = @()
    do {
        $page = Invoke-RestMethod -Uri $url -Headers $Headers -Method Get
        $items += $page.data
        if ($page.nextCursor) {
            $url = "$BaseUrl/api/v1/workflows?limit=100&cursor=$($page.nextCursor)"
        } else {
            $url = $null
        }
    } while ($url)
    $existing = $items | Where-Object { $_.name -eq $WorkflowName } | Sort-Object -Property active -Descending | Select-Object -First 1
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

$acceptSqlCode = @'
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

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const accepted = String(first(q.accepted, 'true')).toLowerCase() === 'true';
const quoteId = first(q.quote_id);
const leadId = first(q.lead_id);
const customerName = first(q.customer_name, 'Customer');
const customerEmail = first(q.customer_email, q.email);
const jobId = accepted ? first(q.job_id, `JOB-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`) : '';
const status = accepted ? 'Quote Accepted - Ready To Schedule Job' : 'Quote Declined';

const requestPayload = { quote_id: quoteId, lead_id: leadId, customer_name: customerName, customer_email: customerEmail, accepted, job_id: jobId };

const query = `
WITH version_row AS (
  SELECT id, quote_id, lead_id, amount, inclusions, exclusions, acceptance_url, status, created_at
  FROM quote_versions
  WHERE id = ${sql(quoteId)} OR quote_id = ${sql(quoteId)}
  ORDER BY created_at DESC
  LIMIT 1
),
resolved AS (
  SELECT
    COALESCE((SELECT quote_id FROM version_row), ${sql(quoteId)}) AS quote_id,
    COALESCE((SELECT lead_id FROM version_row), ${sql(leadId)}) AS lead_id,
    (SELECT amount FROM version_row) AS quote_amount
),
lead_context AS (
  SELECT
    l.id AS lead_id,
    l.customer_id,
    l.trade_type,
    l.job_description,
    l.urgency,
    l.address,
    l.preferred_time,
    c.name AS customer_name,
    c.email AS customer_email,
    c.phone AS customer_phone
  FROM leads l
  LEFT JOIN customers c ON c.id = l.customer_id
  WHERE l.id = (SELECT lead_id FROM resolved)
),
update_version AS (
  UPDATE quote_versions
  SET status = ${sql(status)}, accepted_at = CASE WHEN ${accepted ? 'true' : 'false'} THEN now() ELSE accepted_at END
  WHERE id = ${sql(quoteId)} OR quote_id = ${sql(quoteId)}
  RETURNING id
),
update_quote AS (
  UPDATE quotes
  SET status = ${sql(status)}, accepted_at = CASE WHEN ${accepted ? 'true' : 'false'} THEN now() ELSE accepted_at END, updated_at = now()
  WHERE id = (SELECT quote_id FROM resolved)
  RETURNING id, lead_id, customer_id
),
upsert_job AS (
  INSERT INTO jobs (id, lead_id, quote_id, customer_id, status, scheduled_window, updated_at)
  SELECT
    ${sql(jobId)},
    lead_id,
    quote_id,
    (SELECT customer_id FROM update_quote),
    ${sql(status)},
    (SELECT preferred_time FROM lead_context),
    now()
  FROM resolved
  WHERE ${accepted ? 'true' : 'false'}
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    quote_id = EXCLUDED.quote_id,
    scheduled_window = COALESCE(jobs.scheduled_window, EXCLUDED.scheduled_window),
    updated_at = now()
  RETURNING id
),
update_lead AS (
  UPDATE leads
  SET status = ${sql(status)}, next_action = CASE WHEN ${accepted ? 'true' : 'false'} THEN 'george_confirm_schedule' ELSE 'quote_declined_follow_up' END, updated_at = now()
  WHERE id = (SELECT lead_id FROM resolved)
  RETURNING id
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  VALUES ('quote', (SELECT quote_id FROM resolved), CASE WHEN ${accepted ? 'true' : 'false'} THEN 'quote_accepted' ELSE 'quote_declined' END, ${jsonSql(requestPayload)})
)
SELECT
  true AS success,
  ${accepted ? 'true' : 'false'}::boolean AS accepted,
  (SELECT quote_id FROM resolved) AS quote_id,
  (SELECT lead_id FROM resolved) AS lead_id,
  (SELECT id FROM upsert_job) AS job_id,
  ${sql(status)} AS status,
  COALESCE((SELECT customer_name FROM lead_context), ${sql(customerName)}) AS customer_name,
  COALESCE((SELECT customer_email FROM lead_context), ${sql(customerEmail)}) AS customer_email,
  COALESCE((SELECT customer_phone FROM lead_context), '') AS customer_phone,
  COALESCE((SELECT trade_type FROM lead_context), 'electrical') AS trade_type,
  COALESCE((SELECT job_description FROM lead_context), '') AS job_description,
  COALESCE((SELECT urgency FROM lead_context), 'normal') AS urgency,
  COALESCE((SELECT address FROM lead_context), '') AS customer_address,
  COALESCE((SELECT address FROM lead_context), '') AS customer_suburb,
  COALESCE((SELECT preferred_time FROM lead_context), 'next available') AS preferred_window,
  COALESCE((SELECT quote_amount FROM resolved), '') AS confirmed_quote_amount;
`;

return [{ json: { sql: query } }];
'@

$schedulePayloadCode = @'
const a = items[0]?.json ?? {};

function suburbFromAddress(address) {
  const text = String(address || '').trim();
  if (!text) return '';
  return text.split(',')[0].trim();
}

function inferDurationMinutes(jobDescription, tradeType) {
  const text = `${jobDescription || ''} ${tradeType || ''}`.toLowerCase();
  if (text.includes('install') && text.includes('power')) return 120;
  if (text.includes('inspection') || text.includes('quote')) return 60;
  return 120;
}

function parsePreferredDate(text) {
  const raw = String(text || '');
  const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const months = {
    january: '01', jan: '01',
    february: '02', feb: '02',
    march: '03', mar: '03',
    april: '04', apr: '04',
    may: '05',
    june: '06', jun: '06',
    july: '07', jul: '07',
    august: '08', aug: '08',
    september: '09', sep: '09',
    october: '10', oct: '10',
    november: '11', nov: '11',
    december: '12', dec: '12',
  };
  const match = raw.toLowerCase().match(/\b(\d{1,2})\s+([a-z]+)\s+(20\d{2})\b/);
  if (!match) return '';
  const month = months[match[2]];
  if (!month) return '';
  return `${match[3]}-${month}-${String(match[1]).padStart(2, '0')}`;
}

const preferredDate = parsePreferredDate(a.preferred_window);

return [{
  json: {
    booking_action: 'book',
    persist_schedule: true,
    lead_id: a.lead_id,
    quote_id: a.quote_id,
    job_id: a.job_id,
    customer_name: a.customer_name,
    customer_email: a.customer_email,
    customer_address: a.customer_address,
    customer_suburb: suburbFromAddress(a.customer_suburb || a.customer_address),
    trade_type: a.trade_type || 'electrical',
    preferred_date: preferredDate,
    preferred_window: a.preferred_window || 'next available',
    urgency: a.urgency || 'normal',
    job_description: a.job_description,
    estimated_duration_minutes: inferDurationMinutes(a.job_description, a.trade_type),
    accepted_quote_status: a.status,
    confirmed_quote_amount: a.confirmed_quote_amount,
  },
}];
'@

$calendarPayloadCode = @'
const george = items[0]?.json ?? {};
const accepted = $('Save Acceptance And Job').first().json ?? {};
const schedule = george.scheduler_response ?? george;

return [{
  json: {
    schedule_slot_id: george.schedule_slot_id || schedule.schedule_slot_id,
    lead_id: george.lead_id || schedule.lead_id,
    quote_id: george.quote_id || schedule.quote_id,
    job_id: george.job_id || schedule.job_id,
    customer_name: accepted.customer_name,
    customer_email: accepted.customer_email,
    company_id: 'COMP-1PACENT-DEFAULT',
    tradie_count: 1,
    trade_type: schedule.trade_type || 'electrical',
    calendar_id: 'mac@1pacent.com',
    george_status: george.status,
    george_customer_message: george.customer_message,
    recommended_window: george.recommended_window,
    scheduling_score: george.internal_reasoning?.scheduling_score ?? schedule.scheduling_score,
  },
}];
'@

$finaliseCode = @'
const calendar = items[0]?.json ?? {};
const accepted = $('Save Acceptance And Job').first().json ?? {};
const calendarInput = $('Prepare Calendar Booking Payload').first().json ?? {};

const booked = calendar.success === true || calendar.status === 'calendar_booked' || calendar.calendar_event_status === 'created';
const status = booked ? 'Quote Accepted - Job Scheduled' : 'Quote Accepted - Schedule Needs Review';
const customerName = calendar.customer_name || calendarInput.customer_name || accepted.customer_name || 'there';
const quoteId = calendar.quote_id || calendarInput.quote_id || accepted.quote_id || '';
const jobId = calendar.job_id || '';
const leadId = calendar.lead_id || calendarInput.lead_id || accepted.lead_id || '';
const trackingUrl = leadId
  ? `https://app.1pacent.com/job-status?lead_id=${encodeURIComponent(leadId)}`
  : `https://app.1pacent.com/job-status?job_id=${encodeURIComponent(jobId)}`;
const window = calendar.recommended_window || calendarInput.recommended_window || calendar.window || '';
const acceptanceMessage = booked
  ? `Your quote ${quoteId} has been accepted and your job has been scheduled${window ? ` for ${window}` : ''}.`
  : `Your quote ${quoteId} has been accepted. The team will manually confirm the schedule.`;

return [{
  json: {
    success: true,
    accepted: true,
    quote_id: quoteId,
    lead_id: leadId,
    job_id: jobId,
    schedule_slot_id: calendar.schedule_slot_id || '',
    status,
    calendar_booking: calendar,
    customer_subject: booked ? `Quote accepted and job scheduled: ${quoteId}` : `Quote accepted: ${quoteId}`,
    customer_email: calendar.customer_email || calendarInput.customer_email || accepted.customer_email || '',
    customer_tracking_url: trackingUrl,
    customer_message: [
      `Hi ${customerName},`,
      '',
      acceptanceMessage,
      '',
      booked ? 'The tradie will still confirm final access details before attending.' : 'We will be in touch shortly with the confirmed time.',
      '',
      `Track your request here: ${trackingUrl}`,
      '',
      'Thanks,',
      '1pacent',
    ].join('\n'),
    internal_subject: `${status}: ${quoteId}`,
    internal_message: [
      `Quote ID: ${quoteId}`,
      `Lead ID: ${calendar.lead_id || ''}`,
      `Job ID: ${jobId}`,
      `Schedule slot: ${calendar.schedule_slot_id || ''}`,
      `Status: ${status}`,
      `Calendar event: ${calendar.google_event_id || calendar.calendar_event_id || ''}`,
    ].join('\n'),
  },
}];
'@

$buildAcceptedTemplatePayloadCode = @'
const result = items[0]?.json || {};
return [{
  json: {
    template_key: 'quote_accepted_scheduled_email',
    payload: {
      ...result,
      entity_type: 'quote',
      entity_id: result.quote_id || '',
      customer_name: (result.customer_message || '').match(/^Hi ([^,]+),/)?.[1] || 'there',
      quote_id: result.quote_id || '',
      job_id: result.job_id || '',
      scheduled_window: result.calendar_booking?.recommended_window || result.calendar_booking?.window || '',
      confirmed_quote_amount: result.confirmed_quote_amount || '',
      tracking_url: result.customer_tracking_url || '',
      fallback_subject: result.customer_subject,
      fallback_message: result.customer_message,
    },
  },
}];
'@

$applyAcceptedTemplateCode = @'
const rendered = items[0]?.json || {};
const result = rendered.payload || {};
return [{
  json: {
    ...result,
    message_template_key: rendered.template_key || 'fallback_quote_accepted_scheduled_email',
    message_template_version: rendered.version || null,
    customer_subject: rendered.subject || result.fallback_subject || result.customer_subject,
    customer_message: rendered.body || result.fallback_message || result.customer_message,
  },
}];
'@

$nodes = @(
    (New-WebhookNode 0 0),
    (New-CodeNode "Build Acceptance SQL" $acceptSqlCode 240 0),
    (New-PostgresNode "Save Acceptance And Job" 500 0),
    (New-CodeNode "Prepare George Schedule Payload" $schedulePayloadCode 760 0),
    (New-HttpRequestNode "Ask George To Book Accepted Job" "http://localhost:5678/webhook/agents/george/schedule-recommendation" 1020 0),
    (New-CodeNode "Prepare Calendar Booking Payload" $calendarPayloadCode 1280 0),
    (New-HttpRequestNode "Book Accepted Job In Calendar" "http://localhost:5678/webhook/agents/george/calendar-book-job" 1540 0),
    (New-CodeNode "Build Acceptance Response" $finaliseCode 1800 0),
    (New-CodeNode "Build Accepted Template Payload" $buildAcceptedTemplatePayloadCode 2060 0),
    (New-HttpRequestNode "Render Accepted Template" "http://localhost:5678/webhook/core/message-templates/render" 2320 0),
    (New-CodeNode "Apply Accepted Template" $applyAcceptedTemplateCode 2580 0),
    (New-GmailNode "Email Customer Accepted Scheduled" '={{$json.customer_email}}' '={{$json.customer_subject}}' '={{$json.customer_message}}' 2840 -120),
    (New-GmailNode "Email Internal Accepted Scheduled" "mac@1pacent.com" '={{$json.internal_subject}}' '={{$json.internal_message}}' 2840 120),
    (New-RespondNode '={{ { success: true, quote_id: $json.quote_id, lead_id: $json.lead_id, job_id: $json.job_id, schedule_slot_id: $json.schedule_slot_id, accepted: $json.accepted, status: $json.status, calendar_booking: $json.calendar_booking } }}' 3100 0)
)

$connections = @{
    "Quote Acceptance Webhook" = @{ main = @(, @(@{ node = "Build Acceptance SQL"; type = "main"; index = 0 })) }
    "Build Acceptance SQL" = @{ main = @(, @(@{ node = "Save Acceptance And Job"; type = "main"; index = 0 })) }
    "Save Acceptance And Job" = @{ main = @(, @(@{ node = "Prepare George Schedule Payload"; type = "main"; index = 0 })) }
    "Prepare George Schedule Payload" = @{ main = @(, @(@{ node = "Ask George To Book Accepted Job"; type = "main"; index = 0 })) }
    "Ask George To Book Accepted Job" = @{ main = @(, @(@{ node = "Prepare Calendar Booking Payload"; type = "main"; index = 0 })) }
    "Prepare Calendar Booking Payload" = @{ main = @(, @(@{ node = "Book Accepted Job In Calendar"; type = "main"; index = 0 })) }
    "Book Accepted Job In Calendar" = @{ main = @(, @(@{ node = "Build Acceptance Response"; type = "main"; index = 0 })) }
    "Build Acceptance Response" = @{ main = @(, @(@{ node = "Build Accepted Template Payload"; type = "main"; index = 0 })) }
    "Build Accepted Template Payload" = @{ main = @(, @(@{ node = "Render Accepted Template"; type = "main"; index = 0 })) }
    "Render Accepted Template" = @{ main = @(, @(@{ node = "Apply Accepted Template"; type = "main"; index = 0 })) }
    "Apply Accepted Template" = @{ main = @(, @(
        @{ node = "Email Customer Accepted Scheduled"; type = "main"; index = 0 },
        @{ node = "Email Internal Accepted Scheduled"; type = "main"; index = 0 },
        @{ node = "Respond Accepted Quote"; type = "main"; index = 0 }
    )) }
}

$workflow = Upsert-WorkflowByName "TRADIE-QUOTES-025-Approve-Quote-Convert-To-Job" $nodes $connections

@{
    workflow = $workflow | Select-Object name,id,active
    endpoint = "$BaseUrl/webhook/quotes/accept"
    purpose = "Customer quote acceptance, job creation, George route-aware booking, and calendar scheduling"
} | ConvertTo-Json -Depth 8
