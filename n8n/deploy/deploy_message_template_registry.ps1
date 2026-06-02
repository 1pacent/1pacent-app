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
CREATE TABLE IF NOT EXISTS message_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  template_name text not null,
  owner_agent_key text references agent_definitions(agent_key),
  channel text not null default 'email',
  purpose text not null,
  audience text not null default 'customer',
  subject_template text not null,
  body_template text not null,
  variables_schema jsonb not null default '{}'::jsonb,
  variant_rules jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  status text not null default 'active',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS message_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references message_templates(template_key),
  variant_key text not null default 'default',
  version integer not null,
  template_name text not null,
  owner_agent_key text references agent_definitions(agent_key),
  channel text not null,
  purpose text not null,
  audience text not null,
  subject_template text not null,
  body_template text not null,
  variables_schema jsonb not null default '{}'::jsonb,
  variant_rules jsonb not null default '{}'::jsonb,
  trade_type text,
  job_type text,
  customer_segment text,
  status text not null default 'proposed',
  change_reason text,
  created_by_agent_key text references agent_definitions(agent_key),
  reviewed_by_agent_key text references agent_definitions(agent_key),
  approved_by text,
  promoted_at timestamptz,
  archived_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (template_key, version)
);

ALTER TABLE message_template_versions ADD COLUMN IF NOT EXISTS variant_key text not null default 'default';
ALTER TABLE message_template_versions ADD COLUMN IF NOT EXISTS trade_type text;
ALTER TABLE message_template_versions ADD COLUMN IF NOT EXISTS job_type text;
ALTER TABLE message_template_versions ADD COLUMN IF NOT EXISTS customer_segment text;

CREATE TABLE IF NOT EXISTS message_template_variants (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references message_templates(template_key),
  variant_key text not null,
  trade_type text,
  job_type text,
  customer_segment text,
  priority integer not null default 100,
  subject_template text not null,
  body_template text not null,
  variables_schema jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  status text not null default 'active',
  active boolean not null default true,
  change_reason text,
  created_by_agent_key text references agent_definitions(agent_key),
  approved_by text,
  promoted_at timestamptz,
  archived_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_key, variant_key)
);

CREATE TABLE IF NOT EXISTS message_template_usage_events (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  variant_key text,
  version integer,
  owner_agent_key text,
  entity_type text,
  entity_id text,
  channel text,
  outcome text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

ALTER TABLE message_template_usage_events ADD COLUMN IF NOT EXISTS variant_key text;

CREATE INDEX IF NOT EXISTS idx_message_templates_owner ON message_templates(owner_agent_key, status, active);
CREATE INDEX IF NOT EXISTS idx_message_template_variants_lookup ON message_template_variants(template_key, active, trade_type, job_type, customer_segment, priority);
CREATE INDEX IF NOT EXISTS idx_message_template_versions_key ON message_template_versions(template_key, version desc);
CREATE INDEX IF NOT EXISTS idx_message_template_usage_key ON message_template_usage_events(template_key, created_at desc);

INSERT INTO message_templates (
  template_key, template_name, owner_agent_key, channel, purpose, audience,
  subject_template, body_template, variables_schema, variant_rules, version, status, active
)
VALUES (
  'payment_request_email',
  'Payment request email',
  'penny',
  'email',
  'Ask the customer to pay an issued invoice with clear payment and tracking links.',
  'customer',
  'Payment request for your 1pacent invoice {{invoice_id}}',
  'Hi {{customer_name}},

Thanks again for choosing 1pacent. Your invoice summary is ready for payment.

Invoice reference: {{invoice_id}}
Job reference: {{job_id}}
Amount due: {{amount}}

Pay here: {{payment_url}}
Track your request here: {{tracking_url}}

This payment link is currently a secure placeholder while payment provider integration is being configured. If you have any questions, call Sally and quote your invoice reference.

Thanks,
1pacent',
  '{"required":["customer_name","invoice_id","job_id","amount","payment_url","tracking_url"],"optional":["due_at","payment_request_id"]}'::jsonb,
  '{"default":"customer","future_variants":["emergency_job","high_value_job","repeat_customer","overdue_reminder"]}'::jsonb,
  1,
  'active',
  true
)
ON CONFLICT (template_key) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  owner_agent_key = EXCLUDED.owner_agent_key,
  channel = EXCLUDED.channel,
  purpose = EXCLUDED.purpose,
  audience = EXCLUDED.audience,
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  variables_schema = EXCLUDED.variables_schema,
  variant_rules = EXCLUDED.variant_rules,
  status = 'active',
  active = true,
  updated_at = now();

INSERT INTO message_template_versions (
  template_key, variant_key, version, template_name, owner_agent_key, channel, purpose, audience,
  subject_template, body_template, variables_schema, variant_rules, trade_type, job_type, customer_segment, status, change_reason,
  created_by_agent_key, reviewed_by_agent_key, approved_by, promoted_at, payload
)
SELECT template_key, 'default', version, template_name, owner_agent_key, channel, purpose, audience,
  subject_template, body_template, variables_schema, variant_rules, null, null, null, 'active',
  'Initial active template seed.', 'quintino', 'quintino', 'system', now(), '{}'::jsonb
FROM message_templates
WHERE template_key = 'payment_request_email'
ON CONFLICT (template_key, version) DO NOTHING;

WITH seed_templates(template_key, template_name, owner_agent_key, channel, purpose, audience, subject_template, body_template, variables_schema, variant_rules) AS (
  VALUES
  (
    'booking_request_confirmation_email',
    'Booking request confirmation email',
    'sally_receptionist',
    'email',
    'Confirm that Sally captured a booking request and explain what happens next.',
    'customer',
    'Booking request received: {{lead_id}}',
    'Hi {{customer_name}},

Thanks for contacting 1pacent. We have received your booking request.

Reference: {{lead_id}}
Trade: {{trade_type}}
Job: {{job_description}}
Preferred window: {{preferred_time}}
Address/suburb: {{address}}
Indicative estimate: {{estimated_price_band}}

Track your request here: {{tracking_url}}

This is a booking request confirmation, not a fixed-price quote. The tradie will confirm scope, timing and final pricing before work begins.

Need to change your booking request? Call Sally back and quote your reference.

Thanks,
1pacent',
    '{"required":["customer_name","lead_id","trade_type","job_description","preferred_time","tracking_url"],"optional":["address","estimated_price_band"]}'::jsonb,
    '{"future_variants":["urgent_customer","repeat_customer","high_value_job"]}'::jsonb
  ),
  (
    'quote_confirmation_email',
    'Quote confirmation and acceptance email',
    'nelly',
    'email',
    'Send a tradie-confirmed quote with an acceptance link and clear assumptions.',
    'customer',
    'Your confirmed 1pacent quote: {{quote_id}}',
    'Hi {{customer_name}},

Your tradie has confirmed the quote for your requested work.

Quote reference: {{quote_id}}
Job: {{job_description}}
Appointment window: {{booking_window}}
Confirmed quote: {{amount_label}}
Inclusions: {{inclusions}}
Exclusions/assumptions: {{exclusions}}
Notes: {{scope_notes}}
Valid until: {{valid_until}}

To accept this quote, open this link: {{acceptance_url}}
Track your request here: {{tracking_url}}

No work will proceed until the quote is accepted. If anything changes, call Sally back and quote your reference.

Thanks,
1pacent',
    '{"required":["customer_name","quote_id","job_description","amount_label","acceptance_url","tracking_url"],"optional":["booking_window","inclusions","exclusions","scope_notes","valid_until"]}'::jsonb,
    '{"future_variants":["inspection_required","high_value_quote","repeat_customer"]}'::jsonb
  ),
  (
    'quote_accepted_scheduled_email',
    'Quote accepted and scheduled email',
    'george_foreman',
    'email',
    'Confirm quote acceptance and schedule details after George creates the booking.',
    'customer',
    'Quote accepted and job scheduled: {{quote_id}}',
    'Hi {{customer_name}},

Your quote {{quote_id}} has been accepted and your job has been scheduled.

Job reference: {{job_id}}
Appointment window: {{scheduled_window}}
Confirmed quote: {{confirmed_quote_amount}}

Track your request here: {{tracking_url}}

The tradie will confirm final arrival details before attending. If you need to change the booking, call Sally back and quote your job reference.

Thanks,
1pacent',
    '{"required":["customer_name","quote_id","job_id","scheduled_window","tracking_url"],"optional":["confirmed_quote_amount"]}'::jsonb,
    '{"future_variants":["manual_schedule_required","multi_tradie_job"]}'::jsonb
  ),
  (
    'job_complete_invoice_summary_email',
    'Job complete and invoice summary email',
    'penny',
    'email',
    'Confirm job completion, invoice summary and next payment/review actions.',
    'customer',
    'Job complete and invoice summary: {{invoice_id}}',
    'Hi {{customer_name}},

Your job has been marked complete and the invoice summary is ready.

Job reference: {{job_id}}
Invoice reference: {{invoice_id}}
Final invoice amount: {{final_invoice_amount}}
Completion notes: {{completion_notes}}
Materials used: {{materials_summary}}

Track your request here: {{tracking_url}}

Please keep this email for your records. If you have any questions, call Sally back and quote your job or invoice reference.

Thanks,
1pacent',
    '{"required":["customer_name","job_id","invoice_id","final_invoice_amount","tracking_url"],"optional":["completion_notes","materials_summary"]}'::jsonb,
    '{"future_variants":["variance_explained","no_extra_parts","commercial_customer"]}'::jsonb
  ),
  (
    'review_request_email',
    'Customer review request email',
    'mia_social',
    'email',
    'Ask for an honest customer review after a completed job.',
    'customer',
    'Thanks from 1pacent - quick review request',
    'Hi {{customer_name}},

Thanks again for choosing 1pacent.

If you were happy with the service, would you mind leaving a quick review?

{{review_url}}

Thank you,
The 1pacent team',
    '{"required":["customer_name","review_url"],"optional":["job_id","trade_type"]}'::jsonb,
    '{"future_variants":["high_satisfaction","repeat_customer","after_payment_received"]}'::jsonb
  ),
  (
    'social_draft_internal_review_email',
    'Social draft internal review email',
    'mia_social',
    'email',
    'Ask internal admin to review and approve customer-safe social content drafts.',
    'internal',
    'Mia social draft ready: {{campaign_id}}',
    'A new customer-safe social draft is ready for review.

Campaign: {{campaign_id}}
Job: {{job_id}}
Trade: {{trade_type}}
Suburb: {{suburb}}
Approval status: {{approval_status}}

Draft caption:
{{caption}}

Privacy notes:
{{privacy_notes}}

Next action: {{next_action}}',
    '{"required":["campaign_id","job_id","caption","approval_status"],"optional":["trade_type","suburb","privacy_notes","next_action"]}'::jsonb,
    '{"future_variants":["instagram","facebook","tradie_profile_story"]}'::jsonb
  )
)
INSERT INTO message_templates (
  template_key, template_name, owner_agent_key, channel, purpose, audience,
  subject_template, body_template, variables_schema, variant_rules, version, status, active
)
SELECT template_key, template_name, owner_agent_key, channel, purpose, audience,
  subject_template, body_template, variables_schema, variant_rules, 1, 'active', true
FROM seed_templates
ON CONFLICT (template_key) DO UPDATE SET
  template_name = EXCLUDED.template_name,
  owner_agent_key = EXCLUDED.owner_agent_key,
  channel = EXCLUDED.channel,
  purpose = EXCLUDED.purpose,
  audience = EXCLUDED.audience,
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  variables_schema = EXCLUDED.variables_schema,
  variant_rules = EXCLUDED.variant_rules,
  status = 'active',
  active = true,
  updated_at = now();

INSERT INTO message_template_versions (
  template_key, variant_key, version, template_name, owner_agent_key, channel, purpose, audience,
  subject_template, body_template, variables_schema, variant_rules, trade_type, job_type, customer_segment, status, change_reason,
  created_by_agent_key, reviewed_by_agent_key, approved_by, promoted_at, payload
)
SELECT template_key, 'default', version, template_name, owner_agent_key, channel, purpose, audience,
  subject_template, body_template, variables_schema, variant_rules, null, null, null, 'active',
  'Initial active customer experience template seed.', 'quintino', 'quintino', 'system', now(), '{}'::jsonb
FROM message_templates
WHERE template_key IN (
  'booking_request_confirmation_email',
  'quote_confirmation_email',
  'quote_accepted_scheduled_email',
  'job_complete_invoice_summary_email',
  'review_request_email',
  'social_draft_internal_review_email'
)
ON CONFLICT (template_key, version) DO NOTHING;

INSERT INTO mcp_services (service_key, service_name, provider, category, capability, endpoint_path, workflow_id, credential_name, status, available_to_agents, config)
VALUES
  ('message_templates', 'Message Template Registry', 'postgres', 'agent_capability', 'Version-managed customer and internal message templates with variants and lifecycle governance', '/webhook/core/message-templates/render', null, 'Tradie App Postgres', 'active', ARRAY['quintino','penny','sally_receptionist','nelly','george_foreman','mia_social'], '{"source_of_truth":"postgres","approval_required":true}'::jsonb)
ON CONFLICT (service_key) DO UPDATE SET
  service_name = EXCLUDED.service_name,
  provider = EXCLUDED.provider,
  category = EXCLUDED.category,
  capability = EXCLUDED.capability,
  endpoint_path = EXCLUDED.endpoint_path,
  status = EXCLUDED.status,
  available_to_agents = EXCLUDED.available_to_agents,
  config = EXCLUDED.config,
  updated_at = now();

INSERT INTO mcp_service_tools (service_key, tool_key, tool_name, description, endpoint_path, input_schema, output_contract, active)
VALUES
  ('message_templates', 'message_template_render', 'Message Template Render', 'Render the active message template or best matching variant for a given template key and payload.', '/webhook/core/message-templates/render', '{"template_key":"text","trade_type":"text","job_type":"text","customer_segment":"text","payload":"object"}'::jsonb, '{"subject":"text","body":"text","version":"number","variant_key":"text"}'::jsonb, true),
  ('message_templates', 'message_template_lifecycle_manage', 'Message Template Lifecycle Manage', 'Propose, review or promote a message template version or variant. Older active versions are archived when promoting.', '/webhook/core/message-templates/lifecycle-manage', '{"action":"propose|promote","template_key":"text","variant_key":"text","trade_type":"text","job_type":"text","customer_segment":"text","body_template":"text"}'::jsonb, '{"template_key":"text","variant_key":"text","version":"number","status":"text"}'::jsonb, true)
ON CONFLICT (tool_key) DO UPDATE SET
  description = EXCLUDED.description,
  endpoint_path = EXCLUDED.endpoint_path,
  input_schema = EXCLUDED.input_schema,
  output_contract = EXCLUDED.output_contract,
  active = true,
  updated_at = now();

SELECT jsonb_build_object(
  'success', true,
  'message', 'Message template registry is ready.',
  'seeded_template', 'payment_request_email'
) AS setup_result;
`;
return [{ json: { sql: query } }];
'@

$renderCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw.query ?? raw;
function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}
const templateKey = body.template_key || 'payment_request_email';
const payload = body.payload || body;
const tradeType = String(body.trade_type || payload.trade_type || '').toLowerCase();
const jobType = String(body.job_type || payload.job_type || payload.subcategory || '').toLowerCase();
const customerSegment = String(body.customer_segment || payload.customer_segment || '').toLowerCase();
const query = `
WITH selected_template AS (
  SELECT *
  FROM message_templates
  WHERE template_key = ${sql(templateKey)}
    AND active = true
    AND status = 'active'
  ORDER BY version DESC
  LIMIT 1
),
selected_variant AS (
  SELECT *
  FROM message_template_variants
  WHERE template_key = ${sql(templateKey)}
    AND active = true
    AND status = 'active'
    AND (trade_type IS NULL OR lower(trade_type) = ${sql(tradeType)})
    AND (job_type IS NULL OR lower(job_type) = ${sql(jobType)})
    AND (customer_segment IS NULL OR lower(customer_segment) = ${sql(customerSegment)})
  ORDER BY
    CASE WHEN trade_type IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN job_type IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN customer_segment IS NOT NULL THEN 1 ELSE 0 END DESC,
    priority ASC,
    version DESC
  LIMIT 1
),
usage_event AS (
  INSERT INTO message_template_usage_events (template_key, variant_key, version, owner_agent_key, entity_type, entity_id, channel, outcome, payload)
  SELECT
    st.template_key,
    COALESCE((SELECT variant_key FROM selected_variant), 'default'),
    COALESCE((SELECT version FROM selected_variant), st.version),
    st.owner_agent_key,
    ${sql(payload.entity_type || payload.source_entity_type || '')},
    ${sql(payload.entity_id || payload.invoice_id || payload.job_id || payload.lead_id || '')},
    st.channel,
    'rendered',
    ${jsonSql(payload)}
  FROM selected_template st
)
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'success', true,
      'template_key', st.template_key,
      'template_name', st.template_name,
      'owner_agent_key', st.owner_agent_key,
      'channel', st.channel,
      'version', COALESCE(sv.version, st.version),
      'variant_key', COALESCE(sv.variant_key, 'default'),
      'trade_type', sv.trade_type,
      'job_type', sv.job_type,
      'customer_segment', sv.customer_segment,
      'subject_template', COALESCE(sv.subject_template, st.subject_template),
      'body_template', COALESCE(sv.body_template, st.body_template),
      'variables_schema', COALESCE(sv.variables_schema, st.variables_schema)
    )
    FROM selected_template st
    LEFT JOIN selected_variant sv ON true
  ),
  jsonb_build_object('success', false, 'status', 'not_found', 'template_key', ${sql(templateKey)})
) AS template_render;
`;
return [{ json: { sql: query, payload } }];
'@

$renderApplyCode = @'
const row = items[0]?.json?.template_render || items[0]?.json || {};
const payload = $('Build Template Render SQL').first().json.payload || {};
function valueFor(path) {
  return path.split('.').reduce((acc, key) => acc && acc[key] !== undefined ? acc[key] : '', payload);
}
function render(text) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = valueFor(key);
    return value === undefined || value === null ? '' : String(value);
  });
}
return [{
  json: {
    ...row,
    payload,
    subject: render(row.subject_template),
    body: render(row.body_template),
  },
}];
'@

$lifecycleCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw.query ?? raw;
function slug(text) {
  return String(text || 'template').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 90);
}
function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}
const action = String(body.action || 'propose').toLowerCase();
const templateKey = body.template_key || slug(body.template_name || body.purpose || 'message_template');
const templateName = body.template_name || templateKey.replace(/_/g, ' ');
const variantKey = body.variant_key || 'default';
const isVariant = variantKey !== 'default' || !!body.trade_type || !!body.job_type || !!body.customer_segment;
const owner = body.owner_agent_key || 'quintino';
const status = action === 'promote' ? 'active' : 'proposed';
const query = `
WITH current_template AS (
  SELECT * FROM message_templates WHERE template_key = ${sql(templateKey)} LIMIT 1
),
next_version AS (
  SELECT CASE
    WHEN ${sql(action)} = 'promote' THEN COALESCE((SELECT max(version) + 1 FROM message_template_versions WHERE template_key = ${sql(templateKey)}), 1)
    ELSE COALESCE((SELECT max(version) + 1 FROM message_template_versions WHERE template_key = ${sql(templateKey)}), 1)
  END AS version
),
archive_active AS (
  UPDATE message_template_versions
  SET status = 'archived', archived_at = now()
  WHERE template_key = ${sql(templateKey)}
    AND variant_key = ${sql(variantKey)}
    AND status = 'active'
    AND ${sql(action)} = 'promote'
  RETURNING id
),
upsert_template AS (
  INSERT INTO message_templates (
    template_key, template_name, owner_agent_key, channel, purpose, audience,
    subject_template, body_template, variables_schema, variant_rules, version, status, active
  )
  SELECT
    ${sql(templateKey)},
    ${sql(templateName)},
    ${sql(owner)},
    ${sql(body.channel || 'email')},
    ${sql(body.purpose || 'Customer message')},
    ${sql(body.audience || 'customer')},
    ${sql(body.subject_template || body.subject || '')},
    ${sql(body.body_template || body.body || '')},
    ${jsonSql(body.variables_schema || {})},
    ${jsonSql(body.variant_rules || {})},
    (SELECT version FROM next_version),
    CASE WHEN ${sql(isVariant)} = 'True' THEN COALESCE((SELECT status FROM current_template), 'active') ELSE ${sql(status)} END,
    CASE WHEN ${sql(isVariant)} = 'True' THEN true ELSE ${sql(action)} = 'promote' END
  WHERE NOT (${sql(isVariant)} = 'True' AND EXISTS (SELECT 1 FROM current_template))
     OR (${sql(isVariant)} <> 'True' AND (${sql(action)} = 'promote' OR NOT EXISTS (SELECT 1 FROM current_template)))
  ON CONFLICT (template_key) DO UPDATE SET
    template_name = EXCLUDED.template_name,
    owner_agent_key = EXCLUDED.owner_agent_key,
    channel = EXCLUDED.channel,
    purpose = EXCLUDED.purpose,
    audience = EXCLUDED.audience,
    subject_template = CASE WHEN ${sql(action)} = 'promote' AND ${sql(isVariant)} <> 'True' THEN EXCLUDED.subject_template ELSE message_templates.subject_template END,
    body_template = CASE WHEN ${sql(action)} = 'promote' AND ${sql(isVariant)} <> 'True' THEN EXCLUDED.body_template ELSE message_templates.body_template END,
    variables_schema = CASE WHEN ${sql(action)} = 'promote' AND ${sql(isVariant)} <> 'True' THEN EXCLUDED.variables_schema ELSE message_templates.variables_schema END,
    variant_rules = CASE WHEN ${sql(action)} = 'promote' AND ${sql(isVariant)} <> 'True' THEN EXCLUDED.variant_rules ELSE message_templates.variant_rules END,
    version = CASE WHEN ${sql(action)} = 'promote' AND ${sql(isVariant)} <> 'True' THEN EXCLUDED.version ELSE message_templates.version END,
    status = CASE WHEN ${sql(action)} = 'promote' AND ${sql(isVariant)} <> 'True' THEN 'active' ELSE message_templates.status END,
    active = CASE WHEN ${sql(action)} = 'promote' AND ${sql(isVariant)} <> 'True' THEN true ELSE message_templates.active END,
    updated_at = now()
  RETURNING *
),
upsert_variant AS (
  INSERT INTO message_template_variants (
    template_key, variant_key, trade_type, job_type, customer_segment, priority,
    subject_template, body_template, variables_schema, version, status, active,
    change_reason, created_by_agent_key, approved_by, promoted_at, payload, updated_at
  )
  SELECT
    ${sql(templateKey)},
    ${sql(variantKey)},
    ${sql(body.trade_type || '')},
    ${sql(body.job_type || '')},
    ${sql(body.customer_segment || '')},
    COALESCE(${sql(body.priority || '')}::integer, 100),
    ${sql(body.subject_template || body.subject || '')},
    ${sql(body.body_template || body.body || '')},
    ${jsonSql(body.variables_schema || {})},
    (SELECT version FROM next_version),
    ${sql(status)},
    ${sql(action)} = 'promote',
    ${sql(body.change_reason || body.evidence_summary || 'Template variant lifecycle update.')},
    ${sql(body.created_by_agent_key || 'quintino')},
    ${sql(body.approved_by || '')},
    CASE WHEN ${sql(action)} = 'promote' THEN now() ELSE NULL END,
    ${jsonSql(body)},
    now()
  WHERE ${sql(isVariant)} = 'True' AND ${sql(action)} = 'promote'
  ON CONFLICT (template_key, variant_key) DO UPDATE SET
    trade_type = EXCLUDED.trade_type,
    job_type = EXCLUDED.job_type,
    customer_segment = EXCLUDED.customer_segment,
    priority = EXCLUDED.priority,
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    variables_schema = EXCLUDED.variables_schema,
    version = EXCLUDED.version,
    status = 'active',
    active = true,
    change_reason = EXCLUDED.change_reason,
    approved_by = EXCLUDED.approved_by,
    promoted_at = now(),
    archived_at = null,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
insert_version AS (
  INSERT INTO message_template_versions (
    template_key, variant_key, version, template_name, owner_agent_key, channel, purpose, audience,
    subject_template, body_template, variables_schema, variant_rules, trade_type, job_type, customer_segment, status, change_reason,
    created_by_agent_key, reviewed_by_agent_key, approved_by, promoted_at, payload
  )
  SELECT
    ${sql(templateKey)},
    ${sql(variantKey)},
    (SELECT version FROM next_version),
    ${sql(templateName)},
    ${sql(owner)},
    ${sql(body.channel || 'email')},
    ${sql(body.purpose || 'Customer message')},
    ${sql(body.audience || 'customer')},
    ${sql(body.subject_template || body.subject || '')},
    ${sql(body.body_template || body.body || '')},
    ${jsonSql(body.variables_schema || {})},
    ${jsonSql(body.variant_rules || {})},
    ${sql(body.trade_type || '')},
    ${sql(body.job_type || '')},
    ${sql(body.customer_segment || '')},
    ${sql(status)},
    ${sql(body.change_reason || body.evidence_summary || 'Template lifecycle update.')},
    ${sql(body.created_by_agent_key || 'quintino')},
    'quintino',
    ${sql(body.approved_by || '')},
    CASE WHEN ${sql(action)} = 'promote' THEN now() ELSE NULL END,
    ${jsonSql(body)}
  ON CONFLICT (template_key, version) DO UPDATE SET
    status = EXCLUDED.status,
    change_reason = EXCLUDED.change_reason,
    payload = EXCLUDED.payload
  RETURNING *
),
insert_workflow_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'message_template', template_key, 'message_template_' || ${sql(action)}, to_jsonb(insert_version)
  FROM insert_version
)
SELECT jsonb_build_object(
  'success', true,
  'template_key', template_key,
  'variant_key', variant_key,
  'version', version,
  'status', status,
  'action', ${sql(action)},
  'message', CASE WHEN ${sql(action)} = 'promote' THEN 'Template promoted and older active versions archived.' ELSE 'Template version proposed for Quintino/admin review.' END
) AS template_lifecycle
FROM insert_version
LIMIT 1;
`;
return [{ json: { sql: query } }];
'@

$toolNormaliseCode = @'
const raw = items[0]?.json ?? {};
return [{ json: raw.body ?? raw.query ?? raw }];
'@

$setupNodes = @(
    (New-WebhookNode "Message Template Setup Webhook" "core/message-templates/setup" "POST" 0 0),
    (New-CodeNode "Build Message Template Setup SQL" $setupCode 260 0),
    (New-PostgresNode "Setup Message Templates" 520 0),
    (New-RespondNode "Respond Message Template Setup" '={{$json.setup_result || $json}}' 780 0)
)
$setupConnections = @{
    "Message Template Setup Webhook" = @{ main = @(, @(@{ node = "Build Message Template Setup SQL"; type = "main"; index = 0 })) }
    "Build Message Template Setup SQL" = @{ main = @(, @(@{ node = "Setup Message Templates"; type = "main"; index = 0 })) }
    "Setup Message Templates" = @{ main = @(, @(@{ node = "Respond Message Template Setup"; type = "main"; index = 0 })) }
}
$setup = Upsert-WorkflowByName "TRADIE-CORE-980-Message-Template-Setup" $setupNodes $setupConnections

$renderNodes = @(
    (New-WebhookNode "Message Template Render Webhook" "core/message-templates/render" "POST" 0 0),
    (New-CodeNode "Build Template Render SQL" $renderCode 260 0),
    (New-PostgresNode "Load Message Template" 520 0),
    (New-CodeNode "Apply Template Variables" $renderApplyCode 780 0),
    (New-RespondNode "Respond Message Template Render" '={{$json}}' 1040 0)
)
$renderConnections = @{
    "Message Template Render Webhook" = @{ main = @(, @(@{ node = "Build Template Render SQL"; type = "main"; index = 0 })) }
    "Build Template Render SQL" = @{ main = @(, @(@{ node = "Load Message Template"; type = "main"; index = 0 })) }
    "Load Message Template" = @{ main = @(, @(@{ node = "Apply Template Variables"; type = "main"; index = 0 })) }
    "Apply Template Variables" = @{ main = @(, @(@{ node = "Respond Message Template Render"; type = "main"; index = 0 })) }
}
$render = Upsert-WorkflowByName "TRADIE-CORE-981-Message-Template-Render" $renderNodes $renderConnections

$lifecycleNodes = @(
    (New-WebhookNode "Message Template Lifecycle Webhook" "core/message-templates/lifecycle-manage" "POST" 0 0),
    (New-CodeNode "Build Template Lifecycle SQL" $lifecycleCode 260 0),
    (New-PostgresNode "Manage Message Template Lifecycle" 520 0),
    (New-RespondNode "Respond Template Lifecycle" '={{$json.template_lifecycle || $json}}' 780 0)
)
$lifecycleConnections = @{
    "Message Template Lifecycle Webhook" = @{ main = @(, @(@{ node = "Build Template Lifecycle SQL"; type = "main"; index = 0 })) }
    "Build Template Lifecycle SQL" = @{ main = @(, @(@{ node = "Manage Message Template Lifecycle"; type = "main"; index = 0 })) }
    "Manage Message Template Lifecycle" = @{ main = @(, @(@{ node = "Respond Template Lifecycle"; type = "main"; index = 0 })) }
}
$lifecycle = Upsert-WorkflowByName "TRADIE-CORE-982-Message-Template-Lifecycle-Manage" $lifecycleNodes $lifecycleConnections

$renderToolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Message Template Render Tool Is Called" 0 0),
    (New-CodeNode "Normalise Render Tool Input" $toolNormaliseCode 260 0),
    (New-HttpRequestNode "Call Message Template Render Endpoint" "POST" "http://localhost:5678/webhook/core/message-templates/render" 520 0 "={{ JSON.stringify(`$json) }}")
)
$renderToolConnections = @{
    "When Message Template Render Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Render Tool Input"; type = "main"; index = 0 })) }
    "Normalise Render Tool Input" = @{ main = @(, @(@{ node = "Call Message Template Render Endpoint"; type = "main"; index = 0 })) }
}
$renderTool = Upsert-WorkflowByName "TRADIE-TOOL-Message-Template-Render" $renderToolNodes $renderToolConnections

$lifecycleToolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Message Template Lifecycle Tool Is Called" 0 0),
    (New-CodeNode "Normalise Lifecycle Tool Input" $toolNormaliseCode 260 0),
    (New-HttpRequestNode "Call Message Template Lifecycle Endpoint" "POST" "http://localhost:5678/webhook/core/message-templates/lifecycle-manage" 520 0 "={{ JSON.stringify(`$json) }}")
)
$lifecycleToolConnections = @{
    "When Message Template Lifecycle Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Lifecycle Tool Input"; type = "main"; index = 0 })) }
    "Normalise Lifecycle Tool Input" = @{ main = @(, @(@{ node = "Call Message Template Lifecycle Endpoint"; type = "main"; index = 0 })) }
}
$lifecycleTool = Upsert-WorkflowByName "TRADIE-TOOL-Message-Template-Lifecycle-Manage" $lifecycleToolNodes $lifecycleToolConnections

@{
    setup_workflow = $setup | Select-Object name,id,active
    render_workflow = $render | Select-Object name,id,active
    lifecycle_workflow = $lifecycle | Select-Object name,id,active
    tool_workflows = @(
        ($renderTool | Select-Object name,id,active),
        ($lifecycleTool | Select-Object name,id,active)
    )
    endpoints = @{
        setup = "$BaseUrl/webhook/core/message-templates/setup"
        render = "$BaseUrl/webhook/core/message-templates/render"
        lifecycle = "$BaseUrl/webhook/core/message-templates/lifecycle-manage"
    }
} | ConvertTo-Json -Depth 10
