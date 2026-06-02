$ErrorActionPreference = "Stop"

$BaseUrl = "https://vmi3305336.contaboserver.net"
$ApiKey = $env:N8N_API_KEY
if (-not $ApiKey) { throw "Set N8N_API_KEY in the environment before running this script." }

$Headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "accept" = "application/json"
}

function New-NodeId { return [guid]::NewGuid().ToString() }

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

function New-HttpRequestNode($Name, $Method, $Url, $X, $Y, $JsonBody = $null) {
    $parameters = @{
        method = $Method
        url = $Url
        options = @{ timeout = 20000 }
    }
    if ($JsonBody) {
        $parameters.sendBody = $true
        $parameters.contentType = "json"
        $parameters.specifyBody = "json"
        $parameters.jsonBody = $JsonBody
    }
    return @{
        parameters = $parameters
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
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

$workflows = @(
    @{
        Name = "TRADIE-TOOL-Agent-Business-Rules-Load"
        Nodes = @(
            (New-ExecuteWorkflowTriggerNode "When Business Rules Tool Is Called" 0 0),
            (New-HttpRequestNode "Load Business Rules" "GET" "={{'http://localhost:5678/webhook/core/agent-business-rules/load?agent_key=' + (`$json.agent_key || 'george_foreman')}}" 320 0)
        )
        Connections = @{
            "When Business Rules Tool Is Called" = @{ main = @(, @(@{ node = "Load Business Rules"; type = "main"; index = 0 })) }
        }
    },
    @{
        Name = "TRADIE-TOOL-Agent-Memory-Load"
        Nodes = @(
            (New-ExecuteWorkflowTriggerNode "When Memory Load Tool Is Called" 0 0),
            (New-HttpRequestNode "Load Agent Memory" "GET" "={{'http://localhost:5678/webhook/core/agent-memory/load?agent_key=' + (`$json.agent_key || 'george_foreman') + '&lead_id=' + (`$json.lead_id || '') + '&job_id=' + (`$json.job_id || '')}}" 320 0)
        )
        Connections = @{
            "When Memory Load Tool Is Called" = @{ main = @(, @(@{ node = "Load Agent Memory"; type = "main"; index = 0 })) }
        }
    },
    @{
        Name = "TRADIE-TOOL-Agent-Memory-Save"
        Nodes = @(
            (New-ExecuteWorkflowTriggerNode "When Memory Save Tool Is Called" 0 0),
            (New-HttpRequestNode "Save Agent Memory" "POST" "http://localhost:5678/webhook/core/agent-memory/save" 320 0 "={{ JSON.stringify(`$json) }}")
        )
        Connections = @{
            "When Memory Save Tool Is Called" = @{ main = @(, @(@{ node = "Save Agent Memory"; type = "main"; index = 0 })) }
        }
    }
)

$results = foreach ($workflow in $workflows) {
    Upsert-WorkflowByName $workflow.Name $workflow.Nodes $workflow.Connections | Select-Object name,id,active
}

$results | ConvertTo-Json -Depth 5
