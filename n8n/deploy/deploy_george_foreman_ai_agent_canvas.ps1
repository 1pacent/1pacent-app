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

function New-NodeId {
    return [guid]::NewGuid().ToString()
}

function New-ChatTriggerNode($X, $Y) {
    return @{
        parameters = @{}
        type = "@n8n/n8n-nodes-langchain.chatTrigger"
        typeVersion = 1.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Chat with George"
        webhookId = New-NodeId
    }
}

function New-AgentNode($X, $Y) {
    $systemMessage = @'
You are George Foreman, the scheduling operations AI Agent for 1pacent.

You live inside n8n. Sally is the only customer-facing voice/chat agent in ElevenLabs. Sally asks you for scheduling recommendations and booking actions; you coordinate n8n scheduling tools and return concise operational decisions.

Your business rules are stored in Postgres under agent_key george_foreman. At the start of operational work, use load_business_rules and follow those rules. Use memory_load when a lead_id or job_id is available, and memory_save after important scheduling decisions.
Your business capability knowledge is stored in Postgres knowledge collections. Use knowledge_search before schedule, quote-to-job, route efficiency, and assignment decisions. Use knowledge_save when a new reusable scheduling, quote accuracy, customer objection, route, or tradie productivity lesson is learned.
Reusable MCP-style services and Skills are registered in Postgres. Use mcp_service_search to discover reusable capabilities and credentials. Use skills_search before applying business capability practice. Use skills_save when a reusable best-practice skill should be created or improved.

Your goals:
- Recommend efficient tradie appointment windows.
- Reduce wasted travel time.
- Avoid double-booking.
- Respect customer preferred windows where possible.
- Keep booking request confirmation fast.
- Never invent availability.
- Never promise final trade work is confirmed before tradie scope and price are confirmed.

Tool rules:
- Use load_business_rules to retrieve editable business rules.
- Use memory_load to retrieve relevant shared memory.
- Use memory_save after important decisions.
- Use knowledge_search to retrieve accumulated business capability knowledge.
- Use knowledge_save to capture reusable business-specific lessons that improve the 1pacent moat.
- Use mcp_service_search when you need to discover reusable services such as Gmail, Calendar, Sheets, Drive, Docs, Skills, Memory, or Knowledge.
- Use skills_search to retrieve leading best-practice business capability skills before making decisions.
- Use skills_save to improve the Skills list when a repeatable best practice has been learned.
- Use google_calendar_busy when a date/window is known, so calendar events can block recommendations.
- For availability checks, use the Schedule Recommendation tool with booking_action "preview".
- When Sally says the customer accepted a window and provides a lead_id, use the Schedule Recommendation tool with booking_action "book".
- After a schedule is held and a schedule_slot_id is available, use calendar_book_job to assign up to five matching tradies from the same tradie company and create the labelled Google Calendar booking.
- Use Day Plan when asked to inspect a tradie's route, workload, or travel efficiency for a date.

Output rules:
- Return practical, structured, customer-safe wording Sally can say.
- Do not expose internal workflow names, databases, n8n details, scores, or tool names to the customer.
- Do not expose knowledge store or moat language to customers. Use it internally to make better decisions.
- If a requested time is unavailable, recommend the closest efficient alternative and explain simply.
- If a slot is previewed but not held, say it can be requested, not that it is confirmed.
- If a slot is booked/held after acceptance, say the booking request has been recorded and the written confirmation should be sent now.
- If calendar_book_job succeeds, say the booking request has been placed in the company calendar and the assigned team is visible internally.

Preferred response format:
status: preview_recommended | schedule_held | manual_review
recommended_window: concise date/time window
customer_message: one sentence Sally can say
internal_note: short operational reason for the team
'@

    return @{
        parameters = @{
            options = @{
                systemMessage = $systemMessage
                maxIterations = 5
                returnIntermediateSteps = $false
                enableStreaming = $false
            }
        }
        type = "@n8n/n8n-nodes-langchain.agent"
        typeVersion = 3
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "George Foreman"
    }
}

function New-OpenRouterModelNode($X, $Y) {
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

function New-MemoryNode($X, $Y) {
    return @{
        parameters = @{
            sessionIdType = "fromInput"
            contextWindowLength = 10
        }
        type = "@n8n/n8n-nodes-langchain.memoryBufferWindow"
        typeVersion = 1.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "George Short Memory"
    }
}

function New-ScheduleToolNode($X, $Y) {
    $description = @'
Use this tool to preview or hold a tradie schedule window.

Inputs:
- booking_action: preview or book. Use preview before customer acceptance. Use book only after customer acceptance and when a lead_id exists.
- lead_id: required for book, optional for preview.
- quote_id: optional.
- customer_name: optional.
- customer_email: optional.
- customer_address: job address or suburb.
- customer_suburb: job suburb.
- trade_type: electrical, plumbing, HVAC, carpentry, roofing, appliance repair, or general maintenance.
- job_description: short description of work.
- preferred_date: optional YYYY-MM-DD.
- preferred_window: requested window such as Thursday at 2 pm.
- urgency: urgent, normal, or flexible.

Return the recommended window and customer-safe wording.
'@

    return @{
        parameters = @{
            name = "schedule_recommendation"
            description = $description
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

function New-DayPlanToolNode($X, $Y) {
    $description = @'
Use this tool to inspect a tradie's day plan, route, workload, booked slots, travel assumptions, and total scheduled job minutes for a date.

Inputs:
- work_date: required, preferably YYYY-MM-DD.
- tradie_id: optional. If unknown, leave blank to inspect all tradies.
'@

    return @{
        parameters = @{
            url = "http://localhost:5678/webhook/agents/george/day-plan?work_date={work_date}&tradie_id={tradie_id}"
            method = "GET"
            options = @{
                timeout = 20000
            }
            toolDescription = $description
        }
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "day_plan"
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
            content = "## George Foreman AI Agent`nVisible n8n AI Agent for scheduling operations.`n`nModular pattern for future agents:`n- Gemini chat model`n- Editable business rules in Postgres`n- Shared Postgres memory`n- Workflow tools for reliable operations`n- Google Calendar as availability source`n- Deterministic scheduler for final decisions"
            height = 260
            width = 360
            color = 5
        }
        type = "n8n-nodes-base.stickyNote"
        typeVersion = 1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "George Architecture Note"
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
    (New-ChatTriggerNode 0 0),
    (New-AgentNode 360 0),
    (New-OpenRouterModelNode 260 260),
    (New-MemoryNode 520 260),
    (New-ScheduleToolNode 780 120),
    (New-WorkflowToolNode "google_calendar_busy" "bDhl5QbvMTqlQUlx" "Check Google Calendar busy events for a work date/window before making schedule recommendations." @{
        preferred_date = "={{ `$fromAI('preferred_date', 'preferred date YYYY-MM-DD', 'string') }}"
        preferred_window = "={{ `$fromAI('preferred_window', 'preferred time window', 'string') }}"
        calendar_id = "={{ `$fromAI('calendar_id', 'calendar id, default mac@1pacent.com if unknown', 'string') }}"
    } 780 360),
    (New-WorkflowToolNode "calendar_book_job" "dBsrikO3SIzReKmg" "After a schedule has been held, assign up to five available tradies from the same company and create a clearly labelled Google Calendar event." @{
        schedule_slot_id = "={{ `$fromAI('schedule_slot_id', 'schedule slot id returned by schedule_recommendation', 'string') }}"
        lead_id = "={{ `$fromAI('lead_id', 'lead id', 'string') }}"
        job_id = "={{ `$fromAI('job_id', 'job id if available', 'string') }}"
        quote_id = "={{ `$fromAI('quote_id', 'quote id if available', 'string') }}"
        company_id = "={{ `$fromAI('company_id', 'tradie company id, default COMP-1PACENT-DEFAULT if unknown', 'string') }}"
        tradie_count = "={{ `$fromAI('tradie_count', 'number of tradies required, maximum 5', 'number') }}"
        trade_type = "={{ `$fromAI('trade_type', 'trade type', 'string') }}"
        calendar_id = "={{ `$fromAI('calendar_id', 'Google Calendar id, default mac@1pacent.com if unknown', 'string') }}"
    } 780 580),
    (New-WorkflowToolNode "load_business_rules" "BwfXpBfMdl25XEdZ" "Load editable business rules for the requested agent from Postgres." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as george_foreman', 'string') }}"
    } 1080 40),
    (New-WorkflowToolNode "memory_load" "GimZUvEDEP8sVwI2" "Load shared Postgres memory for an agent, lead, or job." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as george_foreman', 'string') }}"
        lead_id = "={{ `$fromAI('lead_id', 'lead id if available', 'string') }}"
        job_id = "={{ `$fromAI('job_id', 'job id if available', 'string') }}"
    } 1080 260),
    (New-WorkflowToolNode "memory_save" "W0VvE8kWYzl4vfL3" "Save an important agent decision or interaction to shared Postgres memory." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as george_foreman', 'string') }}"
        agent_name = "={{ `$fromAI('agent_name', 'agent display name', 'string') }}"
        lead_id = "={{ `$fromAI('lead_id', 'lead id if available', 'string') }}"
        job_id = "={{ `$fromAI('job_id', 'job id if available', 'string') }}"
        memory_type = "={{ `$fromAI('memory_type', 'interaction decision or tool_result', 'string') }}"
        summary = "={{ `$fromAI('summary', 'short summary to remember', 'string') }}"
    } 1080 480),
    (New-WorkflowToolNode "knowledge_search" "GxQAF82yRIlkqbK8" "Search the agent's accumulated business capability knowledge before making scheduling, route, assignment, or quote-to-job decisions." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as george_foreman', 'string') }}"
        collection_key = "={{ `$fromAI('collection_key', 'optional collection key such as scheduling_knowledge or quote_to_job_learning', 'string') }}"
        query = "={{ `$fromAI('query', 'what business knowledge to search for', 'string') }}"
        trade_type = "={{ `$fromAI('trade_type', 'trade type if relevant', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum search results', 'number') }}"
    } 1380 160),
    (New-WorkflowToolNode "knowledge_save" "KGK3Cj2E8VCxFBBY" "Save a reusable business-specific lesson to the agent knowledge store so future decisions improve." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as george_foreman', 'string') }}"
        collection_key = "={{ `$fromAI('collection_key', 'collection key such as scheduling_knowledge or quote_to_job_learning', 'string') }}"
        title = "={{ `$fromAI('title', 'short knowledge title', 'string') }}"
        content = "={{ `$fromAI('content', 'specific reusable business lesson', 'string') }}"
        tags = "={{ `$fromAI('tags', 'comma separated tags', 'string') }}"
        trade_type = "={{ `$fromAI('trade_type', 'trade type if relevant', 'string') }}"
        entity_type = "={{ `$fromAI('entity_type', 'lead job quote schedule_slot or agent_capability', 'string') }}"
        entity_id = "={{ `$fromAI('entity_id', 'related entity id if available', 'string') }}"
        confidence = "={{ `$fromAI('confidence', 'confidence from 0 to 1', 'number') }}"
        usefulness_score = "={{ `$fromAI('usefulness_score', 'usefulness score from 0 to 10', 'number') }}"
    } 1380 380),
    (New-WorkflowToolNode "mcp_service_search" "Yxxovcn4MYZgyhe2" "Discover reusable MCP-style services and tools available to this agent or workflow." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as george_foreman', 'string') }}"
        category = "={{ `$fromAI('category', 'optional service category such as scheduling communication records documents agent_capability', 'string') }}"
        query = "={{ `$fromAI('query', 'service capability to search for', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum search results', 'number') }}"
    } 1680 80),
    (New-WorkflowToolNode "skills_search" "HMi7xtGQXxMhOCug" "Search reusable business capability Skills stored in Postgres." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as george_foreman', 'string') }}"
        category = "={{ `$fromAI('category', 'optional skill category such as scheduling quoting intake', 'string') }}"
        query = "={{ `$fromAI('query', 'skill or best-practice capability to search for', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum search results', 'number') }}"
    } 1680 300),
    (New-WorkflowToolNode "skills_save" "Jdk4PIpLuODNnEK4" "Create or improve a reusable business capability Skill in Postgres." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as george_foreman', 'string') }}"
        skill_key = "={{ `$fromAI('skill_key', 'stable skill key if updating an existing skill', 'string') }}"
        skill_name = "={{ `$fromAI('skill_name', 'short skill name', 'string') }}"
        capability = "={{ `$fromAI('capability', 'business capability this skill improves', 'string') }}"
        category = "={{ `$fromAI('category', 'skill category', 'string') }}"
        description = "={{ `$fromAI('description', 'short description of the skill', 'string') }}"
        best_practice = "={{ `$fromAI('best_practice', 'clear best-practice procedure', 'string') }}"
        guardrails = "={{ `$fromAI('guardrails', 'constraints and risks', 'string') }}"
        tags = "={{ `$fromAI('tags', 'comma separated tags', 'string') }}"
        usefulness_score = "={{ `$fromAI('usefulness_score', 'usefulness score from 0 to 10', 'number') }}"
    } 1680 520),
    (New-StickyNoteNode -20 -340)
)

$connections = @{
    "Chat with George" = @{
        main = @(, @(@{ node = "George Foreman"; type = "main"; index = 0 }))
    }
    "Google Gemini Chat Model" = @{
        ai_languageModel = @(, @(@{ node = "George Foreman"; type = "ai_languageModel"; index = 0 }))
    }
    "George Short Memory" = @{
        ai_memory = @(, @(@{ node = "George Foreman"; type = "ai_memory"; index = 0 }))
    }
    "schedule_recommendation" = @{
        ai_tool = @(, @(@{ node = "George Foreman"; type = "ai_tool"; index = 0 }))
    }
    "google_calendar_busy" = @{
        ai_tool = @(, @(@{ node = "George Foreman"; type = "ai_tool"; index = 0 }))
    }
    "calendar_book_job" = @{
        ai_tool = @(, @(@{ node = "George Foreman"; type = "ai_tool"; index = 0 }))
    }
    "load_business_rules" = @{
        ai_tool = @(, @(@{ node = "George Foreman"; type = "ai_tool"; index = 0 }))
    }
    "memory_load" = @{
        ai_tool = @(, @(@{ node = "George Foreman"; type = "ai_tool"; index = 0 }))
    }
    "memory_save" = @{
        ai_tool = @(, @(@{ node = "George Foreman"; type = "ai_tool"; index = 0 }))
    }
    "knowledge_search" = @{
        ai_tool = @(, @(@{ node = "George Foreman"; type = "ai_tool"; index = 0 }))
    }
    "knowledge_save" = @{
        ai_tool = @(, @(@{ node = "George Foreman"; type = "ai_tool"; index = 0 }))
    }
    "mcp_service_search" = @{
        ai_tool = @(, @(@{ node = "George Foreman"; type = "ai_tool"; index = 0 }))
    }
    "skills_search" = @{
        ai_tool = @(, @(@{ node = "George Foreman"; type = "ai_tool"; index = 0 }))
    }
    "skills_save" = @{
        ai_tool = @(, @(@{ node = "George Foreman"; type = "ai_tool"; index = 0 }))
    }
}

$result = Upsert-WorkflowByName "TRADIE-AGENT-032-George-Foreman-AI-Agent" $nodes $connections
$result | Select-Object name,id,active | ConvertTo-Json -Depth 5
