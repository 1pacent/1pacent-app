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

$geminiCredential = @{
    id = "Y4LdXQTb6pHuCvri"
    name = "Google Gemini(PaLM) Api account"
}

function New-NodeId { return [guid]::NewGuid().ToString() }

function New-WebhookNode($X, $Y) {
    return @{
        parameters = @{
            httpMethod = "POST"
            path = "agents/george/gemini-test"
            responseMode = "responseNode"
            options = @{}
        }
        type = "n8n-nodes-base.webhook"
        typeVersion = 2.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "George Gemini Test Webhook"
        webhookId = New-NodeId
    }
}

function New-AgentNode($X, $Y) {
    $systemMessage = @'
You are George Foreman, the scheduling operations AI Agent for 1pacent.

Use your scheduling tool when asked to recommend or hold appointment windows. Keep customer-facing wording concise. Do not mention internal tool names, n8n, databases, or workflow details to customers.

For preview requests, recommend a window and ask whether the customer wants to use it. For booking requests with lead_id, hold the accepted window and say the written confirmation should be sent now.
'@

    return @{
        parameters = @{
            promptType = "define"
            text = "={{`$json.body.chatInput || `$json.body.message || `$json.chatInput || `$json.message}}"
            options = @{
                systemMessage = $systemMessage
                maxIterations = 5
                returnIntermediateSteps = $false
            }
        }
        type = "@n8n/n8n-nodes-langchain.agent"
        typeVersion = 3
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "George Foreman Gemini Agent"
    }
}

function New-GeminiModelNode($X, $Y) {
    return @{
        parameters = @{
            modelName = "models/gemini-3.1-flash-lite"
            options = @{}
        }
        type = "@n8n/n8n-nodes-langchain.lmChatGoogleGemini"
        typeVersion = 1.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Google Gemini Chat Model"
        credentials = @{
            googlePalmApi = $geminiCredential
        }
    }
}

function New-ScheduleToolNode($X, $Y) {
    return @{
        parameters = @{
            name = "schedule_recommendation"
            description = "Preview or hold tradie schedule windows. Use booking_action preview before customer acceptance. Use booking_action book after acceptance and include lead_id. Inputs: booking_action, lead_id, quote_id, customer_name, customer_email, customer_address, customer_suburb, trade_type, job_description, preferred_date, preferred_window, urgency."
            workflowId = @{
                __rl = $true
                value = "RvI8P4NXM1GS3Sr9"
                mode = "id"
            }
            workflowInputs = @{
                mappingMode = "defineBelow"
                value = @{
                    booking_action = "={{ `$fromAI('booking_action', 'preview or book', 'string') }}"
                    lead_id = "={{ `$fromAI('lead_id', 'lead id required only for booking hold', 'string') }}"
                    quote_id = "={{ `$fromAI('quote_id', 'quote id if available', 'string') }}"
                    customer_name = "={{ `$fromAI('customer_name', 'customer name', 'string') }}"
                    customer_email = "={{ `$fromAI('customer_email', 'customer email', 'string') }}"
                    customer_address = "={{ `$fromAI('customer_address', 'customer job address', 'string') }}"
                    customer_suburb = "={{ `$fromAI('customer_suburb', 'customer suburb', 'string') }}"
                    trade_type = "={{ `$fromAI('trade_type', 'trade type', 'string') }}"
                    job_description = "={{ `$fromAI('job_description', 'job description', 'string') }}"
                    preferred_date = "={{ `$fromAI('preferred_date', 'preferred date YYYY-MM-DD if known', 'string') }}"
                    preferred_window = "={{ `$fromAI('preferred_window', 'preferred appointment window', 'string') }}"
                    urgency = "={{ `$fromAI('urgency', 'urgent normal or flexible', 'string') }}"
                }
                matchingColumns = @()
                schema = @()
                attemptToConvertTypes = $false
                convertFieldsToString = $true
            }
        }
        type = "@n8n/n8n-nodes-langchain.toolWorkflow"
        typeVersion = 2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "schedule_recommendation"
    }
}

function New-RespondNode($X, $Y) {
    return @{
        parameters = @{
            respondWith = "json"
            responseBody = "={{`$json}}"
            options = @{}
        }
        type = "n8n-nodes-base.respondToWebhook"
        typeVersion = 1.5
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Respond George Gemini Test"
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

$nodes = @(
    (New-WebhookNode 0 0),
    (New-AgentNode 300 0),
    (New-GeminiModelNode 300 260),
    (New-ScheduleToolNode 620 220),
    (New-RespondNode 620 0)
)

$connections = @{
    "George Gemini Test Webhook" = @{
        main = @(, @(@{ node = "George Foreman Gemini Agent"; type = "main"; index = 0 }))
    }
    "Google Gemini Chat Model" = @{
        ai_languageModel = @(, @(@{ node = "George Foreman Gemini Agent"; type = "ai_languageModel"; index = 0 }))
    }
    "schedule_recommendation" = @{
        ai_tool = @(, @(@{ node = "George Foreman Gemini Agent"; type = "ai_tool"; index = 0 }))
    }
    "George Foreman Gemini Agent" = @{
        main = @(, @(@{ node = "Respond George Gemini Test"; type = "main"; index = 0 }))
    }
}

$result = Upsert-WorkflowByName "TRADIE-AGENT-032-George-Foreman-Gemini-Test" $nodes $connections
$result | Select-Object name,id,active | ConvertTo-Json -Depth 5
