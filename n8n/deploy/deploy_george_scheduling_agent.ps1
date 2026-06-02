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

function New-HttpRequestNode($Name, $X, $Y) {
    return @{
        parameters = @{
            method = "POST"
            url = "http://localhost:5678/webhook/schedule/book-job"
            sendBody = $true
            contentType = "json"
            specifyBody = "json"
            jsonBody = "={{ JSON.stringify(`$json) }}"
            options = @{
                timeout = 20000
            }
        }
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
        position = @([int]$X, [int]$Y)
        id = [guid]::NewGuid().ToString()
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

$prepareSchedulerPayloadCode = @'
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

function inferDurationMinutes(jobDescription, tradeType) {
  const text = `${jobDescription || ''} ${tradeType || ''}`.toLowerCase();
  if (text.includes('install') && text.includes('power point')) return 120;
  if (text.includes('quote') || text.includes('inspection')) return 60;
  if (text.includes('urgent') || text.includes('fault')) return 90;
  return 120;
}

function boolValue(value) {
  if (value === true) return true;
  if (value === false) return false;
  const text = String(value ?? '').toLowerCase().trim();
  return ['true', 'yes', 'book', 'hold', 'confirm', 'accepted'].includes(text);
}

const bookingAction = first(body.booking_action, body.action, body.intent, 'preview');
const shouldHold = boolValue(first(body.persist_schedule, body.hold_slot, body.create_hold, bookingAction, false));

const payload = {
  lead_id: first(body.lead_id, body.reference, ''),
  quote_id: first(body.quote_id, ''),
  job_id: first(body.job_id, ''),
  customer_name: first(body.customer_name, body.name, ''),
  customer_email: first(body.customer_email, body.email, ''),
  customer_address: first(body.customer_address, body.address, ''),
  customer_suburb: first(body.customer_suburb, body.suburb, ''),
  trade_type: first(body.trade_type, body.category, 'electrical'),
  preferred_date: first(body.preferred_date, ''),
  preferred_window: first(body.preferred_window, body.preferred_time, body.booking_window, ''),
  urgency: first(body.urgency, 'normal'),
  job_description: first(body.job_description, body.description, ''),
  estimated_duration_minutes: Number(first(body.estimated_duration_minutes, body.duration_minutes, inferDurationMinutes(body.job_description, body.trade_type))),
  booking_action: bookingAction,
  persist_schedule: shouldHold,
};

const required = ['trade_type', 'preferred_window', 'customer_suburb'];
if (shouldHold && !payload.lead_id) required.push('lead_id');
const missing = required.filter((field) => !payload[field]);
if (missing.length) {
  return [{
    json: {
      agent: 'George Foreman',
      success: false,
      status: 'needs_input',
      missing_information: missing,
      customer_message: 'I need a little more information before I can check the schedule.',
      payload,
    },
  }];
}

return [{ json: payload }];
'@

$georgeDecisionCode = @'
const schedule = items[0]?.json ?? {};

const hasSlot = Boolean(schedule.success && schedule.scheduled_start_local && schedule.scheduled_end_local);
const isHeld = schedule.persist_schedule === true;
const customerMessage = hasSlot
  ? isHeld
    ? `I have added ${schedule.scheduled_start_local} to ${schedule.scheduled_end_local} to the booking request. Send the written booking request confirmation now.`
    : `I can request ${schedule.scheduled_start_local} to ${schedule.scheduled_end_local}. Ask the customer if they would like to use that window for the booking request.`
  : 'I could not find a suitable slot from the current tradie availability. The team will need to confirm the next available time manually.';

const georgeDecision = {
  agent: 'George Foreman',
  success: hasSlot,
  status: hasSlot ? (isHeld ? 'schedule_held' : 'schedule_preview_recommended') : 'schedule_needs_manual_review',
  lead_id: schedule.lead_id || '',
  quote_id: schedule.quote_id || '',
  job_id: schedule.job_id || '',
  schedule_slot_id: schedule.schedule_slot_id || '',
  recommended_window: hasSlot ? `${schedule.scheduled_start_local} to ${schedule.scheduled_end_local}` : '',
  tradie_id: schedule.tradie_id || '',
  tradie_name: schedule.tradie_name || '',
  customer_message: customerMessage,
  internal_reasoning: {
    scheduling_score: schedule.scheduling_score,
    estimated_travel_minutes: schedule.estimated_travel_minutes,
    estimated_duration_minutes: schedule.estimated_duration_minutes,
    scheduling_reason: schedule.scheduling_reason || schedule.reason || '',
    timezone: schedule.timezone || 'Australia/Sydney',
    slot_held: isHeld,
  },
  scheduler_response: schedule,
};

return [{ json: georgeDecision }];
'@

$logSqlCode = @'
const decision = items[0]?.json ?? {};

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const summary = decision.success
  ? `George recommended ${decision.recommended_window} with ${decision.tradie_name || 'a matching tradie'}.`
  : `George could not recommend a slot: ${decision.status}.`;

const query = `
INSERT INTO agent_interactions (
  agent_name, lead_id, conversation_id, transcript, summary, payload
)
VALUES (
  'George Foreman',
  ${sql(decision.lead_id)},
  ${sql(decision.schedule_slot_id)},
  ${sql(decision.customer_message)},
  ${sql(summary)},
  ${jsonSql(decision)}
);

INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
VALUES (
  'agent',
  ${sql(decision.schedule_slot_id || decision.lead_id || 'george')},
  ${sql(decision.success ? 'george_schedule_recommended' : 'george_schedule_manual_review')},
  ${jsonSql(decision)}
);

SELECT ${jsonSql(decision)} AS george_decision;
`;

return [{ json: { ...decision, sql: query } }];
'@

$nodes = @(
    (New-WebhookNode "George Scheduling Agent Webhook" "agents/george/schedule-recommendation" "POST" 0 0),
    (New-CodeNode "Prepare Scheduler Payload" $prepareSchedulerPayloadCode 260 0),
    (New-HttpRequestNode "Call Schedule Engine" 520 0),
    (New-CodeNode "George Scheduling Decision" $georgeDecisionCode 780 0),
    (New-RespondNode "Respond George" '={{$json}}' 1040 0),
    (New-CodeNode "Build George Memory SQL" $logSqlCode 1300 0),
    (New-PostgresNode "Save George Memory" 1560 0)
)

$connections = @{
    "George Scheduling Agent Webhook" = @{ main = @(, @(@{ node = "Prepare Scheduler Payload"; type = "main"; index = 0 })) }
    "Prepare Scheduler Payload" = @{ main = @(, @(@{ node = "Call Schedule Engine"; type = "main"; index = 0 })) }
    "Call Schedule Engine" = @{ main = @(, @(@{ node = "George Scheduling Decision"; type = "main"; index = 0 })) }
    "George Scheduling Decision" = @{ main = @(, @(@{ node = "Respond George"; type = "main"; index = 0 })) }
    "Respond George" = @{ main = @(, @(@{ node = "Build George Memory SQL"; type = "main"; index = 0 })) }
    "Build George Memory SQL" = @{ main = @(, @(@{ node = "Save George Memory"; type = "main"; index = 0 })) }
}

$result = Upsert-WorkflowByName "TRADIE-SCHEDULE-032-George-Scheduling-Agent" $nodes $connections
$result | Select-Object name,id,active | ConvertTo-Json -Depth 5
