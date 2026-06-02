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

function New-NodeId { return [guid]::NewGuid().ToString() }

function New-ExecuteWorkflowTriggerNode($X, $Y) {
    return @{
        parameters = @{
            inputSource = "passthrough"
        }
        type = "n8n-nodes-base.executeWorkflowTrigger"
        typeVersion = 1.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "When George Tool Is Called"
    }
}

function New-HttpRequestNode($X, $Y) {
    return @{
        parameters = @{
            method = "POST"
            url = "http://localhost:5678/webhook/agents/george/schedule-recommendation"
            sendBody = $true
            contentType = "json"
            specifyBody = "json"
            jsonBody = "={{ JSON.stringify(`$json) }}"
            options = @{ timeout = 20000 }
        }
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Call George Schedule Recommendation"
    }
}

function New-ParseToolInputNode($X, $Y) {
    $code = @'
const raw = items[0]?.json ?? {};
const text = String(raw.input || raw.tool_input || raw.query || '').trim();

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    return value;
  }
  return '';
}

function field(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}\\s*:\\s*([^,\\n]+)`, 'i');
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

const payload = {
  booking_action: first(raw.booking_action, field('booking_action'), 'preview'),
  lead_id: first(raw.lead_id, field('lead_id'), ''),
  quote_id: first(raw.quote_id, field('quote_id'), ''),
  customer_name: first(raw.customer_name, field('customer_name'), ''),
  customer_email: first(raw.customer_email, field('customer_email'), ''),
  customer_address: first(raw.customer_address, field('customer_address'), field('address'), ''),
  customer_suburb: first(raw.customer_suburb, field('customer_suburb'), field('suburb'), ''),
  trade_type: first(raw.trade_type, field('trade_type'), 'electrical'),
  job_description: first(raw.job_description, field('job_description'), ''),
  preferred_date: first(raw.preferred_date, field('preferred_date'), ''),
  preferred_window: first(raw.preferred_window, field('preferred_window'), field('time'), ''),
  urgency: first(raw.urgency, field('urgency'), 'normal'),
};

return [{ json: payload }];
'@

    return @{
        parameters = @{ jsCode = $code }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Parse George Tool Input"
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

$nodes = @(
    (New-ExecuteWorkflowTriggerNode 0 0),
    (New-ParseToolInputNode 260 0),
    (New-HttpRequestNode 520 0)
)

$connections = @{
    "When George Tool Is Called" = @{
        main = @(, @(@{ node = "Parse George Tool Input"; type = "main"; index = 0 }))
    }
    "Parse George Tool Input" = @{
        main = @(, @(@{ node = "Call George Schedule Recommendation"; type = "main"; index = 0 }))
    }
}

$result = Upsert-WorkflowByName "TRADIE-TOOL-George-Schedule-Recommendation" $nodes $connections
$result | Select-Object name,id,active | ConvertTo-Json -Depth 5
