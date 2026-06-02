$ErrorActionPreference = "Stop"

$BaseUrl = "https://vmi3305336.contaboserver.net"
$WorkflowId = "PztnKwXaz9UjFJSc"
$ApiKey = $env:N8N_API_KEY
if (-not $ApiKey) {
    throw "Set N8N_API_KEY in the environment before running this script."
}

$Headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "accept" = "application/json"
}

$googleSheetsCredential = @{
    id = "O2cMmfdJYPJUEjdb"
    name = "Google Sheets account"
}
$gmailCredential = @{
    id = "Ar5b8h8vd29IBh1g"
    name = "Gmail account"
}
$postgresCredential = @{
    id = "fTq1Q3oE59B59Y0Y"
    name = "Tradie App Postgres"
}

$sheetDocument = @{
    __rl = $true
    value = "1hd3Kf3FkizQ0WCi67NAkPjPMw-paWOIrfyCBwPKzYc0"
    mode = "list"
    cachedResultName = "1pacent Sally Leads"
    cachedResultUrl = "https://docs.google.com/spreadsheets/d/1hd3Kf3FkizQ0WCi67NAkPjPMw-paWOIrfyCBwPKzYc0/edit?usp=drivesdk"
}
$sheetName = @{
    __rl = $true
    value = "gid=0"
    mode = "list"
    cachedResultName = "1pacent Sally Leads"
    cachedResultUrl = "https://docs.google.com/spreadsheets/d/1hd3Kf3FkizQ0WCi67NAkPjPMw-paWOIrfyCBwPKzYc0/edit#gid=0"
}

$schemaColumns = @(
    "created_at",
    "lead_status",
    "customer_name",
    "phone",
    "trade_type",
    "job_description",
    "urgency",
    "address",
    "preferred_time",
    "estimated_price_band",
    "call_summary",
    "source",
    "transcript"
) | ForEach-Object {
    @{
        id = $_
        displayName = $_
        required = $false
        defaultMatch = $false
        display = $true
        type = "string"
        canBeUsedToMatch = $true
        removed = $false
    }
}

$normalizeCode = @'
const raw = items[0]?.json ?? {};
const body = raw.body ?? raw;

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }
  return '';
}

function text(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const customer = body.customer ?? {};
const job = body.job_request ?? body.job ?? {};
const consent = body.consent ?? {};
const analysis = body.analysis ?? {};
const dataCollection = analysis.data_collection_results ?? body.data_collection_results ?? {};
const dynamicVars = body.dynamic_variables ?? body.metadata?.dynamic_variables ?? {};

const now = new Date();
const leadId = first(
  body.lead_id,
  body.external_lead_id,
  `LEAD-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`,
);

const elevenLabsConversationId = first(
  body.conversation_id,
  body.call_id,
  body.elevenlabs_conversation_id,
  body.metadata?.conversation_id,
);
const elevenLabsAgentId = first(
  body.agent_id,
  body.elevenlabs_agent_id,
  body.metadata?.agent_id,
  'agent_4601krtt5j3xf26ac865kpe19yvp',
);

const customerName = first(
  customer.name,
  body.customer_name,
  dataCollection.customer_name?.value,
  dynamicVars.customer_name,
  'Unknown caller',
);
const phone = first(
  customer.mobile,
  customer.phone,
  body.caller_number,
  body.phone,
  body.from,
  dataCollection.phone?.value,
  dynamicVars.phone,
);
const email = first(customer.email, body.email, dataCollection.email?.value, dynamicVars.email);
const emailConfirmedRaw = first(body.email_confirmed, dataCollection.email_confirmed?.value, dynamicVars.email_confirmed, false);
const emailConfirmed = emailConfirmedRaw === true || String(emailConfirmedRaw).toLowerCase() === 'true' || String(emailConfirmedRaw).toLowerCase() === 'yes';
const tradeType = first(job.category, body.trade_type, body.category, dataCollection.trade_type?.value, dynamicVars.trade_type, 'unspecified');
const jobDescription = first(job.description, body.job_description, body.description, dataCollection.job_description?.value, dynamicVars.job_description);
const urgency = first(job.urgency, body.urgency, dataCollection.urgency?.value, dynamicVars.urgency, 'normal');
const address = first(customer.address, body.address, dataCollection.address?.value, dynamicVars.address);
const preferredTime = first(job.preferred_times, body.preferred_time, body.preferred_times, dataCollection.preferred_time?.value, dynamicVars.preferred_time);
const priceBand = first(body.estimated_price_band, body.price_band, dataCollection.estimated_price_band?.value, dynamicVars.estimated_price_band, 'To be estimated');
const transcript = first(body.transcript, body.call_transcript, analysis.transcript, body.messages);
const channel = first(body.channel, body.source, elevenLabsConversationId ? 'elevenlabs_sally' : 'unknown');

const contactConsent = first(consent.contact_consent, body.contact_consent, elevenLabsConversationId ? true : '');
const privacyConsent = first(consent.privacy_consent, body.privacy_consent, elevenLabsConversationId ? true : '');
const missing = [];
if (!phone) missing.push('phone');
if (!email) missing.push('email');
if (email && !emailConfirmed) missing.push('email_confirmation');
if (!jobDescription) missing.push('job_description');
if (!address) missing.push('address');
if (!preferredTime) missing.push('preferred_time');

let qualityScore = 100 - missing.length * 15;
if (!email) qualityScore -= 5;
if (urgency === 'emergency' || urgency === 'urgent') qualityScore += 5;
qualityScore = Math.max(0, Math.min(100, qualityScore));

const consentStatus = contactConsent && privacyConsent ? 'consent_recorded' : 'consent_needs_review';
let status = missing.length ? 'Needs Info' : 'Lead Captured';
if (!missing.length && email && emailConfirmed && preferredTime) {
  status = 'Booking Request Confirmation Sent';
} else if (email && !emailConfirmed) {
  status = 'Email Confirmation Required';
} else if (!email) {
  status = 'Email Required For Booking Confirmation';
}

const callSummaryParts = [
  `Lead ID: ${leadId}`,
  `Customer: ${customerName}`,
  `Trade: ${tradeType}`,
  `Urgency: ${urgency}`,
  `Quality score: ${qualityScore}`,
  `Consent: ${consentStatus}`,
];
if (email) callSummaryParts.push(`Email: ${email}`);
callSummaryParts.push(`Email confirmed: ${emailConfirmed ? 'yes' : 'no'}`);
if (elevenLabsConversationId) callSummaryParts.push(`ElevenLabs conversation: ${elevenLabsConversationId}`);
if (elevenLabsAgentId) callSummaryParts.push(`ElevenLabs agent: ${elevenLabsAgentId}`);
if (missing.length) callSummaryParts.push(`Missing: ${missing.join(', ')}`);
if (body.call_summary) callSummaryParts.push(`Sally summary: ${body.call_summary}`);

return [{
  json: {
    lead_id: leadId,
    tenant_id: first(body.tenant_id, dynamicVars.tenant_id, 'TENANT-001'),
    created_at: now.toISOString(),
    lead_status: status,
    customer_name: text(customerName),
    phone: text(phone),
    email: text(email),
    email_confirmed: emailConfirmed,
    trade_type: text(tradeType),
    job_description: text(jobDescription),
    urgency: text(urgency),
    address: text(address),
    preferred_time: text(preferredTime),
    estimated_price_band: text(priceBand),
    call_summary: callSummaryParts.join(' | '),
    source: text(channel),
    transcript: text(transcript),
    lead_quality_score: qualityScore,
    missing_information: missing,
    consent_status: consentStatus,
    elevenlabs_conversation_id: text(elevenLabsConversationId),
    elevenlabs_agent_id: text(elevenLabsAgentId),
    next_action: missing.length ? 'qualify_lead' : (email && emailConfirmed && preferredTime ? 'tradie_confirm_quote' : 'collect_confirmed_email_and_preferred_time'),
    customer_confirmation_email_status: email && emailConfirmed ? 'queued' : (email ? 'blocked_email_not_confirmed' : 'missing_email'),
    customer_message: missing.length
      ? `Thanks ${customerName}. Sally has captured your request and will confirm ${missing[0].replace('_', ' ')} next.`
      : `Thanks ${customerName}. Sally has captured your request and the team will review it shortly.`,
  },
}];
'@

$prepareCustomerConfirmationCode = @'
const lead = items[0]?.json ?? {};

if (!lead.email || !lead.email_confirmed) {
  return [];
}

const subject = `Booking request received: ${lead.trade_type || 'Tradie'} job ${lead.lead_id}`;
const trackingUrl = `https://app.1pacent.com/job-status?lead_id=${encodeURIComponent(lead.lead_id || '')}`;
const message = [
  `Hi ${lead.customer_name || 'there'},`,
  '',
  'Thanks for speaking with Sally. We have received your booking request.',
  '',
  `Lead reference: ${lead.lead_id}`,
  `Job type: ${lead.trade_type || 'To be confirmed'}`,
  `Job details: ${lead.job_description || 'To be confirmed'}`,
  `Location: ${lead.address || 'To be confirmed'}`,
  `Preferred time: ${lead.preferred_time || 'To be confirmed'}`,
  `Urgency: ${lead.urgency || 'normal'}`,
  `Indicative price band: ${lead.estimated_price_band || 'To be estimated'}`,
  '',
  'Important: this is a booking request confirmation, not a fixed-price quote. The tradie will confirm scope, timing, and final pricing before any work begins.',
  '',
  'Our team will be in touch shortly.',
  '',
  `Track your request here: ${trackingUrl}`,
  '',
  'Need to change your booking request? Call Sally back and quote your lead reference.',
  '',
  'Thanks,',
  '1pacent',
].join('\n');

return [{
  json: {
    ...lead,
    customer_tracking_url: trackingUrl,
    confirmation_subject: subject,
    confirmation_message: message,
  },
}]; 
'@

$buildConfirmationTemplatePayloadCode = @'
const lead = items[0]?.json ?? {};
return [{
  json: {
    template_key: 'booking_request_confirmation_email',
    trade_type: lead.trade_type || '',
    payload: {
      ...lead,
      entity_type: 'lead',
      entity_id: lead.lead_id || '',
      customer_name: lead.customer_name || 'there',
      lead_id: lead.lead_id || '',
      trade_type: lead.trade_type || 'To be confirmed',
      job_description: lead.job_description || 'To be confirmed',
      preferred_time: lead.preferred_time || 'To be confirmed',
      address: lead.address || 'To be confirmed',
      estimated_price_band: lead.estimated_price_band || 'To be estimated',
      tracking_url: lead.customer_tracking_url || `https://app.1pacent.com/job-status?lead_id=${encodeURIComponent(lead.lead_id || '')}`,
      fallback_subject: lead.confirmation_subject,
      fallback_message: lead.confirmation_message,
    },
  },
}];
'@

$applyConfirmationTemplateCode = @'
const rendered = items[0]?.json || {};
const lead = rendered.payload || {};
return [{
  json: {
    ...lead,
    message_template_key: rendered.template_key || 'fallback_booking_request_confirmation_email',
    message_template_version: rendered.version || null,
    confirmation_subject: rendered.subject || lead.fallback_subject || lead.confirmation_subject,
    confirmation_message: rendered.body || lead.fallback_message || lead.confirmation_message,
  },
}];
'@

$buildLeadDatabaseSqlCode = @'
const lead = items[0]?.json ?? {};

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlBool(value) {
  return value ? 'true' : 'false';
}

function sqlInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? String(parsed) : 'NULL';
}

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const customerEmail = lead.email || `${lead.lead_id || Date.now()}@missing-email.local`;
const customerPhone = lead.phone || `${lead.lead_id || Date.now()}-missing-phone`;

const query = `
WITH upsert_customer AS (
  INSERT INTO customers (name, phone, email, email_confirmed, address, updated_at)
  VALUES (
    ${sql(lead.customer_name || 'Unknown Customer')},
    ${sql(customerPhone)},
    ${sql(customerEmail)},
    ${sqlBool(lead.email_confirmed)},
    ${sql(lead.address)},
    now()
  )
  ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    email_confirmed = EXCLUDED.email_confirmed,
    address = EXCLUDED.address,
    updated_at = now()
  RETURNING id
),
upsert_lead AS (
  INSERT INTO leads (
    id, customer_id, tenant_id, source, trade_type, job_description, urgency,
    address, preferred_time, estimated_price_band, status, lead_quality_score,
    consent_status, next_action, updated_at
  )
  SELECT
    ${sql(lead.lead_id)},
    id,
    ${sql(lead.tenant_id || 'TENANT-001')},
    ${sql(lead.source)},
    ${sql(lead.trade_type)},
    ${sql(lead.job_description)},
    ${sql(lead.urgency)},
    ${sql(lead.address)},
    ${sql(lead.preferred_time)},
    ${sql(lead.estimated_price_band)},
    ${sql(lead.lead_status)},
    ${sqlInt(lead.lead_quality_score)},
    ${sql(lead.consent_status)},
    ${sql(lead.next_action)},
    now()
  FROM upsert_customer
  ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    source = EXCLUDED.source,
    trade_type = EXCLUDED.trade_type,
    job_description = EXCLUDED.job_description,
    urgency = EXCLUDED.urgency,
    address = EXCLUDED.address,
    preferred_time = EXCLUDED.preferred_time,
    estimated_price_band = EXCLUDED.estimated_price_band,
    status = EXCLUDED.status,
    lead_quality_score = EXCLUDED.lead_quality_score,
    consent_status = EXCLUDED.consent_status,
    next_action = EXCLUDED.next_action,
    updated_at = now()
  RETURNING id, customer_id
),
insert_agent_interaction AS (
  INSERT INTO agent_interactions (
    agent_name, customer_id, lead_id, conversation_id, transcript, summary, payload
  )
  SELECT
    'Sally',
    customer_id,
    id,
    ${sql(lead.elevenlabs_conversation_id)},
    ${sql(lead.transcript)},
    ${sql(lead.call_summary)},
    ${jsonSql(lead)}
  FROM upsert_lead
  RETURNING id
),
insert_workflow_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT
    'lead',
    id,
    'lead_captured',
    ${jsonSql(lead)}
  FROM upsert_lead
)
SELECT id AS lead_id, customer_id FROM upsert_lead;
`;

return [{ json: { ...lead, sql: query } }];
'@

$nodes = @(
    @{
        parameters = @{
            httpMethod = "POST"
            path = "leads/capture"
            responseMode = "responseNode"
            options = @{}
        }
        type = "n8n-nodes-base.webhook"
        typeVersion = 2.1
        position = @(0, 0)
        id = "a2e19b0f-2aaf-cec2-e348-7dae5a67680e"
        name = "Lead Capture Webhook"
        webhookId = "a2e19b0f-2aaf-cec2-e348-7dae5a67680e"
    },
    @{
        parameters = @{
            jsCode = $normalizeCode
        }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(260, 0)
        id = "4d297d5f-97e3-4a43-9fa3-786782991701"
        name = "Normalize App or ElevenLabs Lead"
    },
    @{
        parameters = @{
            jsCode = $buildLeadDatabaseSqlCode
        }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(540, -220)
        id = "834b4b1b-13f0-4387-888f-766659f00e82"
        name = "Build Lead Database SQL"
    },
    @{
        parameters = @{
            operation = "executeQuery"
            query = '={{$json.sql}}'
            options = @{}
        }
        type = "n8n-nodes-base.postgres"
        typeVersion = 2.6
        position = @(820, -220)
        id = "393f114c-bd95-414c-9ee2-cf91c39a1b02"
        name = "Save Lead to Postgres"
        credentials = @{
            postgres = $postgresCredential
        }
    },
    @{
        parameters = @{
            operation = "append"
            documentId = $sheetDocument
            sheetName = $sheetName
            columns = @{
                mappingMode = "defineBelow"
                value = @{
                    created_at = '={{$json.created_at}}'
                    lead_status = '={{$json.lead_status}}'
                    customer_name = '={{$json.customer_name}}'
                    phone = '={{$json.phone}}'
                    trade_type = '={{$json.trade_type}}'
                    job_description = '={{$json.job_description}}'
                    urgency = '={{$json.urgency}}'
                    address = '={{$json.address}}'
                    preferred_time = '={{$json.preferred_time}}'
                    estimated_price_band = '={{$json.estimated_price_band}}'
                    call_summary = '={{$json.call_summary}}'
                    source = '={{$json.source}}'
                    transcript = '={{$json.transcript}}'
                }
                matchingColumns = @()
                schema = $schemaColumns
                attemptToConvertTypes = $false
                convertFieldsToString = $false
            }
            options = @{}
        }
        type = "n8n-nodes-base.googleSheets"
        typeVersion = 4.7
        position = @(540, 0)
        id = "7ee5dd53-2154-4ff2-9651-d56c5361d764"
        name = "Append Lead to Sally Sheet"
        credentials = @{
            googleSheetsOAuth2Api = $googleSheetsCredential
        }
    },
    @{
        parameters = @{
            sendTo = "mac@1pacent.com"
            subject = '=New Sally Lead {{$json.lead_id}}: {{$json.customer_name}} - {{$json.trade_type}}'
            emailType = "text"
            message = '=New lead captured by Sally / Tradie App

Lead ID: {{$json.lead_id}}
Status: {{$json.lead_status}}
Quality score: {{$json.lead_quality_score}}
Next action: {{$json.next_action}}

Customer: {{$json.customer_name}}
Phone: {{$json.phone}}
Email: {{$json.email}}
Address: {{$json.address}}
Preferred time: {{$json.preferred_time}}

Trade: {{$json.trade_type}}
Urgency: {{$json.urgency}}
Price band: {{$json.estimated_price_band}}

Job: {{$json.job_description}}

Summary: {{$json.call_summary}}

Missing information: {{$json.missing_information.join(", ") || "None"}}
Source: {{$json.source}}
ElevenLabs conversation: {{$json.elevenlabs_conversation_id || "N/A"}}'
            options = @{}
        }
        type = "n8n-nodes-base.gmail"
        typeVersion = 2.2
        position = @(820, 0)
        id = "8af5d048-e076-4af6-8a4c-5598327409b7"
        name = "Email Lead Notification"
        credentials = @{
            gmailOAuth2 = $gmailCredential
        }
    },
    @{
        parameters = @{
            respondWith = "json"
            responseBody = '={{ { success: true, lead_id: $json.lead_id, lead_status: $json.lead_status, lead_quality_score: $json.lead_quality_score, missing_information: $json.missing_information, next_action: $json.next_action, customer_confirmation_email_status: $json.customer_confirmation_email_status, customer_message: $json.customer_message } }}'
            options = @{}
        }
        type = "n8n-nodes-base.respondToWebhook"
        typeVersion = 1.5
        position = @(1100, 0)
        id = "59d08eb7-4cfb-4706-860b-2459bb35b959"
        name = "Respond to Lead Source"
    },
    @{
        parameters = @{
            jsCode = $prepareCustomerConfirmationCode
        }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(820, 220)
        id = "c4e83b02-1ead-4f4a-8487-f96f2629bc3a"
        name = "Prepare Customer Confirmation Email"
    },
    @{
        parameters = @{
            jsCode = $buildConfirmationTemplatePayloadCode
        }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(1100, 220)
        id = "35f26d44-f91a-4ef1-8727-8a467380f182"
        name = "Build Confirmation Template Payload"
    },
    @{
        parameters = @{
            method = "POST"
            url = "http://localhost:5678/webhook/core/message-templates/render"
            sendBody = $true
            contentType = "json"
            specifyBody = "json"
            jsonBody = "={{ JSON.stringify(`$json) }}"
            options = @{ timeout = 30000 }
        }
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
        position = @(1380, 220)
        id = "d155b3dc-26fb-47c8-8f05-cb38a1e21d9a"
        name = "Render Confirmation Template"
    },
    @{
        parameters = @{
            jsCode = $applyConfirmationTemplateCode
        }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @(1660, 220)
        id = "b85ec299-a6cb-41d5-8882-13d24f5c736e"
        name = "Apply Confirmation Template"
    },
    @{
        parameters = @{
            sendTo = '={{$json.email}}'
            subject = '={{$json.confirmation_subject}}'
            emailType = "text"
            message = '={{$json.confirmation_message}}'
            options = @{}
        }
        type = "n8n-nodes-base.gmail"
        typeVersion = 2.2
        position = @(1940, 220)
        id = "fd6d8e98-b9fb-4a51-acce-52e7d73f7dfd"
        name = "Email Customer Confirmation"
        credentials = @{
            gmailOAuth2 = $gmailCredential
        }
    }
)

$connections = @{
    "Lead Capture Webhook" = @{
        main = @(, @(@{ node = "Normalize App or ElevenLabs Lead"; type = "main"; index = 0 }))
    }
    "Normalize App or ElevenLabs Lead" = @{
        main = @(, @(
            @{ node = "Build Lead Database SQL"; type = "main"; index = 0 },
            @{ node = "Append Lead to Sally Sheet"; type = "main"; index = 0 },
            @{ node = "Email Lead Notification"; type = "main"; index = 0 },
            @{ node = "Prepare Customer Confirmation Email"; type = "main"; index = 0 },
            @{ node = "Respond to Lead Source"; type = "main"; index = 0 }
        ))
    }
    "Build Lead Database SQL" = @{
        main = @(, @(@{ node = "Save Lead to Postgres"; type = "main"; index = 0 }))
    }
    "Prepare Customer Confirmation Email" = @{
        main = @(, @(@{ node = "Build Confirmation Template Payload"; type = "main"; index = 0 }))
    }
    "Build Confirmation Template Payload" = @{
        main = @(, @(@{ node = "Render Confirmation Template"; type = "main"; index = 0 }))
    }
    "Render Confirmation Template" = @{
        main = @(, @(@{ node = "Apply Confirmation Template"; type = "main"; index = 0 }))
    }
    "Apply Confirmation Template" = @{
        main = @(, @(@{ node = "Email Customer Confirmation"; type = "main"; index = 0 }))
    }
}

$payload = @{
    name = "TRADIE-LEADS-010-Capture-New-Lead"
    nodes = $nodes
    connections = $connections
    settings = @{
        executionOrder = "v1"
        timezone = "Australia/Sydney"
        callerPolicy = "workflowsFromSameOwner"
        availableInMCP = $true
    }
}

$body = $payload | ConvertTo-Json -Depth 100
$localPath = Join-Path $PSScriptRoot "n8n-workflows\tradie-leads-010-capture-new-lead-live.json"
$body | Set-Content -LiteralPath $localPath -Encoding UTF8

$updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$WorkflowId" -Headers $Headers -Method Put -Body $body -ContentType "application/json"
$updated | ConvertTo-Json -Depth 20
