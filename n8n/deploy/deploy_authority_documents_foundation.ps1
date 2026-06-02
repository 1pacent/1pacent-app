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
const sql = `
CREATE TABLE IF NOT EXISTS authority_documents (
  id uuid primary key default gen_random_uuid(),
  authority_document_key text not null unique,
  document_type text not null,
  industry text not null default 'all',
  trade_type text,
  jurisdiction text not null default 'AU',
  authority_name text not null,
  issuing_body text,
  document_title text not null,
  document_reference text,
  source_url text not null,
  official_source boolean not null default true,
  current_version text,
  effective_from date,
  effective_to date,
  status text not null default 'active',
  verified_at timestamptz not null default now(),
  verified_by text not null default 'codex',
  owner_agent_key text references agent_definitions(agent_key),
  summary text,
  layman_summary text,
  sme_interpretation_status text not null default 'pending_review',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS authority_document_versions (
  id uuid primary key default gen_random_uuid(),
  authority_document_key text not null references authority_documents(authority_document_key),
  version_label text not null,
  version_date date,
  effective_from date,
  effective_to date,
  source_url text not null,
  change_summary text,
  layman_summary text,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(authority_document_key, version_label)
);

CREATE TABLE IF NOT EXISTS authority_document_topics (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null unique,
  authority_document_key text not null references authority_documents(authority_document_key),
  industry text not null default 'all',
  trade_type text,
  topic_name text not null,
  topic_summary text not null,
  applies_to text,
  risk_level text not null default 'medium',
  required_evidence text[] not null default '{}',
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS authority_document_chunks (
  id uuid primary key default gen_random_uuid(),
  authority_document_key text not null references authority_documents(authority_document_key),
  chunk_key text not null unique,
  chunk_order integer not null default 100,
  heading text,
  chunk_text text not null,
  jurisdiction text not null default 'AU',
  industry text not null default 'all',
  trade_type text,
  topic_tags text[] not null default '{}',
  obligation_type text,
  risk_level text not null default 'medium',
  source_url text,
  current_version text,
  effective_from date,
  effective_to date,
  embedding_provider text,
  embedding_model text,
  embedding_status text not null default 'pending',
  embedding_vector_json jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS authority_document_agent_access (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_definitions(agent_key),
  authority_document_key text not null references authority_documents(authority_document_key),
  access_level text not null default 'reference',
  module_key text,
  paid_module boolean not null default false,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agent_key, authority_document_key, module_key)
);

CREATE TABLE IF NOT EXISTS authority_document_links (
  id uuid primary key default gen_random_uuid(),
  authority_document_key text not null references authority_documents(authority_document_key),
  source_table text not null,
  source_key text not null,
  relationship_type text not null default 'grounds',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(authority_document_key, source_table, source_key, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_authority_documents_lookup ON authority_documents(jurisdiction, industry, trade_type, document_type, status);
CREATE INDEX IF NOT EXISTS idx_authority_documents_owner ON authority_documents(owner_agent_key, status);
CREATE INDEX IF NOT EXISTS idx_authority_document_versions_lookup ON authority_document_versions(authority_document_key, status, effective_from);
CREATE INDEX IF NOT EXISTS idx_authority_document_topics_lookup ON authority_document_topics(authority_document_key, industry, trade_type, status);
CREATE INDEX IF NOT EXISTS idx_authority_document_chunks_lookup ON authority_document_chunks(authority_document_key, jurisdiction, industry, trade_type, embedding_status);
CREATE INDEX IF NOT EXISTS idx_authority_document_agent_access_lookup ON authority_document_agent_access(agent_key, module_key, status);

INSERT INTO agent_definitions (
  agent_key, agent_name, agent_role, purpose, operating_scope, customer_facing, owner_domain,
  responsibilities, success_measures, handoff_triggers, guardrails, model_provider, model_name, active
) VALUES (
  'sparky_electrical',
  'Sparky',
  'Electrical compliance and field support SME AI agent',
  'Help electricians interpret authority documents, safety obligations, evidence expectations, and practical compliance steps for electrical work. Sparky supports tradies and internal agents, not DIY customers.',
  'Electrical trade SME support, authority document interpretation, compliance evidence checklists, safety escalation, and learning loops from job outcomes.',
  false,
  'trade_sme_electrical',
  '["answer electrician compliance questions with authority-document references","produce evidence checklists for electrical jobs","flag unsafe or regulated work that needs qualified/licensed handling","support quote and scope quality for electrical work","feed best-practice learnings to Quintino"]'::jsonb,
  '["higher electrical evidence completeness","fewer repeat electrical callouts","lower rework caused by unclear scope","tradie repeat usage of Sparky module","faster compliant quote preparation"]'::jsonb,
  '["handoff legal uncertainty to human compliance owner","handoff customer scheduling to George","handoff pricing intelligence to Nelly","handoff skill lifecycle suggestions to Quintino"]'::jsonb,
  '["do not provide DIY electrical instructions to customers","do not claim legal advice","cite source document, version, jurisdiction, and effective date when available","escalate dangerous or uncertain electrical safety issues","prefer official authority documents over informal sources"]'::jsonb,
  'google_gemini',
  'gemini-2.5-flash',
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

INSERT INTO mcp_services (
  service_key, service_name, provider, category, capability, endpoint_path, credential_name, status, available_to_agents, config
) VALUES (
  'authority_documents_repository',
  'Authority Documents Repository',
  '1pacent_postgres_n8n',
  'knowledge_repository',
  'Search and reference official authority documents, standards, regulator guidance, association rules, and versioned SME interpretations.',
  '/webhook/core/authority-documents/search',
  'Tradie App Postgres',
  'active',
  ARRAY['sparky_electrical','connie_compliance','wally_warranty','george_foreman','nelly_quote_intelligence','patricia_property_manager','quintino_skills_intelligence'],
  '{"modular":true,"versioned":true,"semantic_retrieval_ready":true,"recommended_vector_backend":"qdrant_or_pgvector","paid_modules":["sparky_pro"],"preferred_for":["compliance","safety","regulated trade work","authority references"]}'::jsonb
) ON CONFLICT (service_key) DO UPDATE SET
  capability = excluded.capability,
  endpoint_path = excluded.endpoint_path,
  status = excluded.status,
  available_to_agents = excluded.available_to_agents,
  config = excluded.config,
  updated_at = now();

INSERT INTO mcp_service_tools (
  service_key, tool_key, tool_name, description, endpoint_path, input_schema, output_contract, active
) VALUES (
  'authority_documents_repository',
  'authority_documents_search',
  'Search Authority Documents',
  'Find relevant official authority documents and SME topics for an agent, industry, trade type, jurisdiction, and query.',
  '/webhook/core/authority-documents/search',
  '{"agent_key":"text","industry":"text","trade_type":"text","jurisdiction":"text","query":"text","document_type":"text","limit":"number"}'::jsonb,
  '{"success":"boolean","documents":"array","agent_access_checked":"boolean","caution":"text"}'::jsonb,
  true
) ON CONFLICT (tool_key) DO UPDATE SET
  description = excluded.description,
  endpoint_path = excluded.endpoint_path,
  input_schema = excluded.input_schema,
  output_contract = excluded.output_contract,
  active = true,
  updated_at = now();

INSERT INTO business_skills (
  skill_key, skill_name, capability, category, description, best_practice, guardrails, inputs, outputs, owner_agent_key, version, status, tags, source_type, usefulness_score
) VALUES
(
  'electrical_authority_interpretation_v1',
  'Electrical Authority Document Interpretation',
  'trade_sme_compliance',
  'electrical',
  'Interpret electrical authority documents for qualified tradies and internal workflows using source, version, jurisdiction, effective date, and confidence.',
  'Start with official authority documents, identify jurisdiction and effective version, separate compliance facts from operational interpretation, then return a concise evidence-backed recommendation.',
  'Do not provide DIY electrical repair instructions. Do not present interpretation as legal advice. Escalate dangerous or ambiguous safety issues.',
  '{"required":["query","jurisdiction","trade_type"],"optional":["job_type","property_type","authority_document_key"]}'::jsonb,
  '{"answer":"text","authority_documents":"array","evidence_checklist":"array","escalation_required":"boolean"}'::jsonb,
  'sparky_electrical',
  1,
  'active',
  ARRAY['sparky','electrical','authority_documents','compliance','paid_module'],
  'manual',
  50
),
(
  'electrical_compliance_evidence_checklist_v1',
  'Electrical Compliance Evidence Checklist',
  'evidence_quality',
  'electrical',
  'Create evidence checklists for electrical work orders so job records support trust, auditability, repeat-issue review, quote accuracy, and customer confidence.',
  'Match evidence to job type and authority document topics, include before/after photos, test results where applicable, materials and part warranty details, compliance notes, and unresolved risks.',
  'Do not invent certifications, test results, licence details, or authority requirements. Mark unknown evidence as required follow-up.',
  '{"required":["job_type","jurisdiction"],"optional":["authority_document_topics","work_order_id","tradie_id"]}'::jsonb,
  '{"evidence_required":"array","customer_summary":"text","tradie_notes":"text","risk_flags":"array"}'::jsonb,
  'sparky_electrical',
  1,
  'active',
  ARRAY['sparky','electrical','evidence','trust','moat'],
  'manual',
  50
)
ON CONFLICT (skill_key) DO UPDATE SET
  skill_name = excluded.skill_name,
  capability = excluded.capability,
  category = excluded.category,
  description = excluded.description,
  best_practice = excluded.best_practice,
  guardrails = excluded.guardrails,
  inputs = excluded.inputs,
  outputs = excluded.outputs,
  owner_agent_key = excluded.owner_agent_key,
  status = excluded.status,
  tags = excluded.tags,
  usefulness_score = excluded.usefulness_score,
  updated_at = now();

INSERT INTO agent_skill_assignments (agent_key, skill_key, priority, active)
VALUES
  ('sparky_electrical', 'electrical_authority_interpretation_v1', 10, true),
  ('sparky_electrical', 'electrical_compliance_evidence_checklist_v1', 20, true)
ON CONFLICT (agent_key, skill_key) DO UPDATE SET priority = excluded.priority, active = true, updated_at = now();

INSERT INTO agent_definitions (
  agent_key, agent_name, agent_role, purpose, operating_scope, customer_facing, owner_domain,
  responsibilities, success_measures, handoff_triggers, guardrails, model_provider, model_name, active
) VALUES
(
  'connie_compliance',
  'Connie',
  'Rental compliance workflow AI agent',
  'Own rental compliance requirements, reminders, evidence, certificates, and authority-document monitoring for property-management workflows.',
  'Rental compliance, certificate evidence, authority document references, compliance bundle support.',
  false,
  'rental_compliance',
  '["maintain compliance activities","reference authority documents","support property manager compliance bundles"]'::jsonb,
  '["higher certificate capture","lower missed compliance due dates","faster compliance work order creation"]'::jsonb,
  '["handoff scheduling to George","handoff warranty concerns to Wally","handoff skills lifecycle to Quintino"]'::jsonb,
  '["cite source and version","do not provide legal advice","use layman summaries for notifications"]'::jsonb,
  'google_gemini',
  'gemini-2.5-flash',
  true
),
(
  'wally_warranty',
  'Wally',
  'Warranty and repeat issue monitoring AI agent',
  'Detect warranty candidates, repeat issues, duplicate parts/labour, consumer guarantee considerations, and avoid unfair repeat charges.',
  'Warranty review, repeat issue analysis, consumer guarantee references, work-order guardrails.',
  false,
  'warranty_repeat_issue',
  '["detect repeat work","protect landlords from duplicate charges","route warranty jobs to prior tradie where appropriate"]'::jsonb,
  '["reduced duplicate charges","higher warranty recovery","fewer repeat unresolved issues"]'::jsonb,
  '["handoff scheduling to George","handoff compliance source questions to Connie","handoff skills lifecycle to Quintino"]'::jsonb,
  '["do not provide legal advice","cite authority references","use neutral tenant wording"]'::jsonb,
  'google_gemini',
  'gemini-2.5-flash',
  true
)
ON CONFLICT (agent_key) DO UPDATE SET
  agent_name = excluded.agent_name,
  agent_role = excluded.agent_role,
  purpose = excluded.purpose,
  operating_scope = excluded.operating_scope,
  responsibilities = excluded.responsibilities,
  success_measures = excluded.success_measures,
  handoff_triggers = excluded.handoff_triggers,
  guardrails = excluded.guardrails,
  active = true,
  updated_at = now();

INSERT INTO authority_documents (
  authority_document_key, document_type, industry, trade_type, jurisdiction, authority_name, issuing_body,
  document_title, document_reference, source_url, official_source, current_version, effective_from, effective_to,
  status, verified_at, verified_by, owner_agent_key, summary, layman_summary, sme_interpretation_status, payload
)
SELECT
  'legislation:' || source_key,
  'legislation',
  'property_management',
  NULL,
  jurisdiction,
  source_name,
  source_name,
  source_name,
  legislation_reference,
  source_url,
  true,
  legislation_version,
  effective_from,
  effective_to,
  'active',
  verified_at,
  verified_by,
  'connie_compliance',
  coalesce(legislation_reference, source_name),
  'Authority source used to ground compliance requirements and version monitoring for property management workflows.',
  'pending_review',
  payload
FROM compliance_legislation_sources
ON CONFLICT (authority_document_key) DO UPDATE SET
  current_version = excluded.current_version,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  source_url = excluded.source_url,
  verified_at = excluded.verified_at,
  updated_at = now();

INSERT INTO authority_documents (
  authority_document_key, document_type, industry, trade_type, jurisdiction, authority_name, issuing_body,
  document_title, document_reference, source_url, official_source, current_version, effective_from, effective_to,
  status, verified_at, verified_by, owner_agent_key, summary, layman_summary, sme_interpretation_status, payload
)
SELECT
  'consumer_guarantee:' || guarantee_key,
  'consumer_law_guidance',
  'all',
  NULL,
  jurisdiction,
  source_name,
  source_name,
  guarantee_type || ' - ' || applies_to,
  legislation_reference,
  source_url,
  true,
  legislation_version,
  effective_from,
  effective_to,
  status,
  verified_at,
  verified_by,
  'wally_warranty',
  summary,
  coalesce(operational_rule, summary),
  'approved',
  payload
FROM consumer_guarantee_references
ON CONFLICT (authority_document_key) DO UPDATE SET
  current_version = excluded.current_version,
  summary = excluded.summary,
  layman_summary = excluded.layman_summary,
  source_url = excluded.source_url,
  status = excluded.status,
  verified_at = excluded.verified_at,
  updated_at = now();

INSERT INTO authority_document_links (authority_document_key, source_table, source_key, relationship_type)
SELECT 'legislation:' || source_key, 'compliance_legislation_sources', source_key, 'source_migration'
FROM compliance_legislation_sources
ON CONFLICT DO NOTHING;

INSERT INTO authority_document_links (authority_document_key, source_table, source_key, relationship_type)
SELECT 'consumer_guarantee:' || guarantee_key, 'consumer_guarantee_references', guarantee_key, 'source_migration'
FROM consumer_guarantee_references
ON CONFLICT DO NOTHING;

INSERT INTO authority_document_versions (
  authority_document_key, version_label, effective_from, effective_to, source_url, change_summary, layman_summary, status, payload
)
SELECT authority_document_key, coalesce(current_version, 'current'), effective_from, effective_to, source_url,
       'Seeded from existing compliance and warranty reference data.',
       coalesce(layman_summary, summary, 'Current authority document version seeded for agent reference.'),
       status, payload
FROM authority_documents
WHERE current_version IS NOT NULL
ON CONFLICT (authority_document_key, version_label) DO UPDATE SET
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  source_url = excluded.source_url,
  status = excluded.status,
  updated_at = now();

INSERT INTO authority_document_chunks (
  authority_document_key, chunk_key, chunk_order, heading, chunk_text, jurisdiction, industry, trade_type,
  topic_tags, obligation_type, risk_level, source_url, current_version, effective_from, effective_to, embedding_status, payload
)
SELECT
  authority_document_key,
  authority_document_key || ':summary',
  10,
  'Current summary',
  coalesce(layman_summary, summary, document_title),
  jurisdiction,
  industry,
  trade_type,
  ARRAY[document_type, industry],
  document_type,
  CASE WHEN document_type IN ('legislation', 'regulation', 'consumer_law_guidance') THEN 'high' ELSE 'medium' END,
  source_url,
  current_version,
  effective_from,
  effective_to,
  'pending',
  jsonb_build_object('seeded_from', 'authority_documents_setup', 'semantic_retrieval_ready', true)
FROM authority_documents
WHERE coalesce(layman_summary, summary, document_title) IS NOT NULL
ON CONFLICT (chunk_key) DO UPDATE SET
  chunk_text = excluded.chunk_text,
  source_url = excluded.source_url,
  current_version = excluded.current_version,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  embedding_status = CASE WHEN authority_document_chunks.chunk_text IS DISTINCT FROM excluded.chunk_text THEN 'pending' ELSE authority_document_chunks.embedding_status END,
  updated_at = now();

INSERT INTO authority_document_agent_access (agent_key, authority_document_key, access_level, module_key, paid_module, status)
SELECT 'sparky_electrical', authority_document_key, 'sme_answer', 'sparky_pro', true, 'active'
FROM authority_documents
WHERE industry IN ('all', 'electrical') OR trade_type = 'electrical' OR document_type IN ('consumer_law_guidance')
ON CONFLICT (agent_key, authority_document_key, module_key) DO UPDATE SET access_level = excluded.access_level, paid_module = true, status = 'active', updated_at = now();

INSERT INTO authority_document_agent_access (agent_key, authority_document_key, access_level, module_key, paid_module, status)
SELECT 'connie_compliance', authority_document_key, 'interpret', 'rental_compliance', true, 'active'
FROM authority_documents
WHERE industry IN ('all', 'property_management') OR document_type IN ('legislation', 'regulation', 'regulator_guidance')
ON CONFLICT (agent_key, authority_document_key, module_key) DO UPDATE SET access_level = excluded.access_level, paid_module = true, status = 'active', updated_at = now();

SELECT
  true as success,
  (SELECT count(*) FROM authority_documents) as authority_documents_count,
  (SELECT count(*) FROM authority_document_versions) as authority_document_versions_count,
  (SELECT count(*) FROM authority_document_chunks) as authority_document_chunks_count,
  (SELECT count(*) FROM authority_document_agent_access WHERE agent_key = 'sparky_electrical') as sparky_access_count,
  (SELECT count(*) FROM business_skills WHERE owner_agent_key = 'sparky_electrical') as sparky_skill_count;
`;

return [{ json: { sql } }];
'@

$searchCode = @'
const body = $json.body || $json || {};
function str(value, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}
function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
const agentKey = str(body.agent_key, 'unknown_agent');
const industry = str(body.industry, 'all');
const tradeType = str(body.trade_type, '');
const jurisdiction = str(body.jurisdiction, 'AU');
const documentType = str(body.document_type, '');
const query = str(body.query, '');
const limit = Math.min(Math.max(parseInt(body.limit || '5', 10) || 5, 1), 20);
const like = `%${query.replace(/[%_]/g, '')}%`;

const sqlText = `
WITH candidates AS (
  SELECT
    d.authority_document_key,
    d.document_type,
    d.industry,
    d.trade_type,
    d.jurisdiction,
    d.authority_name,
    d.document_title,
    d.document_reference,
    d.source_url,
    d.official_source,
    d.current_version,
    d.effective_from,
    d.effective_to,
    d.status,
    d.summary,
    d.layman_summary,
    d.sme_interpretation_status,
    coalesce(a.access_level, 'reference') as access_level,
    coalesce(a.module_key, 'core') as module_key,
    coalesce(a.paid_module, false) as paid_module,
    (
      CASE WHEN d.jurisdiction = ${sql(jurisdiction)} THEN 10 ELSE 0 END +
      CASE WHEN d.industry = ${sql(industry)} THEN 8 WHEN d.industry = 'all' THEN 4 ELSE 0 END +
      CASE WHEN d.trade_type = ${sql(tradeType)} THEN 8 WHEN d.trade_type IS NULL THEN 2 ELSE 0 END +
      CASE WHEN ${sql(documentType)} IS NULL OR d.document_type = ${sql(documentType)} THEN 4 ELSE 0 END +
      CASE WHEN d.document_title ILIKE ${sql(like)} THEN 8 ELSE 0 END +
      CASE WHEN d.summary ILIKE ${sql(like)} OR d.layman_summary ILIKE ${sql(like)} THEN 6 ELSE 0 END +
      CASE WHEN EXISTS (
        SELECT 1 FROM authority_document_topics t
        WHERE t.authority_document_key = d.authority_document_key
          AND t.status = 'active'
          AND (t.topic_name ILIKE ${sql(like)} OR t.topic_summary ILIKE ${sql(like)})
      ) THEN 7 ELSE 0 END
    ) as relevance_score
  FROM authority_documents d
  LEFT JOIN authority_document_agent_access a
    ON a.authority_document_key = d.authority_document_key
   AND a.agent_key = ${sql(agentKey)}
   AND a.status = 'active'
  WHERE d.status = 'active'
    AND d.jurisdiction IN (${sql(jurisdiction)}, 'AU')
    AND (${sql(documentType)} IS NULL OR d.document_type = ${sql(documentType)})
    AND (d.industry IN (${sql(industry)}, 'all') OR ${sql(industry)} = 'all')
    AND (d.trade_type = ${sql(tradeType)} OR d.trade_type IS NULL OR ${sql(tradeType)} IS NULL)
)
SELECT
  authority_document_key,
  document_type,
  industry,
  trade_type,
  jurisdiction,
  authority_name,
  document_title,
  document_reference,
  source_url,
  official_source,
  current_version,
  effective_from,
  effective_to,
  summary,
  layman_summary,
  sme_interpretation_status,
  access_level,
  module_key,
  paid_module,
  relevance_score,
  'Use this as a grounded reference. Do not present interpretation as legal advice; cite source, jurisdiction, version, and effective date where possible.' as caution
FROM candidates
WHERE relevance_score > 0 OR ${sql(query)} IS NULL
ORDER BY relevance_score DESC, official_source DESC, authority_document_key
LIMIT ${limit};
`;

return [{ json: { sql: sqlText } }];
'@

$aggregateCode = @'
const rows = $input.all().map(item => item.json);
return [{
  json: {
    success: true,
    agent_access_checked: true,
    documents: rows,
    count: rows.length,
    caution: 'Authority Documents are grounding sources for agent interpretation. They do not replace qualified professional or legal advice.'
  }
}];
'@

$setupNodes = @(
    (New-WebhookNode "Setup Authority Documents Webhook" "core/authority-documents/setup" "POST" 0 0),
    (New-CodeNode "Prepare Authority Documents SQL" $setupCode 240 0),
    (New-PostgresNode "Run Authority Documents Setup" 520 0),
    (New-RespondNode "Return Setup Result" '={{ JSON.stringify($json) }}' 800 0)
)
$setupConnections = @{
    "Setup Authority Documents Webhook" = @{ main = @(, @(@{ node = "Prepare Authority Documents SQL"; type = "main"; index = 0 })) }
    "Prepare Authority Documents SQL" = @{ main = @(, @(@{ node = "Run Authority Documents Setup"; type = "main"; index = 0 })) }
    "Run Authority Documents Setup" = @{ main = @(, @(@{ node = "Return Setup Result"; type = "main"; index = 0 })) }
}

$searchNodes = @(
    (New-WebhookNode "Search Authority Documents Webhook" "core/authority-documents/search" "POST" 0 0),
    (New-CodeNode "Prepare Search SQL" $searchCode 240 0),
    (New-PostgresNode "Run Authority Search" 520 0),
    (New-CodeNode "Aggregate Authority Results" $aggregateCode 760 0),
    (New-RespondNode "Return Authority Results" '={{ JSON.stringify($json) }}' 1000 0)
)
$searchConnections = @{
    "Search Authority Documents Webhook" = @{ main = @(, @(@{ node = "Prepare Search SQL"; type = "main"; index = 0 })) }
    "Prepare Search SQL" = @{ main = @(, @(@{ node = "Run Authority Search"; type = "main"; index = 0 })) }
    "Run Authority Search" = @{ main = @(, @(@{ node = "Aggregate Authority Results"; type = "main"; index = 0 })) }
    "Aggregate Authority Results" = @{ main = @(, @(@{ node = "Return Authority Results"; type = "main"; index = 0 })) }
}

$setupWorkflow = Upsert-WorkflowByName "TRADIE-CORE-020-Authority-Documents-Setup" $setupNodes $setupConnections
$searchWorkflow = Upsert-WorkflowByName "TRADIE-CORE-021-Authority-Documents-Search" $searchNodes $searchConnections

Write-Host "Deployed Authority Documents foundation workflows:"
Write-Host "- $($setupWorkflow.name) [$($setupWorkflow.id)]"
Write-Host "- $($searchWorkflow.name) [$($searchWorkflow.id)]"
Write-Host ""
Write-Host "Run setup:"
Write-Host "POST $BaseUrl/webhook/core/authority-documents/setup"
Write-Host ""
Write-Host "Search:"
Write-Host "POST $BaseUrl/webhook/core/authority-documents/search"
