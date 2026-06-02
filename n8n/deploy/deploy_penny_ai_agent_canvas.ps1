$ErrorActionPreference = "Stop"

$BaseUrl = "https://vmi3305336.contaboserver.net"
$ApiKey = $env:N8N_API_KEY
if (-not $ApiKey) { throw "Set N8N_API_KEY in the environment before running this script." }

$Headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "accept" = "application/json"
}

$geminiCredential = @{
    id = "Y4LdXQTb6pHuCvri"
    name = "Google Gemini(PaLM) Api account"
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

function New-HttpRequestNode($Name, $Method, $Url, $X, $Y, $JsonBody = $null) {
    $params = @{
        method = $Method
        url = $Url
        options = @{ timeout = 30000 }
    }
    if ($JsonBody) {
        $params.sendBody = $true
        $params.contentType = "json"
        $params.specifyBody = "json"
        $params.jsonBody = $JsonBody
    }
    return @{
        parameters = $params
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = $Name
    }
}

function New-ChatTriggerNode($X, $Y) {
    return @{
        parameters = @{}
        type = "@n8n/n8n-nodes-langchain.chatTrigger"
        typeVersion = 1.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Chat with Penny"
        webhookId = New-NodeId
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
        credentials = @{ googlePalmApi = $geminiCredential }
    }
}

function New-MemoryNode($X, $Y) {
    return @{
        parameters = @{
            sessionIdType = "fromInput"
            contextWindowLength = 12
        }
        type = "@n8n/n8n-nodes-langchain.memoryBufferWindow"
        typeVersion = 1.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Penny Short Memory"
    }
}

function New-AgentNode($X, $Y) {
    $systemMessage = @'
You are Penny, the Payments, Invoice Collection, and Faster-Cashflow AI Agent for 1pacent.

You live inside n8n. Your job is to help tradie businesses get paid faster while keeping customer trust high.

Your mission:
- Request payment for issued invoices.
- Check payment status.
- Record payment events from manual tests or payment providers.
- Recommend respectful follow-up actions for overdue payment requests.
- Protect customer trust by keeping messages clear, polite, and transparent.
- Help the product prove a major value point: faster cash collection for tradies.

Operating rules:
- Always load business rules for agent_key penny before operational recommendations.
- Never mark payment as paid unless a payment event, provider webhook, or authorised manual confirmation is supplied.
- Never invent payment provider transaction IDs.
- If the provider is internal_placeholder or manual_test, clearly treat it as a test or placeholder.
- Prefer clear payment links, due dates, invoice references, and concise customer wording.
- Use Skills before recommending a payment collection approach.
- Save important payment/cashflow learnings to knowledge or memory.

Preferred response format:
status: payment_requested | paid | status_checked | follow_up_recommended | blocked
actions_taken: short bullets
payment_reference: payment_request_id, invoice_id, job_id where known
customer_trust_notes: any wording or risk notes
next_step: exact workflow/action to take
'@

    return @{
        parameters = @{
            options = @{
                systemMessage = $systemMessage
                maxIterations = 8
                returnIntermediateSteps = $false
                enableStreaming = $false
            }
        }
        type = "@n8n/n8n-nodes-langchain.agent"
        typeVersion = 3
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Penny"
    }
}

function New-WorkflowToolNode($Name, $WorkflowId, $Description, $Inputs, $X, $Y) {
    return @{
        parameters = @{
            name = $Name
            description = $Description
            workflowId = @{
                __rl = $true
                value = $WorkflowId
                mode = "id"
            }
            workflowInputs = @{
                mappingMode = "defineBelow"
                value = $Inputs
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
        name = $Name
    }
}

function New-StickyNoteNode($X, $Y) {
    return @{
        parameters = @{
            content = "## Penny Payments AI Agent`nVisible n8n AI Agent for payment requests, payment status, paid events, and faster-cashflow recommendations.`n`nTools:`n- request_payment`n- payment_status`n- record_payment`n- business rules, Skills, knowledge, memory`n`nGuardrails:`n- Never mark paid without event/provider/manual confirmation`n- Placeholder links stay internal until Stripe or payment provider is connected"
            height = 300
            width = 430
            color = 6
        }
        type = "n8n-nodes-base.stickyNote"
        typeVersion = 1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Penny Architecture Note"
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

$normaliseCode = @'
const raw = items[0]?.json ?? {};
return [{ json: raw.body ?? raw.query ?? raw }];
'@

$requestToolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Penny Request Payment Tool Is Called" 0 0),
    (New-CodeNode "Normalise Request Payment Input" $normaliseCode 260 0),
    (New-HttpRequestNode "Call Payment Request Endpoint" "POST" "http://localhost:5678/webhook/payments/request" 520 0 "={{ JSON.stringify(`$json) }}")
)
$requestToolConnections = @{
    "When Penny Request Payment Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Request Payment Input"; type = "main"; index = 0 })) }
    "Normalise Request Payment Input" = @{ main = @(, @(@{ node = "Call Payment Request Endpoint"; type = "main"; index = 0 })) }
}
$requestTool = Upsert-WorkflowByName "TRADIE-TOOL-Penny-Request-Payment" $requestToolNodes $requestToolConnections

$recordToolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Penny Record Payment Tool Is Called" 0 0),
    (New-CodeNode "Normalise Record Payment Input" $normaliseCode 260 0),
    (New-HttpRequestNode "Call Record Payment Endpoint" "POST" "http://localhost:5678/webhook/payments/record" 520 0 "={{ JSON.stringify(`$json) }}")
)
$recordToolConnections = @{
    "When Penny Record Payment Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Record Payment Input"; type = "main"; index = 0 })) }
    "Normalise Record Payment Input" = @{ main = @(, @(@{ node = "Call Record Payment Endpoint"; type = "main"; index = 0 })) }
}
$recordTool = Upsert-WorkflowByName "TRADIE-TOOL-Penny-Record-Payment" $recordToolNodes $recordToolConnections

$statusToolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Penny Payment Status Tool Is Called" 0 0),
    (New-CodeNode "Normalise Payment Status Input" $normaliseCode 260 0),
    (New-HttpRequestNode "Call Payment Status Endpoint" "GET" "={{'http://localhost:5678/webhook/payments/status?invoice_id=' + (`$json.invoice_id || '') + '&payment_request_id=' + (`$json.payment_request_id || '') + '&job_id=' + (`$json.job_id || '')}}" 520 0)
)
$statusToolConnections = @{
    "When Penny Payment Status Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Payment Status Input"; type = "main"; index = 0 })) }
    "Normalise Payment Status Input" = @{ main = @(, @(@{ node = "Call Payment Status Endpoint"; type = "main"; index = 0 })) }
}
$statusTool = Upsert-WorkflowByName "TRADIE-TOOL-Penny-Payment-Status" $statusToolNodes $statusToolConnections

$agentNodes = @(
    (New-ChatTriggerNode 0 0),
    (New-AgentNode 330 0),
    (New-GeminiModelNode 330 -260),
    (New-MemoryNode 330 260),
    (New-WorkflowToolNode "request_payment" $requestTool.id "Create a payment request for an issued invoice and send the customer payment email." @{
        invoice_id = "={{ `$fromAI('invoice_id', 'invoice id such as INV-2026-123456', 'string') }}"
        due_days = "={{ `$fromAI('due_days', 'number of days until due', 'number') }}"
        provider = "={{ `$fromAI('provider', 'payment provider e.g. internal_placeholder stripe', 'string') }}"
    } 700 -260),
    (New-WorkflowToolNode "payment_status" $statusTool.id "Check payment request and invoice payment status." @{
        invoice_id = "={{ `$fromAI('invoice_id', 'invoice id', 'string') }}"
        payment_request_id = "={{ `$fromAI('payment_request_id', 'payment request id', 'string') }}"
        job_id = "={{ `$fromAI('job_id', 'job id', 'string') }}"
    } 700 -40),
    (New-WorkflowToolNode "record_payment" $recordTool.id "Record a payment received event from a provider webhook or authorised manual confirmation." @{
        payment_request_id = "={{ `$fromAI('payment_request_id', 'payment request id', 'string') }}"
        invoice_id = "={{ `$fromAI('invoice_id', 'invoice id if payment_request_id unknown', 'string') }}"
        provider = "={{ `$fromAI('provider', 'provider e.g. manual_test stripe', 'string') }}"
        provider_payment_id = "={{ `$fromAI('provider_payment_id', 'provider payment or transaction id', 'string') }}"
        amount = "={{ `$fromAI('amount', 'amount paid', 'number') }}"
    } 700 180),
    (New-WorkflowToolNode "load_business_rules" "BwfXpBfMdl25XEdZ" "Load editable business rules for Penny from Postgres." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key, use penny', 'string') }}"
    } 1040 -260),
    (New-WorkflowToolNode "skills_search" "HMi7xtGQXxMhOCug" "Search reusable payment and cashflow Skills before recommendations." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key, use penny', 'string') }}"
        category = "={{ `$fromAI('category', 'skill category', 'string') }}"
        query = "={{ `$fromAI('query', 'skill search query', 'string') }}"
        limit = "={{ `$fromAI('limit', 'max results', 'number') }}"
    } 1040 -40),
    (New-WorkflowToolNode "mcp_service_search" "Yxxovcn4MYZgyhe2" "Discover reusable services such as payment providers, Gmail, memory, knowledge and Skills." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key, use penny', 'string') }}"
        category = "={{ `$fromAI('category', 'service category', 'string') }}"
        query = "={{ `$fromAI('query', 'service search query', 'string') }}"
        limit = "={{ `$fromAI('limit', 'max results', 'number') }}"
    } 1040 180),
    (New-WorkflowToolNode "knowledge_save" "KGK3Cj2E8VCxFBBY" "Save payment/cashflow lessons to knowledge." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key, use penny', 'string') }}"
        collection_key = "={{ `$fromAI('collection_key', 'collection key e.g. payment_intelligence', 'string') }}"
        title = "={{ `$fromAI('title', 'knowledge title', 'string') }}"
        content = "={{ `$fromAI('content', 'knowledge content', 'string') }}"
        tags = "={{ `$fromAI('tags', 'comma separated tags', 'string') }}"
        entity_type = "={{ `$fromAI('entity_type', 'entity type', 'string') }}"
        entity_id = "={{ `$fromAI('entity_id', 'entity id', 'string') }}"
        usefulness_score = "={{ `$fromAI('usefulness_score', 'score', 'number') }}"
    } 1360 -120),
    (New-WorkflowToolNode "memory_save" "W0VvE8kWYzl4vfL3" "Save Penny payment memory." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key, use penny', 'string') }}"
        agent_name = "={{ `$fromAI('agent_name', 'Penny', 'string') }}"
        memory_type = "={{ `$fromAI('memory_type', 'payment_request payment_paid follow_up', 'string') }}"
        summary = "={{ `$fromAI('summary', 'short memory summary', 'string') }}"
    } 1360 120),
    (New-StickyNoteNode -20 -360)
)

$agentConnections = @{
    "Chat with Penny" = @{ main = @(, @(@{ node = "Penny"; type = "main"; index = 0 })) }
    "Google Gemini Chat Model" = @{ ai_languageModel = @(, @(@{ node = "Penny"; type = "ai_languageModel"; index = 0 })) }
    "Penny Short Memory" = @{ ai_memory = @(, @(@{ node = "Penny"; type = "ai_memory"; index = 0 })) }
    "request_payment" = @{ ai_tool = @(, @(@{ node = "Penny"; type = "ai_tool"; index = 0 })) }
    "payment_status" = @{ ai_tool = @(, @(@{ node = "Penny"; type = "ai_tool"; index = 0 })) }
    "record_payment" = @{ ai_tool = @(, @(@{ node = "Penny"; type = "ai_tool"; index = 0 })) }
    "load_business_rules" = @{ ai_tool = @(, @(@{ node = "Penny"; type = "ai_tool"; index = 0 })) }
    "skills_search" = @{ ai_tool = @(, @(@{ node = "Penny"; type = "ai_tool"; index = 0 })) }
    "mcp_service_search" = @{ ai_tool = @(, @(@{ node = "Penny"; type = "ai_tool"; index = 0 })) }
    "knowledge_save" = @{ ai_tool = @(, @(@{ node = "Penny"; type = "ai_tool"; index = 0 })) }
    "memory_save" = @{ ai_tool = @(, @(@{ node = "Penny"; type = "ai_tool"; index = 0 })) }
}
$agent = Upsert-WorkflowByName "TRADIE-AGENT-064-Penny-Payments-AI-Agent" $agentNodes $agentConnections

@{
    tool_workflows = @(
        ($requestTool | Select-Object name,id,active),
        ($statusTool | Select-Object name,id,active),
        ($recordTool | Select-Object name,id,active)
    )
    ai_agent_workflow = $agent | Select-Object name,id,active
} | ConvertTo-Json -Depth 12

