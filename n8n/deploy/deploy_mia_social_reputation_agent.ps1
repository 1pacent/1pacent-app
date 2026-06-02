$ErrorActionPreference = "Stop"

$BaseUrl = "https://vmi3305336.contaboserver.net"
$ApiKey = $env:N8N_API_KEY
if (-not $ApiKey) { throw "Set N8N_API_KEY in the environment before running this script." }

$Headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "accept" = "application/json"
}

$gmailCredential = @{
    id = "Ar5b8h8vd29IBh1g"
    name = "Gmail account"
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

function New-GmailNode($Name, $SendTo, $Subject, $Message, $X, $Y) {
    return @{
        parameters = @{
            sendTo = $SendTo
            subject = $Subject
            emailType = "text"
            message = $Message
            options = @{}
        }
        type = "n8n-nodes-base.gmail"
        typeVersion = 2.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = $Name
        credentials = @{ gmailOAuth2 = $gmailCredential }
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
        name = "Chat with Mia"
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
        name = "Mia Short Memory"
    }
}

function New-AgentNode($X, $Y) {
    $systemMessage = @'
You are Mia, the Social Media and Reputation AI Agent for 1pacent.

You live inside n8n. You do not speak directly to customers unless a workflow explicitly sends an approved message. Your role is to turn completed jobs, approved media, customer reviews, and trust evidence into growth for tradie businesses.

Your mission:
- Create customer-approved social content drafts from completed jobs.
- Request reviews at the right moment after completion/payment.
- Protect customer trust, privacy, addresses, phone numbers, emails, faces, licence plates, and home-identifying details.
- Use Skills and business rules before making decisions.
- Save reusable learnings that improve reputation growth, review conversion, and social proof.

Operating rules:
- Always load business rules for agent_key mia_social before operational recommendations.
- Never publish content without explicit customer media approval and internal approval.
- Draft only until Meta/Instagram credentials and approval workflows are connected.
- Never invent ratings, licences, insurance, reviews, or certifications.
- Prefer job-specific captions that show the problem solved, suburb-level area only, trade category, and trust reassurance.
- Avoid customer names unless explicit consent is recorded.
- Ask Quintino/Skills to capture repeatable growth lessons.

Preferred response format:
status: draft_ready | review_requested | needs_approval | blocked | recommendation_ready
actions_taken: short bullets
approval_needed: yes/no and why
customer_trust_notes: privacy/consent constraints
next_step: exact workflow/action to take
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
        name = "Mia"
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
            content = "## Mia Social and Reputation`nGrowth agent for completed-job stories and review requests.`n`nGuardrails:`n- Customer media approval required`n- Internal approval required before posting`n- No private addresses, phone numbers, emails, faces or licence plates`n- Starts as draft/approval workflow until Meta credentials are connected"
            height = 280
            width = 420
            color = 5
        }
        type = "n8n-nodes-base.stickyNote"
        typeVersion = 1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Mia Architecture Note"
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
CREATE TABLE IF NOT EXISTS customer_media_permissions (
  id uuid primary key default gen_random_uuid(),
  job_id text references jobs(id),
  customer_id uuid references customers(id),
  permission_status text not null default 'not_requested',
  approved_media_urls text[] not null default '{}',
  restrictions text,
  approved_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS social_campaigns (
  id text primary key,
  job_id text references jobs(id),
  lead_id text references leads(id),
  customer_id uuid references customers(id),
  campaign_type text not null default 'completed_job_story',
  status text not null default 'draft',
  approval_status text not null default 'approval_required',
  platforms text[] not null default '{}',
  content jsonb not null default '{}'::jsonb,
  created_by_agent text not null default 'mia_social',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS social_posts (
  id text primary key,
  campaign_id text references social_campaigns(id),
  platform text not null,
  status text not null default 'draft',
  caption text,
  media_urls text[] not null default '{}',
  customer_approved boolean not null default false,
  approval_required boolean not null default true,
  scheduled_for timestamptz,
  published_at timestamptz,
  external_post_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS review_requests (
  id text primary key,
  job_id text references jobs(id),
  customer_id uuid references customers(id),
  status text not null default 'requested',
  channel text not null default 'email',
  review_url text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_customer_media_permissions_job ON customer_media_permissions(job_id, permission_status);
CREATE INDEX IF NOT EXISTS idx_social_campaigns_job ON social_campaigns(job_id, status);
CREATE INDEX IF NOT EXISTS idx_social_posts_campaign ON social_posts(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_review_requests_job ON review_requests(job_id, status);

INSERT INTO agent_definitions (agent_key, agent_name, agent_role, model_provider, model_name, active)
VALUES ('mia_social', 'Mia', 'Social media and reputation growth AI agent', 'google_gemini', 'models/gemini-3.1-flash-lite', true)
ON CONFLICT (agent_key) DO UPDATE SET
  agent_name = EXCLUDED.agent_name,
  agent_role = EXCLUDED.agent_role,
  model_provider = EXCLUDED.model_provider,
  model_name = EXCLUDED.model_name,
  active = true,
  updated_at = now();

DELETE FROM agent_business_rules WHERE agent_key = 'mia_social';
INSERT INTO agent_business_rules (agent_key, rule_group, rule_order, rule_text)
VALUES
  ('mia_social', 'consent', 10, 'Never publish or schedule public social content unless customer media approval and internal approval are both recorded. Draft content is allowed before approval.'),
  ('mia_social', 'privacy', 20, 'Never include customer phone numbers, email addresses, exact street addresses, faces, licence plates, private home-identifying details, or names unless explicit consent is recorded.'),
  ('mia_social', 'content', 30, 'Use suburb-level location, trade type, problem solved, trust reassurance, and clear calls to action. Keep captions useful and natural, not hype-heavy.'),
  ('mia_social', 'reviews', 40, 'Ask for reviews after the job is complete and preferably after payment is requested or received. Keep review requests short and grateful.'),
  ('mia_social', 'platforms', 50, 'Until Meta/Instagram credentials are connected, social output must stay in draft/approval-required status. Do not claim content was posted.'),
  ('mia_social', 'learning', 60, 'Save reusable social/reputation lessons to Skills or knowledge when evidence shows better review conversion, customer trust, or follower growth.');

INSERT INTO agent_knowledge_collections (agent_key, collection_key, collection_name, capability, active)
VALUES ('mia_social', 'reputation_growth', 'Reputation Growth Intelligence', 'Social proof, review conversion, customer-approved media and local growth learnings', true)
ON CONFLICT (agent_key, collection_key) DO UPDATE SET active = true, updated_at = now();

INSERT INTO business_skills (
  skill_key, skill_name, capability, category, description, best_practice, guardrails, inputs, outputs, owner_agent_key, version, status, tags, source_type, source_id, usefulness_score
)
VALUES
  (
    'skill_customer_approved_job_story',
    'Customer-approved completed job story',
    'social_content',
    'growth',
    'Turn a completed job into a trust-building social post draft.',
    'Use completed job details, approved photos, suburb-level location, trade type, problem solved and trust reassurance. Keep the caption specific but privacy-safe. Create drafts first and require approval before publishing.',
    'No exact addresses, customer contact details, faces, licence plates, customer names, exaggerated claims or invented trust proof. Require explicit customer media approval and internal approval before publishing.',
    '{"requires":["job_id","approval_status","approved_media_urls"],"optional":["platforms","trade_type","suburb"]}'::jsonb,
    '{"returns":["campaign_id","post_drafts","approval_status","privacy_notes"]}'::jsonb,
    'mia_social',
    1,
    'active',
    ARRAY['social','reviews','trust','growth'],
    'system_seed',
    'mia_setup',
    8
  ),
  (
    'skill_review_request_after_paid_job',
    'Review request after completed paid job',
    'review_request',
    'growth',
    'Send a short customer review request at the right post-job moment.',
    'After a job is complete and payment is requested or paid, ask the customer for an honest review with a direct link. Keep tone grateful, concise and specific to the completed job.',
    'Do not pressure customers. Do not ask for only positive reviews. Do not offer incentives unless approved by business rules and local platform policy.',
    '{"requires":["job_id","customer_id"],"optional":["invoice_id","review_url","channel"]}'::jsonb,
    '{"returns":["review_request_id","status","message"]}'::jsonb,
    'mia_social',
    1,
    'active',
    ARRAY['reviews','reputation','customer_success'],
    'system_seed',
    'mia_setup',
    8
  )
ON CONFLICT (skill_key) DO UPDATE SET
  best_practice = EXCLUDED.best_practice,
  guardrails = EXCLUDED.guardrails,
  owner_agent_key = EXCLUDED.owner_agent_key,
  status = 'active',
  updated_at = now();

INSERT INTO agent_skill_assignments (agent_key, skill_key, priority, active)
VALUES
  ('mia_social', 'skill_customer_approved_job_story', 10, true),
  ('mia_social', 'skill_review_request_after_paid_job', 20, true)
ON CONFLICT (agent_key, skill_key) DO UPDATE SET priority = EXCLUDED.priority, active = true, updated_at = now();

INSERT INTO mcp_services (service_key, service_name, provider, category, capability, endpoint_path, credential_name, status, available_to_agents, config)
VALUES
  ('social_publishing', 'Social Publishing', 'meta_placeholder', 'growth', 'Draft and later publish approved Instagram/Facebook job stories', '/webhook/agents/mia/social-draft', null, 'planned', ARRAY['mia_social'], '{"approval_required":true,"provider_credentials_needed":true}'::jsonb),
  ('review_growth', 'Review Growth', 'internal', 'growth', 'Request and track customer reviews after job completion', '/webhook/agents/mia/review-request', 'Gmail account', 'active', ARRAY['mia_social'], '{"channels":["email"],"future_channels":["sms","app_push"]}'::jsonb)
ON CONFLICT (service_key) DO UPDATE SET
  service_name = EXCLUDED.service_name,
  provider = EXCLUDED.provider,
  category = EXCLUDED.category,
  capability = EXCLUDED.capability,
  endpoint_path = EXCLUDED.endpoint_path,
  credential_name = EXCLUDED.credential_name,
  status = EXCLUDED.status,
  available_to_agents = EXCLUDED.available_to_agents,
  config = EXCLUDED.config,
  updated_at = now();

INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
VALUES ('agent', 'mia_social', 'mia_setup_complete', '{"agent":"Mia","capability":"social_and_reputation"}'::jsonb);

SELECT jsonb_build_object('success', true, 'agent_key', 'mia_social', 'note', 'Mia social and reputation foundation is ready.') AS setup_result;
`;
return [{ json: { sql: query } }];
'@

$draftCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw.query ?? raw;

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
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
function arrSql(values) {
  const arr = Array.isArray(values) ? values : String(values || '').split(',').map(v => v.trim()).filter(Boolean);
  if (!arr.length) return "ARRAY[]::text[]";
  return `ARRAY[${arr.map(v => sql(v)).join(',')}]::text[]`;
}

const now = new Date();
const jobId = first(body.job_id);
const invoiceId = first(body.invoice_id);
const leadId = first(body.lead_id);
const platforms = first(body.platforms, ['instagram', 'facebook']);
const approvedMediaUrls = first(body.approved_media_urls, body.media_urls, []);
const customerApproved = ['true', 'yes', 'approved'].includes(String(first(body.customer_approved, body.media_approved, false)).toLowerCase());
const internalApproved = ['true', 'yes', 'approved'].includes(String(first(body.internal_approved, false)).toLowerCase());
const campaignId = first(body.campaign_id, `SOC-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);

const query = `
WITH resolved AS (
  SELECT
    j.id AS job_id,
    j.lead_id,
    j.quote_id,
    j.customer_id,
    j.status AS job_status,
    j.scheduled_window,
    j.completed_at,
    l.trade_type,
    l.job_description,
    l.address,
    l.urgency,
    c.name AS customer_name,
    c.email AS customer_email,
    i.id AS invoice_id,
    i.status AS invoice_status,
    i.amount AS invoice_amount
  FROM jobs j
  LEFT JOIN leads l ON l.id = j.lead_id
  LEFT JOIN customers c ON c.id = j.customer_id
  LEFT JOIN invoices i ON i.job_id = j.id
  WHERE (${sql(jobId)} IS NOT NULL AND j.id = ${sql(jobId)})
     OR (${sql(invoiceId)} IS NOT NULL AND i.id = ${sql(invoiceId)})
     OR (${sql(leadId)} IS NOT NULL AND j.lead_id = ${sql(leadId)})
  ORDER BY j.created_at DESC
  LIMIT 1
),
content AS (
  SELECT
    ${sql(campaignId)} AS campaign_id,
    r.*,
    CASE
      WHEN ${customerApproved}::boolean AND ${internalApproved}::boolean THEN 'approved_ready_to_schedule'
      WHEN ${customerApproved}::boolean THEN 'internal_approval_required'
      ELSE 'customer_media_approval_required'
    END AS approval_status,
    CASE
      WHEN r.job_id IS NULL THEN 'blocked'
      ELSE 'draft'
    END AS campaign_status,
    regexp_replace(COALESCE(r.address, 'local area'), '^.*?,\\s*', '') AS suburb_hint
  FROM resolved r
),
campaign_upsert AS (
  INSERT INTO social_campaigns (id, job_id, lead_id, customer_id, campaign_type, status, approval_status, platforms, content)
  SELECT
    campaign_id,
    job_id,
    lead_id,
    customer_id,
    'completed_job_story',
    campaign_status,
    approval_status,
    ${arrSql(platforms)},
    jsonb_build_object(
      'trade_type', trade_type,
      'job_description', job_description,
      'suburb_hint', suburb_hint,
      'invoice_status', invoice_status,
      'privacy_notes', ARRAY['No customer contact details', 'No exact street address', 'No faces or licence plates without explicit approval'],
      'source_payload', ${jsonSql(body)}
    )
  FROM content
  WHERE job_id IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    approval_status = EXCLUDED.approval_status,
    platforms = EXCLUDED.platforms,
    content = EXCLUDED.content,
    updated_at = now()
  RETURNING *
),
platforms AS (
  SELECT unnest(${arrSql(platforms)}) AS platform
),
post_upsert AS (
  INSERT INTO social_posts (id, campaign_id, platform, status, caption, media_urls, customer_approved, approval_required, payload)
  SELECT
    'POST-' || campaign_upsert.id || '-' || platforms.platform,
    campaign_upsert.id,
    platforms.platform,
    CASE WHEN campaign_upsert.approval_status = 'approved_ready_to_schedule' THEN 'ready_to_schedule' ELSE 'draft_approval_required' END,
    'Completed ' || COALESCE(campaign_upsert.content->>'trade_type', 'trade') || ' job in ' || COALESCE(campaign_upsert.content->>'suburb_hint', 'the local area') || ': ' || COALESCE(campaign_upsert.content->>'job_description', 'customer job completed') || '. Clear scope, transparent pricing and a tidy finish. Need help from a trusted local tradie? Contact 1pacent.',
    ${arrSql(approvedMediaUrls)},
    ${customerApproved}::boolean,
    true,
    jsonb_build_object('generated_by', 'mia_social', 'draft_only', true, 'internal_approved', ${internalApproved}::boolean)
  FROM campaign_upsert
  CROSS JOIN platforms
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    caption = EXCLUDED.caption,
    media_urls = EXCLUDED.media_urls,
    customer_approved = EXCLUDED.customer_approved,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'social_campaign', id, 'social_draft_created', to_jsonb(campaign_upsert)
  FROM campaign_upsert
),
insert_memory AS (
  INSERT INTO agent_memory (agent_key, agent_name, job_id, memory_type, summary, payload)
  SELECT
    'mia_social',
    'Mia',
    job_id,
    'social_draft',
    'Mia drafted social content for completed job ' || job_id || ' with approval status ' || approval_status || '.',
    to_jsonb(campaign_upsert)
  FROM campaign_upsert
)
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'success', true,
      'campaign_id', campaign_upsert.id,
      'job_id', campaign_upsert.job_id,
      'lead_id', campaign_upsert.lead_id,
      'status', campaign_upsert.status,
      'approval_status', campaign_upsert.approval_status,
      'platforms', campaign_upsert.platforms,
      'posts', COALESCE((SELECT jsonb_agg(to_jsonb(post_upsert)) FROM post_upsert), '[]'::jsonb),
      'privacy_notes', campaign_upsert.content->'privacy_notes',
      'next_action', CASE WHEN campaign_upsert.approval_status = 'approved_ready_to_schedule' THEN 'connect_meta_publish_or_schedule' ELSE campaign_upsert.approval_status END
    )
    FROM campaign_upsert
    LIMIT 1
  ),
  jsonb_build_object('success', false, 'status', 'not_found', 'message', 'No completed job matched job_id, invoice_id, or lead_id.')
) AS social_draft;
`;

return [{ json: { sql: query } }];
'@

$prepareApprovalEmailCode = @'
const result = items[0]?.json?.social_draft || items[0]?.json || {};
const posts = Array.isArray(result.posts) ? result.posts : [];
const lines = [
  `Mia social draft: ${result.campaign_id || 'not created'}`,
  `Job: ${result.job_id || ''}`,
  `Approval status: ${result.approval_status || result.status || ''}`,
  '',
  'Draft captions:',
  ...posts.map((p, i) => `${i + 1}. ${p.platform}: ${p.caption}`),
  '',
  'Privacy notes:',
  ...(Array.isArray(result.privacy_notes) ? result.privacy_notes.map(n => `- ${n}`) : ['- Approval and privacy review required.']),
  '',
  `Next action: ${result.next_action || 'review draft'}`
];
return [{ json: { ...result, internal_subject: `Mia social draft ${result.campaign_id || ''}`, internal_message: lines.join('\n') } }];
'@

$reviewCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw.query ?? raw;

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

const now = new Date();
const jobId = first(body.job_id);
const invoiceId = first(body.invoice_id);
const reviewUrl = first(body.review_url, 'https://g.page/r/1pacent-review-placeholder/review');
const channel = first(body.channel, 'email');
const requestId = first(body.review_request_id, `REV-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);

const query = `
WITH resolved AS (
  SELECT
    j.id AS job_id,
    j.customer_id,
    j.status AS job_status,
    l.trade_type,
    l.job_description,
    c.name AS customer_name,
    c.email AS customer_email,
    i.id AS invoice_id,
    i.status AS invoice_status
  FROM jobs j
  LEFT JOIN leads l ON l.id = j.lead_id
  LEFT JOIN customers c ON c.id = j.customer_id
  LEFT JOIN invoices i ON i.job_id = j.id
  WHERE (${sql(jobId)} IS NOT NULL AND j.id = ${sql(jobId)})
     OR (${sql(invoiceId)} IS NOT NULL AND i.id = ${sql(invoiceId)})
  ORDER BY j.created_at DESC
  LIMIT 1
),
created AS (
  INSERT INTO review_requests (id, job_id, customer_id, status, channel, review_url, payload)
  SELECT
    ${sql(requestId)},
    job_id,
    customer_id,
    CASE WHEN customer_email IS NULL THEN 'blocked_missing_email' ELSE 'requested' END,
    ${sql(channel)},
    ${sql(reviewUrl)},
    jsonb_build_object('source_payload', ${jsonSql(body)}, 'invoice_id', invoice_id, 'invoice_status', invoice_status)
  FROM resolved
  WHERE job_id IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    channel = EXCLUDED.channel,
    review_url = EXCLUDED.review_url,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'review_request', id, 'review_request_created', to_jsonb(created)
  FROM created
),
insert_memory AS (
  INSERT INTO agent_memory (agent_key, agent_name, job_id, memory_type, summary, payload)
  SELECT 'mia_social', 'Mia', job_id, 'review_request', 'Mia requested a customer review for job ' || job_id || '.', to_jsonb(created)
  FROM created
),
active_review_template AS (
  SELECT template_key, version, subject_template, body_template
  FROM message_templates
  WHERE template_key = 'review_request_email'
    AND status = 'active'
    AND active = true
  ORDER BY version DESC
  LIMIT 1
)
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'success', true,
      'review_request_id', created.id,
      'job_id', created.job_id,
      'customer_email', resolved.customer_email,
      'customer_name', resolved.customer_name,
      'status', created.status,
      'channel', created.channel,
      'review_url', created.review_url,
      'template_key', (SELECT template_key FROM active_review_template),
      'template_version', (SELECT version FROM active_review_template),
      'template_subject', (SELECT subject_template FROM active_review_template),
      'template_body', (SELECT body_template FROM active_review_template),
      'message', 'Thanks again for choosing 1pacent. If you were happy with the service, would you mind leaving a quick review? ' || created.review_url
    )
    FROM created
    JOIN resolved ON resolved.job_id = created.job_id
    LIMIT 1
  ),
  jsonb_build_object('success', false, 'status', 'not_found', 'message', 'No job matched job_id or invoice_id.')
) AS review_request;
`;

return [{ json: { sql: query } }];
'@

$prepareReviewEmailCode = @'
const result = items[0]?.json?.review_request || items[0]?.json || {};
const variables = {
  customer_name: result.customer_name || 'there',
  review_url: result.review_url || '',
  job_id: result.job_id || '',
  trade_type: result.trade_type || '',
};
function renderTemplate(text) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null ? '' : String(value);
  });
}
const fallbackSubject = 'Thanks from 1pacent - quick review request';
const fallbackMessage = [
  `Hi ${variables.customer_name},`,
  '',
  'Thanks again for choosing 1pacent.',
  'If you were happy with the service, would you mind leaving a quick review?',
  '',
  result.review_url || '',
  '',
  'Thank you,',
  'The 1pacent team'
].join('\n');
return [{
  json: {
    ...result,
    to: result.customer_email || 'admin@1pacent.com',
    message_template_key: result.template_key || 'fallback_review_request_email',
    message_template_version: result.template_version || null,
    subject: result.template_subject ? renderTemplate(result.template_subject) : fallbackSubject,
    message_text: result.template_body ? renderTemplate(result.template_body) : fallbackMessage
  }
}];
'@

$statusCode = @'
const raw = items[0]?.json ?? {};
const q = raw.query ?? raw.body ?? raw;
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
const ref = first(q.campaign_id, q.post_id, q.review_request_id, q.job_id);
const query = `
WITH campaigns AS (
  SELECT * FROM social_campaigns
  WHERE id = ${sql(ref)} OR job_id = ${sql(ref)}
  ORDER BY created_at DESC
  LIMIT 10
),
posts AS (
  SELECT * FROM social_posts
  WHERE campaign_id IN (SELECT id FROM campaigns) OR id = ${sql(ref)}
  ORDER BY created_at DESC
  LIMIT 20
),
reviews AS (
  SELECT * FROM review_requests
  WHERE id = ${sql(ref)} OR job_id = ${sql(ref)}
  ORDER BY created_at DESC
  LIMIT 10
)
SELECT jsonb_build_object(
  'success', true,
  'reference', ${sql(ref)},
  'campaigns', COALESCE((SELECT jsonb_agg(to_jsonb(campaigns)) FROM campaigns), '[]'::jsonb),
  'posts', COALESCE((SELECT jsonb_agg(to_jsonb(posts)) FROM posts), '[]'::jsonb),
  'review_requests', COALESCE((SELECT jsonb_agg(to_jsonb(reviews)) FROM reviews), '[]'::jsonb)
) AS mia_status;
`;
return [{ json: { sql: query } }];
'@

$toolNormaliseCode = @'
const raw = items[0]?.json ?? {};
const data = raw.query ?? raw.body ?? raw;
return [{ json: data }];
'@

$setupNodes = @(
    (New-WebhookNode "Mia Setup Webhook" "agents/mia/setup" "POST" 0 0),
    (New-CodeNode "Build Mia Setup SQL" $setupCode 260 0),
    (New-PostgresNode "Run Mia Setup" 520 0),
    (New-RespondNode "Respond Mia Setup" '={{$json.setup_result || $json}}' 780 0)
)
$setupConnections = @{
    "Mia Setup Webhook" = @{ main = @(, @(@{ node = "Build Mia Setup SQL"; type = "main"; index = 0 })) }
    "Build Mia Setup SQL" = @{ main = @(, @(@{ node = "Run Mia Setup"; type = "main"; index = 0 })) }
    "Run Mia Setup" = @{ main = @(, @(@{ node = "Respond Mia Setup"; type = "main"; index = 0 })) }
}
$setup = Upsert-WorkflowByName "TRADIE-AGENT-940-Mia-Setup" $setupNodes $setupConnections

$draftNodes = @(
    (New-WebhookNode "Mia Social Draft Webhook" "agents/mia/social-draft" "POST" 0 0),
    (New-CodeNode "Build Social Draft SQL" $draftCode 260 0),
    (New-PostgresNode "Save Social Draft" 520 0),
    (New-CodeNode "Prepare Social Approval Email" $prepareApprovalEmailCode 780 0),
    (New-GmailNode "Email Internal Social Draft" "admin@1pacent.com" '={{$json.internal_subject}}' '={{$json.internal_message}}' 1040 -120),
    (New-RespondNode "Respond Social Draft" '={{ { success: $json.success, campaign_id: $json.campaign_id, job_id: $json.job_id, status: $json.status, approval_status: $json.approval_status, posts: $json.posts, next_action: $json.next_action, privacy_notes: $json.privacy_notes } }}' 1040 120)
)
$draftConnections = @{
    "Mia Social Draft Webhook" = @{ main = @(, @(@{ node = "Build Social Draft SQL"; type = "main"; index = 0 })) }
    "Build Social Draft SQL" = @{ main = @(, @(@{ node = "Save Social Draft"; type = "main"; index = 0 })) }
    "Save Social Draft" = @{ main = @(, @(@{ node = "Prepare Social Approval Email"; type = "main"; index = 0 })) }
    "Prepare Social Approval Email" = @{ main = @(, @(
        @{ node = "Email Internal Social Draft"; type = "main"; index = 0 },
        @{ node = "Respond Social Draft"; type = "main"; index = 0 }
    )) }
}
$draft = Upsert-WorkflowByName "TRADIE-SOCIAL-941-Mia-Social-Draft" $draftNodes $draftConnections

$reviewNodes = @(
    (New-WebhookNode "Mia Review Request Webhook" "agents/mia/review-request" "POST" 0 0),
    (New-CodeNode "Build Review Request SQL" $reviewCode 260 0),
    (New-PostgresNode "Save Review Request" 520 0),
    (New-CodeNode "Prepare Review Request Email" $prepareReviewEmailCode 780 0),
    (New-GmailNode "Email Customer Review Request" '={{$json.to}}' '={{$json.subject}}' '={{$json.message_text}}' 1040 -120),
    (New-RespondNode "Respond Review Request" '={{ { success: $json.success, review_request_id: $json.review_request_id, job_id: $json.job_id, status: $json.status, channel: $json.channel, review_url: $json.review_url } }}' 1040 120)
)
$reviewConnections = @{
    "Mia Review Request Webhook" = @{ main = @(, @(@{ node = "Build Review Request SQL"; type = "main"; index = 0 })) }
    "Build Review Request SQL" = @{ main = @(, @(@{ node = "Save Review Request"; type = "main"; index = 0 })) }
    "Save Review Request" = @{ main = @(, @(@{ node = "Prepare Review Request Email"; type = "main"; index = 0 })) }
    "Prepare Review Request Email" = @{ main = @(, @(
        @{ node = "Email Customer Review Request"; type = "main"; index = 0 },
        @{ node = "Respond Review Request"; type = "main"; index = 0 }
    )) }
}
$review = Upsert-WorkflowByName "TRADIE-SOCIAL-942-Mia-Review-Request" $reviewNodes $reviewConnections

$statusNodes = @(
    (New-WebhookNode "Mia Status Webhook" "agents/mia/status" "GET" 0 0),
    (New-CodeNode "Build Mia Status SQL" $statusCode 260 0),
    (New-PostgresNode "Load Mia Status" 520 0),
    (New-RespondNode "Respond Mia Status" '={{$json.mia_status || $json}}' 780 0)
)
$statusConnections = @{
    "Mia Status Webhook" = @{ main = @(, @(@{ node = "Build Mia Status SQL"; type = "main"; index = 0 })) }
    "Build Mia Status SQL" = @{ main = @(, @(@{ node = "Load Mia Status"; type = "main"; index = 0 })) }
    "Load Mia Status" = @{ main = @(, @(@{ node = "Respond Mia Status"; type = "main"; index = 0 })) }
}
$status = Upsert-WorkflowByName "TRADIE-SOCIAL-943-Mia-Status" $statusNodes $statusConnections

$draftToolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Mia Social Draft Tool Is Called" 0 0),
    (New-CodeNode "Normalise Social Draft Tool Input" $toolNormaliseCode 260 0),
    (New-HttpRequestNode "Call Mia Social Draft Endpoint" "POST" "http://localhost:5678/webhook/agents/mia/social-draft" 520 0 "={{ JSON.stringify(`$json) }}")
)
$draftToolConnections = @{
    "When Mia Social Draft Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Social Draft Tool Input"; type = "main"; index = 0 })) }
    "Normalise Social Draft Tool Input" = @{ main = @(, @(@{ node = "Call Mia Social Draft Endpoint"; type = "main"; index = 0 })) }
}
$draftTool = Upsert-WorkflowByName "TRADIE-TOOL-Mia-Social-Draft" $draftToolNodes $draftToolConnections

$reviewToolNodes = @(
    (New-ExecuteWorkflowTriggerNode "When Mia Review Tool Is Called" 0 0),
    (New-CodeNode "Normalise Review Tool Input" $toolNormaliseCode 260 0),
    (New-HttpRequestNode "Call Mia Review Endpoint" "POST" "http://localhost:5678/webhook/agents/mia/review-request" 520 0 "={{ JSON.stringify(`$json) }}")
)
$reviewToolConnections = @{
    "When Mia Review Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Review Tool Input"; type = "main"; index = 0 })) }
    "Normalise Review Tool Input" = @{ main = @(, @(@{ node = "Call Mia Review Endpoint"; type = "main"; index = 0 })) }
}
$reviewTool = Upsert-WorkflowByName "TRADIE-TOOL-Mia-Review-Request" $reviewToolNodes $reviewToolConnections

$agentNodes = @(
    (New-ChatTriggerNode 0 0),
    (New-AgentNode 300 0),
    (New-GeminiModelNode 300 -260),
    (New-MemoryNode 300 260),
    (New-WorkflowToolNode "social_draft" $draftTool.id "Create a privacy-safe social media draft from a completed job. Draft only unless approvals are provided." @{
        job_id = "={{ `$fromAI('job_id', 'job id', 'string') }}"
        invoice_id = "={{ `$fromAI('invoice_id', 'invoice id if known', 'string') }}"
        lead_id = "={{ `$fromAI('lead_id', 'lead id if known', 'string') }}"
        platforms = "={{ `$fromAI('platforms', 'comma separated platforms e.g. instagram,facebook', 'string') }}"
        approved_media_urls = "={{ `$fromAI('approved_media_urls', 'comma separated approved media URLs', 'string') }}"
        customer_approved = "={{ `$fromAI('customer_approved', 'true only if customer approved media usage', 'boolean') }}"
        internal_approved = "={{ `$fromAI('internal_approved', 'true only if internal approval exists', 'boolean') }}"
    } 680 -160),
    (New-WorkflowToolNode "review_request" $reviewTool.id "Create and send a customer review request for a completed job." @{
        job_id = "={{ `$fromAI('job_id', 'job id', 'string') }}"
        invoice_id = "={{ `$fromAI('invoice_id', 'invoice id', 'string') }}"
        review_url = "={{ `$fromAI('review_url', 'review URL', 'string') }}"
        channel = "={{ `$fromAI('channel', 'email sms or app_push', 'string') }}"
    } 680 60),
    (New-WorkflowToolNode "load_business_rules" "BwfXpBfMdl25XEdZ" "Load editable business rules for Mia from Postgres." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key, use mia_social', 'string') }}"
    } 680 280),
    (New-WorkflowToolNode "skills_search" "HMi7xtGQXxMhOCug" "Search reusable business Skills before social/reputation decisions." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key, use mia_social', 'string') }}"
        category = "={{ `$fromAI('category', 'skill category', 'string') }}"
        query = "={{ `$fromAI('query', 'skill search query', 'string') }}"
        limit = "={{ `$fromAI('limit', 'max results', 'number') }}"
    } 980 -160),
    (New-WorkflowToolNode "knowledge_save" "KGK3Cj2E8VCxFBBY" "Save reusable social/reputation lessons to Mia knowledge." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key, use mia_social', 'string') }}"
        collection_key = "={{ `$fromAI('collection_key', 'use reputation_growth', 'string') }}"
        title = "={{ `$fromAI('title', 'knowledge title', 'string') }}"
        content = "={{ `$fromAI('content', 'knowledge content', 'string') }}"
        tags = "={{ `$fromAI('tags', 'comma separated tags', 'string') }}"
        entity_type = "={{ `$fromAI('entity_type', 'entity type', 'string') }}"
        entity_id = "={{ `$fromAI('entity_id', 'entity id', 'string') }}"
        usefulness_score = "={{ `$fromAI('usefulness_score', 'score', 'number') }}"
    } 980 60),
    (New-WorkflowToolNode "memory_save" "W0VvE8kWYzl4vfL3" "Save Mia memory for social/reputation decisions." @{
        agent_key = "={{ `$fromAI('agent_key', 'agent key, use mia_social', 'string') }}"
        agent_name = "={{ `$fromAI('agent_name', 'Mia', 'string') }}"
        memory_type = "={{ `$fromAI('memory_type', 'social_draft review_request recommendation', 'string') }}"
        summary = "={{ `$fromAI('summary', 'short memory summary', 'string') }}"
    } 980 280),
    (New-StickyNoteNode -20 -340)
)

$agentConnections = @{
    "Chat with Mia" = @{ main = @(, @(@{ node = "Mia"; type = "main"; index = 0 })) }
    "Google Gemini Chat Model" = @{ ai_languageModel = @(, @(@{ node = "Mia"; type = "ai_languageModel"; index = 0 })) }
    "Mia Short Memory" = @{ ai_memory = @(, @(@{ node = "Mia"; type = "ai_memory"; index = 0 })) }
    "social_draft" = @{ ai_tool = @(, @(@{ node = "Mia"; type = "ai_tool"; index = 0 })) }
    "review_request" = @{ ai_tool = @(, @(@{ node = "Mia"; type = "ai_tool"; index = 0 })) }
    "load_business_rules" = @{ ai_tool = @(, @(@{ node = "Mia"; type = "ai_tool"; index = 0 })) }
    "skills_search" = @{ ai_tool = @(, @(@{ node = "Mia"; type = "ai_tool"; index = 0 })) }
    "knowledge_save" = @{ ai_tool = @(, @(@{ node = "Mia"; type = "ai_tool"; index = 0 })) }
    "memory_save" = @{ ai_tool = @(, @(@{ node = "Mia"; type = "ai_tool"; index = 0 })) }
}
$agent = Upsert-WorkflowByName "TRADIE-AGENT-944-Mia-Social-Reputation-AI-Agent" $agentNodes $agentConnections

@{
    setup_workflow = $setup | Select-Object name,id,active
    social_draft_workflow = $draft | Select-Object name,id,active
    review_request_workflow = $review | Select-Object name,id,active
    status_workflow = $status | Select-Object name,id,active
    tool_workflows = @(
        ($draftTool | Select-Object name,id,active),
        ($reviewTool | Select-Object name,id,active)
    )
    ai_agent_workflow = $agent | Select-Object name,id,active
    endpoints = @{
        setup = "$BaseUrl/webhook/agents/mia/setup"
        social_draft = "$BaseUrl/webhook/agents/mia/social-draft"
        review_request = "$BaseUrl/webhook/agents/mia/review-request"
        status = "$BaseUrl/webhook/agents/mia/status"
    }
} | ConvertTo-Json -Depth 12
