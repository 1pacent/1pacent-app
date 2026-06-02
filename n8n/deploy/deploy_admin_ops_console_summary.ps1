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

$summaryCode = @'
const raw = items[0]?.json ?? {};
const q = raw.query ?? raw.body ?? raw;

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const tenantId = q.tenant_id || 'TENANT-001';
const limit = Number.isFinite(Number(q.limit)) ? Math.min(Math.max(Number(q.limit), 1), 50) : 10;

const query = `
WITH params AS (
  SELECT ${sql(tenantId)}::text AS tenant_id, ${limit}::integer AS row_limit
),
agent_catalog AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'agent_key', agent_key,
      'agent_name', agent_name,
      'agent_role', agent_role,
      'purpose', purpose,
      'owner_domain', owner_domain,
      'customer_facing', customer_facing,
      'success_measures', success_measures,
      'responsibilities', responsibilities,
      'guardrails', guardrails,
      'model_provider', model_provider,
      'model_name', model_name,
      'active', active,
      'recent_memory_count', COALESCE((
        SELECT count(*) FROM agent_memory am
        WHERE am.agent_key = agent_definitions.agent_key
          AND am.created_at >= now() - interval '7 days'
      ), 0),
      'knowledge_items', COALESCE((
        SELECT count(*) FROM agent_knowledge_items aki
        WHERE aki.agent_key = agent_definitions.agent_key
          AND aki.active = true
      ), 0),
      'assigned_skills', COALESCE((
        SELECT count(*) FROM agent_skill_assignments asa
        WHERE asa.agent_key = agent_definitions.agent_key
          AND asa.active = true
      ), 0)
    )
    ORDER BY customer_facing DESC, owner_domain, agent_name
  ) AS data
  FROM agent_definitions
  WHERE active = true
),
pipeline_counts AS (
  SELECT jsonb_build_object(
    'customers', (SELECT count(*) FROM customers),
    'leads_total', (SELECT count(*) FROM leads WHERE tenant_id = (SELECT tenant_id FROM params)),
    'leads_by_status', COALESCE((SELECT jsonb_object_agg(status, count) FROM (SELECT status, count(*) AS count FROM leads WHERE tenant_id = (SELECT tenant_id FROM params) GROUP BY status ORDER BY status) s), '{}'::jsonb),
    'quotes_total', (SELECT count(*) FROM quotes),
    'quotes_by_status', COALESCE((SELECT jsonb_object_agg(status, count) FROM (SELECT status, count(*) AS count FROM quotes GROUP BY status ORDER BY status) s), '{}'::jsonb),
    'jobs_total', (SELECT count(*) FROM jobs),
    'jobs_by_status', COALESCE((SELECT jsonb_object_agg(status, count) FROM (SELECT status, count(*) AS count FROM jobs GROUP BY status ORDER BY status) s), '{}'::jsonb),
    'invoices_total', (SELECT count(*) FROM invoices),
    'invoices_by_status', COALESCE((SELECT jsonb_object_agg(status, count) FROM (SELECT status, count(*) AS count FROM invoices GROUP BY status ORDER BY status) s), '{}'::jsonb)
  ) AS data
),
payment_metrics AS (
  SELECT jsonb_build_object(
    'payment_requests_total', (SELECT count(*) FROM payment_requests),
    'payment_requests_by_status', COALESCE((SELECT jsonb_object_agg(status, count) FROM (SELECT status, count(*) AS count FROM payment_requests GROUP BY status ORDER BY status) s), '{}'::jsonb),
    'paid_amount_total', COALESCE((SELECT sum(amount) FROM payment_requests WHERE status = 'paid'), 0),
    'requested_amount_open', COALESCE((SELECT sum(amount) FROM payment_requests WHERE status <> 'paid'), 0),
    'average_hours_to_paid', (
      SELECT round(avg(extract(epoch from (paid_at - sent_at)) / 3600.0)::numeric, 2)
      FROM payment_requests
      WHERE status = 'paid' AND paid_at IS NOT NULL AND sent_at IS NOT NULL
    ),
    'overdue_requests', (
      SELECT count(*) FROM payment_requests
      WHERE status <> 'paid' AND due_at IS NOT NULL AND due_at < now()
    )
  ) AS data
),
scheduling_metrics AS (
  SELECT jsonb_build_object(
    'schedule_slots_total', (SELECT count(*) FROM job_schedule_slots),
    'schedule_slots_by_status', COALESCE((SELECT jsonb_object_agg(status, count) FROM (SELECT status, count(*) AS count FROM job_schedule_slots GROUP BY status ORDER BY status) s), '{}'::jsonb),
    'calendar_events_total', (SELECT count(*) FROM calendar_events),
    'assigned_tradies_total', (SELECT count(*) FROM job_assignments),
    'average_estimated_travel_minutes', (SELECT round(avg(estimated_travel_minutes)::numeric, 1) FROM job_schedule_slots WHERE estimated_travel_minutes IS NOT NULL),
    'average_scheduling_score', (SELECT round(avg(scheduling_score)::numeric, 1) FROM job_schedule_slots WHERE scheduling_score IS NOT NULL)
  ) AS data
),
quote_metrics AS (
  SELECT jsonb_build_object(
    'price_recommendations_total', (SELECT count(*) FROM price_recommendations),
    'quote_accuracy_records_total', (SELECT count(*) FROM quote_accuracy_metrics),
    'average_quote_accuracy_score', (SELECT round(avg(accuracy_score)::numeric, 2) FROM quote_accuracy_metrics WHERE accuracy_score IS NOT NULL),
    'average_recommendation_confidence', (SELECT round(avg(confidence_score)::numeric, 2) FROM price_recommendations WHERE confidence_score IS NOT NULL),
    'quote_sla_records_total', (SELECT count(*) FROM quote_sla_metrics),
    'quote_sla_hit_rate', (SELECT round((count(*) FILTER (WHERE sla_met = true)::numeric / NULLIF(count(*), 0)) * 100, 2) FROM quote_sla_metrics),
    'average_quote_response_ms', (SELECT round(avg(response_ms)::numeric, 0) FROM quote_sla_metrics WHERE response_ms IS NOT NULL),
    'latest_quote_sla', COALESCE((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT recommendation_key, lead_id, trade_type, indicative_price_band, response_ms, target_sla_ms, sla_met, confidence_label, evidence_count, created_at
        FROM quote_sla_metrics
        ORDER BY created_at DESC
        LIMIT (SELECT row_limit FROM params)
      ) x
    ), '[]'::jsonb)
  ) AS data
),
growth_metrics AS (
  SELECT jsonb_build_object(
    'social_campaigns_total', (SELECT count(*) FROM social_campaigns),
    'social_campaigns_by_approval', COALESCE((SELECT jsonb_object_agg(approval_status, count) FROM (SELECT approval_status, count(*) AS count FROM social_campaigns GROUP BY approval_status ORDER BY approval_status) s), '{}'::jsonb),
    'social_posts_by_status', COALESCE((SELECT jsonb_object_agg(status, count) FROM (SELECT status, count(*) AS count FROM social_posts GROUP BY status ORDER BY status) s), '{}'::jsonb),
    'review_requests_total', (SELECT count(*) FROM review_requests),
    'review_requests_by_status', COALESCE((SELECT jsonb_object_agg(status, count) FROM (SELECT status, count(*) AS count FROM review_requests GROUP BY status ORDER BY status) s), '{}'::jsonb)
  ) AS data
),
skills_metrics AS (
  SELECT jsonb_build_object(
    'active_skills_total', (SELECT count(*) FROM business_skills WHERE status = 'active'),
    'skills_by_owner', COALESCE((SELECT jsonb_object_agg(COALESCE(owner_agent_key, 'unowned'), count) FROM (SELECT owner_agent_key, count(*) AS count FROM business_skills WHERE status = 'active' GROUP BY owner_agent_key ORDER BY owner_agent_key) s), '{}'::jsonb),
    'skill_versions_total', (SELECT count(*) FROM business_skill_versions),
    'open_recommendations', (SELECT count(*) FROM skill_improvement_recommendations WHERE status in ('proposed','review','open')),
    'latest_recommendations', COALESCE((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT recommendation_key, owner_agent_key, priority, title, status, created_at
        FROM skill_improvement_recommendations
        ORDER BY created_at DESC
        LIMIT (SELECT row_limit FROM params)
      ) x
    ), '[]'::jsonb)
  ) AS data
),
recent_activity AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS data
  FROM (
    SELECT entity_type, entity_id, event_type, created_at, payload
    FROM workflow_events
    ORDER BY created_at DESC
    LIMIT (SELECT row_limit FROM params)
  ) x
),
recent_work AS (
  SELECT jsonb_build_object(
    'leads', COALESCE((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT id, status, trade_type, urgency, address, preferred_time, created_at, updated_at
        FROM leads
        WHERE tenant_id = (SELECT tenant_id FROM params)
        ORDER BY updated_at DESC
        LIMIT (SELECT row_limit FROM params)
      ) x
    ), '[]'::jsonb),
    'jobs', COALESCE((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT id, lead_id, quote_id, status, scheduled_window, completed_at, updated_at
        FROM jobs
        ORDER BY updated_at DESC
        LIMIT (SELECT row_limit FROM params)
      ) x
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT id, invoice_id, job_id, status, amount, currency, payment_url, due_at, paid_at, updated_at
        FROM payment_requests
        ORDER BY updated_at DESC
        LIMIT (SELECT row_limit FROM params)
      ) x
    ), '[]'::jsonb)
  ) AS data
)
SELECT jsonb_build_object(
  'success', true,
  'generated_at', now(),
  'tenant_id', (SELECT tenant_id FROM params),
  'agents', COALESCE((SELECT data FROM agent_catalog), '[]'::jsonb),
  'pipeline', (SELECT data FROM pipeline_counts),
  'payments', (SELECT data FROM payment_metrics),
  'scheduling', (SELECT data FROM scheduling_metrics),
  'quotes', (SELECT data FROM quote_metrics),
  'growth', (SELECT data FROM growth_metrics),
  'skills', (SELECT data FROM skills_metrics),
  'recent_activity', (SELECT data FROM recent_activity),
  'recent_work', (SELECT data FROM recent_work)
) AS ops_console;
`;

return [{ json: { sql: query } }];
'@

$nodes = @(
    (New-WebhookNode "Ops Console Summary Webhook" "admin/ops-console/summary" "GET" 0 0),
    (New-CodeNode "Build Ops Console Summary SQL" $summaryCode 260 0),
    (New-PostgresNode "Load Ops Console Summary" 520 0),
    (New-RespondNode "Respond Ops Console Summary" '={{$json.ops_console || $json}}' 780 0)
)

$connections = @{
    "Ops Console Summary Webhook" = @{ main = @(, @(@{ node = "Build Ops Console Summary SQL"; type = "main"; index = 0 })) }
    "Build Ops Console Summary SQL" = @{ main = @(, @(@{ node = "Load Ops Console Summary"; type = "main"; index = 0 })) }
    "Load Ops Console Summary" = @{ main = @(, @(@{ node = "Respond Ops Console Summary"; type = "main"; index = 0 })) }
}

$workflow = Upsert-WorkflowByName "TRADIE-ADMIN-960-Ops-Console-Summary" $nodes $connections

@{
    workflow = $workflow | Select-Object name,id,active
    endpoint = "$BaseUrl/webhook/admin/ops-console/summary"
} | ConvertTo-Json -Depth 10
