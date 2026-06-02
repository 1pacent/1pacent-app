$ErrorActionPreference = "Stop"

$BaseUrl = "https://vmi3305336.contaboserver.net"
$ApiKey = $env:N8N_API_KEY
if (-not $ApiKey) { throw "Set N8N_API_KEY in the environment before running this script." }

$Headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "accept" = "application/json"
}

$postgresCredential = @{
    id = "fTq1Q3oE59B59Y0Y"
    name = "Tradie App Postgres"
}

$geminiCredential = @{
    id = "nzBbv8Uon1rxicjT"
    name = "Google Gemini(PaLM) Api account 2"
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

function New-ChatTriggerNode($X, $Y) {
    return @{
        parameters = @{}
        type = "@n8n/n8n-nodes-langchain.chatTrigger"
        typeVersion = 1.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Chat with Sparky"
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
            contextWindowLength = 10
        }
        type = "@n8n/n8n-nodes-langchain.memoryBufferWindow"
        typeVersion = 1.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Sparky Short Memory"
    }
}

function New-AgentNode($X, $Y) {
    $systemMessage = @'
You are Sparky, the Electrical Subject Matter Expert AI Agent for 1pacent.

You live inside n8n. Your users are qualified tradies, internal 1pacent agents, property managers, and operations staff. You are not a DIY assistant for tenants or customers.

Your mission:
- Help electricians and internal agents interpret electrical Authority Documents.
- Support safe, compliant electrical scoping, evidence, quoting, warranty/rework review, and escalation.
- Build the 1pacent moat by turning repeat electrical questions into reusable Skills, evidence checklists, and authority-backed guidance.

Critical safety guardrails:
- Do not give DIY electrical repair instructions to customers, tenants, landlords, or unqualified people.
- Do not tell anyone to perform regulated electrical work unless they are appropriately qualified/licensed.
- Do not present your interpretation as legal advice.
- When dangerous, unclear, regulated, or high-risk conditions appear, recommend escalation to a licensed electrician or human compliance owner.
- Cite Authority Documents by source, jurisdiction, version/effective date, and URL where available.
- Clearly separate "source says", "operational interpretation", "evidence to collect", and "escalation required".

Tool rules:
- Use authority_documents_search before answering compliance, safety, warranty, evidence, standard, or rental-electrical questions.
- Use load_business_rules at the start of a substantive answer.
- Use skills_search before advising on repeatable electrical SME practices.
- Use knowledge_search before answering if a job type, warranty pattern, or recurring electrical issue may have been learned previously.
- Use memory_save when you make an important SME decision, identify a reusable lesson, or flag an escalation.
- Use knowledge_save when a reusable electrical business lesson should be retained.
- Use skills_save when a new best-practice skill should be proposed or improved.

Preferred response format:
status: answered | needs_qualified_review | unsafe_do_not_proceed | needs_more_information
short_answer: concise practical answer
authority_references: source names, versions/effective dates, URLs
operational_interpretation: how 1pacent/tradie should handle it
evidence_checklist: evidence to capture on the job
escalation_required: yes/no and why
customer_safe_wording: optional short wording Sally/Patricia can safely say without technical DIY detail
'@

    return @{
        parameters = @{
            options = @{
                systemMessage = $systemMessage
                maxIterations = 7
                returnIntermediateSteps = $false
                enableStreaming = $false
            }
        }
        type = "@n8n/n8n-nodes-langchain.agent"
        typeVersion = 3
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Sparky"
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
            content = "## Sparky Electrical SME`nTrade-specific paid SME module for electricians.`n`nPattern for future agents:`n- Authority Documents semantic search`n- Gemini chat model`n- Postgres memory, knowledge, skills`n- No DIY instructions`n- Cite source/version/effective date`n- Reusable evidence checklists and Skills"
            height = 280
            width = 410
            color = 4
        }
        type = "n8n-nodes-base.stickyNote"
        typeVersion = 1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Sparky Architecture Note"
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
        if ($existing.active) {
            Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($existing.id)/deactivate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
        }
        $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($existing.id)" -Headers $Headers -Method Put -Body $body -ContentType "application/json"
    } else {
        $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows" -Headers $Headers -Method Post -Body $body -ContentType "application/json"
    }
    Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($updated.id)/activate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
    return $updated
}

$setupSqlCode = @'
const sql = `
INSERT INTO agent_definitions (
  agent_key, agent_name, agent_role, purpose, operating_scope, customer_facing, owner_domain,
  responsibilities, success_measures, handoff_triggers, guardrails, model_provider, model_name, active
) VALUES (
  'sparky_electrical',
  'Sparky',
  'Electrical compliance and field support SME AI agent',
  'Help electricians and internal agents interpret electrical Authority Documents, safety obligations, evidence expectations, warranty/rework risks, and practical compliance steps.',
  'Electrical trade SME support, authority document interpretation, compliance evidence checklists, safety escalation, and learning loops from job outcomes.',
  false,
  'trade_sme_electrical',
  '["answer electrician compliance questions with authority-document references","produce electrical evidence checklists","flag unsafe or regulated work requiring qualified review","support electrical quote and scope quality","feed best-practice learnings to Quintino"]'::jsonb,
  '["higher electrical evidence completeness","fewer repeat electrical callouts","lower rework caused by unclear scope","tradie repeat usage of Sparky module","faster compliant quote preparation"]'::jsonb,
  '["handoff legal uncertainty to human compliance owner","handoff customer scheduling to George","handoff pricing intelligence to Nelly","handoff skill lifecycle suggestions to Quintino","handoff warranty/rework patterns to Wally"]'::jsonb,
  '["do not provide DIY electrical instructions to customers or tenants","do not claim legal advice","cite source document, version, jurisdiction, effective date and URL when available","escalate dangerous or uncertain electrical safety issues","prefer official Authority Documents over informal sources"]'::jsonb,
  'google_gemini',
  'models/gemini-3.1-flash-lite',
  true
) ON CONFLICT (agent_key) DO UPDATE SET
  agent_name = excluded.agent_name,
  agent_role = excluded.agent_role,
  purpose = excluded.purpose,
  operating_scope = excluded.operating_scope,
  responsibilities = excluded.responsibilities,
  success_measures = excluded.success_measures,
  handoff_triggers = excluded.handoff_triggers,
  guardrails = excluded.guardrails,
  model_provider = excluded.model_provider,
  model_name = excluded.model_name,
  active = true,
  updated_at = now();

DELETE FROM agent_business_rules WHERE agent_key = 'sparky_electrical';
INSERT INTO agent_business_rules (agent_key, rule_group, rule_order, rule_text, active)
VALUES
  ('sparky_electrical', 'mission', 10, 'Sparky is the electrical SME agent for qualified tradies and internal workflows, not a DIY customer assistant.', true),
  ('sparky_electrical', 'authority_documents', 20, 'Use Authority Documents semantic search before answering compliance, safety, warranty, evidence, standards, or rental-electrical questions.', true),
  ('sparky_electrical', 'safety', 30, 'Do not provide step-by-step electrical repair instructions to customers, tenants, landlords, or unqualified people.', true),
  ('sparky_electrical', 'safety', 40, 'Escalate dangerous, regulated, ambiguous, or high-risk electrical issues to a licensed electrician or human compliance owner.', true),
  ('sparky_electrical', 'evidence', 50, 'Return an evidence checklist for job-facing answers: photos, test results where applicable, materials/parts, warranty terms, compliance notes, unresolved risks.', true),
  ('sparky_electrical', 'source_citation', 60, 'Cite authority name, jurisdiction, current version/effective date, and source URL where available. Do not present interpretation as legal advice.', true),
  ('sparky_electrical', 'learning', 70, 'When a repeat electrical question becomes reusable, save knowledge and propose a Skill improvement for Quintino lifecycle management.', true);

INSERT INTO agent_knowledge_collections (agent_key, collection_key, collection_name, capability, active)
VALUES
  ('sparky_electrical', 'electrical_sme_knowledge', 'Sparky Electrical SME Knowledge', 'Electrical compliance interpretation, evidence quality, safety escalation, warranty/rework learning', true)
ON CONFLICT (agent_key, collection_key) DO UPDATE SET
  collection_name = excluded.collection_name,
  capability = excluded.capability,
  active = true,
  updated_at = now();

INSERT INTO agent_skill_assignments (agent_key, skill_key, priority, active)
VALUES
  ('sparky_electrical', 'electrical_authority_interpretation_v1', 10, true),
  ('sparky_electrical', 'electrical_compliance_evidence_checklist_v1', 20, true)
ON CONFLICT (agent_key, skill_key) DO UPDATE SET priority = excluded.priority, active = true, updated_at = now();

SELECT jsonb_build_object(
  'success', true,
  'agent_key', 'sparky_electrical',
  'note', 'Sparky Electrical SME foundation is ready.',
  'business_rules', (SELECT count(*) FROM agent_business_rules WHERE agent_key = 'sparky_electrical' AND active = true),
  'skills', (SELECT count(*) FROM agent_skill_assignments WHERE agent_key = 'sparky_electrical' AND active = true)
) AS setup_result;
`;
return [{ json: { sql } }];
'@

$toolNormaliseAuthorityCode = @'
const raw = $input.first()?.json || {};
const text = String(raw.input || raw.tool_input || '').trim();

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

return [{
  json: {
    agent_key: first(raw.agent_key, field('agent_key'), 'sparky_electrical'),
    jurisdiction: first(raw.jurisdiction, field('jurisdiction'), 'AU'),
    industry: first(raw.industry, field('industry'), 'electrical'),
    trade_type: first(raw.trade_type, field('trade_type'), 'electrical'),
    query: first(raw.query, raw.question, raw.search, field('query'), text),
    limit: first(raw.limit, field('limit'), 5),
  },
}];
'@

$setupNodes = @(
    (New-WebhookNode "Sparky Setup Webhook" "agents/sparky/setup" "POST" 0 0),
    (New-CodeNode "Build Sparky Setup SQL" $setupSqlCode 260 0),
    (New-PostgresNode "Setup Sparky" 520 0),
    (New-RespondNode "Respond Sparky Setup" '={{ JSON.stringify($json.setup_result || $json) }}' 780 0)
)
$setupConnections = @{
    "Sparky Setup Webhook" = @{ main = @(, @(@{ node = "Build Sparky Setup SQL"; type = "main"; index = 0 })) }
    "Build Sparky Setup SQL" = @{ main = @(, @(@{ node = "Setup Sparky"; type = "main"; index = 0 })) }
    "Setup Sparky" = @{ main = @(, @(@{ node = "Respond Sparky Setup"; type = "main"; index = 0 })) }
}
$setup = Upsert-WorkflowByName "TRADIE-AGENT-940-Sparky-Setup" $setupNodes $setupConnections

$authorityToolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Authority Search Tool Is Called" 0 0),
    (New-CodeNode "Normalise Authority Search Input" $toolNormaliseAuthorityCode 260 0),
    (New-HttpRequestNode "Call Authority Documents Semantic Search" "POST" "http://localhost:5678/webhook/core/authority-documents/qdrant/search" 520 0 "={{ JSON.stringify(`$json) }}")
)
$authorityToolConnections = @{
    "When Authority Search Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Authority Search Input"; type = "main"; index = 0 })) }
    "Normalise Authority Search Input" = @{ main = @(, @(@{ node = "Call Authority Documents Semantic Search"; type = "main"; index = 0 })) }
}
$authorityTool = Upsert-WorkflowByName "TRADIE-TOOL-Authority-Documents-Semantic-Search" $authorityToolNodes $authorityToolConnections

$agentNodes = @(
    (New-ChatTriggerNode 0 0),
    (New-AgentNode 360 0),
    (New-GeminiModelNode 260 300),
    (New-MemoryNode 520 300),
    (New-WorkflowToolNode "authority_documents_search" $authorityTool.id "Search Authority Documents semantic Qdrant repository before answering compliance, safety, warranty, standards, or evidence questions. Always cite returned sources." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key, default sparky_electrical', 'string') }}"
        jurisdiction = "={{ `$fromAI('jurisdiction', 'jurisdiction such as AU VIC NSW QLD WA', 'string') }}"
        industry = "={{ `$fromAI('industry', 'industry such as electrical property_management all', 'string') }}"
        trade_type = "={{ `$fromAI('trade_type', 'trade type such as electrical', 'string') }}"
        query = "={{ `$fromAI('query', 'authority document search query', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum search results', 'number') }}"
    } 780 -180),
    (New-WorkflowToolNode "load_business_rules" "BwfXpBfMdl25XEdZ" "Load editable business rules for Sparky from Postgres." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as sparky_electrical', 'string') }}"
    } 780 40),
    (New-WorkflowToolNode "skills_search" "HMi7xtGQXxMhOCug" "Search reusable electrical SME Skills before advising." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as sparky_electrical', 'string') }}"
        category = "={{ `$fromAI('category', 'skill category such as electrical or compliance', 'string') }}"
        query = "={{ `$fromAI('query', 'skill search query', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum results', 'number') }}"
    } 780 260),
    (New-WorkflowToolNode "knowledge_search" "GxQAF82yRIlkqbK8" "Search Sparky electrical SME knowledge and prior lessons." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as sparky_electrical', 'string') }}"
        collection_key = "={{ `$fromAI('collection_key', 'collection key such as electrical_sme_knowledge', 'string') }}"
        query = "={{ `$fromAI('query', 'knowledge search query', 'string') }}"
        trade_type = "={{ `$fromAI('trade_type', 'trade type if relevant', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum results', 'number') }}"
    } 780 480),
    (New-WorkflowToolNode "memory_save" "W0VvE8kWYzl4vfL3" "Save important Sparky SME decisions and escalations to shared Postgres memory." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as sparky_electrical', 'string') }}"
        agent_name = "={{ `$fromAI('agent_name', 'agent display name Sparky', 'string') }}"
        lead_id = "={{ `$fromAI('lead_id', 'lead id if available', 'string') }}"
        job_id = "={{ `$fromAI('job_id', 'job id if available', 'string') }}"
        memory_type = "={{ `$fromAI('memory_type', 'decision lesson escalation or evidence_checklist', 'string') }}"
        summary = "={{ `$fromAI('summary', 'memory summary', 'string') }}"
    } 1080 -80),
    (New-WorkflowToolNode "knowledge_save" "KGK3Cj2E8VCxFBBY" "Save reusable electrical SME knowledge." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as sparky_electrical', 'string') }}"
        collection_key = "={{ `$fromAI('collection_key', 'collection key such as electrical_sme_knowledge', 'string') }}"
        title = "={{ `$fromAI('title', 'knowledge title', 'string') }}"
        content = "={{ `$fromAI('content', 'knowledge content', 'string') }}"
        tags = "={{ `$fromAI('tags', 'comma separated tags', 'string') }}"
        trade_type = "={{ `$fromAI('trade_type', 'trade type', 'string') }}"
        entity_type = "={{ `$fromAI('entity_type', 'entity type', 'string') }}"
        entity_id = "={{ `$fromAI('entity_id', 'entity id', 'string') }}"
        usefulness_score = "={{ `$fromAI('usefulness_score', 'usefulness score', 'number') }}"
    } 1080 140),
    (New-WorkflowToolNode "skills_save" "Jdk4PIpLuODNnEK4" "Propose or improve reusable electrical SME Skills for Quintino lifecycle management." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as sparky_electrical', 'string') }}"
        skill_key = "={{ `$fromAI('skill_key', 'stable skill key if updating', 'string') }}"
        skill_name = "={{ `$fromAI('skill_name', 'skill name', 'string') }}"
        capability = "={{ `$fromAI('capability', 'business capability', 'string') }}"
        category = "={{ `$fromAI('category', 'skill category', 'string') }}"
        description = "={{ `$fromAI('description', 'skill description', 'string') }}"
        best_practice = "={{ `$fromAI('best_practice', 'best practice procedure', 'string') }}"
        guardrails = "={{ `$fromAI('guardrails', 'constraints and risks', 'string') }}"
        tags = "={{ `$fromAI('tags', 'comma separated tags', 'string') }}"
        usefulness_score = "={{ `$fromAI('usefulness_score', 'usefulness score', 'number') }}"
    } 1080 360),
    (New-WorkflowToolNode "mcp_service_search" "Yxxovcn4MYZgyhe2" "Discover reusable MCP-style services available to Sparky." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as sparky_electrical', 'string') }}"
        category = "={{ `$fromAI('category', 'service category', 'string') }}"
        query = "={{ `$fromAI('query', 'service query', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum results', 'number') }}"
    } 1080 580),
    (New-StickyNoteNode -20 -360)
)

$agentConnections = @{
    "Chat with Sparky" = @{ main = @(, @(@{ node = "Sparky"; type = "main"; index = 0 })) }
    "Google Gemini Chat Model" = @{ ai_languageModel = @(, @(@{ node = "Sparky"; type = "ai_languageModel"; index = 0 })) }
    "Sparky Short Memory" = @{ ai_memory = @(, @(@{ node = "Sparky"; type = "ai_memory"; index = 0 })) }
    "authority_documents_search" = @{ ai_tool = @(, @(@{ node = "Sparky"; type = "ai_tool"; index = 0 })) }
    "load_business_rules" = @{ ai_tool = @(, @(@{ node = "Sparky"; type = "ai_tool"; index = 0 })) }
    "skills_search" = @{ ai_tool = @(, @(@{ node = "Sparky"; type = "ai_tool"; index = 0 })) }
    "knowledge_search" = @{ ai_tool = @(, @(@{ node = "Sparky"; type = "ai_tool"; index = 0 })) }
    "memory_save" = @{ ai_tool = @(, @(@{ node = "Sparky"; type = "ai_tool"; index = 0 })) }
    "knowledge_save" = @{ ai_tool = @(, @(@{ node = "Sparky"; type = "ai_tool"; index = 0 })) }
    "skills_save" = @{ ai_tool = @(, @(@{ node = "Sparky"; type = "ai_tool"; index = 0 })) }
    "mcp_service_search" = @{ ai_tool = @(, @(@{ node = "Sparky"; type = "ai_tool"; index = 0 })) }
}
$agent = Upsert-WorkflowByName "TRADIE-AGENT-941-Sparky-Electrical-SME-AI-Agent" $agentNodes $agentConnections

@{
    setup_workflow = $setup | Select-Object name,id,active
    authority_tool_workflow = $authorityTool | Select-Object name,id,active
    agent_workflow = $agent | Select-Object name,id,active
    setup_endpoint = "$BaseUrl/webhook/agents/sparky/setup"
    authority_search_endpoint = "$BaseUrl/webhook/core/authority-documents/qdrant/search"
} | ConvertTo-Json -Depth 10
