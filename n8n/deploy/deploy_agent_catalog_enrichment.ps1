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

$setupCode = @'
const query = `
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS purpose text;
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS operating_scope text;
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS customer_facing boolean not null default false;
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS owner_domain text;
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS responsibilities jsonb not null default '[]'::jsonb;
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS success_measures jsonb not null default '[]'::jsonb;
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS handoff_triggers jsonb not null default '[]'::jsonb;
ALTER TABLE agent_definitions ADD COLUMN IF NOT EXISTS guardrails jsonb not null default '[]'::jsonb;

INSERT INTO agent_definitions (
  agent_key, agent_name, agent_role, purpose, operating_scope, customer_facing, owner_domain,
  responsibilities, success_measures, handoff_triggers, guardrails, model_provider, model_name, active
)
VALUES
(
  'sally_receptionist',
  'Sally',
  'Customer intake and booking request receptionist',
  'Give customers a fast, calm, trustworthy first contact for trade enquiries across calls and chats.',
  'External ElevenLabs voice/chat agent. Collects customer/job details, confirms email, calls n8n tools, and hands structured work to internal agents.',
  true,
  'customer_intake',
  '["Capture complete customer/job details","Confirm email spelling before confirmation","Use pricing and scheduling tools instead of guessing","Create booking requests for qualified tradies","Maintain a short, natural customer experience"]'::jsonb,
  '["High percentage of complete intake records","Low email correction rate after confirmation","Low customer frustration during scheduling","Fast booking request confirmation sent","Low number of missing consent/contact fields"]'::jsonb,
  '["Needs schedule recommendation -> George Foreman","Needs indicative pricing -> Nelly","Booking request captured -> George/Nelly/Penny as lifecycle progresses","Customer asks for change -> George","Customer asks payment or invoice question -> Penny"]'::jsonb,
  '["Do not give DIY repair instructions","Do not promise fixed final pricing","Do not say internal terms like CRM/workflow/George","Do not create confirmation without confirmed email and consent"]'::jsonb,
  'elevenlabs',
  'Sally - 1pacent Receptionist',
  true
),
(
  'george_foreman',
  'George Foreman',
  'Scheduling operations AI agent',
  'Create efficient, customer-friendly schedules that reduce travel time and improve tradie productivity.',
  'Internal n8n agent. Owns schedule recommendations, calendar booking, day planning, tradie allocation and route efficiency.',
  false,
  'scheduling_operations',
  '["Recommend appointment windows","Avoid double booking","Respect tradie capacity and travel buffers","Book calendar events","Optimise daily route plans","Record scheduling decisions for learning"]'::jsonb,
  '["Schedule acceptance rate","Travel minutes reduced per day","Tradie utilisation rate","Double-booking incidents near zero","Manual scheduling intervention rate","Customer wait time to recommended slot"]'::jsonb,
  '["Customer or Sally requests availability","Quote accepted and job needs scheduling","Tradie calendar changes","Schedule conflict detected","Manual review needed for no feasible slot"]'::jsonb,
  '["Do not invent availability","Use calendar and scheduler tools","Prefer route efficiency without ignoring urgency","Do not expose internal routing logic to customers"]'::jsonb,
  'google_gemini',
  'models/gemini-3.1-flash-lite',
  true
),
(
  'nelly',
  'Nelly',
  'Quote intelligence, indicative pricing and quote-vs-actual learning AI agent',
  'Improve quote accuracy and customer trust by learning from similar jobs, tradie-confirmed quotes, and actual job outcomes.',
  'Internal n8n agent. Owns indicative price ranges, quote confidence, quote assumptions and quote-vs-actual learning.',
  false,
  'pricing_quote_intelligence',
  '["Provide indicative price ranges","Explain pricing assumptions","Compare quotes to actuals","Capture pricing evidence","Improve quote templates and confidence over time"]'::jsonb,
  '["Quote accuracy score","Quote variance against actuals","Estimate confidence improvement","Reduced tradie quote rework","Customer acceptance rate of quotes","Number of useful similar-job evidence records"]'::jsonb,
  '["Sally/customer asks cost","Tradie confirms final costs","Job completed with actual labour/materials","Variation requested","Quote accuracy metric created"]'::jsonb,
  '["Never promise fixed final price before tradie confirmation","Separate indicative estimate from quote","Do not invent similar-job evidence","Surface assumptions and risks"]'::jsonb,
  'google_gemini',
  'models/gemini-3.1-flash-lite',
  true
),
(
  'penny',
  'Penny',
  'Payments, invoice collection and faster-cashflow AI agent',
  'Help tradie businesses get paid faster while keeping payment communication clear and respectful.',
  'Internal n8n agent. Owns payment requests, payment status, payment received events and payment follow-up recommendations.',
  false,
  'payments_cashflow',
  '["Create payment requests","Send payment links","Track payment status","Record provider/manual payment events","Recommend overdue follow-ups","Measure speed to paid"]'::jsonb,
  '["Days sales outstanding reduced","Payment request to paid conversion rate","Average time from invoice sent to paid","Overdue invoice count","Payment follow-up success rate","Payment status accuracy"]'::jsonb,
  '["Invoice issued","Payment request needed","Provider payment webhook received","Payment overdue","Customer asks payment/invoice question","Admin records manual payment"]'::jsonb,
  '["Never mark paid without payment event or authorised manual confirmation","Do not invent provider transaction IDs","Clearly distinguish placeholder/test provider from real payments","Keep customer wording transparent"]'::jsonb,
  'google_gemini',
  'models/gemini-3.1-flash-lite',
  true
),
(
  'mia_social',
  'Mia',
  'Social media and reputation growth AI agent',
  'Turn completed jobs, approved media and reviews into trust-building growth for each tradie business.',
  'Internal n8n agent. Owns social drafts, customer media approval guardrails, review requests and reputation growth loops.',
  false,
  'growth_reputation',
  '["Draft completed-job social content","Require customer media approval","Request reviews after completed jobs","Protect customer privacy","Track social/review status","Feed growth learnings into Skills"]'::jsonb,
  '["Review request conversion rate","Approved social draft count","Customer media approval rate","Follower/reputation growth indicators","Privacy incident count zero","Repeatable growth Skills created"]'::jsonb,
  '["Job completed","Invoice sent or paid","Customer approved media","Review request due","Internal social approval granted","Social provider credentials connected"]'::jsonb,
  '["Never publish without customer and internal approval","No exact address, phone, email, faces or licence plates without consent","Do not invent ratings or trust proof","Draft only until Meta credentials are connected"]'::jsonb,
  'google_gemini',
  'models/gemini-3.1-flash-lite',
  true
),
(
  'quintino',
  'Quintino',
  'Skills intelligence, lifecycle governance, workflow improvement and moat-building analytics AI agent',
  'Strengthen the product moat by turning operational data into version-managed Skills and measurable service improvements.',
  'Internal n8n agent. Owns Skills lifecycle, best-practice library, workflow improvement recommendations and cross-agent learning audits.',
  false,
  'skills_moat_intelligence',
  '["Analyse cross-agent history and workflow data","Identify best-practice Skills","Manage Skill versions and archival","Recommend workflow improvements","Track evidence strength","Keep only one active Skill version"]'::jsonb,
  '["Useful Skills created or improved","Workflow improvement recommendations accepted","Quote/scheduling/payment/review performance improvements linked to Skills","Archived duplicate or stale Skills","Evidence-backed recommendations ratio"]'::jsonb,
  '["New learning from job completion","Repeated operational pattern detected","Agent saves knowledge","Skill needs promotion or archival","Workflow performance issue appears"]'::jsonb,
  '["Do not promote weakly evidenced Skills","Do not invent evidence","Keep recommendations measurable","Preserve historical Skill versions for audit"]'::jsonb,
  'google_gemini',
  'models/gemini-3.1-flash-lite',
  true
)
ON CONFLICT (agent_key) DO UPDATE SET
  agent_name = EXCLUDED.agent_name,
  agent_role = EXCLUDED.agent_role,
  purpose = EXCLUDED.purpose,
  operating_scope = EXCLUDED.operating_scope,
  customer_facing = EXCLUDED.customer_facing,
  owner_domain = EXCLUDED.owner_domain,
  responsibilities = EXCLUDED.responsibilities,
  success_measures = EXCLUDED.success_measures,
  handoff_triggers = EXCLUDED.handoff_triggers,
  guardrails = EXCLUDED.guardrails,
  model_provider = EXCLUDED.model_provider,
  model_name = EXCLUDED.model_name,
  active = EXCLUDED.active,
  updated_at = now();

INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
VALUES ('agent_catalog', 'all', 'agent_catalog_enriched', '{"agents":["sally_receptionist","george_foreman","nelly","penny","mia_social","quintino"]}'::jsonb);

SELECT jsonb_build_object(
  'success', true,
  'agent_count', (SELECT count(*) FROM agent_definitions WHERE active = true),
  'message', 'Agent catalogue enriched with purpose, scope, responsibilities, success measures, handoffs and guardrails.'
) AS setup_result;
`;
return [{ json: { sql: query } }];
'@

$listCode = @'
const raw = items[0]?.json ?? {};
const q = raw.query ?? raw.body ?? raw;
function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
const agentKey = q.agent_key || '';
const query = `
SELECT jsonb_build_object(
  'success', true,
  'agent_key', ${sql(agentKey)},
  'agents', COALESCE(jsonb_agg(
    jsonb_build_object(
      'agent_key', agent_key,
      'agent_name', agent_name,
      'agent_role', agent_role,
      'purpose', purpose,
      'operating_scope', operating_scope,
      'customer_facing', customer_facing,
      'owner_domain', owner_domain,
      'responsibilities', responsibilities,
      'success_measures', success_measures,
      'handoff_triggers', handoff_triggers,
      'guardrails', guardrails,
      'model_provider', model_provider,
      'model_name', model_name,
      'active', active
    )
    ORDER BY customer_facing DESC, owner_domain, agent_name
  ), '[]'::jsonb)
) AS agent_catalog
FROM agent_definitions
WHERE active = true
  AND (${sql(agentKey)} IS NULL OR agent_key = ${sql(agentKey)});
`;
return [{ json: { sql: query } }];
'@

$setupNodes = @(
    (New-WebhookNode "Agent Catalog Enrich Webhook" "core/agent-catalog/enrich" "POST" 0 0),
    (New-CodeNode "Build Agent Catalog Enrichment SQL" $setupCode 260 0),
    (New-PostgresNode "Enrich Agent Catalog" 520 0),
    (New-RespondNode "Respond Agent Catalog Enrich" '={{$json.setup_result || $json}}' 780 0)
)
$setupConnections = @{
    "Agent Catalog Enrich Webhook" = @{ main = @(, @(@{ node = "Build Agent Catalog Enrichment SQL"; type = "main"; index = 0 })) }
    "Build Agent Catalog Enrichment SQL" = @{ main = @(, @(@{ node = "Enrich Agent Catalog"; type = "main"; index = 0 })) }
    "Enrich Agent Catalog" = @{ main = @(, @(@{ node = "Respond Agent Catalog Enrich"; type = "main"; index = 0 })) }
}
$setup = Upsert-WorkflowByName "TRADIE-CORE-950-Agent-Catalog-Enrich" $setupNodes $setupConnections

$listNodes = @(
    (New-WebhookNode "Agent Catalog List Webhook" "core/agent-catalog/list" "GET" 0 0),
    (New-CodeNode "Build Agent Catalog List SQL" $listCode 260 0),
    (New-PostgresNode "List Agent Catalog" 520 0),
    (New-RespondNode "Respond Agent Catalog List" '={{$json.agent_catalog || $json}}' 780 0)
)
$listConnections = @{
    "Agent Catalog List Webhook" = @{ main = @(, @(@{ node = "Build Agent Catalog List SQL"; type = "main"; index = 0 })) }
    "Build Agent Catalog List SQL" = @{ main = @(, @(@{ node = "List Agent Catalog"; type = "main"; index = 0 })) }
    "List Agent Catalog" = @{ main = @(, @(@{ node = "Respond Agent Catalog List"; type = "main"; index = 0 })) }
}
$list = Upsert-WorkflowByName "TRADIE-CORE-951-Agent-Catalog-List" $listNodes $listConnections

@{
    setup_workflow = $setup | Select-Object name,id,active
    list_workflow = $list | Select-Object name,id,active
    endpoints = @{
        enrich = "$BaseUrl/webhook/core/agent-catalog/enrich"
        list = "$BaseUrl/webhook/core/agent-catalog/list"
    }
} | ConvertTo-Json -Depth 10

