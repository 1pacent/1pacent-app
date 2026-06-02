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

const reference = first(q.work_order_id, q.lead_id, q.job_id, q.quote_id, q.invoice_id, q.payment_request_id);

const query = `
CREATE TABLE IF NOT EXISTS trust_metrics (
  id uuid primary key default gen_random_uuid(),
  tradie_id text,
  trade_type text,
  completed_jobs integer not null default 0,
  similar_jobs_completed integer not null default 0,
  quote_accuracy_score numeric,
  on_time_rate numeric,
  average_rating numeric,
  dispute_rate numeric,
  repeat_customer_rate numeric,
  updated_at timestamptz not null default now()
);

WITH input AS (
  SELECT ${sql(reference)}::text AS reference
),
rental_work_order AS (
  SELECT
    wo.*,
    rp.address AS property_address,
    rp.suburb AS property_suburb,
    rp.state AS property_state,
    t.name AS tenant_name,
    t.email AS tenant_email,
    t.phone AS tenant_phone,
    l.name AS landlord_name,
    l.email AS landlord_email,
    pm.name AS property_manager_name,
    pm.email AS property_manager_email
  FROM work_orders wo
  LEFT JOIN rental_properties rp ON rp.id = wo.property_id
  LEFT JOIN tenants t ON t.id = wo.tenant_id
  LEFT JOIN landlords l ON l.id = wo.landlord_id
  LEFT JOIN property_managers pm ON pm.id = wo.property_manager_id
  WHERE wo.id = (SELECT reference FROM input)
     OR wo.lead_id = (SELECT reference FROM input)
     OR wo.job_id = (SELECT reference FROM input)
     OR wo.quote_id = (SELECT reference FROM input)
  ORDER BY wo.updated_at DESC
  LIMIT 1
),
rental_selected_quote AS (
  SELECT ro.*
  FROM rental_quote_options ro
  WHERE ro.work_order_id = (SELECT id FROM rental_work_order)
    AND (
      ro.id = (SELECT payload->>'selected_quote_option_id' FROM rental_work_order)
      OR ro.status = 'approved_selected'
    )
  ORDER BY
    CASE WHEN ro.id = (SELECT payload->>'selected_quote_option_id' FROM rental_work_order) THEN 0 ELSE 1 END,
    ro.updated_at DESC
  LIMIT 1
),
rental_quote_options AS (
  SELECT ro.*
  FROM rental_quote_options ro
  WHERE ro.work_order_id = (SELECT id FROM rental_work_order)
  ORDER BY ro.option_rank
),
rental_schedule AS (
  SELECT s.*
  FROM job_schedule_slots s
  WHERE s.id = (SELECT payload->>'selected_schedule_slot_id' FROM rental_work_order)
     OR s.id = 'SLOT-' || (SELECT id FROM rental_selected_quote)
     OR s.route_context->>'work_order_id' = (SELECT id FROM rental_work_order)
  ORDER BY s.updated_at DESC
  LIMIT 1
),
rental_warranty AS (
  SELECT rr.*
  FROM repeat_issue_reviews rr
  WHERE rr.work_order_id = (SELECT id FROM rental_work_order)
  ORDER BY rr.created_at DESC
  LIMIT 1
),
rental_status AS (
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM rental_work_order WHERE status IN ('completed','job_completed')) THEN 'completed'
      WHEN EXISTS (SELECT 1 FROM rental_schedule WHERE scheduled_start IS NOT NULL) THEN 'scheduled'
      WHEN EXISTS (SELECT 1 FROM rental_selected_quote) THEN 'quote_approved'
      WHEN EXISTS (SELECT 1 FROM rental_quote_options) THEN 'quote_options_ready'
      WHEN EXISTS (SELECT 1 FROM rental_work_order WHERE approval_status ILIKE '%warranty%') THEN 'warranty_review_required'
      WHEN EXISTS (SELECT 1 FROM rental_work_order) THEN 'requested'
      ELSE 'not_found'
    END AS status_key
),
rental_timeline AS (
  SELECT 'Request received' AS label, (SELECT created_at FROM rental_work_order) AS happened_at,
    CASE WHEN EXISTS (SELECT 1 FROM rental_work_order) THEN 'done' ELSE 'pending' END AS state,
    'Sally captured the maintenance request and created a rental work order.' AS description
  UNION ALL
  SELECT 'Warranty checked', COALESCE((SELECT created_at FROM rental_warranty), (SELECT created_at FROM rental_work_order)),
    CASE WHEN EXISTS (SELECT 1 FROM rental_work_order) THEN 'done' ELSE 'pending' END,
    CASE
      WHEN COALESCE((SELECT payload->>'warranty_candidate' FROM rental_work_order), 'false') = 'true'
        THEN 'This may be a warranty or repeat issue and needs review before a new charge.'
      ELSE 'No warranty or repeat issue hold is active.'
    END
  UNION ALL
  SELECT 'Quote options prepared', (SELECT min(created_at) FROM rental_quote_options),
    CASE WHEN EXISTS (SELECT 1 FROM rental_quote_options) THEN 'done' ELSE 'pending' END,
    'Quote options were matched against requester availability and tradie availability.'
  UNION ALL
  SELECT 'Quote approved', (SELECT updated_at FROM rental_selected_quote),
    CASE WHEN EXISTS (SELECT 1 FROM rental_selected_quote) THEN 'done' ELSE 'pending' END,
    'The approver selected one quote option.'
  UNION ALL
  SELECT 'Job scheduled', (SELECT scheduled_start FROM rental_schedule),
    CASE WHEN EXISTS (SELECT 1 FROM rental_schedule WHERE scheduled_start IS NOT NULL) THEN 'done' ELSE 'pending' END,
    'The approved option has a locked schedule slot.'
),
matched AS (
  SELECT
    l.id AS lead_id,
    l.customer_id,
    l.status AS lead_status,
    l.trade_type,
    l.job_description,
    l.urgency,
    l.address,
    l.preferred_time,
    l.estimated_price_band,
    l.created_at AS lead_created_at,
    l.updated_at AS lead_updated_at,
    c.name AS customer_name,
    c.email AS customer_email,
    c.phone AS customer_phone
  FROM leads l
  LEFT JOIN customers c ON c.id = l.customer_id
  WHERE l.id = (SELECT reference FROM input)
     OR EXISTS (SELECT 1 FROM jobs j WHERE j.lead_id = l.id AND j.id = (SELECT reference FROM input))
     OR EXISTS (SELECT 1 FROM quotes q WHERE q.lead_id = l.id AND q.id = (SELECT reference FROM input))
     OR EXISTS (SELECT 1 FROM invoices i JOIN jobs j ON j.id = i.job_id WHERE j.lead_id = l.id AND i.id = (SELECT reference FROM input))
     OR EXISTS (SELECT 1 FROM payment_requests pr WHERE pr.customer_id = l.customer_id AND pr.id = (SELECT reference FROM input))
  ORDER BY l.updated_at DESC
  LIMIT 1
),
quote_rows AS (
  SELECT q.*
  FROM quotes q
  WHERE q.lead_id = (SELECT lead_id FROM matched)
  ORDER BY q.updated_at DESC, q.created_at DESC
),
latest_quote AS (
  SELECT * FROM quote_rows LIMIT 1
),
quote_version_rows AS (
  SELECT qv.*
  FROM quote_versions qv
  WHERE qv.lead_id = (SELECT lead_id FROM matched)
     OR qv.quote_id IN (SELECT id FROM quote_rows)
  ORDER BY qv.created_at DESC
),
job_rows AS (
  SELECT j.*
  FROM jobs j
  WHERE j.lead_id = (SELECT lead_id FROM matched)
     OR j.quote_id IN (SELECT id FROM quote_rows)
  ORDER BY j.updated_at DESC, j.created_at DESC
),
latest_job AS (
  SELECT * FROM job_rows LIMIT 1
),
schedule_rows AS (
  SELECT
    s.*,
    t.name AS tradie_name,
    t.licence_status,
    t.insurance_status,
    t.on_time_rate,
    t.quote_accuracy_score
  FROM job_schedule_slots s
  LEFT JOIN tradies t ON t.id = s.tradie_id
  WHERE s.lead_id = (SELECT lead_id FROM matched)
     OR s.job_id IN (SELECT id FROM job_rows)
     OR s.quote_id IN (SELECT id FROM quote_rows)
  ORDER BY s.updated_at DESC, s.created_at DESC
),
latest_schedule AS (
  SELECT * FROM schedule_rows LIMIT 1
),
calendar_rows AS (
  SELECT ce.*
  FROM calendar_events ce
  WHERE ce.lead_id = (SELECT lead_id FROM matched)
     OR ce.job_id IN (SELECT id FROM job_rows)
     OR ce.quote_id IN (SELECT id FROM quote_rows)
     OR ce.schedule_slot_id IN (SELECT id FROM schedule_rows)
  ORDER BY ce.created_at DESC
),
invoice_rows AS (
  SELECT i.*
  FROM invoices i
  WHERE i.customer_id = (SELECT customer_id FROM matched)
    AND (
      i.job_id IN (SELECT id FROM job_rows)
      OR i.quote_id IN (SELECT id FROM quote_rows)
    )
  ORDER BY i.updated_at DESC, i.created_at DESC
),
latest_invoice AS (
  SELECT * FROM invoice_rows LIMIT 1
),
payment_rows AS (
  SELECT pr.*
  FROM payment_requests pr
  WHERE pr.customer_id = (SELECT customer_id FROM matched)
    AND (
      pr.invoice_id IN (SELECT id FROM invoice_rows)
      OR pr.job_id IN (SELECT id FROM job_rows)
      OR pr.quote_id IN (SELECT id FROM quote_rows)
      OR pr.id = (SELECT reference FROM input)
    )
  ORDER BY pr.updated_at DESC, pr.created_at DESC
),
latest_payment AS (
  SELECT * FROM payment_rows LIMIT 1
),
review_rows AS (
  SELECT rr.*
  FROM review_requests rr
  WHERE rr.customer_id = (SELECT customer_id FROM matched)
    AND rr.job_id IN (SELECT id FROM job_rows)
  ORDER BY rr.updated_at DESC, rr.created_at DESC
),
social_rows AS (
  SELECT sc.*
  FROM social_campaigns sc
  WHERE sc.customer_id = (SELECT customer_id FROM matched)
    AND (sc.lead_id = (SELECT lead_id FROM matched) OR sc.job_id IN (SELECT id FROM job_rows))
  ORDER BY sc.updated_at DESC, sc.created_at DESC
),
trust_row AS (
  SELECT tm.*
  FROM trust_metrics tm
  WHERE tm.tradie_id = (SELECT tradie_id FROM latest_schedule)
     OR lower(tm.trade_type) = lower((SELECT trade_type FROM matched))
  ORDER BY tm.updated_at DESC
  LIMIT 1
),
timeline AS (
  SELECT 'Booking request received' AS label, (SELECT lead_created_at FROM matched) AS happened_at, 'done' AS state, 'We received your request.' AS description
  WHERE EXISTS (SELECT 1 FROM matched)
  UNION ALL
  SELECT 'Quote prepared', COALESCE((SELECT created_at FROM latest_quote), (SELECT created_at FROM quote_version_rows LIMIT 1)), CASE WHEN EXISTS (SELECT 1 FROM latest_quote) THEN 'done' ELSE 'pending' END, 'The tradie confirms scope and pricing before work proceeds.'
  UNION ALL
  SELECT 'Quote accepted', (SELECT accepted_at FROM latest_quote), CASE WHEN (SELECT accepted_at FROM latest_quote) IS NOT NULL THEN 'done' ELSE 'pending' END, 'No work proceeds until the quote is accepted.'
  UNION ALL
  SELECT 'Job scheduled', (SELECT scheduled_start FROM latest_schedule), CASE WHEN EXISTS (SELECT 1 FROM latest_schedule WHERE status ILIKE '%book%' OR status ILIKE '%schedule%' OR scheduled_start IS NOT NULL) THEN 'done' ELSE 'pending' END, 'Your appointment window is managed by the operations team.'
  UNION ALL
  SELECT 'Job complete', (SELECT completed_at FROM latest_job), CASE WHEN (SELECT completed_at FROM latest_job) IS NOT NULL THEN 'done' ELSE 'pending' END, 'Completion notes and materials are captured after the job.'
  UNION ALL
  SELECT 'Invoice sent', (SELECT sent_at FROM latest_invoice), CASE WHEN EXISTS (SELECT 1 FROM latest_invoice) THEN 'done' ELSE 'pending' END, 'The invoice summary is sent after completion.'
  UNION ALL
  SELECT 'Payment received', (SELECT paid_at FROM latest_payment), CASE WHEN EXISTS (SELECT 1 FROM latest_payment WHERE status = 'paid') THEN 'done' ELSE 'pending' END, 'Payment status updates here once received.'
),
current_state AS (
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM latest_payment WHERE status = 'paid') THEN 'paid'
      WHEN EXISTS (SELECT 1 FROM latest_payment) THEN 'payment_requested'
      WHEN EXISTS (SELECT 1 FROM latest_invoice) THEN 'invoice_sent'
      WHEN EXISTS (SELECT 1 FROM latest_job WHERE completed_at IS NOT NULL) THEN 'job_complete'
      WHEN EXISTS (SELECT 1 FROM latest_schedule WHERE scheduled_start IS NOT NULL) THEN 'scheduled'
      WHEN EXISTS (SELECT 1 FROM latest_quote WHERE accepted_at IS NOT NULL) THEN 'quote_accepted'
      WHEN EXISTS (SELECT 1 FROM latest_quote) THEN 'quote_sent'
      WHEN EXISTS (SELECT 1 FROM matched) THEN 'booking_request_received'
      ELSE 'not_found'
    END AS status_key
),
next_action AS (
  SELECT
    CASE (SELECT status_key FROM current_state)
      WHEN 'paid' THEN 'Leave a review if you were happy with the service.'
      WHEN 'payment_requested' THEN 'Review and pay the invoice when ready.'
      WHEN 'invoice_sent' THEN 'Review your invoice summary.'
      WHEN 'job_complete' THEN 'Watch for your invoice summary.'
      WHEN 'scheduled' THEN 'The tradie will confirm final scope and pricing before work begins.'
      WHEN 'quote_accepted' THEN 'Your accepted quote is being scheduled.'
      WHEN 'quote_sent' THEN 'Review and accept the quote before work proceeds.'
      WHEN 'booking_request_received' THEN 'The team will confirm quote and scheduling details.'
      ELSE 'Please contact 1pacent so we can find your request.'
    END AS customer_next_action
)
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'success', true,
      'reference', (SELECT reference FROM input),
      'work_order_id', id,
      'status_key', (SELECT status_key FROM rental_status),
      'status', status,
      'description', description,
      'trade_type', trade_type,
      'job_type', job_type,
      'property_scenario', payload->>'property_scenario',
      'requester_role', payload->>'requester_role',
      'approval_recipient_role', payload->>'approval_recipient_role',
      'approval_status', approval_status,
      'landlord_approval_status', approval_status,
      'approval_required', approval_required,
      'estimated_amount', estimated_amount,
      'property_address', COALESCE(property_address, property_suburb),
      'scheduled_window', scheduled_window,
      'warranty_flag', COALESCE((payload->>'warranty_candidate')::boolean, false),
      'warranty_message', CASE
        WHEN COALESCE((payload->>'warranty_candidate')::boolean, false)
          THEN COALESCE(payload->>'landlord_charge_recommendation', 'Warranty or repeat issue review required before a new charge.')
        ELSE null
      END,
      'selected_quote', COALESCE((
        SELECT jsonb_build_object(
          'option_id', id,
          'tradie_id', tradie_id,
          'company_id', company_id,
          'quote_amount', quote_amount,
          'scheduled_start', scheduled_start,
          'scheduled_end', scheduled_end,
          'trust_score', trust_score,
          'cost_score', cost_score,
          'availability_score', availability_score,
          'total_score', total_score
        )
        FROM rental_selected_quote
      ), '{}'::jsonb),
      'quote_options', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'option_id', id,
          'rank', option_rank,
          'tradie_id', tradie_id,
          'company_id', company_id,
          'quote_amount', quote_amount,
          'scheduled_start', scheduled_start,
          'scheduled_end', scheduled_end,
          'availability_score', availability_score,
          'status', status
        ) ORDER BY option_rank)
        FROM rental_quote_options
      ), '[]'::jsonb),
      'schedule', COALESCE((
        SELECT jsonb_build_object(
          'schedule_slot_id', id,
          'status', status,
          'scheduled_start', scheduled_start,
          'scheduled_end', scheduled_end,
          'scheduled_window', CASE WHEN scheduled_start IS NULL THEN null ELSE to_char(scheduled_start AT TIME ZONE 'Australia/Sydney', 'DD Mon YYYY, HH12:MI am') || ' to ' || to_char(scheduled_end AT TIME ZONE 'Australia/Sydney', 'HH12:MI am') END,
          'tradie_id', tradie_id,
          'scheduling_reason', scheduling_reason
        )
        FROM rental_schedule
      ), '{}'::jsonb),
      'next_action', CASE (SELECT status_key FROM rental_status)
        WHEN 'scheduled' THEN 'Tenant and tradie confirmation is being monitored.'
        WHEN 'quote_approved' THEN 'The approved quote is being scheduled.'
        WHEN 'quote_options_ready' THEN 'The approver should choose one quote option.'
        WHEN 'warranty_review_required' THEN 'Warranty or repeat issue review is required before a new charge.'
        ELSE 'The team will confirm quote and scheduling details.'
      END,
      'timeline', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'label', label,
        'state', state,
        'happened_at', happened_at,
        'description', description
      ) ORDER BY CASE label
        WHEN 'Request received' THEN 1
        WHEN 'Warranty checked' THEN 2
        WHEN 'Quote options prepared' THEN 3
        WHEN 'Quote approved' THEN 4
        WHEN 'Job scheduled' THEN 5
        ELSE 99
      END) FROM rental_timeline), '[]'::jsonb)
    )
    FROM rental_work_order
  ),
  (
    SELECT jsonb_build_object(
      'success', true,
      'reference', (SELECT reference FROM input),
      'status_key', (SELECT status_key FROM current_state),
      'next_action', (SELECT customer_next_action FROM next_action),
      'customer', jsonb_build_object(
        'name', customer_name,
        'email', customer_email,
        'phone_last4', CASE WHEN customer_phone IS NULL OR length(customer_phone) < 4 THEN null ELSE right(customer_phone, 4) END
      ),
      'request', jsonb_build_object(
        'lead_id', lead_id,
        'status', lead_status,
        'trade_type', trade_type,
        'job_description', job_description,
        'urgency', urgency,
        'suburb_or_address', address,
        'preferred_time', preferred_time,
        'estimated_price_band', estimated_price_band,
        'created_at', lead_created_at
      ),
      'quote', COALESCE((
        SELECT jsonb_build_object(
          'quote_id', id,
          'status', status,
          'amount', COALESCE(current_amount, original_amount),
          'accepted_at', accepted_at,
          'versions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', id,
            'amount', amount,
            'reason', reason,
            'inclusions', inclusions,
            'exclusions', exclusions,
            'acceptance_url', acceptance_url,
            'status', status,
            'created_at', created_at
          ) ORDER BY created_at DESC) FROM quote_version_rows), '[]'::jsonb)
        )
        FROM latest_quote
      ), '{}'::jsonb),
      'schedule', COALESCE((
        SELECT jsonb_build_object(
          'schedule_slot_id', id,
          'status', status,
          'scheduled_start', scheduled_start,
          'scheduled_end', scheduled_end,
          'scheduled_window', CASE WHEN scheduled_start IS NULL THEN null ELSE to_char(scheduled_start AT TIME ZONE 'Australia/Sydney', 'DD Mon YYYY, HH12:MI am') || ' to ' || to_char(scheduled_end AT TIME ZONE 'Australia/Sydney', 'HH12:MI am') END,
          'estimated_duration_minutes', estimated_duration_minutes,
          'tradie', jsonb_build_object(
            'name', tradie_name,
            'licence_status', licence_status,
            'insurance_status', insurance_status,
            'on_time_rate', on_time_rate,
            'quote_accuracy_score', quote_accuracy_score
          )
        )
        FROM latest_schedule
      ), '{}'::jsonb),
      'trust', COALESCE((
        SELECT jsonb_build_object(
          'completed_jobs', completed_jobs,
          'similar_jobs_completed', similar_jobs_completed,
          'quote_accuracy_score', quote_accuracy_score,
          'on_time_rate', on_time_rate,
          'average_rating', average_rating,
          'dispute_rate', dispute_rate,
          'repeat_customer_rate', repeat_customer_rate
        )
        FROM trust_row
      ), '{}'::jsonb),
      'invoice', COALESCE((
        SELECT jsonb_build_object(
          'invoice_id', id,
          'status', status,
          'amount', amount,
          'sent_at', sent_at,
          'paid_at', paid_at
        )
        FROM latest_invoice
      ), '{}'::jsonb),
      'payment', COALESCE((
        SELECT jsonb_build_object(
          'payment_request_id', id,
          'status', status,
          'amount', amount,
          'currency', currency,
          'payment_url', payment_url,
          'due_at', due_at,
          'paid_at', paid_at
        )
        FROM latest_payment
      ), '{}'::jsonb),
      'review', COALESCE((
        SELECT jsonb_build_object(
          'review_request_id', id,
          'status', status,
          'review_url', review_url,
          'requested_at', requested_at,
          'completed_at', completed_at
        )
        FROM review_rows
        LIMIT 1
      ), '{}'::jsonb),
      'social', COALESCE((
        SELECT jsonb_build_object(
          'campaign_id', id,
          'status', status,
          'approval_status', approval_status,
          'platforms', platforms
        )
        FROM social_rows
        LIMIT 1
      ), '{}'::jsonb),
      'timeline', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'label', label,
        'state', state,
        'happened_at', happened_at,
        'description', description
      ) ORDER BY CASE label
        WHEN 'Booking request received' THEN 1
        WHEN 'Quote prepared' THEN 2
        WHEN 'Quote accepted' THEN 3
        WHEN 'Job scheduled' THEN 4
        WHEN 'Job complete' THEN 5
        WHEN 'Invoice sent' THEN 6
        WHEN 'Payment received' THEN 7
        ELSE 99
      END) FROM timeline), '[]'::jsonb),
      'support', jsonb_build_object(
        'change_booking_instruction', 'To change your booking, call Sally and quote your request reference.',
        'urgent_instruction', 'If the issue is urgent, call Sally for immediate triage.'
      )
    )
    FROM matched
  ),
  jsonb_build_object(
    'success', false,
    'reference', (SELECT reference FROM input),
    'status_key', 'not_found',
    'message', 'No customer job status was found for that reference.'
  )
) AS customer_job_status;
`;

return [{ json: { sql: query } }];
'@

$nodes = @(
    (New-WebhookNode "Customer Job Status Webhook" "customer/job-status" "GET" 0 0),
    (New-CodeNode "Build Customer Job Status SQL" $statusCode 260 0),
    (New-PostgresNode "Load Customer Job Status" 520 0),
    (New-RespondNode "Respond Customer Job Status" '={{$json.customer_job_status || $json}}' 780 0)
)

$connections = @{
    "Customer Job Status Webhook" = @{ main = @(, @(@{ node = "Build Customer Job Status SQL"; type = "main"; index = 0 })) }
    "Build Customer Job Status SQL" = @{ main = @(, @(@{ node = "Load Customer Job Status"; type = "main"; index = 0 })) }
    "Load Customer Job Status" = @{ main = @(, @(@{ node = "Respond Customer Job Status"; type = "main"; index = 0 })) }
}

$workflow = Upsert-WorkflowByName "TRADIE-CUSTOMER-970-Job-Status" $nodes $connections

@{
    workflow = $workflow | Select-Object name,id,active
    endpoint = "$BaseUrl/webhook/customer/job-status"
    example = "$BaseUrl/webhook/customer/job-status?lead_id=LEAD-2026-113084"
} | ConvertTo-Json -Depth 10
