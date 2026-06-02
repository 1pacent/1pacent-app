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
            availableInMCP = $false
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

$code = @'
const query = `
WITH updated AS (
  UPDATE job_schedule_slots
  SET status = 'cancelled',
      scheduling_reason = COALESCE(scheduling_reason, '') || ' Cancelled because it was an orphan preview hold from testing.',
      updated_at = now()
  WHERE lead_id IS NULL
    AND status = 'Schedule Proposed'
  RETURNING id, job_id, scheduled_start, scheduled_end, customer_suburb
)
SELECT jsonb_build_object(
  'success', true,
  'cancelled_orphan_preview_count', (SELECT count(*) FROM updated),
  'cancelled_slots', COALESCE((SELECT jsonb_agg(to_jsonb(updated)) FROM updated), '[]'::jsonb)
) AS cleanup;
`;
return [{ json: { sql: query } }];
'@

$nodes = @(
    (New-WebhookNode "Cleanup Orphan Schedule Previews Webhook" "admin/cleanup-orphan-schedule-previews" "POST" 0 0),
    (New-CodeNode "Build Cleanup SQL" $code 260 0),
    (New-PostgresNode "Cancel Orphan Schedule Previews" 520 0),
    (New-RespondNode "Respond Cleanup" '={{$json.cleanup}}' 780 0)
)

$connections = @{
    "Cleanup Orphan Schedule Previews Webhook" = @{ main = @(, @(@{ node = "Build Cleanup SQL"; type = "main"; index = 0 })) }
    "Build Cleanup SQL" = @{ main = @(, @(@{ node = "Cancel Orphan Schedule Previews"; type = "main"; index = 0 })) }
    "Cancel Orphan Schedule Previews" = @{ main = @(, @(@{ node = "Respond Cleanup"; type = "main"; index = 0 })) }
}

$result = Upsert-WorkflowByName "TRADIE-ADMIN-001-Cleanup-Orphan-Schedule-Previews" $nodes $connections
$result | Select-Object name,id,active | ConvertTo-Json -Depth 5
