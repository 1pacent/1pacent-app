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
CREATE TABLE IF NOT EXISTS mcp_services (
  id uuid primary key default gen_random_uuid(),
  service_key text not null unique,
  service_name text not null,
  provider text not null,
  category text not null,
  capability text not null,
  endpoint_path text,
  workflow_id text,
  credential_name text,
  status text not null default 'active',
  available_to_agents text[] not null default '{}',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS mcp_service_tools (
  id uuid primary key default gen_random_uuid(),
  service_key text not null references mcp_services(service_key),
  tool_key text not null unique,
  tool_name text not null,
  description text not null,
  endpoint_path text,
  workflow_id text,
  input_schema jsonb not null default '{}'::jsonb,
  output_contract jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS business_skills (
  id uuid primary key default gen_random_uuid(),
  skill_key text not null unique,
  skill_name text not null,
  capability text not null,
  category text not null,
  description text not null,
  best_practice text not null,
  guardrails text,
  inputs jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  owner_agent_key text references agent_definitions(agent_key),
  version integer not null default 1,
  status text not null default 'active',
  tags text[] not null default '{}',
  source_type text not null default 'manual',
  source_id text,
  usefulness_score numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS agent_skill_assignments (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_definitions(agent_key),
  skill_key text not null references business_skills(skill_key),
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_key, skill_key)
);

CREATE TABLE IF NOT EXISTS skill_usage_events (
  id uuid primary key default gen_random_uuid(),
  skill_key text references business_skills(skill_key),
  agent_key text,
  entity_type text,
  entity_id text,
  event_type text not null,
  outcome text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_services_category ON mcp_services(category, status);
CREATE INDEX IF NOT EXISTS idx_mcp_service_tools_service_key ON mcp_service_tools(service_key, active);
CREATE INDEX IF NOT EXISTS idx_business_skills_category ON business_skills(category, status);
CREATE INDEX IF NOT EXISTS idx_business_skills_owner_agent ON business_skills(owner_agent_key, status);
CREATE INDEX IF NOT EXISTS idx_agent_skill_assignments_agent ON agent_skill_assignments(agent_key, active);
CREATE INDEX IF NOT EXISTS idx_skill_usage_events_skill ON skill_usage_events(skill_key, created_at DESC);

INSERT INTO agent_definitions (agent_key, agent_name, agent_role, model_provider, model_name, active)
VALUES
  ('george_foreman', 'George Foreman', 'Scheduling operations AI agent', 'google_gemini', 'models/gemini-3.1-flash-lite', true),
  ('sally_receptionist', 'Sally', 'Customer intake and booking request receptionist', 'elevenlabs', 'Sally - 1pacent Receptionist', true)
ON CONFLICT (agent_key) DO UPDATE SET active = true, updated_at = now();

INSERT INTO mcp_services (service_key, service_name, provider, category, capability, endpoint_path, workflow_id, credential_name, status, available_to_agents, config)
VALUES
  ('google_gmail', 'Google Gmail', 'google', 'communication', 'Send booking, quote, acceptance, invoice and internal notification emails', null, null, 'Gmail account', 'active', ARRAY['sally_receptionist','george_foreman'], '{"credential_required": true}'::jsonb),
  ('google_calendar', 'Google Calendar', 'google', 'scheduling', 'Read busy events and create labelled company calendar bookings', '/webhook/agents/george/calendar-book-job', 'fvxKC3ZdeagYaZ8S', 'Google Calendar account', 'active', ARRAY['george_foreman'], '{"default_calendar_id": "primary"}'::jsonb),
  ('google_sheets', 'Google Sheets', 'google', 'records', 'Read and append operational spreadsheet records during migration', '/webhook/leads/capture', 'PztnKwXaz9UjFJSc', 'Google Sheets account', 'active', ARRAY['sally_receptionist'], '{"legacy_system": true}'::jsonb),
  ('google_drive', 'Google Drive', 'google', 'documents', 'Store and retrieve business documents and evidence files', null, null, 'Google Drive account', 'planned', ARRAY['george_foreman','sally_receptionist'], '{"needs_workflow": true}'::jsonb),
  ('google_docs', 'Google Docs', 'google', 'documents', 'Create quote, invoice and SOP documents from templates', null, null, 'Google Docs account', 'planned', ARRAY['george_foreman'], '{"needs_workflow": true}'::jsonb),
  ('skills_registry', 'Skills Registry', 'postgres', 'agent_capability', 'Search, save and assign reusable business capability skills', '/webhook/core/skills/search', null, 'Tradie App Postgres', 'active', ARRAY['george_foreman','sally_receptionist'], '{"source_of_truth": "postgres"}'::jsonb),
  ('agent_knowledge', 'Agent Knowledge Store', 'postgres', 'agent_capability', 'Search and save accumulated agent business knowledge', '/webhook/core/agent-knowledge/search', 'kIkqBJ8at9TbFXeu', 'Tradie App Postgres', 'active', ARRAY['george_foreman','sally_receptionist'], '{"source_of_truth": "postgres"}'::jsonb),
  ('agent_memory', 'Agent Memory', 'postgres', 'agent_capability', 'Load and save shared agent memory across workflows and conversations', '/webhook/core/agent-memory/load', 'y9I74UctYLqqIPJV', 'Tradie App Postgres', 'active', ARRAY['george_foreman','sally_receptionist'], '{"source_of_truth": "postgres"}'::jsonb)
ON CONFLICT (service_key) DO UPDATE SET
  service_name = EXCLUDED.service_name,
  provider = EXCLUDED.provider,
  category = EXCLUDED.category,
  capability = EXCLUDED.capability,
  endpoint_path = EXCLUDED.endpoint_path,
  workflow_id = EXCLUDED.workflow_id,
  credential_name = EXCLUDED.credential_name,
  status = EXCLUDED.status,
  available_to_agents = EXCLUDED.available_to_agents,
  config = EXCLUDED.config,
  updated_at = now();

INSERT INTO mcp_service_tools (service_key, tool_key, tool_name, description, endpoint_path, workflow_id, input_schema, output_contract, active)
VALUES
  ('google_calendar', 'calendar_book_job', 'Calendar Book Job', 'Assign tradies and create a labelled Google Calendar job event.', '/webhook/agents/george/calendar-book-job', 'fvxKC3ZdeagYaZ8S', '{"schedule_slot_id":"text","tradie_count":"number","calendar_id":"text"}'::jsonb, '{"status":"calendar_booked","google_event_id":"text"}'::jsonb, true),
  ('google_calendar', 'google_calendar_busy', 'Google Calendar Busy Check', 'Read busy calendar events for a requested work date or window.', null, 'bDhl5QbvMTqlQUlx', '{"preferred_date":"date","preferred_window":"text","calendar_id":"text"}'::jsonb, '{"busy":"boolean","events":"array"}'::jsonb, true),
  ('skills_registry', 'skills_search', 'Skills Search', 'Search reusable business capability skills stored in Postgres.', '/webhook/core/skills/search', null, '{"query":"text","agent_key":"text","category":"text"}'::jsonb, '{"results":"array"}'::jsonb, true),
  ('skills_registry', 'skills_save', 'Skills Save', 'Create or update a reusable business capability skill.', '/webhook/core/skills/save', null, '{"skill_key":"text","best_practice":"text"}'::jsonb, '{"skill_key":"text","version":"number"}'::jsonb, true),
  ('agent_knowledge', 'knowledge_search', 'Knowledge Search', 'Search accumulated business knowledge for an agent.', '/webhook/core/agent-knowledge/search', 'kIkqBJ8at9TbFXeu', '{"agent_key":"text","query":"text"}'::jsonb, '{"results":"array"}'::jsonb, true),
  ('agent_knowledge', 'knowledge_save', 'Knowledge Save', 'Save a reusable agent lesson into the knowledge store.', '/webhook/core/agent-knowledge/save', 'f2lih2nHwzv3FQTu', '{"agent_key":"text","content":"text"}'::jsonb, '{"knowledge_id":"uuid"}'::jsonb, true)
ON CONFLICT (tool_key) DO UPDATE SET
  service_key = EXCLUDED.service_key,
  tool_name = EXCLUDED.tool_name,
  description = EXCLUDED.description,
  endpoint_path = EXCLUDED.endpoint_path,
  workflow_id = EXCLUDED.workflow_id,
  input_schema = EXCLUDED.input_schema,
  output_contract = EXCLUDED.output_contract,
  active = true,
  updated_at = now();

INSERT INTO business_skills (
  skill_key, skill_name, capability, category, description, best_practice, guardrails, inputs, outputs, owner_agent_key, version, status, tags, source_type, source_id, usefulness_score
)
VALUES
  (
    'skill_route_efficient_scheduling',
    'Route Efficient Scheduling',
    'Scheduling and workforce productivity',
    'scheduling',
    'Choose booking windows that optimise the whole tradie day, not only the customer preference.',
    'Before recommending a slot, check tradie skills, current day plan, customer suburb, existing calendar blocks, travel buffers, urgency and route score. Prefer slots that reduce dead travel while still giving the customer a fast acceptable window.',
    'Never invent availability. Do not mark a job confirmed until the schedule is held and the calendar booking succeeds or operations approves the fallback.',
    '{"required":["trade_type","customer_suburb","preferred_window","duration_minutes"]}'::jsonb,
    '{"returns":["recommended_window","route_reason","customer_safe_message"]}'::jsonb,
    'george_foreman',
    1,
    'active',
    ARRAY['scheduling','travel','route_efficiency','moat'],
    'seed',
    'SKILL-SEED-001',
    10
  ),
  (
    'skill_quote_accuracy_learning',
    'Quote Accuracy Learning',
    'Pricing trust and quote improvement',
    'quoting',
    'Turn every completed job into better future estimates.',
    'Capture estimate, confirmed quote, final invoice, labour duration, travel time, materials, parts, variance reason and customer acceptance outcome. Use similar completed jobs to improve future indicative pricing and reduce quote surprise.',
    'Do not promise fixed prices from historical data. Use it to improve indicative ranges and confidence only.',
    '{"required":["trade_type","job_description","estimate","actuals"]}'::jsonb,
    '{"returns":["variance_reason","pricing_lesson","future_estimate_adjustment"]}'::jsonb,
    'george_foreman',
    1,
    'active',
    ARRAY['quoting','trust','job_actuals','moat'],
    'seed',
    'SKILL-SEED-002',
    10
  ),
  (
    'skill_customer_email_confirmation',
    'Customer Email Confirmation',
    'Customer intake quality',
    'intake',
    'Prevent wrong-email confirmations by spelling back and confirming email addresses.',
    'Always spell back customer email addresses before sending confirmations, quote links or invoice records. Set email_confirmed only after explicit customer confirmation.',
    'Do not send confirmations when email_confirmed is false.',
    '{"required":["email","customer_confirmation"]}'::jsonb,
    '{"returns":["email_confirmed","corrected_email"]}'::jsonb,
    'sally_receptionist',
    1,
    'active',
    ARRAY['intake','email','customer_experience'],
    'seed',
    'SKILL-SEED-003',
    10
  )
ON CONFLICT (skill_key) DO UPDATE SET
  skill_name = EXCLUDED.skill_name,
  capability = EXCLUDED.capability,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  best_practice = EXCLUDED.best_practice,
  guardrails = EXCLUDED.guardrails,
  inputs = EXCLUDED.inputs,
  outputs = EXCLUDED.outputs,
  owner_agent_key = EXCLUDED.owner_agent_key,
  status = 'active',
  tags = EXCLUDED.tags,
  usefulness_score = EXCLUDED.usefulness_score,
  updated_at = now();

INSERT INTO agent_skill_assignments (agent_key, skill_key, priority, active)
VALUES
  ('george_foreman', 'skill_route_efficient_scheduling', 10, true),
  ('george_foreman', 'skill_quote_accuracy_learning', 20, true),
  ('sally_receptionist', 'skill_customer_email_confirmation', 10, true)
ON CONFLICT (agent_key, skill_key) DO UPDATE SET priority = EXCLUDED.priority, active = true, updated_at = now();

SELECT jsonb_build_object(
  'success', true,
  'services', (SELECT count(*) FROM mcp_services),
  'tools', (SELECT count(*) FROM mcp_service_tools),
  'skills', (SELECT count(*) FROM business_skills),
  'assignments', (SELECT count(*) FROM agent_skill_assignments),
  'note', 'Reusable MCP service registry and Skills foundation are ready.'
) AS setup_result;
`;

return [{ json: { sql: query } }];
'@

$serviceSearchSqlCode = @'
const raw = items[0]?.json ?? {};
const source = raw.query && Object.keys(raw.query).length ? raw.query : (raw.body ?? raw);

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const agentKey = source.agent_key || '';
const category = source.category || '';
const queryText = source.query || source.search || '';

const query = `
WITH svc AS (
  SELECT *,
    CASE
      WHEN ${sql(queryText)} IS NULL THEN 0
      ELSE COALESCE((
        SELECT count(*)
        FROM regexp_split_to_table(lower(${sql(queryText)}), '\\s+') AS q(term)
        WHERE length(q.term) > 2
          AND lower(service_name || ' ' || capability || ' ' || provider || ' ' || category) LIKE '%' || q.term || '%'
      ), 0)
    END AS term_hits
  FROM mcp_services
  WHERE status IN ('active','planned')
    AND (${sql(agentKey)} IS NULL OR ${sql(agentKey)} = ANY(available_to_agents))
    AND (${sql(category)} IS NULL OR category = ${sql(category)})
),
tool_rows AS (
  SELECT
    s.service_key,
    COALESCE(jsonb_agg(jsonb_build_object(
      'tool_key', t.tool_key,
      'tool_name', t.tool_name,
      'description', t.description,
      'endpoint_path', t.endpoint_path,
      'workflow_id', t.workflow_id,
      'input_schema', t.input_schema,
      'output_contract', t.output_contract
    ) ORDER BY t.tool_name) FILTER (WHERE t.id IS NOT NULL), '[]'::jsonb) AS tools
  FROM svc s
  LEFT JOIN mcp_service_tools t ON t.service_key = s.service_key AND t.active = true
  GROUP BY s.service_key
)
SELECT jsonb_build_object(
  'success', true,
  'agent_key', ${sql(agentKey)},
  'query', ${sql(queryText)},
  'result_count', (SELECT count(*) FROM svc WHERE ${sql(queryText)} IS NULL OR term_hits > 0),
  'services', COALESCE(jsonb_agg(jsonb_build_object(
    'service_key', s.service_key,
    'service_name', s.service_name,
    'provider', s.provider,
    'category', s.category,
    'capability', s.capability,
    'endpoint_path', s.endpoint_path,
    'workflow_id', s.workflow_id,
    'credential_name', s.credential_name,
    'status', s.status,
    'available_to_agents', s.available_to_agents,
    'config', s.config,
    'tools', tr.tools
  ) ORDER BY s.category, s.service_name), '[]'::jsonb)
) AS mcp_services
FROM svc s
LEFT JOIN tool_rows tr ON tr.service_key = s.service_key
WHERE ${sql(queryText)} IS NULL OR s.term_hits > 0;
`;

return [{ json: { sql: query } }];
'@

$skillsSearchSqlCode = @'
const raw = items[0]?.json ?? {};
const source = raw.query && Object.keys(raw.query).length ? raw.query : (raw.body ?? raw);

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const agentKey = source.agent_key || '';
const category = source.category || '';
const queryText = source.query || source.search || source.question || '';
const limit = Math.min(Math.max(Number(source.limit || 8), 1), 20);

const query = `
WITH skills AS (
  SELECT
    s.*,
    a.priority,
    CASE
      WHEN ${sql(queryText)} IS NULL THEN 0
      ELSE COALESCE((
        SELECT count(*)
        FROM regexp_split_to_table(lower(${sql(queryText)}), '\\s+') AS q(term)
        WHERE length(q.term) > 2
          AND (
            lower(s.skill_name) LIKE '%' || q.term || '%'
            OR lower(s.description) LIKE '%' || q.term || '%'
            OR lower(s.best_practice) LIKE '%' || q.term || '%'
            OR lower(array_to_string(s.tags, ' ')) LIKE '%' || q.term || '%'
          )
      ), 0)
    END AS term_hits
  FROM business_skills s
  LEFT JOIN agent_skill_assignments a ON a.skill_key = s.skill_key AND a.active = true AND a.agent_key = ${sql(agentKey)}
  WHERE s.status = 'active'
    AND (${sql(agentKey)} IS NULL OR s.owner_agent_key = ${sql(agentKey)} OR a.agent_key = ${sql(agentKey)})
    AND (${sql(category)} IS NULL OR s.category = ${sql(category)})
),
ranked AS (
  SELECT *, term_hits + usefulness_score + COALESCE(100 - priority, 0) / 100.0 AS score
  FROM skills
  WHERE ${sql(queryText)} IS NULL OR term_hits > 0
  ORDER BY score DESC, updated_at DESC
  LIMIT ${limit}
)
SELECT jsonb_build_object(
  'success', true,
  'agent_key', ${sql(agentKey)},
  'query', ${sql(queryText)},
  'result_count', (SELECT count(*) FROM ranked),
  'results', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'skill_key', skill_key,
      'skill_name', skill_name,
      'capability', capability,
      'category', category,
      'description', description,
      'best_practice', best_practice,
      'guardrails', guardrails,
      'inputs', inputs,
      'outputs', outputs,
      'owner_agent_key', owner_agent_key,
      'version', version,
      'tags', tags,
      'usefulness_score', usefulness_score,
      'score', score,
      'updated_at', updated_at
    ) ORDER BY score DESC, updated_at DESC)
    FROM ranked
  ), '[]'::jsonb)
) AS skills_search;
`;

return [{ json: { sql: query } }];
'@

$skillsSaveSqlCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw;

function slug(text) {
  return String(text || 'skill').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}

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

const skillName = body.skill_name || body.title || 'Business Skill';
const skillKey = body.skill_key || slug(skillName);
const agentKey = body.owner_agent_key || body.agent_key || null;

const query = `
INSERT INTO business_skills (
  skill_key, skill_name, capability, category, description, best_practice, guardrails,
  inputs, outputs, owner_agent_key, status, tags, source_type, source_id, usefulness_score
)
VALUES (
  ${sql(skillKey)},
  ${sql(skillName)},
  ${sql(body.capability || body.category || 'Business capability')},
  ${sql(body.category || 'general')},
  ${sql(body.description || body.best_practice || '')},
  ${sql(body.best_practice || body.content || body.description || '')},
  ${sql(body.guardrails || '')},
  ${jsonSql(body.inputs || {})},
  ${jsonSql(body.outputs || {})},
  ${sql(agentKey)},
  'active',
  ${arraySql(body.tags)},
  ${sql(body.source_type || 'agent_update')},
  ${sql(body.source_id || body.entity_id || '')},
  COALESCE(${sql(body.usefulness_score || 5)}, '5')::numeric
)
ON CONFLICT (skill_key) DO UPDATE SET
  skill_name = EXCLUDED.skill_name,
  capability = EXCLUDED.capability,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  best_practice = EXCLUDED.best_practice,
  guardrails = EXCLUDED.guardrails,
  inputs = EXCLUDED.inputs,
  outputs = EXCLUDED.outputs,
  owner_agent_key = EXCLUDED.owner_agent_key,
  version = business_skills.version + 1,
  status = 'active',
  tags = EXCLUDED.tags,
  source_type = EXCLUDED.source_type,
  source_id = EXCLUDED.source_id,
  usefulness_score = EXCLUDED.usefulness_score,
  updated_at = now()
RETURNING jsonb_build_object(
  'success', true,
  'skill_key', skill_key,
  'skill_name', skill_name,
  'version', version,
  'owner_agent_key', owner_agent_key,
  'updated_at', updated_at
) AS skill_save;
`;

return [{ json: { sql: query } }];
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
    category: first(raw.category, field('category'), ''),
    query: first(raw.query, raw.search, field('query'), text),
    limit: first(raw.limit, field('limit'), 8),
  },
}];
'@

$toolNormaliseSkillSaveCode = @'
const raw = items[0]?.json ?? {};
return [{
  json: {
    skill_key: raw.skill_key || '',
    skill_name: raw.skill_name || raw.title || 'Business Skill',
    capability: raw.capability || '',
    category: raw.category || 'general',
    description: raw.description || raw.summary || '',
    best_practice: raw.best_practice || raw.content || raw.summary || '',
    guardrails: raw.guardrails || '',
    owner_agent_key: raw.owner_agent_key || raw.agent_key || 'george_foreman',
    tags: raw.tags || '',
    source_type: raw.source_type || 'agent_update',
    source_id: raw.source_id || raw.entity_id || '',
    usefulness_score: raw.usefulness_score || 5,
    inputs: raw.inputs || {},
    outputs: raw.outputs || {},
  },
}];
'@

$setupNodes = @(
    (New-WebhookNode "MCP And Skills Setup Webhook" "core/mcp-skills/setup" "POST" 0 0),
    (New-CodeNode "Build MCP And Skills Setup SQL" $setupSqlCode 260 0),
    (New-PostgresNode "Setup MCP Services And Skills" 520 0),
    (New-RespondNode "Respond MCP Skills Setup" '={{$json.setup_result || $json}}' 780 0)
)
$setupConnections = @{
    "MCP And Skills Setup Webhook" = @{ main = @(, @(@{ node = "Build MCP And Skills Setup SQL"; type = "main"; index = 0 })) }
    "Build MCP And Skills Setup SQL" = @{ main = @(, @(@{ node = "Setup MCP Services And Skills"; type = "main"; index = 0 })) }
    "Setup MCP Services And Skills" = @{ main = @(, @(@{ node = "Respond MCP Skills Setup"; type = "main"; index = 0 })) }
}
$setup = Upsert-WorkflowByName "TRADIE-CORE-907-MCP-Services-And-Skills-Setup" $setupNodes $setupConnections

$serviceSearchNodes = @(
    (New-WebhookNode "MCP Services Search Webhook" "core/mcp-services/search" "POST" 0 0),
    (New-CodeNode "Build MCP Services Search SQL" $serviceSearchSqlCode 260 0),
    (New-PostgresNode "Search MCP Services" 520 0),
    (New-RespondNode "Respond MCP Services Search" '={{$json.mcp_services || $json}}' 780 0)
)
$serviceSearchConnections = @{
    "MCP Services Search Webhook" = @{ main = @(, @(@{ node = "Build MCP Services Search SQL"; type = "main"; index = 0 })) }
    "Build MCP Services Search SQL" = @{ main = @(, @(@{ node = "Search MCP Services"; type = "main"; index = 0 })) }
    "Search MCP Services" = @{ main = @(, @(@{ node = "Respond MCP Services Search"; type = "main"; index = 0 })) }
}
$serviceSearch = Upsert-WorkflowByName "TRADIE-CORE-908-MCP-Services-Search" $serviceSearchNodes $serviceSearchConnections

$skillsSearchNodes = @(
    (New-WebhookNode "Skills Search Webhook" "core/skills/search" "POST" 0 0),
    (New-CodeNode "Build Skills Search SQL" $skillsSearchSqlCode 260 0),
    (New-PostgresNode "Search Skills" 520 0),
    (New-RespondNode "Respond Skills Search" '={{$json.skills_search || $json}}' 780 0)
)
$skillsSearchConnections = @{
    "Skills Search Webhook" = @{ main = @(, @(@{ node = "Build Skills Search SQL"; type = "main"; index = 0 })) }
    "Build Skills Search SQL" = @{ main = @(, @(@{ node = "Search Skills"; type = "main"; index = 0 })) }
    "Search Skills" = @{ main = @(, @(@{ node = "Respond Skills Search"; type = "main"; index = 0 })) }
}
$skillsSearch = Upsert-WorkflowByName "TRADIE-CORE-909-Skills-Search" $skillsSearchNodes $skillsSearchConnections

$skillsSaveNodes = @(
    (New-WebhookNode "Skills Save Webhook" "core/skills/save" "POST" 0 0),
    (New-CodeNode "Build Skills Save SQL" $skillsSaveSqlCode 260 0),
    (New-PostgresNode "Save Skill" 520 0),
    (New-RespondNode "Respond Skill Save" '={{$json.skill_save || $json}}' 780 0)
)
$skillsSaveConnections = @{
    "Skills Save Webhook" = @{ main = @(, @(@{ node = "Build Skills Save SQL"; type = "main"; index = 0 })) }
    "Build Skills Save SQL" = @{ main = @(, @(@{ node = "Save Skill"; type = "main"; index = 0 })) }
    "Save Skill" = @{ main = @(, @(@{ node = "Respond Skill Save"; type = "main"; index = 0 })) }
}
$skillsSave = Upsert-WorkflowByName "TRADIE-CORE-910-Skills-Save" $skillsSaveNodes $skillsSaveConnections

$toolServiceSearchNodes = @(
    (New-ExecuteWorkflowTriggerNode "When MCP Service Search Tool Is Called" 0 0),
    (New-CodeNode "Normalise MCP Service Search Input" $toolNormaliseSearchCode 260 0),
    (New-HttpRequestNode "Call MCP Service Search Endpoint" "POST" "http://localhost:5678/webhook/core/mcp-services/search" 520 0 "={{ JSON.stringify(`$json) }}")
)
$toolServiceSearchConnections = @{
    "When MCP Service Search Tool Is Called" = @{ main = @(, @(@{ node = "Normalise MCP Service Search Input"; type = "main"; index = 0 })) }
    "Normalise MCP Service Search Input" = @{ main = @(, @(@{ node = "Call MCP Service Search Endpoint"; type = "main"; index = 0 })) }
}
$toolServiceSearch = Upsert-WorkflowByName "TRADIE-TOOL-MCP-Service-Search" $toolServiceSearchNodes $toolServiceSearchConnections

$toolSkillsSearchNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Skills Search Tool Is Called" 0 0),
    (New-CodeNode "Normalise Skills Search Input" $toolNormaliseSearchCode 260 0),
    (New-HttpRequestNode "Call Skills Search Endpoint" "POST" "http://localhost:5678/webhook/core/skills/search" 520 0 "={{ JSON.stringify(`$json) }}")
)
$toolSkillsSearchConnections = @{
    "When Skills Search Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Skills Search Input"; type = "main"; index = 0 })) }
    "Normalise Skills Search Input" = @{ main = @(, @(@{ node = "Call Skills Search Endpoint"; type = "main"; index = 0 })) }
}
$toolSkillsSearch = Upsert-WorkflowByName "TRADIE-TOOL-Skills-Search" $toolSkillsSearchNodes $toolSkillsSearchConnections

$toolSkillsSaveNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Skills Save Tool Is Called" 0 0),
    (New-CodeNode "Normalise Skills Save Input" $toolNormaliseSkillSaveCode 260 0),
    (New-HttpRequestNode "Call Skills Save Endpoint" "POST" "http://localhost:5678/webhook/core/skills/save" 520 0 "={{ JSON.stringify(`$json) }}")
)
$toolSkillsSaveConnections = @{
    "When Skills Save Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Skills Save Input"; type = "main"; index = 0 })) }
    "Normalise Skills Save Input" = @{ main = @(, @(@{ node = "Call Skills Save Endpoint"; type = "main"; index = 0 })) }
}
$toolSkillsSave = Upsert-WorkflowByName "TRADIE-TOOL-Skills-Save" $toolSkillsSaveNodes $toolSkillsSaveConnections

@{
    core_workflows = @(
        ($setup | Select-Object name,id,active),
        ($serviceSearch | Select-Object name,id,active),
        ($skillsSearch | Select-Object name,id,active),
        ($skillsSave | Select-Object name,id,active)
    )
    tool_workflows = @(
        ($toolServiceSearch | Select-Object name,id,active),
        ($toolSkillsSearch | Select-Object name,id,active),
        ($toolSkillsSave | Select-Object name,id,active)
    )
} | ConvertTo-Json -Depth 10
