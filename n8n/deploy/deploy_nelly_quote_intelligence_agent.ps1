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
        name = "Chat with Nelly"
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
            contextWindowLength = 10
        }
        type = "@n8n/n8n-nodes-langchain.memoryBufferWindow"
        typeVersion = 1.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Nelly Short Memory"
    }
}

function New-AgentNode($X, $Y) {
    $systemMessage = @'
You are Nelly, the Quote Intelligence AI Agent for 1pacent.

You live inside n8n. Sally is customer-facing and may ask you for indicative pricing. George handles scheduling. Quintino owns Skills and lifecycle improvement. Your role is pricing intelligence, quote confidence, quote assumptions, and learning from quote-vs-actual data.

Your responsibilities:
- Recommend indicative price bands using historical quotes, actual invoices, job actuals, materials, and Skills.
- Return confidence, evidence count, assumptions, missing information, and risk flags.
- Never promise a final fixed price to customers.
- Explain that indicative estimates are a guide only and the tradie confirms final quote before work begins.
- Use price_recommendation for deterministic pricing evidence.
- Use skills_search and knowledge_search before advising on pricing.
- Use knowledge_save and memory_save when a pricing pattern or quote variance lesson should be remembered.
- Use mcp_service_search to discover reusable services when needed.

Output style:
- Keep customer-facing messages short, calm, and trust-building.
- Be transparent about confidence and what the tradie must confirm.
- Do not expose database, n8n, internal workflow names, or moat language to customers.

Preferred response format:
status: price_recommended | needs_more_info | manual_review
indicative_price_band: concise range
confidence: low | medium | high
customer_message: one sentence Sally can say
internal_note: evidence, assumptions, missing info, risks
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
        name = "Nelly"
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
            content = "## Nelly Quote Intelligence`nOwns indicative pricing, quote confidence and quote-vs-actual learning.`n`nModular pattern:`n- Gemini chat model`n- Skills and knowledge search`n- Postgres quote/actual evidence`n- Deterministic price recommendation tool`n- Memory and learning loop"
            height = 260
            width = 390
            color = 6
        }
        type = "n8n-nodes-base.stickyNote"
        typeVersion = 1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Nelly Architecture Note"
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
CREATE TABLE IF NOT EXISTS price_recommendations (
  id uuid primary key default gen_random_uuid(),
  recommendation_key text not null unique,
  agent_key text not null default 'nelly',
  lead_id text references leads(id),
  quote_id text,
  trade_type text,
  job_description text,
  recommended_low numeric,
  recommended_high numeric,
  recommended_mid numeric,
  confidence_score numeric,
  confidence_label text,
  evidence_count integer not null default 0,
  missing_information text[] not null default '{}',
  assumptions text[] not null default '{}',
  risk_flags text[] not null default '{}',
  similar_jobs jsonb not null default '[]'::jsonb,
  pricing_basis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_price_recommendations_lead ON price_recommendations(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_recommendations_trade ON price_recommendations(trade_type, created_at DESC);

INSERT INTO agent_definitions (agent_key, agent_name, agent_role, model_provider, model_name, active)
VALUES ('nelly', 'Nelly', 'Quote intelligence, indicative pricing and quote-vs-actual learning AI agent', 'google_gemini', 'models/gemini-3.1-flash-lite', true)
ON CONFLICT (agent_key) DO UPDATE SET
  agent_name = EXCLUDED.agent_name,
  agent_role = EXCLUDED.agent_role,
  model_provider = EXCLUDED.model_provider,
  model_name = EXCLUDED.model_name,
  active = true,
  updated_at = now();

DELETE FROM agent_business_rules WHERE agent_key = 'nelly';
INSERT INTO agent_business_rules (agent_key, rule_group, rule_order, rule_text, active)
VALUES
  ('nelly', 'mission', 10, 'Nelly owns indicative pricing intelligence, quote confidence and quote-vs-actual learning for 1pacent.', true),
  ('nelly', 'pricing', 20, 'Never promise final fixed prices. Provide indicative ranges and explain final pricing is confirmed by the tradie before work begins.', true),
  ('nelly', 'evidence', 30, 'Use similar jobs, quote accuracy metrics, job actuals, materials, labour and variance reasons to support price recommendations.', true),
  ('nelly', 'confidence', 40, 'Low evidence or missing job details must reduce confidence and produce missing information prompts.', true),
  ('nelly', 'learning', 50, 'When quote variance patterns are found, save knowledge and feed Quintino Skills improvement recommendations.', true);

INSERT INTO agent_knowledge_collections (agent_key, collection_key, collection_name, capability, active)
VALUES ('nelly', 'quote_intelligence', 'Nelly Quote Intelligence', 'Indicative pricing, quote confidence, similar job evidence and quote-vs-actual learning', true)
ON CONFLICT (agent_key, collection_key) DO UPDATE SET
  collection_name = EXCLUDED.collection_name,
  capability = EXCLUDED.capability,
  active = true,
  updated_at = now();

INSERT INTO business_skills (
  skill_key, skill_name, capability, category, description, best_practice, guardrails,
  inputs, outputs, owner_agent_key, version, status, tags, source_type, source_id, usefulness_score
)
VALUES (
  'skill_indicative_price_recommendation',
  'Indicative Price Recommendation',
  'Pricing trust and quote confidence',
  'quoting',
  'Recommend indicative price bands using similar jobs, actuals, materials and confidence scoring.',
  'Use job description, trade type, suburb, urgency, similar completed jobs, quote-vs-actual metrics, material costs and labour assumptions. Return price band, confidence, assumptions, missing information and risk flags.',
  'Never present an indicative price as a fixed quote. Final pricing must be confirmed by the tradie before work begins.',
  '{"required":["trade_type","job_description"]}'::jsonb,
  '{"returns":["recommended_low","recommended_high","confidence","assumptions","risk_flags"]}'::jsonb,
  'quintino',
  1,
  'active',
  ARRAY['quoting','pricing','trust','quote_accuracy','moat'],
  'seed',
  'NELLY-SKILL-SEED-001',
  10
)
ON CONFLICT (skill_key) DO UPDATE SET
  best_practice = EXCLUDED.best_practice,
  guardrails = EXCLUDED.guardrails,
  owner_agent_key = 'quintino',
  status = 'active',
  usefulness_score = 10,
  updated_at = now();

INSERT INTO agent_skill_assignments (agent_key, skill_key, priority, active)
VALUES ('nelly', 'skill_indicative_price_recommendation', 10, true),
       ('nelly', 'skill_quote_accuracy_learning', 20, true)
ON CONFLICT (agent_key, skill_key) DO UPDATE SET priority = EXCLUDED.priority, active = true, updated_at = now();

SELECT jsonb_build_object(
  'success', true,
  'agent_key', 'nelly',
  'note', 'Nelly Quote Intelligence foundation is ready.',
  'active_skills', (SELECT count(*) FROM agent_skill_assignments WHERE agent_key = 'nelly' AND active = true)
) AS setup_result;
`;

return [{ json: { sql: query } }];
'@

$priceSqlCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw;

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    return value;
  }
  return '';
}

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}

const leadId = first(body.lead_id);
const quoteId = first(body.quote_id);
const tradeType = String(first(body.trade_type, 'electrical')).toLowerCase();
const jobDescription = first(body.job_description, body.description, '');
const suburb = first(body.customer_suburb, body.suburb, '');
const urgency = first(body.urgency, 'normal');
const materialsCost = first(body.materials_cost, body.estimated_materials_cost);
const labourHours = first(body.labour_hours, body.estimated_labour_hours);
const calloutFee = first(body.callout_fee, 150);
const recommendationKey = `PRICE-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.floor(Math.random() * 1000)}`;

const missing = [];
if (!tradeType) missing.push('trade_type');
if (!jobDescription) missing.push('job_description');

const fallbackLow = tradeType.includes('elect') ? 150 : 180;
const fallbackHigh = tradeType.includes('elect') ? 350 : 450;

const query = `
WITH input AS (
  SELECT
    ${sql(leadId)}::text AS lead_id,
    ${sql(quoteId)}::text AS quote_id,
    ${sql(tradeType)}::text AS trade_type,
    ${sql(jobDescription)}::text AS job_description,
    ${sql(suburb)}::text AS suburb,
    ${sql(urgency)}::text AS urgency,
    ${num(materialsCost)}::numeric AS materials_cost,
    ${num(labourHours)}::numeric AS labour_hours,
    ${num(calloutFee)}::numeric AS callout_fee
),
similar_jobs_cte AS (
  SELECT
    qam.*,
    ja.actual_duration_minutes,
    ja.actual_travel_minutes,
    j.status AS job_status,
    l.job_description AS lead_job_description,
    l.address,
    CASE
      WHEN lower(coalesce(qam.trade_type, l.trade_type, '')) = (SELECT trade_type FROM input) THEN 5 ELSE 0
    END
    + CASE
      WHEN lower(coalesce(l.job_description, '')) LIKE '%' || split_part(lower((SELECT job_description FROM input)), ' ', 1) || '%' THEN 2 ELSE 0
    END AS similarity_score
  FROM quote_accuracy_metrics qam
  LEFT JOIN job_actuals ja ON ja.quote_id = qam.quote_id OR ja.lead_id = qam.lead_id
  LEFT JOIN leads l ON l.id = qam.lead_id
  LEFT JOIN jobs j ON j.lead_id = qam.lead_id OR j.quote_id = qam.quote_id
  WHERE lower(coalesce(qam.trade_type, l.trade_type, (SELECT trade_type FROM input))) = (SELECT trade_type FROM input)
  ORDER BY similarity_score DESC, qam.created_at DESC
  LIMIT 8
),
parsed AS (
  SELECT
    *,
    NULLIF(regexp_replace(coalesce(final_invoice, ''), '[^0-9.]', '', 'g'), '')::numeric AS final_invoice_num,
    NULLIF(regexp_replace(coalesce(confirmed_quote, ''), '[^0-9.]', '', 'g'), '')::numeric AS confirmed_quote_num
  FROM similar_jobs_cte
),
stats AS (
  SELECT
    count(*)::integer AS evidence_count,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY final_invoice_num) AS p25_invoice,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY final_invoice_num) AS p50_invoice,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY final_invoice_num) AS p75_invoice,
    avg(accuracy_score) AS avg_accuracy,
    avg(actual_duration_minutes) AS avg_duration,
    avg(actual_travel_minutes) AS avg_travel
  FROM parsed
  WHERE final_invoice_num IS NOT NULL
),
recommendation AS (
  SELECT
    CASE
      WHEN evidence_count >= 3 THEN round(GREATEST(p25_invoice * 0.9, 50)::numeric, 0)
      WHEN evidence_count >= 1 THEN round(GREATEST(COALESCE(p50_invoice, p25_invoice, p75_invoice) * 0.9, 50)::numeric, 0)
      WHEN (SELECT labour_hours FROM input) IS NOT NULL THEN round(((SELECT callout_fee FROM input) + ((SELECT labour_hours FROM input) * 120) + COALESCE((SELECT materials_cost FROM input), 0)) * 0.9, 0)
      ELSE ${fallbackLow}
    END AS low,
    CASE
      WHEN evidence_count >= 3 THEN round(GREATEST(p75_invoice * 1.15, p50_invoice)::numeric, 0)
      WHEN evidence_count >= 1 THEN round(GREATEST(COALESCE(p75_invoice, p50_invoice, p25_invoice) * 1.2, COALESCE(p50_invoice, p25_invoice, p75_invoice))::numeric, 0)
      WHEN (SELECT labour_hours FROM input) IS NOT NULL THEN round(((SELECT callout_fee FROM input) + ((SELECT labour_hours FROM input) * 120) + COALESCE((SELECT materials_cost FROM input), 0)) * 1.25, 0)
      ELSE ${fallbackHigh}
    END AS high,
    evidence_count,
    avg_accuracy,
    avg_duration,
    avg_travel
  FROM stats
),
scored AS (
  SELECT
    low,
    high,
    round(((low + high) / 2.0)::numeric, 0) AS mid,
    evidence_count,
    LEAST(95, GREATEST(25,
      35
      + (evidence_count * 10)
      + CASE WHEN ${missing.length} = 0 THEN 15 ELSE 0 END
      + COALESCE(avg_accuracy, 60) / 10
    )) AS confidence_score,
    avg_duration,
    avg_travel
  FROM recommendation
),
final AS (
  SELECT
    *,
    CASE WHEN confidence_score >= 75 THEN 'high' WHEN confidence_score >= 55 THEN 'medium' ELSE 'low' END AS confidence_label,
    ARRAY_REMOVE(ARRAY[
      ${missing.includes('trade_type') ? "'trade_type'" : 'NULL'},
      ${missing.includes('job_description') ? "'job_description'" : 'NULL'},
      CASE WHEN evidence_count < 3 THEN 'more_similar_completed_jobs' ELSE NULL END,
      CASE WHEN (SELECT materials_cost FROM input) IS NULL THEN 'materials_cost_if_known' ELSE NULL END,
      CASE WHEN (SELECT labour_hours FROM input) IS NULL THEN 'estimated_labour_hours_if_known' ELSE NULL END
    ], NULL) AS missing_information,
    ARRAY_REMOVE(ARRAY[
      'Indicative estimate only',
      'Final price confirmed by tradie before work begins',
      CASE WHEN evidence_count < 3 THEN 'Limited similar job history, fallback pricing used' ELSE 'Similar completed jobs used' END,
      CASE WHEN (SELECT urgency FROM input) IN ('urgent','emergency') THEN 'Urgency may increase callout or scheduling cost' ELSE NULL END
    ], NULL) AS assumptions,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN evidence_count < 3 THEN 'low_evidence' ELSE NULL END,
      CASE WHEN (SELECT urgency FROM input) IN ('urgent','emergency') THEN 'urgent_job' ELSE NULL END,
      CASE WHEN lower((SELECT job_description FROM input)) LIKE '%fault%' THEN 'fault_diagnosis_required' ELSE NULL END,
      CASE WHEN lower((SELECT job_description FROM input)) LIKE '%hidden%' THEN 'hidden_scope_risk' ELSE NULL END
    ], NULL) AS risk_flags
  FROM scored
),
insert_recommendation AS (
  INSERT INTO price_recommendations (
    recommendation_key, agent_key, lead_id, quote_id, trade_type, job_description,
    recommended_low, recommended_high, recommended_mid, confidence_score, confidence_label,
    evidence_count, missing_information, assumptions, risk_flags, similar_jobs, pricing_basis
  )
  SELECT
    ${sql(recommendationKey)},
    'nelly',
    (SELECT lead_id FROM input),
    (SELECT quote_id FROM input),
    (SELECT trade_type FROM input),
    (SELECT job_description FROM input),
    low,
    high,
    mid,
    confidence_score,
    confidence_label,
    evidence_count,
    missing_information,
    assumptions,
    risk_flags,
    COALESCE((SELECT jsonb_agg(to_jsonb(parsed) ORDER BY similarity_score DESC, created_at DESC) FROM parsed), '[]'::jsonb),
    jsonb_build_object(
      'suburb', (SELECT suburb FROM input),
      'urgency', (SELECT urgency FROM input),
      'materials_cost', (SELECT materials_cost FROM input),
      'labour_hours', (SELECT labour_hours FROM input),
      'callout_fee', (SELECT callout_fee FROM input),
      'avg_duration', avg_duration,
      'avg_travel', avg_travel
    )
  FROM final
  RETURNING *
),
insert_memory AS (
  INSERT INTO agent_memory (agent_key, agent_name, lead_id, memory_type, summary, payload)
  SELECT
    'nelly',
    'Nelly',
    lead_id,
    'price_recommendation',
    'Recommended indicative price band ' || chr(36) || recommended_low || '-' || chr(36) || recommended_high || ' with ' || confidence_label || ' confidence.',
    to_jsonb(insert_recommendation)
  FROM insert_recommendation
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'price_recommendation', recommendation_key, 'nelly_price_recommended', to_jsonb(insert_recommendation)
  FROM insert_recommendation
)
SELECT jsonb_build_object(
  'success', true,
  'agent', 'Nelly',
  'status', CASE WHEN array_length(missing_information, 1) > 0 AND evidence_count = 0 THEN 'needs_more_info' ELSE 'price_recommended' END,
  'recommendation_key', recommendation_key,
  'lead_id', lead_id,
  'quote_id', quote_id,
  'trade_type', trade_type,
  'job_description', job_description,
  'indicative_price_band', chr(36) || recommended_low || '-' || chr(36) || recommended_high,
  'recommended_low', recommended_low,
  'recommended_high', recommended_high,
  'recommended_mid', recommended_mid,
  'confidence_score', confidence_score,
  'confidence_label', confidence_label,
  'evidence_count', evidence_count,
  'missing_information', missing_information,
  'assumptions', assumptions,
  'risk_flags', risk_flags,
  'similar_jobs', similar_jobs,
  'customer_message', 'The indicative estimate is ' || chr(36) || recommended_low || '-' || chr(36) || recommended_high || '. The tradie will confirm the final quote before any work begins.',
  'internal_note', 'Evidence count: ' || evidence_count || ', confidence: ' || confidence_label || '.'
) AS price_recommendation
FROM insert_recommendation;
`;

return [{ json: { sql: query } }];
'@

$toolNormaliseCode = @'
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
    lead_id: first(raw.lead_id, field('lead_id')),
    quote_id: first(raw.quote_id, field('quote_id')),
    trade_type: first(raw.trade_type, field('trade_type'), 'electrical'),
    job_description: first(raw.job_description, raw.description, field('job_description'), field('description'), text),
    customer_suburb: first(raw.customer_suburb, raw.suburb, field('customer_suburb'), field('suburb')),
    urgency: first(raw.urgency, field('urgency'), 'normal'),
    materials_cost: first(raw.materials_cost, field('materials_cost')),
    labour_hours: first(raw.labour_hours, raw.estimated_labour_hours, field('labour_hours'), field('estimated_labour_hours')),
    callout_fee: first(raw.callout_fee, field('callout_fee'), 150),
  },
}];
'@

$setupNodes = @(
    (New-WebhookNode "Nelly Setup Webhook" "agents/nelly/setup" "POST" 0 0),
    (New-CodeNode "Build Nelly Setup SQL" $setupSqlCode 260 0),
    (New-PostgresNode "Setup Nelly" 520 0),
    (New-RespondNode "Respond Nelly Setup" '={{$json.setup_result || $json}}' 780 0)
)
$setupConnections = @{
    "Nelly Setup Webhook" = @{ main = @(, @(@{ node = "Build Nelly Setup SQL"; type = "main"; index = 0 })) }
    "Build Nelly Setup SQL" = @{ main = @(, @(@{ node = "Setup Nelly"; type = "main"; index = 0 })) }
    "Setup Nelly" = @{ main = @(, @(@{ node = "Respond Nelly Setup"; type = "main"; index = 0 })) }
}
$setup = Upsert-WorkflowByName "TRADIE-AGENT-930-Nelly-Setup" $setupNodes $setupConnections

$priceNodes = @(
    (New-WebhookNode "Nelly Price Recommendation Webhook" "agents/nelly/price-recommendation" "POST" 0 0),
    (New-CodeNode "Build Price Recommendation SQL" $priceSqlCode 260 0),
    (New-PostgresNode "Generate Price Recommendation" 520 0),
    (New-RespondNode "Respond Price Recommendation" '={{$json.price_recommendation || $json}}' 780 0)
)
$priceConnections = @{
    "Nelly Price Recommendation Webhook" = @{ main = @(, @(@{ node = "Build Price Recommendation SQL"; type = "main"; index = 0 })) }
    "Build Price Recommendation SQL" = @{ main = @(, @(@{ node = "Generate Price Recommendation"; type = "main"; index = 0 })) }
    "Generate Price Recommendation" = @{ main = @(, @(@{ node = "Respond Price Recommendation"; type = "main"; index = 0 })) }
}
$price = Upsert-WorkflowByName "TRADIE-QUOTES-931-Nelly-Price-Recommendation" $priceNodes $priceConnections

$toolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Nelly Price Tool Is Called" 0 0),
    (New-CodeNode "Normalise Nelly Price Tool Input" $toolNormaliseCode 260 0),
    (New-HttpRequestNode "Call Nelly Price Recommendation" "POST" "http://localhost:5678/webhook/agents/nelly/price-recommendation" 520 0 "={{ JSON.stringify(`$json) }}")
)
$toolConnections = @{
    "When Nelly Price Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Nelly Price Tool Input"; type = "main"; index = 0 })) }
    "Normalise Nelly Price Tool Input" = @{ main = @(, @(@{ node = "Call Nelly Price Recommendation"; type = "main"; index = 0 })) }
}
$tool = Upsert-WorkflowByName "TRADIE-TOOL-Nelly-Price-Recommendation" $toolNodes $toolConnections

$agentNodes = @(
    (New-ChatTriggerNode 0 0),
    (New-AgentNode 360 0),
    (New-GeminiModelNode 260 280),
    (New-MemoryNode 520 280),
    (New-WorkflowToolNode "price_recommendation" $tool.id "Generate an indicative price band using similar jobs, actuals, quote history and confidence scoring." @{
        lead_id = "={{ `$fromAI('lead_id', 'lead id if available', 'string') }}"
        quote_id = "={{ `$fromAI('quote_id', 'quote id if available', 'string') }}"
        trade_type = "={{ `$fromAI('trade_type', 'trade type', 'string') }}"
        job_description = "={{ `$fromAI('job_description', 'job description', 'string') }}"
        customer_suburb = "={{ `$fromAI('customer_suburb', 'customer suburb', 'string') }}"
        urgency = "={{ `$fromAI('urgency', 'urgency', 'string') }}"
        materials_cost = "={{ `$fromAI('materials_cost', 'estimated materials cost if known', 'number') }}"
        labour_hours = "={{ `$fromAI('labour_hours', 'estimated labour hours if known', 'number') }}"
        callout_fee = "={{ `$fromAI('callout_fee', 'callout fee if known', 'number') }}"
    } 780 -120),
    (New-WorkflowToolNode "skills_search" "HMi7xtGQXxMhOCug" "Search pricing and quote-related Skills before pricing decisions." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as nelly', 'string') }}"
        category = "={{ `$fromAI('category', 'skill category such as quoting', 'string') }}"
        query = "={{ `$fromAI('query', 'skill search query', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum results', 'number') }}"
    } 780 100),
    (New-WorkflowToolNode "knowledge_search" "GxQAF82yRIlkqbK8" "Search Nelly and Quintino quote intelligence knowledge." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as nelly or quintino', 'string') }}"
        collection_key = "={{ `$fromAI('collection_key', 'collection key such as quote_intelligence', 'string') }}"
        query = "={{ `$fromAI('query', 'knowledge search query', 'string') }}"
        trade_type = "={{ `$fromAI('trade_type', 'trade type if relevant', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum results', 'number') }}"
    } 780 320),
    (New-WorkflowToolNode "knowledge_save" "KGK3Cj2E8VCxFBBY" "Save reusable pricing and quote variance lessons." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as nelly', 'string') }}"
        collection_key = "={{ `$fromAI('collection_key', 'collection key such as quote_intelligence', 'string') }}"
        title = "={{ `$fromAI('title', 'knowledge title', 'string') }}"
        content = "={{ `$fromAI('content', 'knowledge content', 'string') }}"
        tags = "={{ `$fromAI('tags', 'comma separated tags', 'string') }}"
        trade_type = "={{ `$fromAI('trade_type', 'trade type', 'string') }}"
        entity_type = "={{ `$fromAI('entity_type', 'entity type', 'string') }}"
        entity_id = "={{ `$fromAI('entity_id', 'entity id', 'string') }}"
        usefulness_score = "={{ `$fromAI('usefulness_score', 'usefulness score', 'number') }}"
    } 1080 -120),
    (New-WorkflowToolNode "memory_save" "W0VvE8kWYzl4vfL3" "Save Nelly pricing decisions and lessons to shared memory." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as nelly', 'string') }}"
        agent_name = "={{ `$fromAI('agent_name', 'agent display name', 'string') }}"
        lead_id = "={{ `$fromAI('lead_id', 'lead id if available', 'string') }}"
        job_id = "={{ `$fromAI('job_id', 'job id if available', 'string') }}"
        memory_type = "={{ `$fromAI('memory_type', 'pricing decision or lesson', 'string') }}"
        summary = "={{ `$fromAI('summary', 'memory summary', 'string') }}"
    } 1080 100),
    (New-WorkflowToolNode "mcp_service_search" "Yxxovcn4MYZgyhe2" "Discover reusable services and tools." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key such as nelly', 'string') }}"
        category = "={{ `$fromAI('category', 'service category', 'string') }}"
        query = "={{ `$fromAI('query', 'service query', 'string') }}"
        limit = "={{ `$fromAI('limit', 'maximum results', 'number') }}"
    } 1080 320),
    (New-StickyNoteNode -20 -340)
)

$agentConnections = @{
    "Chat with Nelly" = @{ main = @(, @(@{ node = "Nelly"; type = "main"; index = 0 })) }
    "Google Gemini Chat Model" = @{ ai_languageModel = @(, @(@{ node = "Nelly"; type = "ai_languageModel"; index = 0 })) }
    "Nelly Short Memory" = @{ ai_memory = @(, @(@{ node = "Nelly"; type = "ai_memory"; index = 0 })) }
    "price_recommendation" = @{ ai_tool = @(, @(@{ node = "Nelly"; type = "ai_tool"; index = 0 })) }
    "skills_search" = @{ ai_tool = @(, @(@{ node = "Nelly"; type = "ai_tool"; index = 0 })) }
    "knowledge_search" = @{ ai_tool = @(, @(@{ node = "Nelly"; type = "ai_tool"; index = 0 })) }
    "knowledge_save" = @{ ai_tool = @(, @(@{ node = "Nelly"; type = "ai_tool"; index = 0 })) }
    "memory_save" = @{ ai_tool = @(, @(@{ node = "Nelly"; type = "ai_tool"; index = 0 })) }
    "mcp_service_search" = @{ ai_tool = @(, @(@{ node = "Nelly"; type = "ai_tool"; index = 0 })) }
}
$agent = Upsert-WorkflowByName "TRADIE-AGENT-932-Nelly-Quote-Intelligence-AI-Agent" $agentNodes $agentConnections

@{
    setup_workflow = $setup | Select-Object name,id,active
    price_workflow = $price | Select-Object name,id,active
    tool_workflow = $tool | Select-Object name,id,active
    agent_workflow = $agent | Select-Object name,id,active
    endpoint = "$BaseUrl/webhook/agents/nelly/price-recommendation"
} | ConvertTo-Json -Depth 10
