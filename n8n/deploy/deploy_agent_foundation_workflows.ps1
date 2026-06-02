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
const rules = [
  ['mission', 10, 'George Foreman is the n8n scheduling operations AI Agent for 1pacent. Sally is the only customer-facing ElevenLabs voice/chat agent.'],
  ['mission', 20, 'George recommends efficient tradie appointment windows, reduces travel time, avoids double-booking, and respects customer preferred windows where possible.'],
  ['tool_policy', 10, 'Use schedule_recommendation with booking_action preview before customer acceptance.'],
  ['tool_policy', 20, 'Use schedule_recommendation with booking_action book only after customer acceptance and when a real lead_id exists.'],
  ['tool_policy', 30, 'Use google_calendar_busy before final schedule recommendations when a work date/window is known. Calendar busy blocks must be treated as unavailable.'],
  ['tool_policy', 40, 'Use day_plan to inspect route, workload, booked slots, and travel assumptions for a tradie/date.'],
  ['scheduling', 10, 'Never invent availability. Prefer the requested day and time if available.'],
  ['scheduling', 20, 'When the exact requested time is unavailable, recommend the closest efficient alternative based on travel and current day plan.'],
  ['scheduling', 30, 'Do not promise final trade work is confirmed until tradie scope and final price are confirmed.'],
  ['customer_wording', 10, 'Return one concise customer_message Sally can say. Do not expose scores, n8n, Postgres, tools, or internal workflow names.'],
  ['customer_wording', 20, 'For previewed slots, say the window can be requested. For held slots, say the booking request has been recorded and written confirmation should be sent now.'],
  ['memory', 10, 'Write decisions and tool outputs to shared Postgres memory with agent_key george_foreman and clear entity references.']
];

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const values = rules.map(([group, order, text]) =>
  `('george_foreman', ${sql(group)}, ${order}, ${sql(text)}, true)`
).join(',\n');

const query = `
CREATE TABLE IF NOT EXISTS agent_definitions (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null unique,
  agent_name text not null,
  agent_role text not null,
  model_provider text not null default 'google_gemini',
  model_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS agent_business_rules (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_definitions(agent_key),
  rule_group text not null,
  rule_order integer not null default 100,
  rule_text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null,
  agent_name text not null,
  conversation_id text,
  customer_id uuid references customers(id),
  lead_id text references leads(id),
  job_id text references jobs(id),
  memory_type text not null default 'interaction',
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_agent_business_rules_agent_key ON agent_business_rules(agent_key, active, rule_order);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_key ON agent_memory(agent_key, lead_id, created_at DESC);

INSERT INTO agent_definitions (agent_key, agent_name, agent_role, model_provider, model_name, active, updated_at)
VALUES ('george_foreman', 'George Foreman', 'Scheduling operations AI agent', 'google_gemini', 'models/gemini-3.1-flash-lite', true, now())
ON CONFLICT (agent_key) DO UPDATE SET
  agent_name = EXCLUDED.agent_name,
  agent_role = EXCLUDED.agent_role,
  model_provider = EXCLUDED.model_provider,
  model_name = EXCLUDED.model_name,
  active = EXCLUDED.active,
  updated_at = now();

DELETE FROM agent_business_rules WHERE agent_key = 'george_foreman';
INSERT INTO agent_business_rules (agent_key, rule_group, rule_order, rule_text, active)
VALUES
${values};

SELECT jsonb_build_object(
  'success', true,
  'agent_key', 'george_foreman',
  'seeded_rule_count', (SELECT count(*) FROM agent_business_rules WHERE agent_key = 'george_foreman')
) AS setup_result;
`;

return [{ json: { sql: query } }];
'@

$loadRulesCode = @'
const raw = items[0]?.json ?? {};
const source = raw.query ?? raw.body ?? raw;
const agentKey = source.agent_key || 'george_foreman';
function sql(value) { return `'${String(value || '').replace(/'/g, "''")}'`; }
const query = `
SELECT jsonb_build_object(
  'agent', to_jsonb(a),
  'business_rules', COALESCE(jsonb_agg(jsonb_build_object(
    'rule_group', r.rule_group,
    'rule_order', r.rule_order,
    'rule_text', r.rule_text
  ) ORDER BY r.rule_group, r.rule_order) FILTER (WHERE r.id IS NOT NULL), '[]'::jsonb),
  'system_rules_text', COALESCE(string_agg('- [' || r.rule_group || '] ' || r.rule_text, E'\n' ORDER BY r.rule_group, r.rule_order), '')
) AS business_rules
FROM agent_definitions a
LEFT JOIN agent_business_rules r ON r.agent_key = a.agent_key AND r.active = true
WHERE a.agent_key = ${sql(agentKey)}
GROUP BY a.id;
`;
return [{ json: { sql: query } }];
'@

$saveMemoryCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw;
function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}
const agentKey = body.agent_key || 'george_foreman';
const agentName = body.agent_name || 'George Foreman';
const query = `
INSERT INTO agent_memory (
  agent_key, agent_name, conversation_id, lead_id, job_id, memory_type, summary, payload
) VALUES (
  ${sql(agentKey)}, ${sql(agentName)}, ${sql(body.conversation_id)}, ${sql(body.lead_id)},
  ${sql(body.job_id)}, ${sql(body.memory_type || 'interaction')}, ${sql(body.summary)}, ${jsonSql(body.payload || body)}
)
RETURNING jsonb_build_object('success', true, 'memory_id', id, 'agent_key', agent_key, 'created_at', created_at) AS memory_save;
`;
return [{ json: { sql: query } }];
'@

$loadMemoryCode = @'
const raw = items[0]?.json ?? {};
const source = raw.query ?? raw.body ?? raw;
function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
const agentKey = source.agent_key || 'george_foreman';
const query = `
SELECT jsonb_build_object(
  'success', true,
  'agent_key', ${sql(agentKey)},
  'memory', COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC), '[]'::jsonb)
) AS memory_load
FROM (
  SELECT id, agent_key, agent_name, conversation_id, lead_id, job_id, memory_type, summary, payload, created_at
  FROM agent_memory
  WHERE agent_key = ${sql(agentKey)}
    AND (${sql(source.lead_id)} IS NULL OR lead_id = ${sql(source.lead_id)})
    AND (${sql(source.job_id)} IS NULL OR job_id = ${sql(source.job_id)})
  ORDER BY created_at DESC
  LIMIT 20
) m;
`;
return [{ json: { sql: query } }];
'@

$workflows = @(
    @{
        Name = "TRADIE-CORE-900-Agent-Foundation-Setup"
        Nodes = @(
            (New-WebhookNode "Agent Foundation Setup Webhook" "core/agent-foundation/setup" "POST" 0 0),
            (New-CodeNode "Build Agent Foundation SQL" $setupCode 260 0),
            (New-PostgresNode "Apply Agent Foundation" 520 0),
            (New-RespondNode "Respond Foundation Setup" '={{$json.setup_result}}' 780 0)
        )
        Connections = @{
            "Agent Foundation Setup Webhook" = @{ main = @(, @(@{ node = "Build Agent Foundation SQL"; type = "main"; index = 0 })) }
            "Build Agent Foundation SQL" = @{ main = @(, @(@{ node = "Apply Agent Foundation"; type = "main"; index = 0 })) }
            "Apply Agent Foundation" = @{ main = @(, @(@{ node = "Respond Foundation Setup"; type = "main"; index = 0 })) }
        }
    },
    @{
        Name = "TRADIE-CORE-901-Agent-Business-Rules-Load"
        Nodes = @(
            (New-WebhookNode "Business Rules Load Webhook" "core/agent-business-rules/load" "GET" 0 0),
            (New-CodeNode "Build Business Rules SQL" $loadRulesCode 260 0),
            (New-PostgresNode "Read Business Rules" 520 0),
            (New-RespondNode "Respond Business Rules" '={{$json.business_rules}}' 780 0)
        )
        Connections = @{
            "Business Rules Load Webhook" = @{ main = @(, @(@{ node = "Build Business Rules SQL"; type = "main"; index = 0 })) }
            "Build Business Rules SQL" = @{ main = @(, @(@{ node = "Read Business Rules"; type = "main"; index = 0 })) }
            "Read Business Rules" = @{ main = @(, @(@{ node = "Respond Business Rules"; type = "main"; index = 0 })) }
        }
    },
    @{
        Name = "TRADIE-CORE-902-Agent-Memory-Save"
        Nodes = @(
            (New-WebhookNode "Agent Memory Save Webhook" "core/agent-memory/save" "POST" 0 0),
            (New-CodeNode "Build Memory Save SQL" $saveMemoryCode 260 0),
            (New-PostgresNode "Save Agent Memory" 520 0),
            (New-RespondNode "Respond Memory Save" '={{$json.memory_save}}' 780 0)
        )
        Connections = @{
            "Agent Memory Save Webhook" = @{ main = @(, @(@{ node = "Build Memory Save SQL"; type = "main"; index = 0 })) }
            "Build Memory Save SQL" = @{ main = @(, @(@{ node = "Save Agent Memory"; type = "main"; index = 0 })) }
            "Save Agent Memory" = @{ main = @(, @(@{ node = "Respond Memory Save"; type = "main"; index = 0 })) }
        }
    },
    @{
        Name = "TRADIE-CORE-903-Agent-Memory-Load"
        Nodes = @(
            (New-WebhookNode "Agent Memory Load Webhook" "core/agent-memory/load" "GET" 0 0),
            (New-CodeNode "Build Memory Load SQL" $loadMemoryCode 260 0),
            (New-PostgresNode "Read Agent Memory" 520 0),
            (New-RespondNode "Respond Memory Load" '={{$json.memory_load}}' 780 0)
        )
        Connections = @{
            "Agent Memory Load Webhook" = @{ main = @(, @(@{ node = "Build Memory Load SQL"; type = "main"; index = 0 })) }
            "Build Memory Load SQL" = @{ main = @(, @(@{ node = "Read Agent Memory"; type = "main"; index = 0 })) }
            "Read Agent Memory" = @{ main = @(, @(@{ node = "Respond Memory Load"; type = "main"; index = 0 })) }
        }
    }
)

$results = foreach ($workflow in $workflows) {
    Upsert-WorkflowByName $workflow.Name $workflow.Nodes $workflow.Connections | Select-Object name,id,active
}

$results | ConvertTo-Json -Depth 5
