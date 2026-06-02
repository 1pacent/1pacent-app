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
        options = @{ timeout = 20000 }
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

$setupSqlCode = @'
const query = `
CREATE TABLE IF NOT EXISTS agent_knowledge_collections (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_definitions(agent_key),
  collection_key text not null,
  collection_name text not null,
  capability text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_key, collection_key)
);

CREATE TABLE IF NOT EXISTS agent_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_definitions(agent_key),
  collection_key text not null,
  source_type text not null default 'manual',
  source_id text,
  title text not null,
  content text not null,
  tags text[] not null default '{}',
  trade_type text,
  entity_type text,
  entity_id text,
  confidence numeric not null default 0.7,
  usefulness_score numeric not null default 0,
  payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_collections_agent_key ON agent_knowledge_collections(agent_key, active);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_items_agent_key ON agent_knowledge_items(agent_key, collection_key, active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_items_entity ON agent_knowledge_items(entity_type, entity_id);

INSERT INTO agent_definitions (agent_key, agent_name, agent_role, model_provider, model_name, active)
VALUES
  ('george_foreman', 'George Foreman', 'Scheduling operations AI agent', 'google_gemini', 'models/gemini-3.1-flash-lite', true),
  ('sally_receptionist', 'Sally', 'Customer intake and booking request receptionist', 'elevenlabs', 'Sally - 1pacent Receptionist', true)
ON CONFLICT (agent_key) DO UPDATE SET
  agent_name = EXCLUDED.agent_name,
  agent_role = EXCLUDED.agent_role,
  model_provider = EXCLUDED.model_provider,
  model_name = EXCLUDED.model_name,
  active = true,
  updated_at = now();

INSERT INTO agent_knowledge_collections (agent_key, collection_key, collection_name, capability, active)
VALUES
  ('george_foreman', 'scheduling_knowledge', 'George Scheduling Knowledge', 'Scheduling efficiency, travel optimisation, tradie allocation, calendar booking', true),
  ('george_foreman', 'quote_to_job_learning', 'George Quote To Job Learning', 'Learn from quote acceptance, job completion, actual costs, travel and duration variance', true),
  ('sally_receptionist', 'customer_intake_knowledge', 'Sally Customer Intake Knowledge', 'Customer objections, missing information patterns, consent and confirmation quality', true)
ON CONFLICT (agent_key, collection_key) DO UPDATE SET
  collection_name = EXCLUDED.collection_name,
  capability = EXCLUDED.capability,
  active = true,
  updated_at = now();

INSERT INTO agent_knowledge_items (
  agent_key, collection_key, source_type, source_id, title, content, tags, trade_type, entity_type, entity_id, confidence, usefulness_score, payload
)
VALUES
  (
    'george_foreman',
    'scheduling_knowledge',
    'seed',
    'GEORGE-SCHEDULING-MOAT-001',
    'Scheduling moat: optimise the tradie day, not just the customer slot',
    'George should balance customer preference, tradie skill match, existing calendar bookings, travel time between jobs, urgency, and route efficiency. A booking is better when it reduces dead travel and creates a more productive tradie day.',
    ARRAY['scheduling','moat','travel','route_efficiency'],
    null,
    'agent_capability',
    'george_foreman',
    0.9,
    10,
    '{"seeded": true}'::jsonb
  ),
  (
    'george_foreman',
    'scheduling_knowledge',
    'seed',
    'GEORGE-CALENDAR-LABEL-001',
    'Calendar bookings must be labelled for operations visibility',
    'Calendar events should show the trade, lead or job reference, suburb, customer name, and assigned tradie names so the operations team can see who is doing what job and when without opening the database.',
    ARRAY['calendar','operations_visibility','assignment'],
    null,
    'agent_capability',
    'george_foreman',
    0.9,
    10,
    '{"seeded": true}'::jsonb
  ),
  (
    'george_foreman',
    'quote_to_job_learning',
    'seed',
    'GEORGE-QUOTE-LEARNING-001',
    'Every completed job should improve future quote and schedule accuracy',
    'When a job is completed, capture estimated duration, actual duration, estimated travel, actual travel, estimated materials, actual materials, quote amount, invoice amount, and variance reason. This is the proprietary dataset that improves pricing trust and scheduling productivity.',
    ARRAY['quote_accuracy','job_actuals','moat','continuous_learning'],
    null,
    'agent_capability',
    'george_foreman',
    0.95,
    10,
    '{"seeded": true}'::jsonb
  )
ON CONFLICT DO NOTHING;

SELECT jsonb_build_object(
  'success', true,
  'collections', (SELECT count(*) FROM agent_knowledge_collections),
  'items', (SELECT count(*) FROM agent_knowledge_items),
  'note', 'Agent knowledge foundation is ready.'
) AS setup_result;
`;

return [{ json: { sql: query } }];
'@

$saveSqlCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw;

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

function arraySql(values) {
  const items = Array.isArray(values) ? values : String(values || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (!items.length) return "'{}'::text[]";
  return `ARRAY[${items.map(sql).join(',')}]::text[]`;
}

const agentKey = body.agent_key || 'george_foreman';
const collectionKey = body.collection_key || 'scheduling_knowledge';
const title = body.title || body.summary || 'Agent knowledge note';
const content = body.content || body.summary || JSON.stringify(body.payload || body);
const sourceType = body.source_type || 'agent_observation';
const sourceId = body.source_id || body.lead_id || body.job_id || body.schedule_slot_id || '';

const query = `
INSERT INTO agent_knowledge_items (
  agent_key, collection_key, source_type, source_id, title, content, tags, trade_type,
  entity_type, entity_id, confidence, usefulness_score, payload
)
VALUES (
  ${sql(agentKey)},
  ${sql(collectionKey)},
  ${sql(sourceType)},
  ${sql(sourceId)},
  ${sql(title)},
  ${sql(content)},
  ${arraySql(body.tags)},
  ${sql(body.trade_type)},
  ${sql(body.entity_type)},
  ${sql(body.entity_id || body.lead_id || body.job_id)},
  COALESCE(${sql(body.confidence)}, '0.7')::numeric,
  COALESCE(${sql(body.usefulness_score)}, '0')::numeric,
  ${jsonSql(body.payload || body)}
)
RETURNING jsonb_build_object(
  'success', true,
  'knowledge_id', id,
  'agent_key', agent_key,
  'collection_key', collection_key,
  'title', title,
  'created_at', created_at
) AS knowledge_save;
`;

return [{ json: { sql: query } }];
'@

$searchSqlCode = @'
const raw = items[0]?.json ?? {};
const source = raw.query && Object.keys(raw.query).length ? raw.query : (raw.body ?? raw);

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const agentKey = source.agent_key || 'george_foreman';
const collectionKey = source.collection_key || '';
const queryText = source.query || source.question || source.search || '';
const tradeType = source.trade_type || '';
const limit = Math.min(Math.max(Number(source.limit || 5), 1), 10);

const query = `
WITH scored AS (
  SELECT
    id,
    agent_key,
    collection_key,
    source_type,
    source_id,
    title,
    content,
    tags,
    trade_type,
    entity_type,
    entity_id,
    confidence,
    usefulness_score,
    payload,
    updated_at,
    CASE
      WHEN ${sql(queryText)} IS NULL THEN 0
      ELSE ts_rank_cd(
        to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'') || ' ' || array_to_string(tags, ' ')),
        plainto_tsquery('english', ${sql(queryText)})
      )
    END AS text_rank,
    CASE
      WHEN ${sql(queryText)} IS NULL THEN 0
      ELSE COALESCE((
        SELECT count(*)
        FROM regexp_split_to_table(lower(${sql(queryText)}), '\\s+') AS q(term)
        WHERE length(q.term) > 2
          AND (
            lower(coalesce(title,'')) LIKE '%' || q.term || '%'
            OR lower(coalesce(content,'')) LIKE '%' || q.term || '%'
            OR lower(array_to_string(tags, ' ')) LIKE '%' || q.term || '%'
          )
      ), 0)
    END AS term_hits
  FROM agent_knowledge_items
  WHERE active = true
    AND agent_key = ${sql(agentKey)}
    AND (${sql(collectionKey)} IS NULL OR collection_key = ${sql(collectionKey)})
    AND (${sql(tradeType)} IS NULL OR trade_type IS NULL OR lower(trade_type) = lower(${sql(tradeType)}))
),
ranked AS (
  SELECT *,
    (text_rank * 10) + term_hits + confidence + usefulness_score + EXTRACT(EPOCH FROM (updated_at - now())) / 31536000 AS score
  FROM scored
  WHERE ${sql(queryText)} IS NULL
     OR text_rank > 0
     OR term_hits > 0
     OR lower(title) LIKE '%' || lower(${sql(queryText)}) || '%'
     OR lower(content) LIKE '%' || lower(${sql(queryText)}) || '%'
  ORDER BY score DESC, updated_at DESC
  LIMIT ${limit}
)
SELECT jsonb_build_object(
  'success', true,
  'agent_key', ${sql(agentKey)},
  'collection_key', ${sql(collectionKey)},
  'query', ${sql(queryText)},
  'result_count', (SELECT count(*) FROM ranked),
  'results', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'knowledge_id', id,
      'collection_key', collection_key,
      'title', title,
      'content', content,
      'tags', tags,
      'trade_type', trade_type,
      'entity_type', entity_type,
      'entity_id', entity_id,
      'confidence', confidence,
      'usefulness_score', usefulness_score,
      'score', score,
      'source_type', source_type,
      'source_id', source_id,
      'updated_at', updated_at
    ) ORDER BY score DESC, updated_at DESC)
    FROM ranked
  ), '[]'::jsonb)
) AS knowledge_search;
`;

return [{ json: { sql: query } }];
'@

$toolNormaliseSaveCode = @'
const raw = items[0]?.json ?? {};
return [{
  json: {
    agent_key: raw.agent_key || 'george_foreman',
    collection_key: raw.collection_key || 'scheduling_knowledge',
    title: raw.title || raw.summary || 'Agent knowledge note',
    content: raw.content || raw.summary || raw.input || '',
    tags: raw.tags || '',
    trade_type: raw.trade_type || '',
    entity_type: raw.entity_type || '',
    entity_id: raw.entity_id || raw.lead_id || raw.job_id || '',
    source_type: raw.source_type || 'agent_observation',
    source_id: raw.source_id || raw.lead_id || raw.job_id || raw.schedule_slot_id || '',
    confidence: raw.confidence || 0.7,
    usefulness_score: raw.usefulness_score || 0,
    payload: raw,
  },
}];
'@

$toolNormaliseSearchCode = @'
const raw = items[0]?.json ?? {};
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
    agent_key: first(raw.agent_key, field('agent_key'), 'george_foreman'),
    collection_key: first(raw.collection_key, field('collection_key'), ''),
    query: first(raw.query, raw.question, raw.search, field('query'), text),
    trade_type: first(raw.trade_type, field('trade_type'), ''),
    limit: first(raw.limit, field('limit'), 5),
  },
}];
'@

$workflows = @()

$setupNodes = @(
    (New-WebhookNode "Agent Knowledge Setup Webhook" "core/agent-knowledge/setup" "POST" 0 0),
    (New-CodeNode "Build Knowledge Setup SQL" $setupSqlCode 260 0),
    (New-PostgresNode "Setup Agent Knowledge" 520 0),
    (New-RespondNode "Respond Knowledge Setup" '={{$json.setup_result || $json}}' 780 0)
)
$setupConnections = @{
    "Agent Knowledge Setup Webhook" = @{ main = @(, @(@{ node = "Build Knowledge Setup SQL"; type = "main"; index = 0 })) }
    "Build Knowledge Setup SQL" = @{ main = @(, @(@{ node = "Setup Agent Knowledge"; type = "main"; index = 0 })) }
    "Setup Agent Knowledge" = @{ main = @(, @(@{ node = "Respond Knowledge Setup"; type = "main"; index = 0 })) }
}
$workflows += Upsert-WorkflowByName "TRADIE-CORE-904-Agent-Knowledge-Setup" $setupNodes $setupConnections

$saveNodes = @(
    (New-WebhookNode "Agent Knowledge Save Webhook" "core/agent-knowledge/save" "POST" 0 0),
    (New-CodeNode "Build Knowledge Save SQL" $saveSqlCode 260 0),
    (New-PostgresNode "Save Agent Knowledge" 520 0),
    (New-RespondNode "Respond Knowledge Save" '={{$json.knowledge_save || $json}}' 780 0)
)
$saveConnections = @{
    "Agent Knowledge Save Webhook" = @{ main = @(, @(@{ node = "Build Knowledge Save SQL"; type = "main"; index = 0 })) }
    "Build Knowledge Save SQL" = @{ main = @(, @(@{ node = "Save Agent Knowledge"; type = "main"; index = 0 })) }
    "Save Agent Knowledge" = @{ main = @(, @(@{ node = "Respond Knowledge Save"; type = "main"; index = 0 })) }
}
$workflows += Upsert-WorkflowByName "TRADIE-CORE-905-Agent-Knowledge-Save" $saveNodes $saveConnections

$searchNodes = @(
    (New-WebhookNode "Agent Knowledge Search Webhook" "core/agent-knowledge/search" "POST" 0 0),
    (New-CodeNode "Build Knowledge Search SQL" $searchSqlCode 260 0),
    (New-PostgresNode "Search Agent Knowledge" 520 0),
    (New-RespondNode "Respond Knowledge Search" '={{$json.knowledge_search || $json}}' 780 0)
)
$searchConnections = @{
    "Agent Knowledge Search Webhook" = @{ main = @(, @(@{ node = "Build Knowledge Search SQL"; type = "main"; index = 0 })) }
    "Build Knowledge Search SQL" = @{ main = @(, @(@{ node = "Search Agent Knowledge"; type = "main"; index = 0 })) }
    "Search Agent Knowledge" = @{ main = @(, @(@{ node = "Respond Knowledge Search"; type = "main"; index = 0 })) }
}
$workflows += Upsert-WorkflowByName "TRADIE-CORE-906-Agent-Knowledge-Search" $searchNodes $searchConnections

$toolSaveNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Agent Knowledge Save Tool Is Called" 0 0),
    (New-CodeNode "Normalise Knowledge Save Tool Input" $toolNormaliseSaveCode 260 0),
    (New-HttpRequestNode "Call Knowledge Save Endpoint" "POST" "http://localhost:5678/webhook/core/agent-knowledge/save" 520 0 "={{ JSON.stringify(`$json) }}")
)
$toolSaveConnections = @{
    "When Agent Knowledge Save Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Knowledge Save Tool Input"; type = "main"; index = 0 })) }
    "Normalise Knowledge Save Tool Input" = @{ main = @(, @(@{ node = "Call Knowledge Save Endpoint"; type = "main"; index = 0 })) }
}
$toolSave = Upsert-WorkflowByName "TRADIE-TOOL-Agent-Knowledge-Save" $toolSaveNodes $toolSaveConnections

$toolSearchNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Agent Knowledge Search Tool Is Called" 0 0),
    (New-CodeNode "Normalise Knowledge Search Tool Input" $toolNormaliseSearchCode 260 0),
    (New-HttpRequestNode "Call Knowledge Search Endpoint" "POST" "http://localhost:5678/webhook/core/agent-knowledge/search" 520 0 "={{ JSON.stringify(`$json) }}")
)
$toolSearchConnections = @{
    "When Agent Knowledge Search Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Knowledge Search Tool Input"; type = "main"; index = 0 })) }
    "Normalise Knowledge Search Tool Input" = @{ main = @(, @(@{ node = "Call Knowledge Search Endpoint"; type = "main"; index = 0 })) }
}
$toolSearch = Upsert-WorkflowByName "TRADIE-TOOL-Agent-Knowledge-Search" $toolSearchNodes $toolSearchConnections

@{
    core_workflows = $workflows | Select-Object name,id,active
    tool_workflows = @(
        ($toolSave | Select-Object name,id,active),
        ($toolSearch | Select-Object name,id,active)
    )
} | ConvertTo-Json -Depth 10
