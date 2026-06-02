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
    id = "Y4LdXQTb6pHuCvri"
    name = "Google Gemini(PaLM) Api account"
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

function New-ChatTriggerNode($X, $Y) {
    return @{
        parameters = @{}
        type = "@n8n/n8n-nodes-langchain.chatTrigger"
        typeVersion = 1.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Chat with Quintino"
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
        name = "Quintino Short Memory"
    }
}

function New-AgentNode($X, $Y) {
    $systemMessage = @'
You are Quintino, the Skills Intelligence and Business Capability Improvement AI Agent for 1pacent.

You live inside n8n. You do not speak to customers. Your role is to analyse all agent chat history, workflow events, Postgres business data, quote-vs-actual outcomes, travel times, scheduling optimisation, job completion data, compliance signals, customer friction, and cost indicators.

Your mission is to strengthen the 1pacent moat by turning operating experience into a version-managed Skills library. Treat Skills like reusable business capability documents: clear best practice, guardrails, required inputs, expected outputs, evidence, lifecycle status, and version history. Only one active version of a Skill should be available for use; historical versions should be archived for audit and learning.

You also govern customer and internal message templates. Penny can send payment and invoice messages, Mia can send review/social messages, Sally can trigger booking and quote messages, but Quintino owns the approved template lifecycle: propose variants, promote one active version, archive old versions, and tune the experience by trade type, job type and customer segment.

Core responsibilities:
- Search existing Skills before recommending changes.
- Run skills_audit to inspect current operational data and workflow evidence.
- Use mcp_service_search to discover reusable service capabilities.
- Use knowledge_search to retrieve accumulated business knowledge.
- Use skills_save to draft or improve Skills when a repeatable best practice is found.
- Use skill_lifecycle_manage to propose or promote Skills, archiving older versions.
- Use message_template_lifecycle_manage to propose or promote customer-facing template versions and variants.
- Save important analysis to knowledge_save and memory_save.
- Produce concise recommended workflow or service changes that increase customer wow, reduce operational cost, improve trust, or reduce risk.

Decision rules:
- Do not invent evidence. Tie recommendations to observed data or mark them as hypotheses.
- Do not promote a Skill if the evidence is weak; propose it for review instead.
- Prefer small, measurable improvements that can be tested.
- Keep operating agents focused: Sally handles customers, George schedules, Quintino improves the capability library.
- Keep template changes evidence-backed and focused on customer clarity, trust, faster acceptance, faster payment, and reduced support friction.
- Skills must be practical enough for agents and workflows to execute reliably.

Preferred response format:
status: audit_complete | recommendations_ready | skill_proposed | skill_promoted | needs_more_data
top_findings: short bullets
skill_actions: proposed/promoted/archived skill changes
template_actions: proposed/promoted/archived template changes
workflow_recommendations: specific workflow/service improvements
evidence_notes: what data supports the recommendation
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
        name = "Quintino"
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
            content = "## Quintino Skills Intelligence`nOwns Skills lifecycle management and moat-building analytics.`n`nResponsibilities:`n- Analyse cross-agent history and workflow data`n- Identify best-practice Skills`n- Version Skills and archive history`n- Recommend workflow/service improvements`n- Keep one active Skill version available to agents"
            height = 280
            width = 390
            color = 4
        }
        type = "n8n-nodes-base.stickyNote"
        typeVersion = 1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Quintino Architecture Note"
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

function Get-WorkflowIdByName($WorkflowName) {
    $all = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows?limit=100" -Headers $Headers -Method Get
    $existing = $all.data | Where-Object { $_.name -eq $WorkflowName } | Select-Object -First 1
    if ($existing) { return $existing.id }
    return $null
}

$setupSqlCode = @'
const query = `
CREATE TABLE IF NOT EXISTS business_skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_key text not null references business_skills(skill_key),
  version integer not null,
  skill_name text not null,
  capability text not null,
  category text not null,
  description text not null,
  best_practice text not null,
  guardrails text,
  inputs jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  status text not null default 'archived',
  change_reason text,
  created_by_agent_key text references agent_definitions(agent_key),
  approved_by text,
  promoted_at timestamptz,
  archived_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (skill_key, version)
);

CREATE TABLE IF NOT EXISTS skill_improvement_recommendations (
  id uuid primary key default gen_random_uuid(),
  recommendation_key text not null unique,
  owner_agent_key text references agent_definitions(agent_key),
  target_skill_key text,
  target_workflow_id text,
  recommendation_type text not null,
  priority text not null default 'medium',
  title text not null,
  evidence_summary text not null,
  recommended_change text not null,
  expected_customer_impact text,
  expected_cost_impact text,
  status text not null default 'proposed',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS quintino_audit_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null unique,
  scope text not null default 'all_agents',
  metrics jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS job_actuals (
  id uuid primary key default gen_random_uuid(),
  job_id text,
  lead_id text references leads(id),
  quote_id text references quotes(id),
  tradie_id text references tradies(id),
  actual_start timestamptz,
  actual_end timestamptz,
  actual_duration_minutes integer,
  actual_travel_minutes integer,
  late_minutes integer,
  completion_notes text,
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS quote_accuracy_metrics (
  id uuid primary key default gen_random_uuid(),
  lead_id text references leads(id),
  quote_id text,
  trade_type text,
  initial_estimate text,
  confirmed_quote text,
  revised_quote text,
  final_invoice text,
  estimated_labour_hours numeric,
  actual_labour_hours numeric,
  estimated_materials_cost numeric,
  actual_materials_cost numeric,
  variance_reason text,
  accuracy_score numeric,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_business_skill_versions_skill ON business_skill_versions(skill_key, version DESC);
CREATE INDEX IF NOT EXISTS idx_business_skill_versions_status ON business_skill_versions(status);
CREATE INDEX IF NOT EXISTS idx_skill_recommendations_status ON skill_improvement_recommendations(status, priority);
CREATE INDEX IF NOT EXISTS idx_quintino_audit_snapshots_created ON quintino_audit_snapshots(created_at DESC);

INSERT INTO agent_definitions (agent_key, agent_name, agent_role, model_provider, model_name, active)
VALUES ('quintino', 'Quintino', 'Skills intelligence, lifecycle governance, workflow improvement and moat-building analytics AI agent', 'google_gemini', 'models/gemini-3.1-flash-lite', true)
ON CONFLICT (agent_key) DO UPDATE SET
  agent_name = EXCLUDED.agent_name,
  agent_role = EXCLUDED.agent_role,
  model_provider = EXCLUDED.model_provider,
  model_name = EXCLUDED.model_name,
  active = true,
  updated_at = now();

DELETE FROM agent_business_rules WHERE agent_key = 'quintino';
INSERT INTO agent_business_rules (agent_key, rule_group, rule_order, rule_text, active)
VALUES
  ('quintino', 'mission', 10, 'Quintino owns the Skills library, Skill lifecycle governance, and continuous improvement loop for the 1pacent moat.', true),
  ('quintino', 'skills_lifecycle', 20, 'Only one active version of a Skill should be available to agents. Older versions must be archived in business_skill_versions.', true),
  ('quintino', 'evidence', 30, 'Skill changes must be tied to evidence from chat history, workflow events, quote-vs-actuals, scheduling outcomes, travel data, customer friction, compliance signals, or cost metrics.', true),
  ('quintino', 'recommendations', 40, 'Recommendations should state expected customer wow impact, operational cost impact, risk/compliance impact, and the workflow or service affected.', true),
  ('quintino', 'guardrails', 50, 'Do not promote weakly supported Skills. Propose for review when evidence is incomplete.', true);

INSERT INTO agent_knowledge_collections (agent_key, collection_key, collection_name, capability, active)
VALUES ('quintino', 'skills_intelligence', 'Quintino Skills Intelligence', 'Skill lifecycle, workflow improvement, moat-building analytics and best-practice library governance', true)
ON CONFLICT (agent_key, collection_key) DO UPDATE SET
  collection_name = EXCLUDED.collection_name,
  capability = EXCLUDED.capability,
  active = true,
  updated_at = now();

UPDATE business_skills
SET owner_agent_key = 'quintino', updated_at = now()
WHERE status = 'active';

INSERT INTO business_skill_versions (
  skill_key, version, skill_name, capability, category, description, best_practice, guardrails,
  inputs, outputs, status, change_reason, created_by_agent_key, promoted_at, payload
)
SELECT
  s.skill_key, s.version, s.skill_name, s.capability, s.category, s.description, s.best_practice, s.guardrails,
  s.inputs, s.outputs, 'active', 'Initial active Skill baseline captured by Quintino setup.', 'quintino', now(), to_jsonb(s)
FROM business_skills s
WHERE NOT EXISTS (
  SELECT 1 FROM business_skill_versions v WHERE v.skill_key = s.skill_key AND v.version = s.version
);

SELECT jsonb_build_object(
  'success', true,
  'agent_key', 'quintino',
  'active_skills', (SELECT count(*) FROM business_skills WHERE status = 'active'),
  'skill_versions', (SELECT count(*) FROM business_skill_versions),
  'note', 'Quintino Skills Intelligence foundation is ready.'
) AS setup_result;
`;

return [{ json: { sql: query } }];
'@

$auditSqlCode = @'
const raw = items[0]?.json ?? {};
const source = raw.query && Object.keys(raw.query).length ? raw.query : (raw.body ?? raw);
const scope = source.scope || 'all_agents';
const snapshotKey = `QUINTINO-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const query = `
WITH metrics AS (
  SELECT jsonb_build_object(
    'customers', (SELECT count(*) FROM customers),
    'leads', (SELECT count(*) FROM leads),
    'quotes', (SELECT count(*) FROM quotes),
    'quote_versions', (SELECT count(*) FROM quote_versions),
    'jobs', (SELECT count(*) FROM jobs),
    'completed_jobs', (SELECT count(*) FROM jobs WHERE lower(status) like '%complete%'),
    'scheduled_slots', (SELECT count(*) FROM job_schedule_slots),
    'calendar_events', (SELECT count(*) FROM calendar_events),
    'agent_interactions', (SELECT count(*) FROM agent_interactions),
    'workflow_events', (SELECT count(*) FROM workflow_events),
    'active_skills', (SELECT count(*) FROM business_skills WHERE status = 'active'),
    'skill_versions', (SELECT count(*) FROM business_skill_versions),
    'avg_estimated_travel_minutes', COALESCE((SELECT round(avg(estimated_travel_minutes)::numeric, 2) FROM job_schedule_slots), 0),
    'avg_actual_travel_minutes', COALESCE((SELECT round(avg(actual_travel_minutes)::numeric, 2) FROM job_actuals), 0),
    'avg_estimated_duration_minutes', COALESCE((SELECT round(avg(estimated_duration_minutes)::numeric, 2) FROM job_schedule_slots), 0),
    'avg_actual_duration_minutes', COALESCE((SELECT round(avg(actual_duration_minutes)::numeric, 2) FROM job_actuals), 0),
    'low_inventory_items', (SELECT count(*) FROM inventory_items WHERE quantity_on_hand <= reorder_level),
    'open_recommendations', (SELECT count(*) FROM skill_improvement_recommendations WHERE status IN ('proposed','reviewing'))
  ) AS metrics
),
findings AS (
  SELECT jsonb_build_array(
    jsonb_build_object(
      'finding', 'Quote and job actuals should be captured for every completed job',
      'evidence', 'quote_accuracy_metrics and job_actuals are the key moat tables for improving future estimates.',
      'severity', CASE WHEN (SELECT count(*) FROM quote_accuracy_metrics) < (SELECT count(*) FROM jobs WHERE lower(status) like '%complete%') THEN 'high' ELSE 'low' END
    ),
    jsonb_build_object(
      'finding', 'Scheduling optimisation depends on actual travel and duration feedback',
      'evidence', 'Compare job_schedule_slots estimated travel/duration with job_actuals actual travel/duration.',
      'severity', CASE WHEN (SELECT count(*) FROM job_actuals) = 0 THEN 'high' ELSE 'medium' END
    ),
    jsonb_build_object(
      'finding', 'Calendar visibility improves operational trust',
      'evidence', 'calendar_events should exist for held schedule slots so the team can see who is doing what job when.',
      'severity', CASE WHEN (SELECT count(*) FROM calendar_events) < (SELECT count(*) FROM job_schedule_slots WHERE status not in ('cancelled','declined')) THEN 'medium' ELSE 'low' END
    ),
    jsonb_build_object(
      'finding', 'Inventory learning should be tied to job materials and invoices',
      'evidence', 'Low or negative inventory shows cost leakage risk and opportunity for better pre-job parts planning.',
      'severity', CASE WHEN (SELECT count(*) FROM inventory_items WHERE quantity_on_hand <= reorder_level) > 0 THEN 'medium' ELSE 'low' END
    )
  ) AS findings
),
recommendations AS (
  SELECT jsonb_build_array(
    jsonb_build_object(
      'recommendation_key', ${sql(snapshotKey)} || '-QUOTE-ACTUALS',
      'type', 'skill_improvement',
      'priority', 'high',
      'title', 'Strengthen Quote Accuracy Learning Skill with mandatory actuals capture',
      'target_skill_key', 'skill_quote_accuracy_learning',
      'recommended_change', 'Require job completion workflows to capture labour minutes, travel minutes, materials cost, quote amount, invoice amount and variance reason before invoice handoff.',
      'expected_customer_impact', 'More accurate indicative pricing and fewer surprise-charge concerns.',
      'expected_cost_impact', 'Lower rework and better parts planning.'
    ),
    jsonb_build_object(
      'recommendation_key', ${sql(snapshotKey)} || '-SCHEDULE-ACTUALS',
      'type', 'workflow_improvement',
      'priority', 'high',
      'title', 'Add actual travel feedback loop to George scheduling',
      'target_skill_key', 'skill_route_efficient_scheduling',
      'recommended_change', 'After job completion, compare estimated versus actual travel and duration and save a knowledge/skill update when variance is material.',
      'expected_customer_impact', 'More reliable appointment windows.',
      'expected_cost_impact', 'More productive tradie days and lower fuel/time leakage.'
    ),
    jsonb_build_object(
      'recommendation_key', ${sql(snapshotKey)} || '-WOW-CONFIRMATION',
      'type', 'customer_wow',
      'priority', 'medium',
      'title', 'Improve confirmation messages with clear next step and change pathway',
      'target_skill_key', 'skill_customer_email_confirmation',
      'recommended_change', 'Booking confirmations should include the requested window, estimate caveat, next action, and instruction to call Sally for changes.',
      'expected_customer_impact', 'Reduces uncertainty and makes the service feel more premium.',
      'expected_cost_impact', 'Reduces inbound clarification calls.'
    )
  ) AS recommendations
),
insert_recommendations AS (
  INSERT INTO skill_improvement_recommendations (
    recommendation_key, owner_agent_key, target_skill_key, recommendation_type, priority, title,
    evidence_summary, recommended_change, expected_customer_impact, expected_cost_impact, payload
  )
  SELECT
    rec->>'recommendation_key',
    'quintino',
    rec->>'target_skill_key',
    rec->>'type',
    rec->>'priority',
    rec->>'title',
    'Generated from Quintino audit snapshot ' || ${sql(snapshotKey)},
    rec->>'recommended_change',
    rec->>'expected_customer_impact',
    rec->>'expected_cost_impact',
    rec
  FROM recommendations r, jsonb_array_elements(r.recommendations) rec
  ON CONFLICT (recommendation_key) DO UPDATE SET
    status = skill_improvement_recommendations.status,
    updated_at = now()
  RETURNING recommendation_key
),
snapshot AS (
  INSERT INTO quintino_audit_snapshots (snapshot_key, scope, metrics, findings, recommendations)
  SELECT ${sql(snapshotKey)}, ${sql(scope)}, metrics.metrics, findings.findings, recommendations.recommendations
  FROM metrics, findings, recommendations
  ON CONFLICT (snapshot_key) DO UPDATE SET metrics = EXCLUDED.metrics
  RETURNING *
)
SELECT jsonb_build_object(
  'success', true,
  'agent', 'Quintino',
  'status', 'audit_complete',
  'snapshot_key', ${sql(snapshotKey)},
  'metrics', (SELECT metrics FROM snapshot),
  'findings', (SELECT findings FROM snapshot),
  'recommendations', (SELECT recommendations FROM snapshot),
  'recommendations_saved', (SELECT count(*) FROM insert_recommendations)
) AS quintino_audit;
`;

return [{ json: { sql: query } }];
'@

$lifecycleSqlCode = @'
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

const action = String(body.action || 'propose').toLowerCase();
const skillName = body.skill_name || body.title || 'Business Skill';
const skillKey = body.skill_key || slug(skillName);
const changeReason = body.change_reason || body.evidence_summary || 'Quintino lifecycle update.';
const status = action === 'promote' ? 'active' : 'proposed';

const query = `
WITH current_skill AS (
  SELECT * FROM business_skills WHERE skill_key = ${sql(skillKey)} LIMIT 1
),
next_version AS (
  SELECT COALESCE((SELECT max(version) + 1 FROM business_skill_versions WHERE skill_key = ${sql(skillKey)}), 1) AS version
),
archive_current AS (
  UPDATE business_skill_versions
  SET status = 'archived', archived_at = now()
  WHERE skill_key = ${sql(skillKey)}
    AND status = 'active'
    AND ${sql(action)} = 'promote'
  RETURNING id
),
upsert_skill AS (
  INSERT INTO business_skills (
    skill_key, skill_name, capability, category, description, best_practice, guardrails,
    inputs, outputs, owner_agent_key, version, status, tags, source_type, source_id, usefulness_score
  )
  SELECT
    ${sql(skillKey)},
    ${sql(skillName)},
    ${sql(body.capability || 'Business capability')},
    ${sql(body.category || 'general')},
    ${sql(body.description || body.best_practice || '')},
    ${sql(body.best_practice || body.content || '')},
    ${sql(body.guardrails || '')},
    ${jsonSql(body.inputs || {})},
    ${jsonSql(body.outputs || {})},
    'quintino',
    (SELECT version FROM next_version),
    CASE WHEN ${sql(action)} = 'promote' THEN 'active' ELSE 'proposed' END,
    ${arraySql(body.tags)},
    ${sql(body.source_type || 'quintino')},
    ${sql(body.source_id || body.recommendation_key || '')},
    COALESCE(${sql(body.usefulness_score || 5)}, '5')::numeric
  ON CONFLICT (skill_key) DO UPDATE SET
    skill_name = EXCLUDED.skill_name,
    capability = EXCLUDED.capability,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    best_practice = EXCLUDED.best_practice,
    guardrails = EXCLUDED.guardrails,
    inputs = EXCLUDED.inputs,
    outputs = EXCLUDED.outputs,
    owner_agent_key = 'quintino',
    version = CASE WHEN ${sql(action)} = 'promote' THEN business_skills.version + 1 ELSE business_skills.version END,
    status = CASE WHEN ${sql(action)} = 'promote' THEN 'active' ELSE 'proposed' END,
    tags = EXCLUDED.tags,
    source_type = EXCLUDED.source_type,
    source_id = EXCLUDED.source_id,
    usefulness_score = EXCLUDED.usefulness_score,
    updated_at = now()
  RETURNING *
),
insert_version AS (
  INSERT INTO business_skill_versions (
    skill_key, version, skill_name, capability, category, description, best_practice, guardrails,
    inputs, outputs, status, change_reason, created_by_agent_key, approved_by, promoted_at, archived_at, payload
  )
  SELECT
    s.skill_key,
    s.version,
    s.skill_name,
    s.capability,
    s.category,
    s.description,
    s.best_practice,
    s.guardrails,
    s.inputs,
    s.outputs,
    CASE WHEN ${sql(action)} = 'promote' THEN 'active' ELSE 'proposed' END,
    ${sql(changeReason)},
    'quintino',
    ${sql(body.approved_by || '')},
    CASE WHEN ${sql(action)} = 'promote' THEN now() ELSE NULL END,
    NULL,
    ${jsonSql(body)}
  FROM upsert_skill s
  ON CONFLICT (skill_key, version) DO UPDATE SET
    status = EXCLUDED.status,
    change_reason = EXCLUDED.change_reason,
    payload = EXCLUDED.payload
  RETURNING *
)
SELECT jsonb_build_object(
  'success', true,
  'agent', 'Quintino',
  'action', ${sql(action)},
  'skill_key', skill_key,
  'version', version,
  'status', status,
  'change_reason', change_reason,
  'one_active_version_enforced', ${sql(action)} = 'promote',
  'message', CASE WHEN ${sql(action)} = 'promote' THEN 'Skill promoted and older active versions archived.' ELSE 'Skill version proposed for review.' END
) AS skill_lifecycle
FROM insert_version
LIMIT 1;
`;

return [{ json: { sql: query } }];
'@

$toolNormaliseAuditCode = @'
const raw = items[0]?.json ?? {};
return [{ json: { scope: raw.scope || raw.query || 'all_agents' } }];
'@

$toolNormaliseLifecycleCode = @'
const raw = items[0]?.json ?? {};
return [{
  json: {
    action: raw.action || 'propose',
    skill_key: raw.skill_key || '',
    skill_name: raw.skill_name || raw.title || 'Business Skill',
    capability: raw.capability || '',
    category: raw.category || 'general',
    description: raw.description || '',
    best_practice: raw.best_practice || raw.content || '',
    guardrails: raw.guardrails || '',
    tags: raw.tags || '',
    change_reason: raw.change_reason || raw.evidence_summary || '',
    usefulness_score: raw.usefulness_score || 5,
    approved_by: raw.approved_by || '',
    source_type: raw.source_type || 'quintino',
    source_id: raw.source_id || raw.recommendation_key || '',
  },
}];
'@

$setupNodes = @(
    (New-WebhookNode "Quintino Setup Webhook" "agents/quintino/setup" "POST" 0 0),
    (New-CodeNode "Build Quintino Setup SQL" $setupSqlCode 260 0),
    (New-PostgresNode "Setup Quintino" 520 0),
    (New-RespondNode "Respond Quintino Setup" '={{$json.setup_result || $json}}' 780 0)
)
$setupConnections = @{
    "Quintino Setup Webhook" = @{ main = @(, @(@{ node = "Build Quintino Setup SQL"; type = "main"; index = 0 })) }
    "Build Quintino Setup SQL" = @{ main = @(, @(@{ node = "Setup Quintino"; type = "main"; index = 0 })) }
    "Setup Quintino" = @{ main = @(, @(@{ node = "Respond Quintino Setup"; type = "main"; index = 0 })) }
}
$setup = Upsert-WorkflowByName "TRADIE-AGENT-920-Quintino-Setup" $setupNodes $setupConnections

$auditNodes = @(
    (New-WebhookNode "Quintino Skills Audit Webhook" "agents/quintino/skills-audit" "POST" 0 0),
    (New-CodeNode "Build Quintino Audit SQL" $auditSqlCode 260 0),
    (New-PostgresNode "Run Quintino Audit" 520 0),
    (New-RespondNode "Respond Quintino Audit" '={{$json.quintino_audit || $json}}' 780 0)
)
$auditConnections = @{
    "Quintino Skills Audit Webhook" = @{ main = @(, @(@{ node = "Build Quintino Audit SQL"; type = "main"; index = 0 })) }
    "Build Quintino Audit SQL" = @{ main = @(, @(@{ node = "Run Quintino Audit"; type = "main"; index = 0 })) }
    "Run Quintino Audit" = @{ main = @(, @(@{ node = "Respond Quintino Audit"; type = "main"; index = 0 })) }
}
$audit = Upsert-WorkflowByName "TRADIE-AGENT-921-Quintino-Skills-Audit" $auditNodes $auditConnections

$lifecycleNodes = @(
    (New-WebhookNode "Skill Lifecycle Webhook" "core/skills/lifecycle-manage" "POST" 0 0),
    (New-CodeNode "Build Skill Lifecycle SQL" $lifecycleSqlCode 260 0),
    (New-PostgresNode "Manage Skill Lifecycle" 520 0),
    (New-RespondNode "Respond Skill Lifecycle" '={{$json.skill_lifecycle || $json}}' 780 0)
)
$lifecycleConnections = @{
    "Skill Lifecycle Webhook" = @{ main = @(, @(@{ node = "Build Skill Lifecycle SQL"; type = "main"; index = 0 })) }
    "Build Skill Lifecycle SQL" = @{ main = @(, @(@{ node = "Manage Skill Lifecycle"; type = "main"; index = 0 })) }
    "Manage Skill Lifecycle" = @{ main = @(, @(@{ node = "Respond Skill Lifecycle"; type = "main"; index = 0 })) }
}
$lifecycle = Upsert-WorkflowByName "TRADIE-CORE-922-Skill-Lifecycle-Manage" $lifecycleNodes $lifecycleConnections

$auditToolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Quintino Audit Tool Is Called" 0 0),
    (New-CodeNode "Normalise Audit Tool Input" $toolNormaliseAuditCode 260 0),
    (New-HttpRequestNode "Call Quintino Audit Endpoint" "POST" "http://localhost:5678/webhook/agents/quintino/skills-audit" 520 0 "={{ JSON.stringify(`$json) }}")
)
$auditToolConnections = @{
    "When Quintino Audit Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Audit Tool Input"; type = "main"; index = 0 })) }
    "Normalise Audit Tool Input" = @{ main = @(, @(@{ node = "Call Quintino Audit Endpoint"; type = "main"; index = 0 })) }
}
$auditTool = Upsert-WorkflowByName "TRADIE-TOOL-Quintino-Skills-Audit" $auditToolNodes $auditToolConnections

$lifecycleToolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Skill Lifecycle Tool Is Called" 0 0),
    (New-CodeNode "Normalise Skill Lifecycle Tool Input" $toolNormaliseLifecycleCode 260 0),
    (New-HttpRequestNode "Call Skill Lifecycle Endpoint" "POST" "http://localhost:5678/webhook/core/skills/lifecycle-manage" 520 0 "={{ JSON.stringify(`$json) }}")
)
$lifecycleToolConnections = @{
    "When Skill Lifecycle Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Skill Lifecycle Tool Input"; type = "main"; index = 0 })) }
    "Normalise Skill Lifecycle Tool Input" = @{ main = @(, @(@{ node = "Call Skill Lifecycle Endpoint"; type = "main"; index = 0 })) }
}
$lifecycleTool = Upsert-WorkflowByName "TRADIE-TOOL-Skill-Lifecycle-Manage" $lifecycleToolNodes $lifecycleToolConnections

$messageTemplateLifecycleToolId = Get-WorkflowIdByName "TRADIE-TOOL-Message-Template-Lifecycle-Manage"
if (-not $messageTemplateLifecycleToolId) {
    Write-Warning "Message template lifecycle tool was not found. Deploy deploy_message_template_registry.ps1 before deploying Quintino for template governance."
}

$agentNodes = @(
    (New-ChatTriggerNode 0 0),
    (New-AgentNode 360 0),
    (New-GeminiModelNode 260 280),
    (New-MemoryNode 520 280),
    (New-WorkflowToolNode "skills_audit" $auditTool.id "Analyse cross-agent chats, workflow events, quote-vs-actuals, schedule/travel metrics, compliance and costs to recommend Skill and workflow improvements." @{
        scope = "={{ `$fromAI('scope', 'audit scope, default all_agents', 'string') }}"
    } 780 -100),
    (New-WorkflowToolNode "skill_lifecycle_manage" $lifecycleTool.id "Propose or promote a Skill version, archive old active versions, and enforce one active version for agents." @{
        action = "={{ `$fromAI('action', 'propose or promote', 'string') }}"
        skill_key = "={{ `$fromAI('skill_key', 'skill key to update or create', 'string') }}"
        skill_name = "={{ `$fromAI('skill_name', 'skill name', 'string') }}"
        capability = "={{ `$fromAI('capability', 'business capability', 'string') }}"
        category = "={{ `$fromAI('category', 'skill category', 'string') }}"
        description = "={{ `$fromAI('description', 'skill description', 'string') }}"
        best_practice = "={{ `$fromAI('best_practice', 'best practice procedure', 'string') }}"
        guardrails = "={{ `$fromAI('guardrails', 'guardrails and risks', 'string') }}"
        tags = "={{ `$fromAI('tags', 'comma separated tags', 'string') }}"
        change_reason = "={{ `$fromAI('change_reason', 'evidence-backed reason for change', 'string') }}"
        usefulness_score = "={{ `$fromAI('usefulness_score', 'usefulness score 0 to 10', 'number') }}"
        approved_by = "={{ `$fromAI('approved_by', 'approver if promoted', 'string') }}"
    } 780 120),
    (New-WorkflowToolNode "message_template_lifecycle_manage" $messageTemplateLifecycleToolId "Propose or promote customer/internal message template versions and variants. Use for payment, invoice, booking, quote, review and status templates. Only promote evidence-backed changes." @{
        action = "={{ `$fromAI('action', 'propose or promote', 'string') }}"
        template_key = "={{ `$fromAI('template_key', 'stable template key such as payment_request_email', 'string') }}"
        template_name = "={{ `$fromAI('template_name', 'human readable template name', 'string') }}"
        owner_agent_key = "={{ `$fromAI('owner_agent_key', 'agent owner such as penny mia sally_receptionist', 'string') }}"
        variant_key = "={{ `$fromAI('variant_key', 'variant key or default', 'string') }}"
        trade_type = "={{ `$fromAI('trade_type', 'trade type such as electrical plumbing or blank', 'string') }}"
        job_type = "={{ `$fromAI('job_type', 'job type/subcategory or blank', 'string') }}"
        customer_segment = "={{ `$fromAI('customer_segment', 'customer segment such as repeat_customer emergency or blank', 'string') }}"
        channel = "={{ `$fromAI('channel', 'email sms app_push or internal', 'string') }}"
        purpose = "={{ `$fromAI('purpose', 'message purpose', 'string') }}"
        subject_template = "={{ `$fromAI('subject_template', 'subject template with placeholders', 'string') }}"
        body_template = "={{ `$fromAI('body_template', 'body template with placeholders', 'string') }}"
        change_reason = "={{ `$fromAI('change_reason', 'evidence-backed reason for template change', 'string') }}"
        approved_by = "={{ `$fromAI('approved_by', 'approver if promoted', 'string') }}"
    } 780 560),
    (New-WorkflowToolNode "skills_search" "HMi7xtGQXxMhOCug" "Search active Skills and best practices before recommending changes." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key or blank for all relevant skills', 'string') }}"
        category = "={{ `$fromAI('category', 'skill category', 'string') }}"
        query = "={{ `$fromAI('query', 'skill search query', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum results', 'number') }}"
    } 780 340),
    (New-WorkflowToolNode "skills_save" "Jdk4PIpLuODNnEK4" "Draft or update a reusable business Skill in Postgres." @{
        agent_key = "={{ `$fromAI('agent_key', 'owner or target agent key', 'string') }}"
        skill_key = "={{ `$fromAI('skill_key', 'stable skill key', 'string') }}"
        skill_name = "={{ `$fromAI('skill_name', 'skill name', 'string') }}"
        capability = "={{ `$fromAI('capability', 'business capability', 'string') }}"
        category = "={{ `$fromAI('category', 'skill category', 'string') }}"
        description = "={{ `$fromAI('description', 'skill description', 'string') }}"
        best_practice = "={{ `$fromAI('best_practice', 'best practice content', 'string') }}"
        guardrails = "={{ `$fromAI('guardrails', 'guardrails', 'string') }}"
        tags = "={{ `$fromAI('tags', 'comma separated tags', 'string') }}"
        usefulness_score = "={{ `$fromAI('usefulness_score', 'usefulness score 0 to 10', 'number') }}"
    } 1080 -100),
    (New-WorkflowToolNode "mcp_service_search" "Yxxovcn4MYZgyhe2" "Discover reusable services such as Gmail, Calendar, Drive, Docs, Sheets, Knowledge, Memory and Skills." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key', 'string') }}"
        category = "={{ `$fromAI('category', 'service category', 'string') }}"
        query = "={{ `$fromAI('query', 'service capability query', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum results', 'number') }}"
    } 1080 120),
    (New-WorkflowToolNode "knowledge_search" "GxQAF82yRIlkqbK8" "Search accumulated business knowledge across agents." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as quintino george_foreman or sally_receptionist', 'string') }}"
        collection_key = "={{ `$fromAI('collection_key', 'optional collection key', 'string') }}"
        query = "={{ `$fromAI('query', 'knowledge search query', 'string') }}"
        trade_type = "={{ `$fromAI('trade_type', 'trade type if relevant', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum results', 'number') }}"
    } 1080 340),
    (New-WorkflowToolNode "knowledge_save" "KGK3Cj2E8VCxFBBY" "Save reusable analysis or lessons to Quintino knowledge." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as quintino', 'string') }}"
        collection_key = "={{ `$fromAI('collection_key', 'collection key such as skills_intelligence', 'string') }}"
        title = "={{ `$fromAI('title', 'knowledge title', 'string') }}"
        content = "={{ `$fromAI('content', 'knowledge content', 'string') }}"
        tags = "={{ `$fromAI('tags', 'comma separated tags', 'string') }}"
        entity_type = "={{ `$fromAI('entity_type', 'related entity type', 'string') }}"
        entity_id = "={{ `$fromAI('entity_id', 'related entity id', 'string') }}"
        usefulness_score = "={{ `$fromAI('usefulness_score', 'usefulness score', 'number') }}"
    } 1380 -100),
    (New-WorkflowToolNode "memory_save" "W0VvE8kWYzl4vfL3" "Save Quintino analysis memory." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as quintino', 'string') }}"
        agent_name = "={{ `$fromAI('agent_name', 'agent display name', 'string') }}"
        memory_type = "={{ `$fromAI('memory_type', 'analysis recommendation or decision', 'string') }}"
        summary = "={{ `$fromAI('summary', 'short memory summary', 'string') }}"
    } 1380 120),
    (New-StickyNoteNode -20 -340)
)

$agentConnections = @{
    "Chat with Quintino" = @{ main = @(, @(@{ node = "Quintino"; type = "main"; index = 0 })) }
    "Google Gemini Chat Model" = @{ ai_languageModel = @(, @(@{ node = "Quintino"; type = "ai_languageModel"; index = 0 })) }
    "Quintino Short Memory" = @{ ai_memory = @(, @(@{ node = "Quintino"; type = "ai_memory"; index = 0 })) }
    "skills_audit" = @{ ai_tool = @(, @(@{ node = "Quintino"; type = "ai_tool"; index = 0 })) }
    "skill_lifecycle_manage" = @{ ai_tool = @(, @(@{ node = "Quintino"; type = "ai_tool"; index = 0 })) }
    "message_template_lifecycle_manage" = @{ ai_tool = @(, @(@{ node = "Quintino"; type = "ai_tool"; index = 0 })) }
    "skills_search" = @{ ai_tool = @(, @(@{ node = "Quintino"; type = "ai_tool"; index = 0 })) }
    "skills_save" = @{ ai_tool = @(, @(@{ node = "Quintino"; type = "ai_tool"; index = 0 })) }
    "mcp_service_search" = @{ ai_tool = @(, @(@{ node = "Quintino"; type = "ai_tool"; index = 0 })) }
    "knowledge_search" = @{ ai_tool = @(, @(@{ node = "Quintino"; type = "ai_tool"; index = 0 })) }
    "knowledge_save" = @{ ai_tool = @(, @(@{ node = "Quintino"; type = "ai_tool"; index = 0 })) }
    "memory_save" = @{ ai_tool = @(, @(@{ node = "Quintino"; type = "ai_tool"; index = 0 })) }
}
$agent = Upsert-WorkflowByName "TRADIE-AGENT-923-Quintino-Skills-Intelligence-AI-Agent" $agentNodes $agentConnections

@{
    core_workflows = @(
        ($setup | Select-Object name,id,active),
        ($audit | Select-Object name,id,active),
        ($lifecycle | Select-Object name,id,active)
    )
    tool_workflows = @(
        ($auditTool | Select-Object name,id,active),
        ($lifecycleTool | Select-Object name,id,active)
    )
    agent_workflow = $agent | Select-Object name,id,active
} | ConvertTo-Json -Depth 10
