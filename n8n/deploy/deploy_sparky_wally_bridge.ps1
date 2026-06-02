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

function New-HttpNode($Name, $Url, $X, $Y, $Continue = $false) {
    return @{
        parameters = @{
            method = "POST"
            url = $Url
            sendBody = $true
            contentType = "json"
            specifyBody = "json"
            jsonBody = '={{ JSON.stringify($json) }}'
            options = @{ timeout = 30000 }
        }
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = $Name
        continueOnFail = $Continue
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

function Get-AllWorkflows {
    $url = "$BaseUrl/api/v1/workflows?limit=100"
    $items = @()
    do {
        $page = Invoke-RestMethod -Uri $url -Headers $Headers -Method Get
        $items += $page.data
        if ($page.nextCursor) { $url = "$BaseUrl/api/v1/workflows?limit=100&cursor=$($page.nextCursor)" } else { $url = $null }
    } while ($url)
    return $items
}

function Upsert-WorkflowByName($WorkflowName, $Nodes, $Connections) {
    $existing = Get-AllWorkflows | Where-Object { $_.name -eq $WorkflowName } | Sort-Object -Property active -Descending | Select-Object -First 1
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
        if ($existing.active) {
            Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($existing.id)/deactivate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
        }
        $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($existing.id)" -Headers $Headers -Method Put -Body $body -ContentType "application/json"
    } else {
        $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows" -Headers $Headers -Method Post -Body $body -ContentType "application/json"
    }
    Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($updated.id)/activate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
    return $updated
}

function Update-WorkOrderIntakeWallyUrl($NewUrl) {
    $wf = Get-AllWorkflows | Where-Object { $_.name -eq "TRADIE-RENTAL-101-Work-Order-Intake-Approval-Rules" } | Sort-Object -Property active -Descending | Select-Object -First 1
    if (-not $wf) { return @{ updated = $false; reason = "Work order intake workflow not found." } }
    $full = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($wf.id)" -Headers $Headers -Method Get
    $node = $full.nodes | Where-Object { $_.name -eq "Call Wally Warranty Guard" } | Select-Object -First 1
    if (-not $node) { return @{ updated = $false; reason = "Call Wally Warranty Guard node not found."; workflow_id = $wf.id } }
    $oldUrl = $node.parameters.url
    $node.parameters.url = $NewUrl
    $payload = @{
        name = $full.name
        nodes = $full.nodes
        connections = $full.connections
        settings = $full.settings
    }
    if ($wf.active) {
        Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($wf.id)/deactivate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
    }
    $body = $payload | ConvertTo-Json -Depth 100
    $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($wf.id)" -Headers $Headers -Method Put -Body $body -ContentType "application/json"
    Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($updated.id)/activate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
    return @{ updated = $true; workflow_id = $updated.id; old_url = $oldUrl; new_url = $NewUrl }
}

$sparkyContextSqlCode = @'
const raw = $input.first()?.json || {};
const body = raw.body || raw;
const esc = (v) => String(v ?? '').replace(/'/g, "''");
const workOrderId = body.work_order_id || body.workOrderId || '';
if (!workOrderId) {
  return [{ json: { context_result: { found: false, input: body } } }];
}
const sql = `
SELECT jsonb_build_object(
  'found', true,
  'input', '${esc(JSON.stringify(body))}'::jsonb,
  'work_order', to_jsonb(wo),
  'property', CASE WHEN rp.id IS NULL THEN NULL ELSE to_jsonb(rp) END,
  'latest_repeat_review', (
    SELECT to_jsonb(rir)
    FROM repeat_issue_reviews rir
    WHERE rir.work_order_id = wo.id
    ORDER BY rir.created_at DESC
    LIMIT 1
  ),
  'active_warranty', (
    SELECT to_jsonb(w)
    FROM work_order_warranties w
    WHERE w.property_id = wo.property_id
      AND lower(coalesce(w.trade_type,'')) = lower(coalesce(wo.trade_type,''))
      AND lower(coalesce(w.job_type,'')) = lower(coalesce(wo.job_type,''))
      AND w.status = 'active'
    ORDER BY w.warranty_end DESC NULLS LAST, w.created_at DESC
    LIMIT 1
  )
) AS context_result
FROM work_orders wo
LEFT JOIN rental_properties rp ON rp.id = wo.property_id
WHERE wo.id = '${esc(workOrderId)}'
LIMIT 1;`;
return [{ json: { sql, input: body } }];
'@

$prepareAuthoritySearchCode = @'
const raw = $input.first()?.json || {};
const context = raw.context_result || { found: false, input: raw.input || {} };
const input = context.input || {};
const workOrder = context.work_order || {};
const property = context.property || {};
const repeat = context.latest_repeat_review || {};
const warranty = context.active_warranty || {};
const tradeType = input.trade_type || workOrder.trade_type || warranty.trade_type || '';
const jobType = input.job_type || workOrder.job_type || warranty.job_type || '';
const description = input.description || workOrder.description || '';
const jurisdiction = input.jurisdiction || property.state || 'AU';
const query = [
  'electrical rental maintenance safety compliance warranty consumer guarantee repeat repair',
  tradeType,
  jobType,
  description,
  repeat.warranty_candidate ? 'warranty candidate repeated issue' : '',
  warranty.warranty_key ? 'active workmanship parts warranty no duplicate landlord charge' : ''
].filter(Boolean).join(' ');
return [{
  json: {
    agent_key: 'sparky_electrical',
    industry: 'rental_property_management',
    trade_type: tradeType || 'electrical',
    jurisdiction,
    query,
    limit: 5,
    sparky_context: context
  }
}];
'@

$buildSparkyReviewCode = @'
const search = $input.first()?.json || {};
const context = $node["Prepare Authority Search"].json.sparky_context || {};
const input = context.input || {};
const wo = context.work_order || {};
const property = context.property || {};
const repeat = context.latest_repeat_review || {};
const warranty = context.active_warranty || {};

const text = [
  input.trade_type, input.job_type, input.description,
  wo.trade_type, wo.job_type, wo.description
].filter(Boolean).join(' ').toLowerCase();

const isElectrical = /electrical|electrician|power|switch|switchboard|outlet|power point|powerpoint|light|lighting|circuit|breaker|safety switch|rcd|smoke alarm|fan|oven|cooktop|ev charger/.test(text);
const danger = /shock|sparking|burning|burnt|smoke|live wire|exposed wire|fire|tripping|no power|switchboard|safety switch|rcd|water.*power|power.*water/.test(text);
const repeatIssue = Boolean(input.repeat_issue || repeat.warranty_candidate || warranty.warranty_key || Number(input.previous_repair_days_ago || 9999) <= 30);

let status = 'answered';
if (danger) status = 'unsafe_do_not_proceed';
else if (isElectrical || repeatIssue) status = 'needs_qualified_review';

let safetyRisk = 'low';
if (danger) safetyRisk = 'high';
else if (isElectrical) safetyRisk = 'medium';

const authorityReferences = (search.results || search.matches || search.documents || []).slice(0, 5).map((r) => {
  const meta = r.metadata || r.document?.metadata || r;
  return {
    authority_document_key: meta.authority_document_key || meta.document_key || null,
    chunk_key: meta.chunk_key || null,
    jurisdiction: meta.jurisdiction || null,
    current_version: meta.current_version || meta.version || null,
    source_url: meta.source_url || null,
    score: r.score || r.similarity || null
  };
}).filter((r) => r.authority_document_key || r.source_url);

const evidenceChecklist = [
  'tenant description of the symptom, timing, and whether it is a repeat issue',
  'before photos or short video where safe to capture without touching electrical equipment',
  'previous work order, invoice, warranty terms, and parts used if this may be rework',
  'tradie attendance notes, diagnosis, test results where applicable, and safety observations',
  'part brand, model, serial number, purchase date, and warranty status where a part is involved',
  'after photos, completion notes, and any compliance or certificate reference'
];

const landlordGuardrail = repeatIssue
  ? 'review_warranty_consumer_guarantees_and_previous_tradie_before_new_landlord_charge'
  : danger
    ? 'safety_review_before_quote_or_charge'
    : 'standard_quote_path_with_authority_evidence';

const wallyInstruction = repeatIssue
  ? 'Hold new landlord charges until warranty/repeat issue review is complete. Prefer previous tradie for inspection/rework unless unsafe, unavailable, conflicted, or manager override is recorded.'
  : 'Continue standard rental maintenance flow, but keep electrical safety evidence attached.';

const customerSafeWording = danger
  ? 'For safety, please do not touch the affected electrical item. A licensed electrician needs to review this before anyone proceeds.'
  : repeatIssue
    ? 'Because this may relate to recent work, we will check the previous repair and warranty position before any new charge is approved.'
    : 'A qualified electrician will confirm the scope and final price before any electrical work proceeds.';

const reviewKey = `SPARKY-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
const review = {
  success: true,
  agent_key: 'sparky_electrical',
  review_key: reviewKey,
  work_order_id: input.work_order_id || wo.id || null,
  jurisdiction: input.jurisdiction || property.state || 'AU',
  trade_type: input.trade_type || wo.trade_type || 'electrical',
  job_type: input.job_type || wo.job_type || null,
  status,
  safety_risk: safetyRisk,
  repeat_issue: repeatIssue,
  qualified_review_required: Boolean(isElectrical || danger),
  landlord_charge_guardrail: landlordGuardrail,
  scheduling_guardrail: repeatIssue ? 'previous_tradie_or_warranty_rework_first' : 'standard_electrical_scheduling',
  next_action: danger
    ? 'licensed_electrician_safety_review_required'
    : repeatIssue
      ? 'route_to_previous_tradie_for_warranty_review'
      : 'continue_standard_quote_and_schedule_flow',
  wally_instruction: wallyInstruction,
  evidence_checklist: evidenceChecklist,
  authority_references: authorityReferences,
  customer_safe_wording: customerSafeWording,
  note: 'Sparky does not provide DIY electrical instructions. This is workflow guidance for qualified tradies and internal agents, not legal advice.',
  created_at: new Date().toISOString()
};
return [{ json: { sparky_review_result: review } }];
'@

$saveSparkyReviewSqlCode = @'
const review = $input.first()?.json?.sparky_review_result || {};
const esc = (v) => String(v ?? '').replace(/'/g, "''");
const workOrderId = review.work_order_id || '';
const payload = JSON.stringify(review);
const eventEntityId = workOrderId || review.review_key;
const sql = `
WITH review_payload AS (
  SELECT
    '${esc(workOrderId)}'::text AS work_order_id,
    '${esc(review.review_key || ('SPARKY-' + Date.now()))}'::text AS review_key,
    '${esc(eventEntityId)}'::text AS event_entity_id,
    '${esc(payload)}'::jsonb AS payload
),
updated_work_order AS (
  UPDATE work_orders
  SET payload = coalesce(work_orders.payload, '{}'::jsonb) || jsonb_build_object('latest_sparky_review', review_payload.payload),
      updated_at = now()
  FROM review_payload
  WHERE work_orders.id = review_payload.work_order_id
  RETURNING work_orders.id
),
saved_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'work_order', event_entity_id, 'sparky_electrical_reviewed', payload
  FROM review_payload
  RETURNING id
)
SELECT payload AS sparky_review_result FROM review_payload;`;
return [{ json: { sql } }];
'@

$wrapperPrepareSparkyCode = @'
const original = $node["Rental Warranty With Sparky Webhook"].json.body || $node["Rental Warranty With Sparky Webhook"].json || {};
const wally = $input.first()?.json || {};
const workOrder = wally.work_order || wally.work_order_result || {};
return [{
  json: {
    work_order_id: original.work_order_id || wally.work_order_id || workOrder.id,
    trade_type: original.trade_type || wally.trade_type || workOrder.trade_type || 'electrical',
    job_type: original.job_type || wally.job_type || workOrder.job_type,
    description: original.description || wally.description || workOrder.description,
    jurisdiction: original.jurisdiction || wally.jurisdiction || 'AU',
    repeat_issue: Boolean(original.repeat_issue || wally.warranty_candidate || wally.repeat_issue),
    previous_repair_days_ago: original.previous_repair_days_ago,
    wally_review: wally
  }
}];
'@

$wrapperMergeCode = @'
const wally = $node["Call Wally Warranty Guard"].json || {};
const sparkyRaw = $input.first()?.json || {};
const sparky = sparkyRaw.sparky_review_result || sparkyRaw;
const enriched = {
  ...wally,
  sparky_review: sparky,
  sme_reviews: {
    ...(wally.sme_reviews || {}),
    sparky_electrical: sparky
  },
  safety_risk: sparky.safety_risk || wally.safety_risk,
  landlord_charge_recommendation: sparky.landlord_charge_guardrail || wally.landlord_charge_recommendation,
  scheduling_constraint: sparky.scheduling_guardrail || wally.scheduling_constraint,
  next_action: sparky.next_action || wally.next_action,
  customer_safe_language: sparky.customer_safe_wording || wally.customer_safe_language,
  notes: [
    wally.note,
    sparky.note ? `Sparky: ${sparky.note}` : null
  ].filter(Boolean)
};
return [{ json: { warranty_review_with_sparky_result: enriched } }];
'@

$wrapperPrepareWallyCode = @'
const raw = $input.first()?.json || {};
return [{ json: raw.body || raw }];
'@

$sparkyNodes = @(
    (New-WebhookNode "Sparky Electrical Review Webhook" "agents/sparky/electrical-review" "POST" 0 0),
    (New-CodeNode "Build Sparky Context SQL" $sparkyContextSqlCode 260 0),
    (New-PostgresNode "Fetch Work Order Context" 520 0),
    (New-CodeNode "Prepare Authority Search" $prepareAuthoritySearchCode 780 0),
    (New-HttpNode "Authority Documents Semantic Search" "http://n8n:5678/webhook/core/authority-documents/qdrant/search" 1040 0 $true),
    (New-CodeNode "Build Sparky Electrical Review" $buildSparkyReviewCode 1300 0),
    (New-CodeNode "Build Save Sparky Review SQL" $saveSparkyReviewSqlCode 1560 0),
    (New-PostgresNode "Save Sparky Review" 1820 0),
    (New-RespondNode "Respond Sparky Electrical Review" '={{$node["Build Sparky Electrical Review"].json.sparky_review_result}}' 2080 0)
)
$sparkyConnections = @{
    "Sparky Electrical Review Webhook" = @{ main = @(, @(@{ node = "Build Sparky Context SQL"; type = "main"; index = 0 })) }
    "Build Sparky Context SQL" = @{ main = @(, @(@{ node = "Fetch Work Order Context"; type = "main"; index = 0 })) }
    "Fetch Work Order Context" = @{ main = @(, @(@{ node = "Prepare Authority Search"; type = "main"; index = 0 })) }
    "Prepare Authority Search" = @{ main = @(, @(@{ node = "Authority Documents Semantic Search"; type = "main"; index = 0 })) }
    "Authority Documents Semantic Search" = @{ main = @(, @(@{ node = "Build Sparky Electrical Review"; type = "main"; index = 0 })) }
    "Build Sparky Electrical Review" = @{ main = @(, @(@{ node = "Build Save Sparky Review SQL"; type = "main"; index = 0 })) }
    "Build Save Sparky Review SQL" = @{ main = @(, @(@{ node = "Save Sparky Review"; type = "main"; index = 0 })) }
    "Save Sparky Review" = @{ main = @(, @(@{ node = "Respond Sparky Electrical Review"; type = "main"; index = 0 })) }
}
$sparkyWorkflow = Upsert-WorkflowByName "TRADIE-AGENT-942-Sparky-Electrical-Review" $sparkyNodes $sparkyConnections

$wrapperNodes = @(
    (New-WebhookNode "Rental Warranty With Sparky Webhook" "rental/warranty/review-with-sparky" "POST" 0 0),
    (New-CodeNode "Prepare Wally Warranty Handoff" $wrapperPrepareWallyCode 260 0),
    (New-HttpNode "Call Wally Warranty Guard" "http://n8n:5678/webhook/rental/warranty/review" 520 0 $true),
    (New-CodeNode "Prepare Sparky Warranty Handoff" $wrapperPrepareSparkyCode 780 0),
    (New-HttpNode "Call Sparky Electrical Review" "http://n8n:5678/webhook/agents/sparky/electrical-review" 1040 0 $true),
    (New-CodeNode "Merge Wally And Sparky" $wrapperMergeCode 1300 0),
    (New-RespondNode "Respond Warranty With Sparky" '={{$json.warranty_review_with_sparky_result || $json}}' 1560 0)
)
$wrapperConnections = @{
    "Rental Warranty With Sparky Webhook" = @{ main = @(, @(@{ node = "Prepare Wally Warranty Handoff"; type = "main"; index = 0 })) }
    "Prepare Wally Warranty Handoff" = @{ main = @(, @(@{ node = "Call Wally Warranty Guard"; type = "main"; index = 0 })) }
    "Call Wally Warranty Guard" = @{ main = @(, @(@{ node = "Prepare Sparky Warranty Handoff"; type = "main"; index = 0 })) }
    "Prepare Sparky Warranty Handoff" = @{ main = @(, @(@{ node = "Call Sparky Electrical Review"; type = "main"; index = 0 })) }
    "Call Sparky Electrical Review" = @{ main = @(, @(@{ node = "Merge Wally And Sparky"; type = "main"; index = 0 })) }
    "Merge Wally And Sparky" = @{ main = @(, @(@{ node = "Respond Warranty With Sparky"; type = "main"; index = 0 })) }
}
$wrapperWorkflow = Upsert-WorkflowByName "TRADIE-RENTAL-113-Warranty-Review-With-Sparky" $wrapperNodes $wrapperConnections

$intakePatch = Update-WorkOrderIntakeWallyUrl "http://n8n:5678/webhook/rental/warranty/review-with-sparky"

@{
    sparky_review_workflow = $sparkyWorkflow | Select-Object name,id,active
    warranty_with_sparky_workflow = $wrapperWorkflow | Select-Object name,id,active
    work_order_intake_patch = $intakePatch
    sparky_review_endpoint = "$BaseUrl/webhook/agents/sparky/electrical-review"
    warranty_with_sparky_endpoint = "$BaseUrl/webhook/rental/warranty/review-with-sparky"
} | ConvertTo-Json -Depth 10
