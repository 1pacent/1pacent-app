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

$buildSqlCode = @'
const raw = items[0]?.json ?? {};
const source = raw.query ?? raw.body ?? raw;

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseDate(value) {
  const text = String(value || '').toLowerCase();
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const now = new Date();
  if (text.includes('tomorrow')) now.setDate(now.getDate() + 1);
  return now.toISOString().slice(0, 10);
}

const workDate = parseDate(source.work_date || source.date);
const tradieId = source.tradie_id || '';

const query = `
WITH day_slots AS (
  SELECT
    ss.*,
    t.name AS tradie_name,
    (ss.scheduled_start AT TIME ZONE 'Australia/Sydney') AS scheduled_start_local,
    (ss.scheduled_end AT TIME ZONE 'Australia/Sydney') AS scheduled_end_local
  FROM job_schedule_slots ss
  LEFT JOIN tradies t ON t.id = ss.tradie_id
  WHERE (ss.scheduled_start AT TIME ZONE 'Australia/Sydney')::date = ${sql(workDate)}::date
    AND (${sql(tradieId)} IS NULL OR ss.tradie_id = ${sql(tradieId)})
    AND ss.status NOT IN ('cancelled', 'declined')
),
ordered AS (
  SELECT * FROM day_slots ORDER BY tradie_id, scheduled_start
)
SELECT jsonb_build_object(
  'agent', 'George Foreman',
  'success', true,
  'work_date', ${sql(workDate)},
  'tradie_id', ${sql(tradieId)},
  'slot_count', (SELECT count(*) FROM ordered),
  'estimated_total_travel_minutes', COALESCE((SELECT sum(estimated_travel_minutes) FROM ordered), 0),
  'estimated_total_job_minutes', COALESCE((SELECT sum(estimated_duration_minutes) FROM ordered), 0),
  'day_plan', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'schedule_slot_id', id,
      'job_id', job_id,
      'lead_id', lead_id,
      'quote_id', quote_id,
      'tradie_id', tradie_id,
      'tradie_name', tradie_name,
      'status', status,
      'scheduled_start_local', scheduled_start_local,
      'scheduled_end_local', scheduled_end_local,
      'customer_suburb', customer_suburb,
      'estimated_duration_minutes', estimated_duration_minutes,
      'estimated_travel_minutes', estimated_travel_minutes,
      'inbound_travel_minutes', inbound_travel_minutes,
      'outbound_travel_minutes', outbound_travel_minutes,
      'previous_schedule_slot_id', previous_schedule_slot_id,
      'next_schedule_slot_id', next_schedule_slot_id,
      'route_context', route_context,
      'scheduling_score', scheduling_score,
      'scheduling_reason', scheduling_reason
    ) ORDER BY tradie_id, scheduled_start)
    FROM ordered
  ), '[]'::jsonb)
) AS george_day_plan;
`;

return [{ json: { work_date: workDate, tradie_id: tradieId, sql: query } }];
'@

$nodes = @(
    (New-WebhookNode "George Day Plan Webhook" "agents/george/day-plan" "GET" 0 0),
    (New-CodeNode "Build George Day Plan SQL" $buildSqlCode 260 0),
    (New-PostgresNode "Read George Day Plan" 520 0),
    (New-RespondNode "Respond George Day Plan" '={{$json.george_day_plan}}' 780 0)
)

$connections = @{
    "George Day Plan Webhook" = @{ main = @(, @(@{ node = "Build George Day Plan SQL"; type = "main"; index = 0 })) }
    "Build George Day Plan SQL" = @{ main = @(, @(@{ node = "Read George Day Plan"; type = "main"; index = 0 })) }
    "Read George Day Plan" = @{ main = @(, @(@{ node = "Respond George Day Plan"; type = "main"; index = 0 })) }
}

$result = Upsert-WorkflowByName "TRADIE-SCHEDULE-033-George-Day-Plan-Tool" $nodes $connections
$result | Select-Object name,id,active | ConvertTo-Json -Depth 5
