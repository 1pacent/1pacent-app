$ErrorActionPreference = "Stop"

$BaseUrl = "https://n8n.1pacent.com"
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

$gmailCredential = @{
    id = "Ar5b8h8vd29IBh1g"
    name = "Gmail account"
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

function New-HttpRequestNode($Name, $Url, $X, $Y) {
    return @{
        parameters = @{
            method = "POST"
            url = $Url
            sendBody = $true
            contentType = "json"
            specifyBody = "json"
            jsonBody = "={{ JSON.stringify(`$json) }}"
            options = @{ timeout = 30000 }
        }
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = $Name
        continueOnFail = $true
    }
}

function New-GmailNode($Name, $X, $Y) {
    return @{
        parameters = @{
            sendTo = '={{$json.to}}'
            subject = '={{$json.subject}}'
            emailType = "text"
            message = '={{$json.message}}'
            options = @{}
        }
        type = "n8n-nodes-base.gmail"
        typeVersion = 2.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = $Name
        continueOnFail = $true
        credentials = @{
            gmailOAuth2 = $gmailCredential
        }
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
    $knownWorkflowIds = @{
        "TRADIE-RENTAL-102-Tenant-Feedback-Trust-Score" = "BNruC3xfJPZg27n3"
        "TRADIE-RENTAL-103-Compliance-Service-Offer" = "JcbPbP4nNxTEHN6N"
        "TRADIE-RENTAL-104-Inspection-Report-To-Work-Orders" = "KabTrWFQlBbzDPUW"
        "TRADIE-RENTAL-106-Approve-Quote-Option-Lock-Slot" = "5V6t3jQcmjYOcpLb"
        "TRADIE-RENTAL-107-Tenant-Tradie-Confirmation-Monitor" = "2XvJCVQh9VpvM3da"
        "TRADIE-RENTAL-109-Two-Week-Schedule-Optimiser" = "MzqjAOlxGBdjagVL"
        "TRADIE-RENTAL-110-Warranty-Repeat-Issue-Guard" = "MBHZlMQY8Ps7yRqd"
    }
    $url = "$BaseUrl/api/v1/workflows?limit=100"
    $items = @()
    do {
        $page = Invoke-RestMethod -Uri $url -Headers $Headers -Method Get
        $items += $page.data
        if ($page.nextCursor) { $url = "$BaseUrl/api/v1/workflows?limit=100&cursor=$($page.nextCursor)" } else { $url = $null }
    } while ($url)

    $existingByName = $items |
        Where-Object { $_.name -eq $WorkflowName } |
        Sort-Object -Property active -Descending |
        Select-Object -First 1
    $existingId = if ($knownWorkflowIds[$WorkflowName]) { $knownWorkflowIds[$WorkflowName] } elseif ($existingByName) { $existingByName.id } else { $null }
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

    $webhookPaths = @()
    foreach ($node in $Nodes) {
        if ($node.type -eq "n8n-nodes-base.webhook" -and $node.parameters.path) {
            $webhookPaths += $node.parameters.path
        }
    }

    $pathConflicts = $items | Where-Object {
        $_.active -and $_.id -ne $existingId -and (
            @($_.nodes | Where-Object {
                $_.type -eq "n8n-nodes-base.webhook" -and
                $webhookPaths -contains $_.parameters.path
            }).Count -gt 0
        )
    }
    foreach ($conflict in $pathConflicts) {
        Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($conflict.id)/deactivate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
    }

    if ($existingId) {
        try {
            $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$existingId" -Headers $Headers -Method Put -Body $body -ContentType "application/json"
        } catch {
            $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows" -Headers $Headers -Method Post -Body $body -ContentType "application/json"
        }
    }
    else {
        $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows" -Headers $Headers -Method Post -Body $body -ContentType "application/json"
    }

    $duplicates = $items | Where-Object { $_.name -eq $WorkflowName -and $_.id -ne $updated.id -and $_.active }
    foreach ($duplicate in $duplicates) {
        Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($duplicate.id)/deactivate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
    }

    Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($updated.id)/activate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
    return $updated
}

$setupCode = @'
const query = `
CREATE TABLE IF NOT EXISTS agencies (
  id text primary key,
  name text not null,
  abn text,
  primary_email text,
  primary_phone text,
  plan_key text not null default 'starter',
  property_count integer not null default 0,
  active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS property_managers (
  id text primary key,
  agency_id text references agencies(id),
  name text not null,
  email text,
  phone text,
  approval_limit numeric not null default 300,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS landlords (
  id text primary key,
  name text not null,
  email text,
  phone text,
  default_approval_limit numeric not null default 300,
  prefers_auto_approval boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS tenants (
  id text primary key,
  name text not null,
  email text,
  phone text,
  preferred_contact_channel text not null default 'email',
  feedback_score numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS rental_properties (
  id text primary key,
  agency_id text references agencies(id),
  property_manager_id text references property_managers(id),
  landlord_id text references landlords(id),
  address text not null,
  suburb text,
  state text not null default 'VIC',
  postcode text,
  bedrooms integer,
  bathrooms integer,
  access_notes text,
  compliance_status text not null default 'not_assessed',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS tenancies (
  id text primary key,
  property_id text references rental_properties(id),
  tenant_id text references tenants(id),
  lease_start date,
  lease_end date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS approval_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id text references agencies(id),
  landlord_id text references landlords(id),
  property_id text references rental_properties(id),
  trade_type text,
  job_type text,
  threshold_amount numeric not null default 300,
  auto_approve_compliance boolean not null default false,
  auto_approve_emergency boolean not null default true,
  requires_landlord_approval boolean not null default true,
  contract_reference text,
  active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS work_orders (
  id text primary key,
  agency_id text references agencies(id),
  property_id text references rental_properties(id),
  tenancy_id text references tenancies(id),
  tenant_id text references tenants(id),
  landlord_id text references landlords(id),
  property_manager_id text references property_managers(id),
  lead_id text references leads(id),
  job_id text,
  quote_id text,
  source text not null default 'sally',
  category text not null default 'maintenance',
  trade_type text,
  job_type text,
  description text not null,
  urgency text not null default 'normal',
  status text not null default 'triaged',
  indicative_price_band text,
  estimated_amount numeric,
  approval_status text not null default 'pending_triage',
  approval_required boolean not null default true,
  auto_approved boolean not null default false,
  tenant_preferred_time text,
  scheduled_window text,
  tenant_access_confirmed boolean not null default false,
  compliance_required boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS tradie_commercial_terms (
  id uuid primary key default gen_random_uuid(),
  tradie_id text references tradies(id),
  company_id text references tradie_companies(id),
  trade_type text,
  job_type text,
  standard_callout_fee numeric,
  emergency_callout_fee numeric,
  hourly_rate numeric,
  minimum_labour_minutes integer,
  labour_warranty_days integer not null default 90,
  parts_warranty_policy text not null default 'manufacturer_or_supplier_warranty_plus_acl_consumer_guarantees',
  parts_warranty_days integer,
  can_discount boolean not null default true,
  callout_waiver_policy text,
  sally_discount_instructions text,
  effective_from date not null default current_date,
  effective_to date,
  active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS tradie_job_offer_overrides (
  id uuid primary key default gen_random_uuid(),
  tradie_id text references tradies(id),
  work_order_id text,
  quote_option_id text,
  callout_fee_override numeric,
  discount_amount numeric,
  discount_percent numeric,
  labour_warranty_days_override integer,
  parts_warranty_policy_override text,
  sally_instruction_override text,
  reason text,
  expires_at timestamptz,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS work_order_warranties (
  id uuid primary key default gen_random_uuid(),
  warranty_key text not null unique,
  original_work_order_id text references work_orders(id),
  job_id text,
  quote_option_id text,
  tradie_id text references tradies(id),
  property_id text references rental_properties(id),
  trade_type text,
  job_type text,
  part_sku text,
  part_description text,
  warranty_type text not null default 'workmanship_and_parts',
  commercial_terms_id uuid,
  labour_warranty_days integer,
  parts_warranty_days integer,
  consumer_guarantee_reference_keys text[] not null default '{}',
  warranty_start date,
  warranty_end date,
  warranty_terms text,
  callout_fee_policy text,
  landlord_charge_policy text not null default 'no_charge_if_same_issue_within_warranty',
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS repeat_issue_reviews (
  id uuid primary key default gen_random_uuid(),
  review_key text not null unique,
  work_order_id text references work_orders(id),
  property_id text references rental_properties(id),
  tenant_id text references tenants(id),
  trade_type text,
  job_type text,
  issue_signature text,
  repeat_count integer not null default 0,
  warranty_candidate boolean not null default false,
  matched_warranty_key text references work_order_warranties(warranty_key),
  previous_tradie_id text references tradies(id),
  landlord_charge_recommendation text,
  tenant_responsibility_signal text,
  recommended_action text,
  status text not null default 'reviewed',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS landlord_approvals (
  id text primary key,
  work_order_id text references work_orders(id),
  landlord_id text references landlords(id),
  approval_type text not null default 'quote',
  amount numeric,
  status text not null default 'pending',
  approval_url text,
  decision_notes text,
  decided_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS tenant_availability_windows (
  id uuid primary key default gen_random_uuid(),
  work_order_id text references work_orders(id),
  tenant_id text references tenants(id),
  window_start timestamptz,
  window_end timestamptz,
  preference_rank integer not null default 1,
  access_notes text,
  status text not null default 'offered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS rental_quote_options (
  id text primary key,
  batch_id text not null,
  work_order_id text references work_orders(id),
  landlord_id text references landlords(id),
  tenant_id text references tenants(id),
  tenant_availability_window_id uuid references tenant_availability_windows(id),
  tradie_id text references tradies(id),
  company_id text references tradie_companies(id),
  option_rank integer not null default 1,
  quote_amount numeric,
  quote_band text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  urgency text,
  trust_score numeric,
  cost_score numeric,
  availability_score numeric,
  total_score numeric,
  status text not null default 'proposed',
  approval_id text,
  approval_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS rental_confirmation_events (
  id uuid primary key default gen_random_uuid(),
  work_order_id text references work_orders(id),
  quote_option_id text references rental_quote_options(id),
  schedule_slot_id text references job_schedule_slots(id),
  actor_type text not null,
  actor_id text,
  confirmation_status text not null,
  response_channel text not null default 'webhook',
  response_due_at timestamptz,
  responded_at timestamptz not null default now(),
  fallback_triggered boolean not null default false,
  fallback_quote_option_id text references rental_quote_options(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS rental_job_evidence (
  id uuid primary key default gen_random_uuid(),
  work_order_id text references work_orders(id),
  job_id text,
  quote_option_id text references rental_quote_options(id),
  tradie_id text references tradies(id),
  evidence_type text not null default 'completion',
  before_photo_urls text[] not null default '{}',
  after_photo_urls text[] not null default '{}',
  certificate_urls text[] not null default '{}',
  parts_used jsonb not null default '[]'::jsonb,
  labour_hours numeric,
  travel_minutes integer,
  final_amount numeric,
  completion_notes text,
  variance_reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS tenant_feedback (
  id uuid primary key default gen_random_uuid(),
  work_order_id text references work_orders(id),
  tenant_id text references tenants(id),
  tradie_id text references tradies(id),
  rating integer check (rating between 1 and 5),
  access_experience_score integer check (access_experience_score between 1 and 5),
  communication_score integer check (communication_score between 1 and 5),
  completion_score integer check (completion_score between 1 and 5),
  comments text,
  trust_signal jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  property_id text references rental_properties(id),
  requirement_type text not null,
  jurisdiction text not null default 'VIC',
  frequency_months integer,
  due_date date,
  status text not null default 'due',
  upsell_eligible boolean not null default true,
  package_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS compliance_legislation_sources (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  source_key text not null unique,
  source_name text not null,
  source_url text not null,
  legislation_reference text,
  legislation_version text,
  effective_from date,
  effective_to date,
  verified_at timestamptz not null default now(),
  verified_by text not null default 'codex',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS consumer_guarantee_references (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null default 'AU',
  guarantee_key text not null unique,
  source_name text not null,
  source_url text not null,
  legislation_reference text,
  legislation_version text,
  guarantee_type text not null,
  applies_to text not null,
  summary text not null,
  operational_rule text,
  effective_from date,
  effective_to date,
  verified_at timestamptz not null default now(),
  verified_by text not null default 'codex',
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
ALTER TABLE work_order_warranties ADD COLUMN IF NOT EXISTS commercial_terms_id uuid;
ALTER TABLE work_order_warranties ADD COLUMN IF NOT EXISTS labour_warranty_days integer;
ALTER TABLE work_order_warranties ADD COLUMN IF NOT EXISTS parts_warranty_days integer;
ALTER TABLE work_order_warranties ADD COLUMN IF NOT EXISTS consumer_guarantee_reference_keys text[] not null default '{}';
ALTER TABLE work_order_warranties ADD COLUMN IF NOT EXISTS callout_fee_policy text;
CREATE TABLE IF NOT EXISTS compliance_requirement_catalogue (
  id uuid primary key default gen_random_uuid(),
  requirement_key text not null unique,
  jurisdiction text not null,
  activity_key text not null,
  activity_name text not null,
  requirement_summary text not null,
  frequency_months integer,
  due_rule text,
  required_tradie_type text,
  evidence_required text[] not null default '{}',
  legislation_source_key text references compliance_legislation_sources(source_key),
  legislation_reference text,
  legislation_version text,
  effective_from date,
  effective_to date,
  status text not null default 'active',
  verified_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS compliance_bundle_catalogue (
  id uuid primary key default gen_random_uuid(),
  bundle_key text not null unique,
  jurisdiction text not null,
  bundle_name text not null,
  included_activity_keys text[] not null default '{}',
  fixed_fee_amount numeric,
  tradie_payout_amount numeric,
  platform_margin_amount numeric,
  recommended_duration_minutes integer,
  travel_saving_strategy text,
  evidence_required text[] not null default '{}',
  status text not null default 'active',
  effective_from date,
  effective_to date,
  verified_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS compliance_certificates (
  id text primary key,
  property_id text references rental_properties(id),
  work_order_id text references work_orders(id),
  requirement_type text not null,
  certificate_url text,
  issued_by_tradie_id text references tradies(id),
  issued_at timestamptz,
  expires_at timestamptz,
  status text not null default 'captured',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS compliance_service_offers (
  id text primary key,
  agency_id text references agencies(id),
  property_id text references rental_properties(id),
  landlord_id text references landlords(id),
  package_key text not null,
  package_name text not null,
  price_amount numeric,
  platform_revenue_amount numeric,
  status text not null default 'proposed',
  offer_url text,
  accepted_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS property_inspection_reports (
  id text primary key,
  agency_id text references agencies(id),
  property_id text references rental_properties(id),
  property_manager_id text references property_managers(id),
  inspection_type text not null default 'routine',
  report_source text not null default 'manual_upload',
  report_url text,
  report_text text,
  report_date date,
  status text not null default 'received',
  extracted_summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS property_inspection_findings (
  id text primary key,
  inspection_report_id text references property_inspection_reports(id),
  property_id text references rental_properties(id),
  work_order_id text references work_orders(id),
  finding_type text not null default 'maintenance',
  trade_type text,
  job_type text,
  description text not null,
  location_hint text,
  urgency text not null default 'normal',
  estimated_amount numeric,
  confidence_score numeric,
  status text not null default 'work_order_created',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS rental_schedule_forecasts (
  id text primary key,
  forecast_window_start date not null,
  forecast_window_end date not null,
  generated_by_agent text not null default 'george_foreman',
  scope text not null default 'rental_maintenance',
  status text not null default 'generated',
  total_candidate_jobs integer not null default 0,
  total_forecast_options integer not null default 0,
  estimated_travel_minutes_saved integer,
  estimated_landlord_savings numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS rental_schedule_forecast_options (
  id uuid primary key default gen_random_uuid(),
  forecast_id text references rental_schedule_forecasts(id),
  work_order_id text references work_orders(id),
  compliance_requirement_key text,
  bundle_key text,
  tradie_id text references tradies(id),
  company_id text references tradie_companies(id),
  tenant_availability_window_id uuid references tenant_availability_windows(id),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  suburb text,
  urgency text,
  route_cluster_key text,
  productivity_score numeric,
  landlord_cost_estimate numeric,
  travel_minutes_estimate integer,
  status text not null default 'forecast',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_rental_properties_agency ON rental_properties(agency_id, active);
CREATE INDEX IF NOT EXISTS idx_work_orders_property_status ON work_orders(property_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_agency_status ON work_orders(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_work_order_warranties_lookup ON work_order_warranties(property_id, trade_type, job_type, status, warranty_end);
CREATE INDEX IF NOT EXISTS idx_repeat_issue_reviews_work_order ON repeat_issue_reviews(work_order_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_tradie_commercial_terms_lookup ON tradie_commercial_terms(tradie_id, company_id, trade_type, job_type, active, effective_from);
CREATE INDEX IF NOT EXISTS idx_tradie_job_offer_overrides_lookup ON tradie_job_offer_overrides(tradie_id, work_order_id, quote_option_id, status);
CREATE INDEX IF NOT EXISTS idx_consumer_guarantee_references_lookup ON consumer_guarantee_references(jurisdiction, guarantee_type, applies_to, status);
CREATE INDEX IF NOT EXISTS idx_landlord_approvals_work_order ON landlord_approvals(work_order_id, status);
CREATE INDEX IF NOT EXISTS idx_rental_quote_options_work_order ON rental_quote_options(work_order_id, status, option_rank);
CREATE INDEX IF NOT EXISTS idx_rental_quote_options_batch ON rental_quote_options(batch_id, option_rank);
CREATE INDEX IF NOT EXISTS idx_rental_confirmation_events_work_order ON rental_confirmation_events(work_order_id, actor_type, created_at desc);
CREATE INDEX IF NOT EXISTS idx_rental_job_evidence_work_order ON rental_job_evidence(work_order_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_tenant_feedback_work_order ON tenant_feedback(work_order_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_compliance_requirements_due ON compliance_requirements(status, due_date);
CREATE INDEX IF NOT EXISTS idx_compliance_requirement_catalogue_lookup ON compliance_requirement_catalogue(jurisdiction, status, activity_key);
CREATE INDEX IF NOT EXISTS idx_compliance_bundle_catalogue_lookup ON compliance_bundle_catalogue(jurisdiction, status);
CREATE INDEX IF NOT EXISTS idx_compliance_certificates_property ON compliance_certificates(property_id, requirement_type, expires_at);
CREATE INDEX IF NOT EXISTS idx_compliance_service_offers_status ON compliance_service_offers(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_property_inspection_reports_property ON property_inspection_reports(property_id, report_date desc);
CREATE INDEX IF NOT EXISTS idx_property_inspection_findings_report ON property_inspection_findings(inspection_report_id, status);
CREATE INDEX IF NOT EXISTS idx_rental_schedule_forecast_options_forecast ON rental_schedule_forecast_options(forecast_id, tradie_id, scheduled_start);

INSERT INTO compliance_legislation_sources (
  jurisdiction, source_key, source_name, source_url, legislation_reference,
  legislation_version, effective_from, verified_at, payload
)
VALUES
  ('VIC', 'vic_cav_smoke_alarms_2026_02_27', 'Consumer Affairs Victoria - Smoke alarms and fire safety', 'https://www.consumer.vic.gov.au/housing/renting/repairs-alterations-safety-and-pets/keeping-the-property-safe/smoke-alarms-and-fire-safety', 'Residential Tenancies Act 1997 (VIC) sections 3, 68AA, 72', 'CAV page last updated 27 February 2026; verified by 1pacent catalogue on 2026-05-20', '2025-11-25', now(), '{"official_source":true}'::jsonb),
  ('VIC', 'vic_cav_gas_electrical_2026_05_04', 'Consumer Affairs Victoria - Rental providers gas and electrical safety', 'https://www.consumer.vic.gov.au/housing/renting/repairs-alterations-safety-and-pets/gas-electrical-and-water-safety-standards/rental-providers-gas-and-electrical-safety', 'Residential Tenancies Regulations 2021 (VIC) regulation 5, 16, 30 and Schedule 3; Residential Tenancies Act 1997 (VIC) sections 68A and 68B', 'CAV page last updated 4 May 2026; verified by 1pacent catalogue on 2026-05-20', '2021-03-29', now(), '{"official_source":true}'::jsonb),
  ('NSW', 'nsw_fair_trading_smoke_alarms_2026', 'NSW Government - Landlord responsibilities for repair and maintenance of rental properties', 'https://www.nsw.gov.au/housing-and-construction/rules/landlord-obligations-and-responsibilities-for-rental-properties', 'Residential Tenancies Regulation 2019 (NSW) smoke alarm repair and maintenance obligations', 'NSW Government page crawled last week by search index; verified by 1pacent catalogue on 2026-05-20', '2020-03-23', now(), '{"official_source":true}'::jsonb),
  ('QLD', 'qld_rta_smoke_alarms_2026', 'Queensland Residential Tenancies Authority - Smoke alarms', 'https://www.rta.qld.gov.au/during-a-tenancy/maintenance/smoke-alarms', 'Fire Services Act 1990 (QLD); Building Fire Safety Regulation 2008 (QLD)', 'RTA smoke alarms page; verified by 1pacent catalogue on 2026-05-20', null, now(), '{"official_source":true}'::jsonb),
  ('WA', 'wa_lgirs_rental_home_safety_2026', 'WA Consumer Protection - Rental home safety', 'https://www.consumerprotection.wa.gov.au/rental-home-safety', 'WA smoke alarm and RCD rental home safety requirements', 'WA Consumer Protection rental home safety page; verified by 1pacent catalogue on 2026-05-20', null, now(), '{"official_source":true}'::jsonb),
  ('SA', 'sa_gov_smoke_alarms_2023_06_02', 'SA.GOV.AU - Smoke alarms', 'https://www.sa.gov.au/topics/housing/keeping-your-property-safe/smoke-alarms', 'South Australian smoke alarm property safety requirements', 'SA.GOV.AU page last updated 2 June 2023; verified by 1pacent catalogue on 2026-05-20', null, now(), '{"official_source":true}'::jsonb),
  ('TAS', 'tas_cbos_smoke_alarms_2024', 'CBOS Tasmania - Smoke alarms in rental properties', 'https://www.cbos.tas.gov.au/topics/housing/renting/beginning-tenancy/smoke-alarms', 'Residential Tenancy Act 1997 (TAS) and related smoke alarm Regulations', 'CBOS smoke alarms in rental properties page; verified by 1pacent catalogue on 2026-05-20', null, now(), '{"official_source":true}'::jsonb)
ON CONFLICT (source_key) DO UPDATE SET
  source_name = EXCLUDED.source_name,
  source_url = EXCLUDED.source_url,
  legislation_reference = EXCLUDED.legislation_reference,
  legislation_version = EXCLUDED.legislation_version,
  effective_from = EXCLUDED.effective_from,
  verified_at = EXCLUDED.verified_at,
  payload = EXCLUDED.payload,
  updated_at = now();

INSERT INTO consumer_guarantee_references (
  jurisdiction, guarantee_key, source_name, source_url, legislation_reference,
  legislation_version, guarantee_type, applies_to, summary, operational_rule,
  effective_from, verified_at, verified_by, status, payload
)
VALUES
  ('AU', 'AU_ACL_CONSUMER_GUARANTEES_AUTOMATIC_2026_05_21', 'ACCC - Consumer rights and guarantees', 'https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees', 'Australian Consumer Law consumer guarantees', 'ACCC page crawled/verified 2026-05-21; national ACL framework', 'automatic_consumer_guarantee', 'goods_and_services', 'Consumer guarantees apply automatically when goods or services are supplied to consumers and cannot be excluded, replaced or limited by business warranty terms.', 'Do not treat a tradie warranty expiry as the end of all rights. For repeat defects, check ACL consumer guarantees and escalate before approving duplicate charges.', '2011-01-01', now(), 'codex_official_source_check', 'active', '{"official_source":true,"legal_advice":false,"notes":"Operational reference only; escalate disputes or ambiguous claims."}'::jsonb),
  ('AU', 'AU_ACL_SERVICES_DUE_CARE_SKILL_2026_05_21', 'ACCC - Consumer rights and guarantees', 'https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees', 'Australian Consumer Law service consumer guarantees', 'ACCC page crawled/verified 2026-05-21; services due care and skill guidance', 'service_due_care_and_skill', 'services', 'Services must be provided with due care and skill, fit for stated purpose where applicable, and within a reasonable time where no time is agreed.', 'If the same repair fails shortly after attendance, mark for warranty/rework review before charging another callout. Route to prior tradie where appropriate.', '2011-01-01', now(), 'codex_official_source_check', 'active', '{"official_source":true,"example":"ACCC describes a plumbing leak returning the next day as a possible due care and skill issue."}'::jsonb),
  ('AU', 'AU_ACL_WARRANTIES_ADDITIONAL_2026_05_21', 'ACCC - Warranties', 'https://www.accc.gov.au/consumers/consumer-rights-guarantees/warranties', 'Australian Consumer Law warranties and warranties against defects', 'ACCC warranties page crawled/verified 2026-05-21', 'warranty_additional_to_acl', 'goods_and_services', 'Warranties are extra promises businesses make and apply in addition to automatic consumer guarantees. Warranties cannot remove basic consumer rights.', 'Store tradie labour warranties and part warranties as commercial promises, but always keep ACL consumer guarantees as a separate protection layer.', '2011-01-01', now(), 'codex_official_source_check', 'active', '{"official_source":true,"legal_advice":false}'::jsonb),
  ('AU', 'AU_ACL_REMEDIES_REPAIR_REPLACE_REFUND_2026_05_21', 'ACCC - Problem with a product or service you bought', 'https://www.accc.gov.au/consumers/problem-with-a-product-or-service-you-bought', 'Australian Consumer Law remedies for consumer guarantee failures', 'ACCC page crawled/verified 2026-05-21', 'remedy_reference', 'goods_and_services', 'Where a product or service does not meet consumer guarantees, a remedy such as repair, replacement, refund, cancellation or compensation may be required depending on the circumstances.', 'For Wally decisions, recommend review/remedy paths and avoid auto-charging landlords for repeat defects until warranty/ACL position is checked.', '2011-01-01', now(), 'codex_official_source_check', 'active', '{"official_source":true,"legal_advice":false}'::jsonb)
ON CONFLICT (guarantee_key) DO UPDATE SET
  source_name = EXCLUDED.source_name,
  source_url = EXCLUDED.source_url,
  legislation_reference = EXCLUDED.legislation_reference,
  legislation_version = EXCLUDED.legislation_version,
  guarantee_type = EXCLUDED.guarantee_type,
  applies_to = EXCLUDED.applies_to,
  summary = EXCLUDED.summary,
  operational_rule = EXCLUDED.operational_rule,
  effective_from = EXCLUDED.effective_from,
  verified_at = EXCLUDED.verified_at,
  verified_by = EXCLUDED.verified_by,
  status = EXCLUDED.status,
  payload = EXCLUDED.payload,
  updated_at = now();

INSERT INTO compliance_requirement_catalogue (
  requirement_key, jurisdiction, activity_key, activity_name, requirement_summary,
  frequency_months, due_rule, required_tradie_type, evidence_required,
  legislation_source_key, legislation_reference, legislation_version, effective_from, status, payload
)
VALUES
  ('VIC_SMOKE_ALARM_ANNUAL_2025_11_25', 'VIC', 'smoke_alarm_safety_check', 'Annual smoke alarm safety check', 'All Victorian rental properties require annual smoke alarm safety checks to ensure alarms are correctly installed and working.', 12, 'Due every 12 months from 25 November 2025 or earlier by agency policy.', 'smoke_alarm_technician_or_electrician', ARRAY['test_result','alarm_locations','battery/replacement evidence','technician details'], 'vic_cav_smoke_alarms_2026_02_27', 'Residential Tenancies Act 1997 (VIC) sections 3, 68AA, 72', 'CAV page last updated 27 February 2026; annual checks mandatory from 25 November 2025', '2025-11-25', 'active', '{"bundle_candidate":true}'::jsonb),
  ('VIC_GAS_SAFETY_CHECK_24M_2021_03_29', 'VIC', 'gas_safety_check', 'Gas safety check', 'Rental providers for relevant agreements must conduct gas safety checks every 2 years where the premises contains gas appliances, fixtures or fittings.', 24, 'Due every 24 months for relevant rental agreements entered into after 29 March 2021, and as soon as possible if no check in last 2 years at occupation.', 'licensed_or_registered_gasfitter_type_a_servicing', ARRAY['gasfitter licence/registration','date conducted','results','servicing record'], 'vic_cav_gas_electrical_2026_05_04', 'Residential Tenancies Regulations 2021 (VIC) regulation 5, 16, 30 and Schedule 3', 'CAV page last updated 4 May 2026; Schedule 3 every two years', '2021-03-29', 'active', '{"bundle_candidate":true}'::jsonb),
  ('VIC_ELECTRICAL_SAFETY_CHECK_24M_2021_03_29', 'VIC', 'electrical_safety_check', 'Electrical safety check', 'Rental providers for relevant agreements must have all electrical installations and fittings checked by a licensed electrician at least once every 2 years.', 24, 'Due every 24 months for relevant rental agreements entered into after 29 March 2021, and as soon as possible if no check in last 2 years at occupation.', 'licensed_electrician_rec', ARRAY['electrician licence/registration','date conducted','results','AS/NZS 3019 report'], 'vic_cav_gas_electrical_2026_05_04', 'Residential Tenancies Regulations 2021 (VIC) regulation 5, 16, 30 and Schedule 3', 'CAV page last updated 4 May 2026; Schedule 3 every two years', '2021-03-29', 'active', '{"bundle_candidate":true}'::jsonb),
  ('QLD_SMOKE_ALARM_START_RENEWAL_2026', 'QLD', 'smoke_alarm_tenancy_start_renewal_check', 'Smoke alarm test before tenancy start or renewal', 'Property managers/owners are required to test smoke alarms within 30 days before the start date of a tenancy, including a renewed tenancy.', null, 'Due within 30 days before tenancy start or renewal.', 'smoke_alarm_technician', ARRAY['test_result','battery/replacement evidence','alarm compliance notes'], 'qld_rta_smoke_alarms_2026', 'Fire Services Act 1990 (QLD); Building Fire Safety Regulation 2008 (QLD)', 'RTA smoke alarms page verified 2026-05-20', null, 'active', '{"bundle_candidate":true}'::jsonb),
  ('NSW_SMOKE_ALARM_REPAIR_MAINTAIN_2026', 'NSW', 'smoke_alarm_repair_maintain', 'Smoke alarm repair and maintenance', 'Landlords should check smoke alarms are working, repair smoke alarms within required timeframes, and install or replace removable batteries every year.', 12, 'Annual battery replacement/check where applicable and repair within required smoke alarm repair timeframes.', 'smoke_alarm_technician_or_electrician', ARRAY['working test result','battery replacement evidence','repair notes'], 'nsw_fair_trading_smoke_alarms_2026', 'Residential Tenancies Regulation 2019 (NSW)', 'NSW Government landlord responsibilities page verified 2026-05-20', '2020-03-23', 'active', '{"bundle_candidate":true}'::jsonb),
  ('WA_SMOKE_ALARM_RENT_HIRE_2026', 'WA', 'smoke_alarm_compliance_check', 'Smoke alarm compliance check', 'Homes made available for rent or hire must have compliant mains powered smoke alarms that are less than 10 years old, working and maintained by the landlord.', null, 'Check before lease/rent/hire and maintain during tenancy.', 'smoke_alarm_technician_or_electrician', ARRAY['working test result','age check','mains power compliance note'], 'wa_lgirs_rental_home_safety_2026', 'WA smoke alarm rental home safety requirements', 'WA Consumer Protection rental home safety page verified 2026-05-20', null, 'active', '{"bundle_candidate":true}'::jsonb),
  ('WA_RCD_RENTAL_HOME_2026', 'WA', 'rcd_safety_check', 'RCD safety switch check', 'Rental homes must have two RCDs installed on the switchboard before being leased; faulty RCDs must be replaced immediately.', null, 'Check before lease and when reported faulty.', 'licensed_electrician', ARRAY['RCD test result','switchboard photo','electrician details'], 'wa_lgirs_rental_home_safety_2026', 'WA RCD rental home safety requirements', 'WA Consumer Protection rental home safety page verified 2026-05-20', null, 'active', '{"bundle_candidate":true}'::jsonb),
  ('SA_SMOKE_ALARM_WORKING_2023_06_02', 'SA', 'smoke_alarm_compliance_check', 'Smoke alarm working and correctly installed check', 'Residential landlords are responsible for making sure smoke alarms are working and installed correctly.', null, 'Check before lease and when smoke alarm status changes.', 'smoke_alarm_technician_or_electrician', ARRAY['working test result','installation compliance notes'], 'sa_gov_smoke_alarms_2023_06_02', 'South Australian smoke alarm property safety requirements', 'SA.GOV.AU page last updated 2 June 2023', null, 'active', '{"bundle_candidate":true}'::jsonb),
  ('TAS_SMOKE_ALARM_RENTAL_2024', 'TAS', 'smoke_alarm_rental_compliance_check', 'Smoke alarm rental compliance check', 'Owners must install and maintain smoke alarms for rented residential properties, with alarms permanently connected to power or powered by a 10-year non-replaceable battery.', null, 'Check at tenancy setup and when alarm condition changes.', 'smoke_alarm_technician_or_electrician', ARRAY['alarm type','installation location','working test result'], 'tas_cbos_smoke_alarms_2024', 'Residential Tenancy Act 1997 (TAS) and related smoke alarm Regulations', 'CBOS page verified 2026-05-20', null, 'active', '{"bundle_candidate":true}'::jsonb)
ON CONFLICT (requirement_key) DO UPDATE SET
  requirement_summary = EXCLUDED.requirement_summary,
  frequency_months = EXCLUDED.frequency_months,
  due_rule = EXCLUDED.due_rule,
  required_tradie_type = EXCLUDED.required_tradie_type,
  evidence_required = EXCLUDED.evidence_required,
  legislation_source_key = EXCLUDED.legislation_source_key,
  legislation_reference = EXCLUDED.legislation_reference,
  legislation_version = EXCLUDED.legislation_version,
  effective_from = EXCLUDED.effective_from,
  status = EXCLUDED.status,
  verified_at = now(),
  payload = EXCLUDED.payload,
  updated_at = now();

INSERT INTO compliance_bundle_catalogue (
  bundle_key, jurisdiction, bundle_name, included_activity_keys, fixed_fee_amount,
  tradie_payout_amount, platform_margin_amount, recommended_duration_minutes,
  travel_saving_strategy, evidence_required, status, effective_from, payload
)
VALUES
  ('VIC_RENTAL_COMPLIANCE_PACK_V1', 'VIC', 'Victorian Rental Compliance Pack', ARRAY['smoke_alarm_safety_check','electrical_safety_check','gas_safety_check'], 649, 560, 89, 210, 'Bundle smoke, electrical and gas compliance in one tenant access window where property has both electrical and gas requirements.', ARRAY['smoke alarm evidence','electrical report','gas safety record','certificate URLs'], 'active', '2025-11-25', '{"pricing_version":"v1","fixed_fee_indicative":true}'::jsonb),
  ('VIC_SMOKE_ELECTRICAL_PACK_V1', 'VIC', 'Smoke Alarm + Electrical Safety Pack', ARRAY['smoke_alarm_safety_check','electrical_safety_check'], 399, 340, 59, 150, 'Pair annual smoke alarm check with electrical safety visit where electrical check is due inside the next 90 days.', ARRAY['smoke alarm evidence','electrical report'], 'active', '2025-11-25', '{"pricing_version":"v1","fixed_fee_indicative":true}'::jsonb),
  ('NATIONAL_SMOKE_ALARM_RUN_V1', 'NATIONAL', 'Smoke Alarm Local Run', ARRAY['smoke_alarm_safety_check','smoke_alarm_compliance_check','smoke_alarm_repair_maintain','smoke_alarm_tenancy_start_renewal_check','smoke_alarm_rental_compliance_check'], 129, 105, 24, 45, 'Cluster smoke alarm checks by suburb to reduce travel and create dense half-day tradie runs.', ARRAY['working test result','alarm locations','photo evidence'], 'active', null, '{"pricing_version":"v1","fixed_fee_indicative":true}'::jsonb),
  ('WA_RCD_SMOKE_PACK_V1', 'WA', 'WA RCD + Smoke Alarm Pack', ARRAY['rcd_safety_check','smoke_alarm_compliance_check'], 299, 255, 44, 120, 'Combine RCD and smoke alarm compliance checks in one electrician visit before or during tenancy.', ARRAY['RCD test result','smoke alarm evidence','switchboard photo'], 'active', null, '{"pricing_version":"v1","fixed_fee_indicative":true}'::jsonb)
ON CONFLICT (bundle_key) DO UPDATE SET
  bundle_name = EXCLUDED.bundle_name,
  included_activity_keys = EXCLUDED.included_activity_keys,
  fixed_fee_amount = EXCLUDED.fixed_fee_amount,
  tradie_payout_amount = EXCLUDED.tradie_payout_amount,
  platform_margin_amount = EXCLUDED.platform_margin_amount,
  recommended_duration_minutes = EXCLUDED.recommended_duration_minutes,
  travel_saving_strategy = EXCLUDED.travel_saving_strategy,
  evidence_required = EXCLUDED.evidence_required,
  status = EXCLUDED.status,
  verified_at = now(),
  payload = EXCLUDED.payload,
  updated_at = now();

INSERT INTO tradie_companies (id, name, active, updated_at)
VALUES
  ('TC-ELECTRICAL-001', 'Demo Electrical Company', true, now()),
  ('TC-PLUMBING-001', 'Demo Plumbing Company', true, now())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  active = true,
  updated_at = now();

INSERT INTO tradies (id, company_id, name, active, updated_at)
VALUES
  ('TRD-ELECTRICAL-001', 'TC-ELECTRICAL-001', 'Demo Electrical Tradie', true, now()),
  ('TRD-PLUMBING-001', 'TC-PLUMBING-001', 'Demo Plumbing Tradie', true, now())
ON CONFLICT (id) DO UPDATE SET
  company_id = EXCLUDED.company_id,
  name = EXCLUDED.name,
  active = true,
  updated_at = now();

INSERT INTO tradie_commercial_terms (
  tradie_id, company_id, trade_type, job_type, standard_callout_fee, emergency_callout_fee,
  hourly_rate, minimum_labour_minutes, labour_warranty_days, parts_warranty_policy,
  parts_warranty_days, can_discount, callout_waiver_policy, sally_discount_instructions,
  effective_from, active, payload
)
VALUES
  ('TRD-ELECTRICAL-001', 'TC-ELECTRICAL-001', 'electrical', null, 150, 220, 120, 60, 90, 'Manufacturer or supplier warranty applies to supplied parts, plus Australian Consumer Law consumer guarantees where applicable.', null, true, 'May waive callout for confirmed warranty rework, repeat issue within 30 days, or bundled compliance run where margin remains acceptable.', 'For customer-facing estimates, Sally may say the callout may be waived if the issue is confirmed as covered warranty rework. Do not promise a waiver before review.', current_date, true, '{"source":"demo_default","consumer_guarantee_keys":["AU_ACL_CONSUMER_GUARANTEES_AUTOMATIC_2026_05_21","AU_ACL_SERVICES_DUE_CARE_SKILL_2026_05_21","AU_ACL_WARRANTIES_ADDITIONAL_2026_05_21"]}'::jsonb),
  ('TRD-PLUMBING-001', 'TC-PLUMBING-001', 'plumbing', null, 140, 210, 110, 60, 90, 'Manufacturer or supplier warranty applies to supplied parts, plus Australian Consumer Law consumer guarantees where applicable.', null, true, 'May waive callout for confirmed same-leak warranty rework within the labour warranty period.', 'Sally may explain that repeat leaks are reviewed before any duplicate callout is approved.', current_date, true, '{"source":"demo_default","consumer_guarantee_keys":["AU_ACL_CONSUMER_GUARANTEES_AUTOMATIC_2026_05_21","AU_ACL_SERVICES_DUE_CARE_SKILL_2026_05_21"]}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO agent_definitions (
  agent_key, agent_name, agent_role, purpose, operating_scope, customer_facing, owner_domain,
  responsibilities, success_measures, handoff_triggers, guardrails, model_provider, model_name, active
)
VALUES
(
  'patricia_property_manager',
  'Patricia',
  'Property manager work-order orchestration AI agent',
  'Reduce property manager admin by triaging rental maintenance, applying contract approval rules and coordinating tenant/landlord/tradie workflows.',
  'Internal n8n agent. Owns rental work orders, property manager rules, tenant access, landlord approval thresholds and escalation policy.',
  false,
  'rental_work_order_operations',
  '["Classify rental work orders","Apply approval thresholds","Route landlord approvals","Coordinate tenant access windows","Escalate exceptions to property managers","Measure admin-time reduction"]'::jsonb,
  '["Auto-approval rate within contract thresholds","Manual intervention rate","Time from tenant report to actionable work order","Landlord approval turnaround","Tenant access confirmation rate"]'::jsonb,
  '["Tenant reports issue","Sally identifies rental persona","Quote exceeds threshold","Emergency job needs auto approval","Landlord approval pending","Tenant access missing"]'::jsonb,
  '["Do not approve spend above configured threshold","Do not bypass landlord approval where contract requires it","Keep audit trail for approvals","Escalate safety/compliance risks"]'::jsonb,
  'google_gemini',
  'models/gemini-3.1-flash-lite',
  true
),
(
  'leo_landlord',
  'Leo',
  'Landlord approval and owner communication AI agent',
  'Help landlords approve maintenance quickly with clear quote, risk, compliance and property-impact summaries.',
  'Internal n8n agent. Owns landlord approval messaging, spend summaries, property history and compliance upsell explanations.',
  false,
  'landlord_approvals',
  '["Summarise work order impact","Request landlord approval","Explain quote assumptions","Surface compliance risk","Track approval decisions","Support annual compliance upsell"]'::jsonb,
  '["Approval response time","Approval conversion rate","Fewer follow-up questions","Compliance offer acceptance rate","Landlord satisfaction score"]'::jsonb,
  '["Approval required above threshold","Compliance service offer due","Landlord asks for quote context","Property manager needs owner-ready summary"]'::jsonb,
  '["Do not pressure approval","Do not invent legal advice","Make spend and assumptions clear","Escalate disputed approvals to property manager"]'::jsonb,
  'google_gemini',
  'models/gemini-3.1-flash-lite',
  true
),
(
  'connie_compliance',
  'Connie',
  'Rental compliance workflow and certificate vault AI agent',
  'Own recurring rental compliance workflows, certificate capture, renewal reminders and compliance service upsell opportunities.',
  'Internal n8n agent. Tracks smoke alarm, gas, electrical and other rental compliance obligations by property and jurisdiction.',
  false,
  'rental_compliance',
  '["Track compliance due dates","Create compliance work orders","Capture certificates","Flag expired/missing evidence","Recommend annual compliance bundles","Measure certificate capture rate"]'::jsonb,
  '["Certificate capture rate","Expired compliance count","Compliance bundle conversion","Renewal reminder completion","Audit-ready property percentage"]'::jsonb,
  '["Compliance due soon","Certificate uploaded","Compliance job completed","Landlord/agency eligible for annual package","Audit report requested"]'::jsonb,
  '["Do not provide legal advice","Use jurisdiction-specific rules as configurable data","Require certificate evidence","Escalate missing or expired compliance records"]'::jsonb,
  'google_gemini',
  'models/gemini-3.1-flash-lite',
  true
),
(
  'wally_warranty',
  'Wally',
  'Warranty, repeat issue and cost-protection AI agent',
  'Detect repeat rental maintenance issues, protect landlords from duplicate charges, route genuine warranty work back to the previous tradie, and surface fair non-accusatory responsibility signals.',
  'Internal n8n agent. Reviews new work orders before quote/scheduling, compares prior work, parts, evidence, warranties and tenant/property history.',
  false,
  'warranty_repeat_issue_cost_control',
  '["Detect repeated issues at the same property","Match possible warranty coverage","Route work back to previous tradie where warranty applies","Flag duplicate part replacement risk","Identify unusual work-order frequency patterns","Use neutral responsibility language"]'::jsonb,
  '["Avoided duplicate landlord charges","Warranty recovery rate","Repeat issue detection precision","Reduced unnecessary callout fees","Fair responsibility triage completion rate"]'::jsonb,
  '["New work order resembles completed job","Same part replaced recently","Tenant reports issue within warranty period","High request frequency at property","Tradie suggests replacement of recently replaced part"]'::jsonb,
  '["Do not accuse tenants of damage","Do not deny urgent safety repairs","Do not charge landlord for likely warranty rework without review","Escalate disputed responsibility to property manager"]'::jsonb,
  'google_gemini',
  'models/gemini-3.1-flash-lite',
  true
)
ON CONFLICT (agent_key) DO UPDATE SET
  agent_name = EXCLUDED.agent_name,
  agent_role = EXCLUDED.agent_role,
  purpose = EXCLUDED.purpose,
  operating_scope = EXCLUDED.operating_scope,
  customer_facing = EXCLUDED.customer_facing,
  owner_domain = EXCLUDED.owner_domain,
  responsibilities = EXCLUDED.responsibilities,
  success_measures = EXCLUDED.success_measures,
  handoff_triggers = EXCLUDED.handoff_triggers,
  guardrails = EXCLUDED.guardrails,
  model_provider = EXCLUDED.model_provider,
  model_name = EXCLUDED.model_name,
  active = true,
  updated_at = now();

INSERT INTO mcp_services (service_key, service_name, provider, category, capability, endpoint_path, workflow_id, credential_name, status, available_to_agents, config)
VALUES
  ('rental_work_orders', 'Rental Work Orders', 'postgres', 'property_management', 'Rental property work-order source of truth with tenant, landlord, property manager and approval context', '/webhook/rental/work-orders/intake', null, 'Tradie App Postgres', 'active', ARRAY['sally_receptionist','patricia_property_manager','leo_landlord','connie_compliance','george_foreman','nelly','penny','quintino'], '{"source_of_truth":"postgres"}'::jsonb),
  ('rental_compliance', 'Rental Compliance Engine', 'postgres', 'property_management', 'Compliance requirements, certificates, annual packages and renewal/upsell workflows', '/webhook/rental/compliance/offer', null, 'Tradie App Postgres', 'active', ARRAY['connie_compliance','patricia_property_manager','leo_landlord','quintino'], '{"jurisdiction":"configurable","initial_state":"VIC"}'::jsonb),
  ('inspection_report_ingestion', 'Inspection Report Ingestion', 'postgres', 'property_management', 'Inspection report intake, finding extraction and automatic rental work-order creation', '/webhook/rental/inspection-reports/ingest', null, 'Tradie App Postgres', 'active', ARRAY['patricia_property_manager','connie_compliance','sally_receptionist','quintino'], '{"supports":["manual_text","structured_findings","future_file_download","future_ocr"]}'::jsonb),
  ('rental_quote_options', 'Rental Quote Options', 'postgres', 'property_management', 'Create and approve landlord-ready quote options that already match tenant availability, tradie availability, urgency, cost and trust score', '/webhook/rental/quote-options/generate', null, 'Tradie App Postgres', 'active', ARRAY['patricia_property_manager','leo_landlord','nelly','george_foreman','quintino'], '{"ranking_weights":{"trust":0.40,"cost":0.35,"availability":0.25},"approve_endpoint":"/webhook/rental/quote-options/approve","confirm_endpoint":"/webhook/rental/confirmations/respond","goal":"reduce tenant-tradie-landlord ping-pong"}'::jsonb),
  ('rental_job_completion', 'Rental Job Completion Evidence', 'postgres', 'property_management', 'Capture completion evidence, job actuals, quote accuracy, compliance certificates and invoice trigger for rental jobs', '/webhook/rental/jobs/complete', null, 'Tradie App Postgres', 'active', ARRAY['patricia_property_manager','connie_compliance','nelly','penny','mia_social','quintino'], '{"feeds":["quote_accuracy_metrics","job_actuals","invoices","rental_job_evidence"],"goal":"audit-ready completion and pricing moat"}'::jsonb),
  ('rental_schedule_optimiser', 'Rental Schedule Optimiser', 'postgres', 'property_management', 'Forecast two-week tradie productivity, bundled compliance runs, tenant availability matching and fallback options', '/webhook/rental/schedule/forecast', null, 'Tradie App Postgres', 'active', ARRAY['george_foreman','patricia_property_manager','connie_compliance','nelly','quintino'], '{"forecast_days":14,"goal":"maximise tradie productivity and minimise landlord travel/admin cost"}'::jsonb),
  ('rental_warranty_guard', 'Rental Warranty Guard', 'postgres', 'property_management', 'Detect repeat issues, warranty candidates, duplicate part replacements and neutral tenant/property responsibility signals before landlord charges are approved', '/webhook/rental/warranty/review', null, 'Tradie App Postgres', 'active', ARRAY['wally_warranty','patricia_property_manager','leo_landlord','nelly','george_foreman','quintino'], '{"goal":"avoid duplicate landlord charges and route warranty rework to previous tradie"}'::jsonb)
ON CONFLICT (service_key) DO UPDATE SET
  service_name = EXCLUDED.service_name,
  category = EXCLUDED.category,
  capability = EXCLUDED.capability,
  endpoint_path = EXCLUDED.endpoint_path,
  status = EXCLUDED.status,
  available_to_agents = EXCLUDED.available_to_agents,
  config = EXCLUDED.config,
  updated_at = now();

INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
VALUES ('rental_foundation', 'property_management', 'rental_foundation_setup', '{"agents":["patricia_property_manager","leo_landlord","connie_compliance","wally_warranty"]}'::jsonb);

SELECT jsonb_build_object(
  'success', true,
  'message', 'Rental property management foundation is ready.',
  'agents_added', ARRAY['patricia_property_manager','leo_landlord','connie_compliance','wally_warranty']
) AS setup_result;
`;
return [{ json: { sql: query } }];
'@

$workOrderCode = @'
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
function bool(value) {
  return value === true || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'yes';
}
function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}
function id(prefix, provided) {
  return first(provided, `${prefix}-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`);
}

const agency = body.agency || {};
const pm = body.property_manager || {};
const landlord = body.landlord || {};
const tenant = body.tenant || body.customer || {};
const property = body.property || {};
const work = body.work_order || body.job || {};

function nextDateForText(text, index) {
  const lower = String(text || '').toLowerCase();
  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const now = new Date();
  const targetDay = dayNames.findIndex(day => lower.includes(day));
  const date = new Date(now);
  if (targetDay >= 0) {
    const delta = (targetDay - now.getDay() + 7) % 7 || 7;
    date.setDate(now.getDate() + delta);
  } else {
    date.setDate(now.getDate() + index + 1);
  }

  const timeMatches = [...lower.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/g)];
  const to24 = (match, fallbackHour) => {
    if (!match) return [fallbackHour, 0];
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const suffix = match[3];
    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    return [hour, minute];
  };

  let startHour = 9;
  let endHour = 11;
  if (lower.includes('morning')) {
    startHour = 9; endHour = 12;
  } else if (lower.includes('afternoon')) {
    startHour = 13; endHour = 16;
  } else if (lower.includes('evening')) {
    startHour = 17; endHour = 19;
  }

  const [parsedStartHour, parsedStartMinute] = to24(timeMatches[0], startHour);
  const [parsedEndHour, parsedEndMinute] = to24(timeMatches[1], endHour);
  const start = new Date(date);
  start.setHours(parsedStartHour, parsedStartMinute, 0, 0);
  const end = new Date(date);
  end.setHours(parsedEndHour, parsedEndMinute, 0, 0);
  if (end <= start) end.setHours(start.getHours() + 2, start.getMinutes(), 0, 0);
  return { window_start: start.toISOString(), window_end: end.toISOString() };
}

function normaliseAvailability(value, index, requesterRole) {
  if (value && typeof value === 'object') {
    const notes = first(value.access_notes, value.notes, value.label, value.text, '');
    const start = first(value.window_start, value.start, value.from);
    const end = first(value.window_end, value.end, value.to);
    if (start && end) {
      return {
        window_start: start,
        window_end: end,
        preference_rank: first(value.preference_rank, value.rank, index + 1),
        access_notes: first(notes, `${requesterRole} availability ${index + 1}`),
      };
    }
    const parsed = nextDateForText(notes || JSON.stringify(value), index);
    return {
      ...parsed,
      preference_rank: first(value.preference_rank, value.rank, index + 1),
      access_notes: first(notes, `${requesterRole} availability ${index + 1}`),
    };
  }
  const text = String(value || '').trim();
  if (!text) return null;
  return {
    ...nextDateForText(text, index),
    preference_rank: index + 1,
    access_notes: text,
  };
}

const agencyId = id('AGY', first(body.agency_id, agency.id));
const pmId = id('PM', first(body.property_manager_id, pm.id));
const landlordId = id('LL', first(body.landlord_id, landlord.id));
const tenantId = id('TEN', first(body.tenant_id, tenant.id));
const propertyId = id('PROP', first(body.property_id, property.id));
const tenancyId = id('LEASE', first(body.tenancy_id));
const workOrderId = id('WO', first(body.work_order_id, work.id));
const approvalId = id('APR', first(body.approval_id));

const estimatedAmount = first(work.estimated_amount, body.estimated_amount, body.amount);
const urgency = first(work.urgency, body.urgency, 'normal');
const tradeType = first(work.trade_type, body.trade_type, 'unspecified');
const jobType = first(work.job_type, body.job_type, tradeType);
const category = first(work.category, body.category, 'maintenance');
const complianceRequired = bool(first(work.compliance_required, body.compliance_required, category === 'compliance'));
const propertyScenario = first(body.property_scenario, body.occupancy_type, property.property_scenario, 'rental');
const requesterRole = first(body.requester_role, propertyScenario === 'owner_occupied' ? 'owner' : 'tenant');
const approvalRecipientRole = first(body.approval_recipient_role, propertyScenario === 'owner_occupied' ? 'owner' : 'landlord');
const requesterAvailabilityInput = first(
  Array.isArray(body.availability_windows) ? body.availability_windows : '',
  Array.isArray(body.requester_availability_windows) ? body.requester_availability_windows : '',
  Array.isArray(body.requester_availability) ? body.requester_availability : '',
  Array.isArray(body.tenant_availability) ? body.tenant_availability : '',
  Array.isArray(body.owner_availability) ? body.owner_availability : '',
  []
);
const requesterAvailability = (Array.isArray(requesterAvailabilityInput) ? requesterAvailabilityInput : [])
  .map((value, index) => normaliseAvailability(value, index, requesterRole))
  .filter(Boolean)
  .slice(0, 12);
const requesterAvailabilityValues = requesterAvailability.map(w => `(
  ${sql(workOrderId)},
  ${sql(tenantId)},
  ${sql(w.window_start)}::timestamptz,
  ${sql(w.window_end)}::timestamptz,
  ${Number.parseInt(String(w.preference_rank), 10) || 1},
  ${sql(`${requesterRole}: ${w.access_notes}`)},
  'offered',
  now()
)`).join(',\n');

const query = `
WITH upsert_agency AS (
  INSERT INTO agencies (id, name, primary_email, primary_phone, plan_key, payload, updated_at)
  VALUES (${sql(agencyId)}, ${sql(first(agency.name, body.agency_name, 'Demo Property Agency'))}, ${sql(first(agency.email, agency.primary_email))}, ${sql(first(agency.phone, agency.primary_phone))}, ${sql(first(agency.plan_key, 'starter'))}, ${jsonSql(agency)}, now())
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, primary_email = EXCLUDED.primary_email, primary_phone = EXCLUDED.primary_phone, plan_key = EXCLUDED.plan_key, payload = EXCLUDED.payload, updated_at = now()
  RETURNING id
),
upsert_pm AS (
  INSERT INTO property_managers (id, agency_id, name, email, phone, approval_limit, updated_at)
  VALUES (${sql(pmId)}, ${sql(agencyId)}, ${sql(first(pm.name, body.property_manager_name, 'Property Manager'))}, ${sql(first(pm.email, body.property_manager_email))}, ${sql(first(pm.phone, body.property_manager_phone))}, COALESCE(${num(first(pm.approval_limit, body.pm_approval_limit))}, 300), now())
  ON CONFLICT (id) DO UPDATE SET agency_id = EXCLUDED.agency_id, name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone, approval_limit = EXCLUDED.approval_limit, updated_at = now()
  RETURNING id, approval_limit
),
upsert_landlord AS (
  INSERT INTO landlords (id, name, email, phone, default_approval_limit, prefers_auto_approval, updated_at)
  VALUES (${sql(landlordId)}, ${sql(first(landlord.name, body.landlord_name, 'Landlord'))}, ${sql(first(landlord.email, body.landlord_email))}, ${sql(first(landlord.phone, body.landlord_phone))}, COALESCE(${num(first(landlord.default_approval_limit, body.landlord_approval_limit))}, 300), ${bool(first(landlord.prefers_auto_approval, body.prefers_auto_approval))}, now())
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone, default_approval_limit = EXCLUDED.default_approval_limit, prefers_auto_approval = EXCLUDED.prefers_auto_approval, updated_at = now()
  RETURNING id, default_approval_limit, prefers_auto_approval
),
upsert_tenant AS (
  INSERT INTO tenants (id, name, email, phone, updated_at)
  VALUES (${sql(tenantId)}, ${sql(first(tenant.name, body.tenant_name, body.customer_name, 'Tenant'))}, ${sql(first(tenant.email, body.tenant_email, body.email))}, ${sql(first(tenant.phone, body.tenant_phone, body.phone))}, now())
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone, updated_at = now()
  RETURNING id
),
upsert_property AS (
  INSERT INTO rental_properties (id, agency_id, property_manager_id, landlord_id, address, suburb, state, postcode, access_notes, updated_at)
  VALUES (
    ${sql(propertyId)},
    ${sql(agencyId)},
    ${sql(pmId)},
    ${sql(landlordId)},
    COALESCE(${sql(first(property.address, body.address))}, (SELECT address FROM rental_properties WHERE id = ${sql(propertyId)}), 'Address to be confirmed'),
    COALESCE(${sql(first(property.suburb, body.suburb))}, (SELECT suburb FROM rental_properties WHERE id = ${sql(propertyId)})),
    COALESCE(${sql(first(property.state, 'VIC'))}, (SELECT state FROM rental_properties WHERE id = ${sql(propertyId)}), 'VIC'),
    COALESCE(${sql(first(property.postcode, body.postcode))}, (SELECT postcode FROM rental_properties WHERE id = ${sql(propertyId)})),
    COALESCE(${sql(first(property.access_notes, body.access_notes))}, (SELECT access_notes FROM rental_properties WHERE id = ${sql(propertyId)})),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    agency_id = EXCLUDED.agency_id,
    property_manager_id = EXCLUDED.property_manager_id,
    landlord_id = EXCLUDED.landlord_id,
    address = COALESCE(EXCLUDED.address, rental_properties.address),
    suburb = COALESCE(EXCLUDED.suburb, rental_properties.suburb),
    state = COALESCE(EXCLUDED.state, rental_properties.state),
    postcode = COALESCE(EXCLUDED.postcode, rental_properties.postcode),
    access_notes = COALESCE(EXCLUDED.access_notes, rental_properties.access_notes),
    updated_at = now()
  RETURNING id
),
upsert_tenancy AS (
  INSERT INTO tenancies (id, property_id, tenant_id, status, updated_at)
  VALUES (${sql(tenancyId)}, ${sql(propertyId)}, ${sql(tenantId)}, 'active', now())
  ON CONFLICT (id) DO UPDATE SET property_id = EXCLUDED.property_id, tenant_id = EXCLUDED.tenant_id, status = 'active', updated_at = now()
  RETURNING id
),
matching_rule AS (
  SELECT *
  FROM approval_rules
  WHERE active = true
    AND (agency_id IS NULL OR agency_id = ${sql(agencyId)})
    AND (landlord_id IS NULL OR landlord_id = ${sql(landlordId)})
    AND (property_id IS NULL OR property_id = ${sql(propertyId)})
    AND (trade_type IS NULL OR lower(trade_type) = lower(${sql(tradeType)}))
    AND (job_type IS NULL OR lower(job_type) = lower(${sql(jobType)}))
  ORDER BY property_id NULLS LAST, landlord_id NULLS LAST, trade_type NULLS LAST
  LIMIT 1
),
decision AS (
  SELECT
    COALESCE((SELECT threshold_amount FROM matching_rule), (SELECT default_approval_limit FROM upsert_landlord), (SELECT approval_limit FROM upsert_pm), 300) AS threshold_amount,
    COALESCE((SELECT auto_approve_emergency FROM matching_rule), true) AS auto_approve_emergency,
    COALESCE((SELECT auto_approve_compliance FROM matching_rule), false) AS auto_approve_compliance,
    COALESCE((SELECT requires_landlord_approval FROM matching_rule), true) AS requires_landlord_approval,
    COALESCE(${num(estimatedAmount)}, 0) AS estimated_amount
),
approval_decision AS (
  SELECT
    CASE
      WHEN lower(${sql(urgency)}) IN ('urgent','emergency') AND auto_approve_emergency THEN 'auto_approved_emergency'
      WHEN ${complianceRequired ? 'true' : 'false'} AND auto_approve_compliance THEN 'auto_approved_compliance'
      WHEN estimated_amount > 0 AND estimated_amount <= threshold_amount AND requires_landlord_approval = false THEN 'auto_approved_within_pm_threshold'
      WHEN estimated_amount > 0 AND estimated_amount <= threshold_amount AND (SELECT prefers_auto_approval FROM upsert_landlord) THEN 'auto_approved_within_landlord_threshold'
      ELSE ${sql(`${approvalRecipientRole}_approval_required`)}
    END AS approval_status,
    threshold_amount,
    estimated_amount
  FROM decision
),
upsert_work_order AS (
  INSERT INTO work_orders (
    id, agency_id, property_id, tenancy_id, tenant_id, landlord_id, property_manager_id, lead_id,
    source, category, trade_type, job_type, description, urgency, status, indicative_price_band,
    estimated_amount, approval_status, approval_required, auto_approved, tenant_preferred_time,
    scheduled_window, tenant_access_confirmed, compliance_required, payload, updated_at
  )
  VALUES (
    ${sql(workOrderId)}, ${sql(agencyId)}, ${sql(propertyId)}, ${sql(tenancyId)}, ${sql(tenantId)}, ${sql(landlordId)}, ${sql(pmId)}, ${sql(first(body.lead_id, work.lead_id))},
    ${sql(first(body.source, 'sally'))}, ${sql(category)}, ${sql(tradeType)}, ${sql(jobType)}, ${sql(first(work.description, body.description, body.job_description))}, ${sql(urgency)}, 'triaged',
    ${sql(first(work.indicative_price_band, body.indicative_price_band))}, (SELECT estimated_amount FROM approval_decision),
    (SELECT approval_status FROM approval_decision),
    (SELECT approval_status FROM approval_decision) IN ('landlord_approval_required','owner_approval_required'),
    (SELECT approval_status FROM approval_decision) NOT IN ('landlord_approval_required','owner_approval_required'),
    ${sql(first(work.tenant_preferred_time, body.preferred_time))}, ${sql(first(work.scheduled_window, body.scheduled_window))},
    ${bool(first(work.tenant_access_confirmed, body.tenant_access_confirmed))}, ${complianceRequired ? 'true' : 'false'},
    ${jsonSql({
      ...body,
      property_scenario: propertyScenario,
      requester_role: requesterRole,
      approval_recipient_role: approvalRecipientRole,
      requester_availability_windows: requesterAvailability,
      warranty_check_required: true,
      quote_matching_requires_availability_overlap: true,
    })}, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    approval_status = EXCLUDED.approval_status,
    approval_required = EXCLUDED.approval_required,
    auto_approved = EXCLUDED.auto_approved,
    estimated_amount = EXCLUDED.estimated_amount,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
insert_requester_availability AS (
  INSERT INTO tenant_availability_windows (work_order_id, tenant_id, window_start, window_end, preference_rank, access_notes, status, updated_at)
  SELECT v.work_order_id, v.tenant_id, v.window_start, v.window_end, v.preference_rank, v.access_notes, v.status, v.updated_at
  FROM (
    ${requesterAvailabilityValues ? `SELECT * FROM (VALUES ${requesterAvailabilityValues}) AS v(work_order_id, tenant_id, window_start, window_end, preference_rank, access_notes, status, updated_at)` : "SELECT NULL::text AS work_order_id, NULL::text AS tenant_id, NULL::timestamptz AS window_start, NULL::timestamptz AS window_end, NULL::integer AS preference_rank, NULL::text AS access_notes, NULL::text AS status, NULL::timestamptz AS updated_at WHERE false"}
  ) v
  WHERE v.work_order_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM tenant_availability_windows tw
      WHERE tw.work_order_id = v.work_order_id
        AND tw.window_start = v.window_start
        AND tw.window_end = v.window_end
    )
  RETURNING *
),
wally_prior_work AS (
  SELECT
    prev.*,
    rje.tradie_id AS previous_tradie_id,
    rje.created_at AS completed_at
  FROM upsert_work_order wo
  JOIN work_orders prev
    ON prev.property_id = wo.property_id
   AND prev.id <> wo.id
   AND prev.created_at >= now() - interval '180 days'
  LEFT JOIN rental_job_evidence rje ON rje.work_order_id = prev.id
  WHERE lower(COALESCE(prev.trade_type, '')) = lower(COALESCE(wo.trade_type, ''))
    AND (
      lower(COALESCE(prev.job_type, '')) = lower(COALESCE(wo.job_type, ''))
      OR lower(COALESCE(prev.description, '')) LIKE '%' || split_part(lower(COALESCE(wo.description, '')), ' ', 1) || '%'
    )
),
wally_matching_warranty AS (
  SELECT wow.*
  FROM upsert_work_order wo
  JOIN work_order_warranties wow
    ON wow.property_id = wo.property_id
   AND wow.status = 'active'
   AND now()::date <= COALESCE(wow.warranty_end, now()::date)
   AND (wow.trade_type IS NULL OR lower(wow.trade_type) = lower(COALESCE(wo.trade_type, '')))
   AND (wow.job_type IS NULL OR lower(wow.job_type) = lower(COALESCE(wo.job_type, '')))
  ORDER BY wow.warranty_end DESC
  LIMIT 1
),
wally_decision AS (
  SELECT
    wo.*,
    (SELECT count(*)::integer FROM wally_prior_work) AS repeat_count,
    COALESCE(
      (SELECT warranty_key FROM wally_matching_warranty),
      (
        SELECT warranty_key
        FROM work_order_warranties wow
        WHERE wow.property_id = wo.property_id
          AND wow.status = 'active'
          AND now()::date <= COALESCE(wow.warranty_end, now()::date)
          AND (wow.trade_type IS NULL OR lower(wow.trade_type) = lower(COALESCE(wo.trade_type, '')))
        ORDER BY
          CASE WHEN lower(COALESCE(wow.job_type, '')) = lower(COALESCE(wo.job_type, '')) THEN 0 ELSE 1 END,
          wow.warranty_end DESC
        LIMIT 1
      )
    ) AS matched_warranty_key,
    COALESCE(
      (SELECT tradie_id FROM wally_matching_warranty),
      (
        SELECT tradie_id
        FROM work_order_warranties wow
        WHERE wow.property_id = wo.property_id
          AND wow.status = 'active'
          AND now()::date <= COALESCE(wow.warranty_end, now()::date)
          AND (wow.trade_type IS NULL OR lower(wow.trade_type) = lower(COALESCE(wo.trade_type, '')))
        ORDER BY
          CASE WHEN lower(COALESCE(wow.job_type, '')) = lower(COALESCE(wo.job_type, '')) THEN 0 ELSE 1 END,
          wow.warranty_end DESC
        LIMIT 1
      ),
      (SELECT previous_tradie_id FROM wally_prior_work WHERE previous_tradie_id IS NOT NULL ORDER BY completed_at DESC LIMIT 1)
    ) AS previous_tradie_id
  FROM upsert_work_order wo
),
wally_review AS (
  INSERT INTO repeat_issue_reviews (
    review_key, work_order_id, property_id, tenant_id, trade_type, job_type,
    issue_signature, repeat_count, warranty_candidate, matched_warranty_key,
    previous_tradie_id, landlord_charge_recommendation, tenant_responsibility_signal,
    recommended_action, status, payload
  )
  SELECT
    'WREV-' || id || '-AUTO',
    id,
    property_id,
    tenant_id,
    trade_type,
    job_type,
    lower(regexp_replace(COALESCE(trade_type, '') || ' ' || COALESCE(job_type, '') || ' ' || COALESCE(description, ''), '[^a-zA-Z0-9 ]+', ' ', 'g')),
    repeat_count,
    (matched_warranty_key IS NOT NULL OR repeat_count > 0),
    matched_warranty_key,
    previous_tradie_id,
    CASE
      WHEN matched_warranty_key IS NOT NULL THEN 'no_landlord_charge_until_warranty_scope_reviewed'
      WHEN repeat_count > 0 THEN 'hold_duplicate_callout_fee_pending_repeat_issue_review'
      ELSE 'standard_charge_policy'
    END,
    CASE
      WHEN repeat_count >= 4 THEN 'higher_than_average_requests_review_property_condition_and_usage_neutrally'
      WHEN repeat_count >= 2 THEN 'repeat_issue_monitoring_recommended'
      ELSE 'no_unusual_pattern_detected'
    END,
    CASE
      WHEN matched_warranty_key IS NOT NULL OR repeat_count > 0 THEN 'route_to_previous_tradie_for_warranty_or_repeat_issue_review'
      WHEN repeat_count >= 4 THEN 'property_manager_review_before_charge_or_scope_expansion'
      ELSE 'continue_standard_quote_and_schedule_flow'
    END,
    'reviewed',
    jsonb_build_object('source', 'work_order_intake_auto_wally', 'consumer_guarantee_keys', jsonb_build_array('AU_ACL_CONSUMER_GUARANTEES_AUTOMATIC_2026_05_21','AU_ACL_SERVICES_DUE_CARE_SKILL_2026_05_21'))
  FROM wally_decision
  WHERE matched_warranty_key IS NOT NULL OR repeat_count > 0
  ON CONFLICT (review_key) DO UPDATE SET
    repeat_count = EXCLUDED.repeat_count,
    warranty_candidate = EXCLUDED.warranty_candidate,
    matched_warranty_key = EXCLUDED.matched_warranty_key,
    previous_tradie_id = EXCLUDED.previous_tradie_id,
    landlord_charge_recommendation = EXCLUDED.landlord_charge_recommendation,
    tenant_responsibility_signal = EXCLUDED.tenant_responsibility_signal,
    recommended_action = EXCLUDED.recommended_action,
    payload = EXCLUDED.payload
  RETURNING *
),
wally_work_order AS (
  UPDATE work_orders wo
  SET status = CASE WHEN wr.warranty_candidate THEN 'warranty_review_required' ELSE wo.status END,
      approval_status = CASE WHEN wr.warranty_candidate THEN 'warranty_or_repeat_issue_hold' ELSE wo.approval_status END,
      approval_required = CASE WHEN wr.warranty_candidate THEN false ELSE wo.approval_required END,
      auto_approved = CASE WHEN wr.warranty_candidate THEN false ELSE wo.auto_approved END,
      payload = wo.payload || jsonb_build_object(
        'wally_auto_checked', true,
        'latest_warranty_review_key', wr.review_key,
        'warranty_candidate', wr.warranty_candidate,
        'matched_warranty_key', wr.matched_warranty_key,
        'previous_tradie_id', wr.previous_tradie_id,
        'scheduling_constraint', CASE WHEN wr.warranty_candidate AND wr.previous_tradie_id IS NOT NULL THEN 'previous_tradie_only' ELSE 'standard_scheduling' END,
        'landlord_charge_recommendation', wr.landlord_charge_recommendation,
        'tenant_responsibility_signal', wr.tenant_responsibility_signal,
        'consumer_guarantee_keys', jsonb_build_array('AU_ACL_CONSUMER_GUARANTEES_AUTOMATIC_2026_05_21','AU_ACL_SERVICES_DUE_CARE_SKILL_2026_05_21')
      ),
      updated_at = now()
  FROM wally_review wr
  WHERE wo.id = wr.work_order_id
  RETURNING wo.*
),
final_work_order AS (
  SELECT * FROM wally_work_order
  UNION ALL
  SELECT * FROM upsert_work_order WHERE NOT EXISTS (SELECT 1 FROM wally_work_order)
),
approval_needed AS (
  INSERT INTO landlord_approvals (id, work_order_id, landlord_id, amount, status, approval_url, payload, updated_at)
  SELECT ${sql(approvalId)}, id, landlord_id, estimated_amount, 'pending',
    CASE
      WHEN payload->>'approval_recipient_role' = 'owner' THEN 'https://app.1pacent.com/owner/approve?approval_id=' || ${sql(approvalId)}
      ELSE 'https://app.1pacent.com/landlord/approve?approval_id=' || ${sql(approvalId)}
    END,
    to_jsonb(upsert_work_order), now()
  FROM final_work_order upsert_work_order
  WHERE approval_required = true
  ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, status = EXCLUDED.status, approval_url = EXCLUDED.approval_url, payload = EXCLUDED.payload, updated_at = now()
  RETURNING *
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'work_order', id, 'rental_work_order_triaged', to_jsonb(final_work_order) FROM final_work_order
)
SELECT jsonb_build_object(
  'success', true,
  'work_order_id', wo.id,
  'agency_id', wo.agency_id,
  'property_id', wo.property_id,
  'tenant_id', wo.tenant_id,
  'landlord_id', wo.landlord_id,
  'trade_type', wo.trade_type,
  'job_type', wo.job_type,
  'description', wo.description,
  'status', wo.status,
  'property_scenario', wo.payload->>'property_scenario',
  'requester_role', wo.payload->>'requester_role',
  'approval_recipient_role', wo.payload->>'approval_recipient_role',
  'requester_availability_windows', COALESCE(wo.payload->'requester_availability_windows', '[]'::jsonb),
  'approval_status', wo.approval_status,
  'approval_required', wo.approval_required,
  'auto_approved', wo.auto_approved,
  'approval_id', (SELECT id FROM approval_needed LIMIT 1),
  'approval_url', (SELECT approval_url FROM approval_needed LIMIT 1),
  'threshold_amount', (SELECT threshold_amount FROM approval_decision),
  'estimated_amount', wo.estimated_amount,
  'wally_auto_checked', true,
  'warranty_check_performed', true,
  'warranty_candidate', COALESCE((wo.payload->>'warranty_candidate')::boolean, false),
  'matched_warranty_key', wo.payload->>'matched_warranty_key',
  'previous_tradie_id', wo.payload->>'previous_tradie_id',
  'landlord_charge_recommendation', wo.payload->>'landlord_charge_recommendation',
  'scheduling_constraint', wo.payload->>'scheduling_constraint',
  'availability_windows_saved', (SELECT count(*) FROM insert_requester_availability),
  'next_action', CASE
    WHEN wo.approval_required AND wo.payload->>'approval_recipient_role' = 'owner' THEN 'send_owner_approval'
    WHEN wo.approval_required THEN 'send_landlord_approval'
    ELSE 'proceed_to_scheduling'
  END
) AS work_order_result
FROM final_work_order wo;
`;
return [{ json: { sql: query } }];
'@

$workOrderWallyHandoffCode = @'
const result = items[0]?.json?.work_order_result ?? items[0]?.json ?? {};
return [{
  json: {
    work_order_id: result.work_order_id,
    property_id: result.property_id,
    trade_type: result.trade_type,
    job_type: result.job_type,
    description: result.description,
    source_work_order_result: result,
    lookback_days: 180,
    default_warranty_days: 90
  }
}];
'@

$workOrderIntakeResponseCode = @'
const handoff = items[0]?.json || {};
const saved = handoff.source_work_order_result || {};
const review = saved.warranty_review || {};
const reviewHasPayload = review && typeof review === 'object' && Object.keys(review).length > 0;

if (!saved || Object.keys(saved).length === 0) {
  return [{
    json: {
      success: false,
      message: 'Work order intake saved no response payload. Check Save Rental Work Order output shape.',
      diagnostic_stage: 'build_work_order_intake_response',
      response_version: 'uat_intake_response_20260602_path_conflict_cleanup',
      handoff_keys: Object.keys(handoff || {}),
      raw_handoff: handoff,
    }
  }];
}

const warrantyCandidate = Boolean(
  saved.warranty_candidate ||
  review.warranty_candidate ||
  saved.matched_warranty_key ||
  review.matched_warranty_key
);

return [{
  json: {
    ...saved,
    success: saved.success !== false,
    response_version: 'uat_intake_response_20260602_path_conflict_cleanup',
    warranty_review: reviewHasPayload ? review : null,
    wally_auto_checked: true,
    warranty_check_performed: true,
    warranty_candidate: warrantyCandidate,
    matched_warranty_key: saved.matched_warranty_key || review.matched_warranty_key || null,
    previous_tradie_id: saved.previous_tradie_id || review.previous_tradie_id || null,
    scheduling_constraint: saved.scheduling_constraint || review.scheduling_constraint || 'standard_scheduling',
    next_action: warrantyCandidate
      ? (review.next_action || saved.next_action || 'warranty_review_before_new_quote')
      : (saved.next_action || 'generate_quote_options'),
  }
}];
'@

$feedbackCode = @'
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
function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.max(1, Math.min(5, Math.round(n)))) : 'NULL';
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}
const query = `
WITH wo AS (
  SELECT * FROM work_orders WHERE id = ${sql(first(body.work_order_id))} LIMIT 1
),
insert_feedback AS (
  INSERT INTO tenant_feedback (
    work_order_id, tenant_id, tradie_id, rating, access_experience_score,
    communication_score, completion_score, comments, trust_signal
  )
  SELECT
    wo.id,
    COALESCE(${sql(first(body.tenant_id))}, wo.tenant_id),
    ${sql(first(body.tradie_id))},
    ${num(first(body.rating))},
    ${num(first(body.access_experience_score))},
    ${num(first(body.communication_score))},
    ${num(first(body.completion_score))},
    ${sql(first(body.comments))},
    ${jsonSql(body)}
  FROM wo
  RETURNING *
),
tenant_score AS (
  SELECT tenant_id, round(avg(
    (
      COALESCE(rating, 0)
      + COALESCE(access_experience_score, 0)
      + COALESCE(communication_score, 0)
      + COALESCE(completion_score, 0)
    )::numeric / NULLIF(
      (
        CASE WHEN rating IS NULL THEN 0 ELSE 1 END
        + CASE WHEN access_experience_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN communication_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN completion_score IS NULL THEN 0 ELSE 1 END
      ), 0
    )
  )::numeric, 2) AS avg_score
  FROM tenant_feedback
  WHERE tenant_id IN (SELECT tenant_id FROM insert_feedback)
  GROUP BY tenant_id
),
update_tenant AS (
  UPDATE tenants
  SET feedback_score = tenant_score.avg_score,
      updated_at = now()
  FROM tenant_score
  WHERE tenants.id = tenant_score.tenant_id
  RETURNING tenants.*
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'work_order', work_order_id, 'tenant_feedback_captured', to_jsonb(insert_feedback)
  FROM insert_feedback
)
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'success', true,
      'work_order_id', work_order_id,
      'tenant_id', tenant_id,
      'feedback_score', (SELECT avg_score FROM tenant_score LIMIT 1),
      'message', 'Tenant feedback captured for trust scoring.'
    )
    FROM insert_feedback
    LIMIT 1
  ),
  jsonb_build_object('success', false, 'status', 'not_found', 'message', 'No work order matched.')
) AS feedback_result;
`;
return [{ json: { sql: query } }];
'@

$complianceOfferCode = @'
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
function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}
const offerId = first(body.offer_id, `CSO-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const packageKey = first(body.package_key, 'rental_compliance_pack');
const packageName = first(body.package_name, 'Rental Compliance Pack');
const price = first(body.price_amount, 499);
const platformRevenue = first(body.platform_revenue_amount, 75);
const query = `
WITH property_row AS (
  SELECT * FROM rental_properties WHERE id = ${sql(first(body.property_id))} LIMIT 1
),
insert_offer AS (
  INSERT INTO compliance_service_offers (
    id, agency_id, property_id, landlord_id, package_key, package_name,
    price_amount, platform_revenue_amount, status, offer_url, payload, updated_at
  )
  SELECT
    ${sql(offerId)},
    COALESCE(${sql(first(body.agency_id))}, agency_id),
    COALESCE(${sql(first(body.property_id))}, id),
    COALESCE(${sql(first(body.landlord_id))}, landlord_id),
    ${sql(packageKey)},
    ${sql(packageName)},
    ${num(price)},
    ${num(platformRevenue)},
    'proposed',
    'https://app.1pacent.com/landlord/compliance-offer?offer_id=' || ${sql(offerId)},
    ${jsonSql(body)},
    now()
  FROM property_row
  ON CONFLICT (id) DO UPDATE SET
    price_amount = EXCLUDED.price_amount,
    platform_revenue_amount = EXCLUDED.platform_revenue_amount,
    status = EXCLUDED.status,
    offer_url = EXCLUDED.offer_url,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'compliance_service_offer', id, 'compliance_offer_proposed', to_jsonb(insert_offer)
  FROM insert_offer
)
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'success', true,
      'offer_id', id,
      'property_id', property_id,
      'landlord_id', landlord_id,
      'package_key', package_key,
      'package_name', package_name,
      'price_amount', price_amount,
      'platform_revenue_amount', platform_revenue_amount,
      'offer_url', offer_url,
      'status', status
    )
    FROM insert_offer
    LIMIT 1
  ),
  jsonb_build_object('success', false, 'status', 'not_found', 'message', 'No property matched for compliance offer.')
) AS compliance_offer_result;
`;
return [{ json: { sql: query } }];
'@

$inspectionReportCode = @'
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
function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}
function makeId(prefix, suffix = '') {
  const base = `${prefix}-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`;
  return suffix ? `${base}-${suffix}` : base;
}
function classify(text) {
  const lower = String(text || '').toLowerCase();
  if (lower.includes('power') || lower.includes('light') || lower.includes('switch') || lower.includes('electrical')) return 'electrical';
  if (lower.includes('tap') || lower.includes('leak') || lower.includes('toilet') || lower.includes('plumb')) return 'plumbing';
  if (lower.includes('lock') || lower.includes('door') || lower.includes('handle')) return 'locksmith';
  if (lower.includes('heater') || lower.includes('aircon') || lower.includes('air con') || lower.includes('hvac')) return 'hvac';
  if (lower.includes('smoke') || lower.includes('gas safety') || lower.includes('electrical safety')) return 'compliance';
  return 'general_maintenance';
}
function urgencyFor(text) {
  const lower = String(text || '').toLowerCase();
  if (lower.includes('urgent') || lower.includes('unsafe') || lower.includes('sparking') || lower.includes('flood') || lower.includes('no power')) return 'urgent';
  return 'normal';
}
function amountFor(tradeType) {
  if (tradeType === 'electrical') return 250;
  if (tradeType === 'plumbing') return 220;
  if (tradeType === 'locksmith') return 180;
  if (tradeType === 'compliance') return 299;
  return 200;
}

const report = body.report || {};
const propertyId = first(body.property_id, report.property_id);
const reportId = first(body.report_id, report.id, makeId('INSP'));
const reportText = first(body.report_text, report.text, report.summary, '');
const sourceFindings = Array.isArray(body.findings) ? body.findings : Array.isArray(report.findings) ? report.findings : [];
const findings = sourceFindings.length
  ? sourceFindings
  : reportText.split(/\n+/).map(line => line.trim()).filter(line => /repair|replace|broken|fault|leak|not working|damaged|unsafe|check|service/i.test(line)).map(description => ({ description }));

const safeFindings = findings.slice(0, 20).map((finding, index) => {
  const description = first(finding.description, finding.issue, finding.text, `Inspection finding ${index + 1}`);
  const tradeType = first(finding.trade_type, classify(description));
  return {
    id: first(finding.finding_id, makeId('FIND', String(index + 1).padStart(2, '0'))),
    work_order_id: first(finding.work_order_id, makeId('WO-INSP', String(index + 1).padStart(2, '0'))),
    description,
    trade_type: tradeType,
    job_type: first(finding.job_type, tradeType),
    location_hint: first(finding.location_hint, finding.room, ''),
    urgency: first(finding.urgency, urgencyFor(description)),
    estimated_amount: first(finding.estimated_amount, amountFor(tradeType)),
    confidence_score: first(finding.confidence_score, sourceFindings.length ? 0.85 : 0.55),
  };
});

const values = safeFindings.map(f => `(
  ${sql(f.id)},
  ${sql(reportId)},
  ${sql(propertyId)},
  ${sql(f.work_order_id)},
  'maintenance',
  ${sql(f.trade_type)},
  ${sql(f.job_type)},
  ${sql(f.description)},
  ${sql(f.location_hint)},
  ${sql(f.urgency)},
  ${num(f.estimated_amount)},
  ${num(f.confidence_score)},
  'work_order_created',
  ${jsonSql(f)}
)`).join(',\n');

const noWorkOrderSelect = `
  SELECT
    NULL::text AS id,
    NULL::text AS agency_id,
    NULL::text AS property_id,
    NULL::text AS tenancy_id,
    NULL::text AS tenant_id,
    NULL::text AS landlord_id,
    NULL::text AS property_manager_id,
    NULL::text AS source,
    NULL::text AS category,
    NULL::text AS trade_type,
    NULL::text AS job_type,
    NULL::text AS description,
    NULL::text AS urgency,
    NULL::text AS status,
    NULL::numeric AS estimated_amount,
    NULL::text AS approval_status,
    NULL::boolean AS approval_required,
    NULL::boolean AS auto_approved,
    NULL::jsonb AS payload
  WHERE false`;

const workOrderSelects = safeFindings.map(f => `
  SELECT
    ${sql(f.work_order_id)} AS id,
    rp.agency_id AS agency_id,
    rp.id AS property_id,
    t.id AS tenancy_id,
    t.tenant_id AS tenant_id,
    rp.landlord_id AS landlord_id,
    rp.property_manager_id AS property_manager_id,
    'inspection_report'::text AS source,
    'maintenance'::text AS category,
    ${sql(f.trade_type)}::text AS trade_type,
    ${sql(f.job_type)}::text AS job_type,
    ${sql(f.description)}::text AS description,
    ${sql(f.urgency)}::text AS urgency,
    'triaged_from_inspection'::text AS status,
    ${num(f.estimated_amount)}::numeric AS estimated_amount,
    CASE
      WHEN COALESCE(${num(f.estimated_amount)}, 0) <= COALESCE(ar.threshold_amount, l.default_approval_limit, pm.approval_limit, 300)
        AND COALESCE(l.prefers_auto_approval, false) = true THEN 'auto_approved_within_landlord_threshold'
      ELSE 'landlord_approval_required'
    END AS approval_status,
    NOT (
      COALESCE(${num(f.estimated_amount)}, 0) <= COALESCE(ar.threshold_amount, l.default_approval_limit, pm.approval_limit, 300)
      AND COALESCE(l.prefers_auto_approval, false) = true
    ) AS approval_required,
    (
      COALESCE(${num(f.estimated_amount)}, 0) <= COALESCE(ar.threshold_amount, l.default_approval_limit, pm.approval_limit, 300)
      AND COALESCE(l.prefers_auto_approval, false) = true
    ) AS auto_approved,
    ${jsonSql({ ...f, report_id: reportId })} AS payload
  FROM property_row rp
  LEFT JOIN active_tenancy t ON true
  LEFT JOIN pm ON true
  LEFT JOIN l ON true
  LEFT JOIN ar ON true
`).join('\nUNION ALL\n');

const query = `
WITH property_row AS (
  SELECT * FROM rental_properties WHERE id = ${sql(propertyId)} LIMIT 1
),
active_tenancy AS (
  SELECT * FROM tenancies WHERE property_id = ${sql(propertyId)} AND status = 'active' ORDER BY created_at DESC LIMIT 1
),
insert_report AS (
  INSERT INTO property_inspection_reports (
    id, agency_id, property_id, property_manager_id, inspection_type, report_source,
    report_url, report_text, report_date, status, extracted_summary, payload, updated_at
  )
  SELECT
    ${sql(reportId)},
    agency_id,
    id,
    property_manager_id,
    ${sql(first(body.inspection_type, report.inspection_type, 'routine'))},
    ${sql(first(body.report_source, report.source, 'manual_upload'))},
    ${sql(first(body.report_url, report.url))},
    ${sql(reportText)},
    COALESCE(${sql(first(body.report_date, report.report_date))}::date, now()::date),
    CASE WHEN ${safeFindings.length} > 0 THEN 'findings_extracted' ELSE 'no_findings_detected' END,
    ${sql(safeFindings.length + ' finding(s) extracted')},
    ${jsonSql(body)},
    now()
  FROM property_row
  ON CONFLICT (id) DO UPDATE SET
    report_url = EXCLUDED.report_url,
    report_text = EXCLUDED.report_text,
    status = EXCLUDED.status,
    extracted_summary = EXCLUDED.extracted_summary,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
pm AS (
  SELECT pm.* FROM property_managers pm JOIN property_row rp ON rp.property_manager_id = pm.id LIMIT 1
),
l AS (
  SELECT l.* FROM landlords l JOIN property_row rp ON rp.landlord_id = l.id LIMIT 1
),
ar AS (
  SELECT ar.*
  FROM approval_rules ar
  JOIN property_row rp ON (ar.property_id IS NULL OR ar.property_id = rp.id)
  WHERE ar.active = true
  ORDER BY ar.property_id NULLS LAST
  LIMIT 1
),
created_work_orders AS (
  INSERT INTO work_orders (
    id, agency_id, property_id, tenancy_id, tenant_id, landlord_id, property_manager_id,
    source, category, trade_type, job_type, description, urgency, status, estimated_amount,
    approval_status, approval_required, auto_approved, payload, updated_at
  )
  SELECT
    v.id, v.agency_id, v.property_id, v.tenancy_id, v.tenant_id, v.landlord_id, v.property_manager_id,
    v.source, v.category, v.trade_type, v.job_type, v.description, v.urgency, v.status, v.estimated_amount,
    v.approval_status, v.approval_required, v.auto_approved, v.payload, now()
  FROM (
    ${workOrderSelects || noWorkOrderSelect}
  ) v
  WHERE v.property_id IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET
    description = EXCLUDED.description,
    estimated_amount = EXCLUDED.estimated_amount,
    approval_status = EXCLUDED.approval_status,
    approval_required = EXCLUDED.approval_required,
    auto_approved = EXCLUDED.auto_approved,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
insert_findings AS (
  INSERT INTO property_inspection_findings (
    id, inspection_report_id, property_id, work_order_id, finding_type, trade_type,
    job_type, description, location_hint, urgency, estimated_amount, confidence_score, status, payload
  )
  VALUES
    ${values || "('NO-FINDING', NULL, NULL, NULL, 'maintenance', NULL, NULL, 'No findings', NULL, 'normal', NULL, NULL, 'ignored', '{}'::jsonb)"}
  ON CONFLICT (id) DO UPDATE SET
    work_order_id = EXCLUDED.work_order_id,
    status = EXCLUDED.status,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
insert_approvals AS (
  INSERT INTO landlord_approvals (id, work_order_id, landlord_id, amount, status, approval_url, payload, updated_at)
  SELECT
    'APR-' || replace(cwo.id, 'WO-', ''),
    cwo.id,
    cwo.landlord_id,
    cwo.estimated_amount,
    'pending',
    'https://app.1pacent.com/landlord/approve?approval_id=APR-' || replace(cwo.id, 'WO-', ''),
    to_jsonb(cwo),
    now()
  FROM created_work_orders cwo
  WHERE cwo.approval_required = true
  ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, status = EXCLUDED.status, approval_url = EXCLUDED.approval_url, payload = EXCLUDED.payload, updated_at = now()
  RETURNING *
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'inspection_report', id, 'inspection_report_ingested', to_jsonb(insert_report) FROM insert_report
)
SELECT jsonb_build_object(
  'success', true,
  'inspection_report_id', (SELECT id FROM insert_report),
  'property_id', ${sql(propertyId)},
  'findings_detected', ${safeFindings.length},
  'work_orders_created', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'work_order_id', id,
    'trade_type', trade_type,
    'description', description,
    'approval_status', approval_status,
    'approval_required', approval_required,
    'auto_approved', auto_approved,
    'estimated_amount', estimated_amount
  )) FROM created_work_orders), '[]'::jsonb),
  'approvals_created', COALESCE((SELECT jsonb_agg(jsonb_build_object('approval_id', id, 'work_order_id', work_order_id, 'approval_url', approval_url)) FROM insert_approvals), '[]'::jsonb)
) AS inspection_report_result;
`;
return [{ json: { sql: query } }];
'@

$quoteOptionsCode = @'
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
function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}
function int(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback === null ? 'NULL' : String(fallback);
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? String(n) : (fallback === null ? 'NULL' : String(fallback));
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}
function makeId(prefix) {
  return `${prefix}-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`;
}
function normaliseWindow(item, index) {
  if (typeof item === 'string') {
    return {
      window_start: '',
      window_end: '',
      preference_rank: index + 1,
      access_notes: item,
    };
  }
  return {
    window_start: first(item.window_start, item.start, item.from),
    window_end: first(item.window_end, item.end, item.to),
    preference_rank: first(item.preference_rank, item.rank, index + 1),
    access_notes: first(item.access_notes, item.notes, ''),
  };
}

const workOrderId = first(body.work_order_id, body.id);
const batchId = first(body.batch_id, makeId('RQO'));
const approvalId = first(body.approval_id, `APR-${batchId.replace(/^RQO-/, '')}`);
const maxOptions = Math.max(1, Math.min(5, Number(first(body.max_options, 3)) || 3));
const durationMinutes = Math.max(30, Math.min(480, Number(first(body.estimated_duration_minutes, body.duration_minutes, 120)) || 120));

const tenantWindows = (
  Array.isArray(body.tenant_windows) ? body.tenant_windows :
  Array.isArray(body.tenant_availability_windows) ? body.tenant_availability_windows :
  Array.isArray(body.requester_availability_windows) ? body.requester_availability_windows :
  Array.isArray(body.availability_windows) ? body.availability_windows :
  []
)
  .map(normaliseWindow)
  .filter(w => w.window_start && w.window_end)
  .slice(0, 12);

const tradieOptions = (Array.isArray(body.tradie_options) ? body.tradie_options : Array.isArray(body.quote_options) ? body.quote_options : [])
  .map((option, index) => ({
    tradie_id: first(option.tradie_id, option.provider_id, `TRADIE-OPTION-${index + 1}`),
    company_id: first(option.company_id, option.tradie_company_id, `COMPANY-OPTION-${index + 1}`),
    tradie_name: first(option.tradie_name, option.name, `Tradie Option ${index + 1}`),
    amount: first(option.amount, option.quote_amount, option.estimated_amount),
    scheduled_start: first(option.scheduled_start, option.window_start, option.start),
    scheduled_end: first(option.scheduled_end, option.window_end, option.end),
    trust_score: first(option.trust_score, option.average_rating, option.rating),
    response_minutes: first(option.response_minutes, option.response_time_minutes, 60),
    source: first(option.source, 'tradie_quote'),
  }))
  .filter(o => o.tradie_id && o.company_id && o.scheduled_start && o.scheduled_end)
  .slice(0, 25);

const tenantWindowValues = tenantWindows.map(w => `(
  ${sql(workOrderId)},
  ${sql(w.window_start)}::timestamptz,
  ${sql(w.window_end)}::timestamptz,
  ${int(w.preference_rank, 1)},
  ${sql(w.access_notes)},
  'offered',
  now()
)`).join(',\n');

const providedCompanyValues = tradieOptions.map(o => `(${sql(o.company_id)}, ${sql(first(o.company_name, o.company_id))})`).join(',\n');
const providedTradieValues = tradieOptions.map(o => `(${sql(o.tradie_id)}, ${sql(o.company_id)}, ${sql(o.tradie_name)})`).join(',\n');
const providedCandidateValues = tradieOptions.map(o => `(
  ${sql(o.tradie_id)},
  ${sql(o.company_id)},
  ${num(o.amount)},
  ${sql(o.scheduled_start)}::timestamptz,
  ${sql(o.scheduled_end)}::timestamptz,
  ${num(o.trust_score)},
  ${int(o.response_minutes, 60)},
  ${sql(o.source)}
)`).join(',\n');

const noTenantWindows = `
  SELECT
    NULL::text AS work_order_id,
    NULL::timestamptz AS window_start,
    NULL::timestamptz AS window_end,
    NULL::integer AS preference_rank,
    NULL::text AS access_notes,
    NULL::text AS status,
    NULL::timestamptz AS updated_at
  WHERE false`;

const noProvidedCandidates = `
  SELECT
    NULL::text AS tradie_id,
    NULL::text AS company_id,
    NULL::numeric AS amount,
    NULL::timestamptz AS scheduled_start,
    NULL::timestamptz AS scheduled_end,
    NULL::numeric AS trust_score,
    NULL::integer AS response_minutes,
    NULL::text AS source
  WHERE false`;

const query = `
WITH wo AS (
  SELECT * FROM work_orders WHERE id = ${sql(workOrderId)} LIMIT 1
),
provided_companies AS (
  INSERT INTO tradie_companies (id, name, active, updated_at)
  SELECT DISTINCT company_id, company_name, true, now()
  FROM (
    ${providedCompanyValues ? `SELECT * FROM (VALUES ${providedCompanyValues}) AS v(company_id, company_name)` : "SELECT NULL::text AS company_id, NULL::text AS company_name WHERE false"}
  ) c
  WHERE company_id IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET name = COALESCE(EXCLUDED.name, tradie_companies.name), active = true, updated_at = now()
  RETURNING *
),
provided_tradies AS (
  INSERT INTO tradies (id, company_id, name, active, updated_at)
  SELECT DISTINCT tradie_id, company_id, tradie_name, true, now()
  FROM (
    ${providedTradieValues ? `SELECT * FROM (VALUES ${providedTradieValues}) AS v(tradie_id, company_id, tradie_name)` : "SELECT NULL::text AS tradie_id, NULL::text AS company_id, NULL::text AS tradie_name WHERE false"}
  ) t
  WHERE tradie_id IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET company_id = COALESCE(EXCLUDED.company_id, tradies.company_id), name = COALESCE(EXCLUDED.name, tradies.name), active = true, updated_at = now()
  RETURNING *
),
insert_tenant_windows AS (
  INSERT INTO tenant_availability_windows (work_order_id, tenant_id, window_start, window_end, preference_rank, access_notes, status, updated_at)
  SELECT v.work_order_id, wo.tenant_id, v.window_start, v.window_end, v.preference_rank, v.access_notes, v.status, v.updated_at
  FROM (
    ${tenantWindowValues ? `SELECT * FROM (VALUES ${tenantWindowValues}) AS v(work_order_id, window_start, window_end, preference_rank, access_notes, status, updated_at)` : noTenantWindows}
  ) v
  JOIN wo ON true
  WHERE v.work_order_id IS NOT NULL
  RETURNING *
),
tenant_windows AS (
  SELECT * FROM insert_tenant_windows
  UNION ALL
  SELECT * FROM tenant_availability_windows
  WHERE work_order_id = ${sql(workOrderId)}
    AND status IN ('offered','preferred','confirmed')
    AND NOT EXISTS (SELECT 1 FROM insert_tenant_windows)
),
provided_candidates AS (
  SELECT
    pc.tradie_id,
    pc.company_id,
    pc.amount,
    pc.scheduled_start,
    pc.scheduled_end,
    pc.trust_score,
    pc.response_minutes,
    pc.source,
    tw.id AS tenant_availability_window_id,
    tw.preference_rank,
    1 AS source_priority
  FROM (
    ${providedCandidateValues ? `SELECT * FROM (VALUES ${providedCandidateValues}) AS v(tradie_id, company_id, amount, scheduled_start, scheduled_end, trust_score, response_minutes, source)` : noProvidedCandidates}
  ) pc
  JOIN wo ON true
  JOIN tenant_windows tw
    ON pc.scheduled_start >= tw.window_start
   AND pc.scheduled_end <= tw.window_end
  WHERE pc.tradie_id IS NOT NULL
    AND (
      COALESCE(wo.payload->>'warranty_candidate', 'false') <> 'true'
      OR pc.tradie_id = wo.payload->>'previous_tradie_id'
    )
    AND NOT EXISTS (
      SELECT 1 FROM job_schedule_slots s
      WHERE s.tradie_id = pc.tradie_id
        AND s.status IN ('booked','confirmed','scheduled')
        AND tstzrange(s.scheduled_start, s.scheduled_end, '[)') && tstzrange(pc.scheduled_start, pc.scheduled_end, '[)')
    )
),
db_candidates AS (
  SELECT
    tr.id AS tradie_id,
    tr.company_id,
    COALESCE(wo.estimated_amount, 300)::numeric AS amount,
    tw.window_start AS scheduled_start,
    LEAST(tw.window_end, tw.window_start + (${durationMinutes} || ' minutes')::interval) AS scheduled_end,
    COALESCE(tm.average_rating * 20, tr.on_time_rate, tr.quote_accuracy_score, 70)::numeric AS trust_score,
    120::integer AS response_minutes,
    'database_availability'::text AS source,
    tw.id AS tenant_availability_window_id,
    tw.preference_rank,
    2 AS source_priority
  FROM wo
  JOIN tenant_windows tw ON true
  JOIN tradies tr ON tr.active = true
  LEFT JOIN tradie_skills ts ON ts.tradie_id = tr.id AND lower(ts.trade_type) = lower(COALESCE(wo.trade_type, 'general_maintenance'))
  LEFT JOIN tradie_availability ta
    ON ta.tradie_id = tr.id
   AND ta.active = true
   AND ta.day_of_week = EXTRACT(DOW FROM tw.window_start AT TIME ZONE 'Australia/Sydney')::integer
   AND ta.start_time <= (tw.window_start AT TIME ZONE 'Australia/Sydney')::time
   AND ta.end_time >= (LEAST(tw.window_end, tw.window_start + (${durationMinutes} || ' minutes')::interval) AT TIME ZONE 'Australia/Sydney')::time
  LEFT JOIN trust_metrics tm ON tm.tradie_id = tr.id AND (tm.trade_type IS NULL OR lower(tm.trade_type) = lower(COALESCE(wo.trade_type, 'general_maintenance')))
  WHERE (
      ts.id IS NOT NULL
      OR lower(COALESCE(wo.trade_type, '')) IN ('', 'unspecified', 'general_maintenance')
      OR EXISTS (
        SELECT 1
        FROM tradie_commercial_terms t
        WHERE t.active = true
          AND (t.tradie_id = tr.id OR t.company_id = tr.company_id)
          AND lower(COALESCE(t.trade_type, '')) = lower(COALESCE(wo.trade_type, ''))
      )
    )
    AND (
      COALESCE(wo.payload->>'warranty_candidate', 'false') <> 'true'
      OR tr.id = wo.payload->>'previous_tradie_id'
    )
    AND (ta.id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM tradie_availability WHERE tradie_id = tr.id AND active = true))
    AND NOT EXISTS (
      SELECT 1 FROM job_schedule_slots s
      WHERE s.tradie_id = tr.id
        AND s.status IN ('booked','confirmed','scheduled')
        AND tstzrange(s.scheduled_start, s.scheduled_end, '[)') && tstzrange(tw.window_start, LEAST(tw.window_end, tw.window_start + (${durationMinutes} || ' minutes')::interval), '[)')
    )
),
candidate_pool AS (
  SELECT * FROM provided_candidates
  UNION ALL
  SELECT * FROM db_candidates
  WHERE NOT EXISTS (SELECT 1 FROM provided_candidates)
),
scored AS (
  SELECT
    candidate_pool.*,
    tct.standard_callout_fee,
    tct.emergency_callout_fee,
    tct.hourly_rate,
    tct.labour_warranty_days,
    tct.parts_warranty_policy,
    tct.callout_waiver_policy,
    tct.sally_discount_instructions,
    tjo.callout_fee_override,
    tjo.discount_amount,
    tjo.discount_percent,
    tjo.sally_instruction_override,
    GREATEST(0, LEAST(100, COALESCE(trust_score, 70))) AS normalised_trust_score,
    GREATEST(0, 100 - (((COALESCE(amount, 300) - COALESCE(tjo.discount_amount, 0)) * (1 - COALESCE(tjo.discount_percent, 0) / 100) - MIN((COALESCE(amount, 300) - COALESCE(tjo.discount_amount, 0)) * (1 - COALESCE(tjo.discount_percent, 0) / 100)) OVER ()) / NULLIF(MIN((COALESCE(amount, 300) - COALESCE(tjo.discount_amount, 0)) * (1 - COALESCE(tjo.discount_percent, 0) / 100)) OVER (), 0) * 100)) AS normalised_cost_score,
    GREATEST(0, round(((COALESCE(amount, 300) - COALESCE(tjo.discount_amount, 0)) * (1 - COALESCE(tjo.discount_percent, 0) / 100))::numeric, 2)) AS effective_amount,
    GREATEST(0, 110 - (preference_rank * 10) - LEAST(30, COALESCE(response_minutes, 60) / 10)) AS normalised_availability_score
  FROM candidate_pool
  LEFT JOIN LATERAL (
    SELECT *
    FROM tradie_commercial_terms t
    WHERE t.active = true
      AND (t.tradie_id IS NULL OR t.tradie_id = candidate_pool.tradie_id)
      AND (t.company_id IS NULL OR t.company_id = candidate_pool.company_id)
      AND (t.trade_type IS NULL OR lower(t.trade_type) = lower((SELECT trade_type FROM wo)))
      AND (t.job_type IS NULL OR lower(t.job_type) = lower((SELECT job_type FROM wo)))
      AND t.effective_from <= current_date
      AND (t.effective_to IS NULL OR t.effective_to >= current_date)
    ORDER BY t.tradie_id NULLS LAST, t.job_type NULLS LAST, t.effective_from DESC
    LIMIT 1
  ) tct ON true
  LEFT JOIN LATERAL (
    SELECT *
    FROM tradie_job_offer_overrides o
    WHERE o.status = 'active'
      AND o.tradie_id = candidate_pool.tradie_id
      AND (o.work_order_id IS NULL OR o.work_order_id = ${sql(workOrderId)})
      AND (o.expires_at IS NULL OR o.expires_at > now())
    ORDER BY o.work_order_id NULLS LAST, o.created_at DESC
    LIMIT 1
  ) tjo ON true
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY tradie_id, scheduled_start, scheduled_end
      ORDER BY source_priority, preference_rank
    ) AS duplicate_rank,
    ROW_NUMBER() OVER (
      ORDER BY
        ((normalised_trust_score * 0.40) + (normalised_cost_score * 0.35) + (normalised_availability_score * 0.25)) DESC,
        effective_amount ASC,
        preference_rank ASC
    ) AS option_rank,
    round(((normalised_trust_score * 0.40) + (normalised_cost_score * 0.35) + (normalised_availability_score * 0.25))::numeric, 2) AS total_score
  FROM scored
),
top_options AS (
  SELECT *
  FROM ranked
  WHERE duplicate_rank = 1
  ORDER BY option_rank
  LIMIT ${maxOptions}
),
insert_options AS (
  INSERT INTO rental_quote_options (
    id, batch_id, work_order_id, landlord_id, tenant_id, tenant_availability_window_id,
    tradie_id, company_id, option_rank, quote_amount, quote_band, scheduled_start, scheduled_end,
    urgency, trust_score, cost_score, availability_score, total_score, status, approval_id, approval_url, payload, updated_at
  )
  SELECT
    ${sql(batchId)} || '-' || option_rank,
    ${sql(batchId)},
    wo.id,
    wo.landlord_id,
    wo.tenant_id,
    top_options.tenant_availability_window_id,
    top_options.tradie_id,
    top_options.company_id,
    top_options.option_rank,
    top_options.effective_amount,
    chr(36) || round(top_options.effective_amount)::text,
    top_options.scheduled_start,
    top_options.scheduled_end,
    wo.urgency,
    top_options.normalised_trust_score,
    top_options.normalised_cost_score,
    top_options.normalised_availability_score,
    top_options.total_score,
    'proposed',
    ${sql(approvalId)},
    CASE
      WHEN wo.payload->>'approval_recipient_role' = 'owner' THEN 'https://app.1pacent.com/owner/approve-options?approval_id=' || ${sql(approvalId)}
      ELSE 'https://app.1pacent.com/landlord/approve-options?approval_id=' || ${sql(approvalId)}
    END,
    jsonb_build_object(
      'source', top_options.source,
      'duration_minutes', ${durationMinutes},
      'ranking_weights', jsonb_build_object('trust', 0.40, 'cost', 0.35, 'availability', 0.25),
      'warranty_constraint', CASE
        WHEN COALESCE(wo.payload->>'warranty_candidate', 'false') = 'true' THEN jsonb_build_object(
          'previous_tradie_only', true,
          'previous_tradie_id', wo.payload->>'previous_tradie_id',
          'matched_warranty_key', wo.payload->>'matched_warranty_key',
          'landlord_charge_recommendation', wo.payload->>'landlord_charge_recommendation'
        )
        ELSE NULL
      END,
      'tenant_window_rank', top_options.preference_rank,
      'response_minutes', top_options.response_minutes,
      'commercial_terms', jsonb_build_object(
        'standard_callout_fee', top_options.standard_callout_fee,
        'emergency_callout_fee', top_options.emergency_callout_fee,
        'hourly_rate', top_options.hourly_rate,
        'labour_warranty_days', top_options.labour_warranty_days,
        'parts_warranty_policy', top_options.parts_warranty_policy,
        'callout_waiver_policy', top_options.callout_waiver_policy,
        'sally_discount_instructions', COALESCE(top_options.sally_instruction_override, top_options.sally_discount_instructions),
        'callout_fee_override', top_options.callout_fee_override,
        'discount_amount', top_options.discount_amount,
        'discount_percent', top_options.discount_percent
      ),
      'consumer_guarantee_keys', jsonb_build_array('AU_ACL_CONSUMER_GUARANTEES_AUTOMATIC_2026_05_21','AU_ACL_SERVICES_DUE_CARE_SKILL_2026_05_21','AU_ACL_WARRANTIES_ADDITIONAL_2026_05_21')
    ),
    now()
  FROM top_options
  JOIN wo ON true
  ON CONFLICT (id) DO UPDATE SET
    option_rank = EXCLUDED.option_rank,
    quote_amount = EXCLUDED.quote_amount,
    scheduled_start = EXCLUDED.scheduled_start,
    scheduled_end = EXCLUDED.scheduled_end,
    trust_score = EXCLUDED.trust_score,
    cost_score = EXCLUDED.cost_score,
    availability_score = EXCLUDED.availability_score,
    total_score = EXCLUDED.total_score,
    approval_id = EXCLUDED.approval_id,
    approval_url = EXCLUDED.approval_url,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
approval AS (
  INSERT INTO landlord_approvals (id, work_order_id, landlord_id, approval_type, amount, status, approval_url, payload, updated_at)
  SELECT
    ${sql(approvalId)},
    wo.id,
    wo.landlord_id,
    'quote_option_set',
    MIN(io.quote_amount),
    'pending',
    CASE
      WHEN wo.payload->>'approval_recipient_role' = 'owner' THEN 'https://app.1pacent.com/owner/approve-options?approval_id=' || ${sql(approvalId)}
      ELSE 'https://app.1pacent.com/landlord/approve-options?approval_id=' || ${sql(approvalId)}
    END,
    jsonb_build_object(
      'batch_id', ${sql(batchId)},
      'options', jsonb_agg(to_jsonb(io) ORDER BY io.option_rank),
      'approval_recipient_role', COALESCE(wo.payload->>'approval_recipient_role', 'landlord'),
      'decision_needed', 'Choose one approved cost/service window that already matches requester availability and tradie availability.'
    ),
    now()
  FROM wo
  JOIN insert_options io ON true
  GROUP BY wo.id, wo.landlord_id, wo.payload
  ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    status = 'pending',
    approval_url = EXCLUDED.approval_url,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
update_work_order AS (
  UPDATE work_orders
  SET approval_status = CASE WHEN EXISTS (SELECT 1 FROM approval) THEN 'landlord_quote_options_sent' ELSE approval_status END,
      approval_required = CASE WHEN EXISTS (SELECT 1 FROM approval) THEN true ELSE approval_required END,
      payload = payload || jsonb_build_object('latest_quote_option_batch_id', ${sql(batchId)}, 'latest_quote_option_approval_id', ${sql(approvalId)}),
      updated_at = now()
  WHERE id = ${sql(workOrderId)}
  RETURNING *
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'work_order', ${sql(workOrderId)}, 'rental_quote_options_generated', jsonb_build_object('batch_id', ${sql(batchId)}, 'options', jsonb_agg(to_jsonb(insert_options) ORDER BY option_rank))
  FROM insert_options
)
SELECT jsonb_build_object(
  'success', true,
  'work_order_id', ${sql(workOrderId)},
  'batch_id', ${sql(batchId)},
  'approval_id', (SELECT id FROM approval LIMIT 1),
  'approval_url', (SELECT approval_url FROM approval LIMIT 1),
  'options_count', (SELECT count(*) FROM insert_options),
  'options', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'option_id', id,
    'rank', option_rank,
    'tradie_id', tradie_id,
    'company_id', company_id,
    'quote_amount', quote_amount,
    'scheduled_start', scheduled_start,
    'scheduled_end', scheduled_end,
    'trust_score', trust_score,
    'cost_score', cost_score,
    'availability_score', availability_score,
    'total_score', total_score
  ) ORDER BY option_rank) FROM insert_options), '[]'::jsonb),
  'next_action', CASE
    WHEN COALESCE((SELECT payload->>'warranty_candidate' FROM wo), 'false') = 'true'
      AND COALESCE((SELECT payload->>'previous_tradie_id' FROM wo), '') = ''
      THEN 'warranty_review_before_new_quote'
    WHEN EXISTS (SELECT 1 FROM approval)
      THEN CASE
        WHEN COALESCE((SELECT payload->>'approval_recipient_role' FROM wo), 'landlord') = 'owner'
          THEN 'send_owner_three_option_approval'
        ELSE 'send_landlord_three_option_approval'
      END
    ELSE 'collect_more_requester_or_tradie_availability'
  END,
  'approval_recipient_role', COALESCE((SELECT payload->>'approval_recipient_role' FROM wo), 'landlord'),
  'property_scenario', COALESCE((SELECT payload->>'property_scenario' FROM wo), 'rental'),
  'availability_policy', 'Quote options must fit requester availability and tradie availability.',
  'warranty_policy', 'Warranty and repeat issue guardrails must clear before new non-warranty quote options are offered.',
  'customer_value', 'Approver receives three costed options that already fit requester availability and tradie availability.'
) AS quote_options_result;
`;
return [{ json: { sql: query } }];
'@

$quoteOptionApprovalCode = @'
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

const approvalId = first(body.approval_id);
const optionId = first(body.option_id, body.selected_option_id);
const approver = first(body.approved_by, body.landlord_name, 'landlord');
const decisionNotes = first(body.decision_notes, 'Landlord approved quote option.');

const query = `
WITH selected_option AS (
  SELECT ro.*
  FROM rental_quote_options ro
  WHERE (${sql(optionId)} IS NOT NULL AND ro.id = ${sql(optionId)})
     OR (${sql(optionId)} IS NULL AND ro.approval_id = ${sql(approvalId)})
  ORDER BY ro.option_rank
  LIMIT 1
),
wo AS (
  SELECT wo.*
  FROM work_orders wo
  JOIN selected_option so ON so.work_order_id = wo.id
  LIMIT 1
),
property_row AS (
  SELECT rp.*
  FROM rental_properties rp
  JOIN wo ON wo.property_id = rp.id
  LIMIT 1
),
mark_options AS (
  UPDATE rental_quote_options ro
  SET status = CASE WHEN ro.id = (SELECT id FROM selected_option) THEN 'approved_selected' ELSE 'not_selected' END,
      updated_at = now()
  WHERE ro.approval_id = ${sql(approvalId)}
  RETURNING *
),
approval AS (
  UPDATE landlord_approvals la
  SET status = 'approved',
      amount = (SELECT quote_amount FROM selected_option),
      decision_notes = ${sql(decisionNotes)},
      decided_at = now(),
      payload = la.payload || jsonb_build_object(
        'selected_option_id', (SELECT id FROM selected_option),
        'approved_by', ${sql(approver)},
        'approved_at', now()
      ),
      updated_at = now()
  WHERE la.id = ${sql(approvalId)}
  RETURNING *
),
schedule_slot AS (
  INSERT INTO job_schedule_slots (
    id, job_id, lead_id, quote_id, tradie_id, status, scheduled_start, scheduled_end,
    customer_address, customer_suburb, estimated_duration_minutes, route_context,
    scheduling_score, scheduling_reason, updated_at
  )
  SELECT
    'SLOT-' || so.id,
    wo.job_id,
    wo.lead_id,
    wo.quote_id,
    so.tradie_id,
    'booked_pending_tradie_confirmation',
    so.scheduled_start,
    so.scheduled_end,
    rp.address,
    rp.suburb,
    GREATEST(30, EXTRACT(EPOCH FROM (so.scheduled_end - so.scheduled_start))::integer / 60),
    jsonb_build_object(
      'source', 'landlord_quote_option_approval',
      'work_order_id', wo.id,
      'approval_id', ${sql(approvalId)},
      'tenant_availability_window_id', so.tenant_availability_window_id,
      'approval_matched_tenant_and_tradie_availability', true
    ),
    so.total_score,
    'Landlord approved one of three ranked options already matched to tenant availability and tradie availability.',
    now()
  FROM selected_option so
  JOIN wo ON true
  LEFT JOIN property_row rp ON true
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    scheduled_start = EXCLUDED.scheduled_start,
    scheduled_end = EXCLUDED.scheduled_end,
    route_context = EXCLUDED.route_context,
    scheduling_score = EXCLUDED.scheduling_score,
    scheduling_reason = EXCLUDED.scheduling_reason,
    updated_at = now()
  RETURNING *
),
update_work_order AS (
  UPDATE work_orders
  SET status = 'landlord_approved_scheduling_ready',
      approval_status = 'landlord_approved_quote_option',
      approval_required = false,
      auto_approved = false,
      estimated_amount = (SELECT quote_amount FROM selected_option),
      scheduled_window = to_char((SELECT scheduled_start FROM selected_option) AT TIME ZONE 'Australia/Sydney', 'Dy DD Mon YYYY HH24:MI') || ' - ' || to_char((SELECT scheduled_end FROM selected_option) AT TIME ZONE 'Australia/Sydney', 'HH24:MI'),
      payload = payload || jsonb_build_object(
        'selected_quote_option_id', (SELECT id FROM selected_option),
        'selected_schedule_slot_id', (SELECT id FROM schedule_slot),
        'landlord_approval_id', ${sql(approvalId)}
      ),
      updated_at = now()
  WHERE id = (SELECT work_order_id FROM selected_option)
  RETURNING *
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'work_order', id, 'landlord_quote_option_approved', jsonb_build_object(
    'approval_id', ${sql(approvalId)},
    'selected_option', (SELECT to_jsonb(selected_option) FROM selected_option),
    'schedule_slot', (SELECT to_jsonb(schedule_slot) FROM schedule_slot)
  )
  FROM update_work_order
)
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'success', true,
      'approval_id', ${sql(approvalId)},
      'selected_option_id', so.id,
      'work_order_id', so.work_order_id,
      'quote_amount', so.quote_amount,
      'tradie_id', so.tradie_id,
      'company_id', so.company_id,
      'trade_type', (SELECT trade_type FROM wo),
      'job_type', (SELECT job_type FROM wo),
      'approval_recipient_role', (SELECT payload->>'approval_recipient_role' FROM wo),
      'property_scenario', (SELECT payload->>'property_scenario' FROM wo),
      'scheduled_start', so.scheduled_start,
      'scheduled_end', so.scheduled_end,
      'schedule_slot_id', (SELECT id FROM schedule_slot),
      'next_action', 'notify_tenant_and_tradie_then_create_calendar_event',
      'message', 'Quote option approved and schedule slot locked for tenant/tradie confirmation.'
    )
    FROM selected_option so
  ),
  jsonb_build_object('success', false, 'message', 'No quote option matched the approval request.')
) AS quote_option_approval_result;
`;
return [{ json: { sql: query } }];
'@

$quoteOptionCalendarHandoffCode = @'
const approval = $('Approve Rental Quote Option').first().json?.quote_option_approval_result || $('Approve Rental Quote Option').first().json || {};

if (!approval.success || !approval.schedule_slot_id) {
  return [{
    json: {
      success: false,
      status: 'calendar_handoff_skipped',
      approval_result: approval,
      customer_message: 'The quote option approval could not be handed to scheduling because no schedule slot was created.',
    },
  }];
}

return [{
  json: {
    schedule_slot_id: approval.schedule_slot_id,
    job_id: approval.job_id || '',
    lead_id: approval.lead_id || '',
    quote_id: approval.quote_id || '',
    company_id: approval.company_id || 'COMP-1PACENT-DEFAULT',
    tradie_id: approval.tradie_id || '',
    preferred_tradie_id: approval.tradie_id || '',
    tradie_count: 1,
    trade_type: approval.trade_type || 'general_maintenance',
    job_type: approval.job_type || '',
    calendar_id: approval.calendar_id || 'mac@1pacent.com',
    source: approval.approval_recipient_role === 'owner'
      ? 'owner_quote_option_approval'
      : 'rental_landlord_quote_option_approval',
    approval_recipient_role: approval.approval_recipient_role || 'landlord',
    property_scenario: approval.property_scenario || 'rental',
    approval_id: approval.approval_id,
    selected_option_id: approval.selected_option_id,
    work_order_id: approval.work_order_id,
  },
}];
'@

$quoteOptionApprovalResponseCode = @'
const approval = $('Approve Rental Quote Option').first().json?.quote_option_approval_result || $('Approve Rental Quote Option').first().json || {};
const calendar = $('Call George Calendar Booking').first().json || {};
const calendarBody = calendar.body || calendar;
const notificationLog = items[0]?.json?.notification_result || items[0]?.json || {};

return [{
  json: {
    success: Boolean(approval.success),
    approval_result: approval,
    calendar_booking_result: calendarBody,
    notification_result: notificationLog,
    next_action: calendarBody?.success
      ? 'notify_tenant_tradie_and_property_manager'
      : 'calendar_booking_needs_review_then_notify',
    message: calendarBody?.success
      ? 'Landlord option approved, schedule slot locked, and George booked it into the company calendar.'
      : 'Landlord option approved and schedule slot locked. Calendar booking needs review.',
  },
}];
'@

$notificationContextSqlCode = @'
const approval = $('Approve Rental Quote Option').first().json?.quote_option_approval_result || $('Approve Rental Quote Option').first().json || {};
const calendar = $('Call George Calendar Booking').first().json?.body || $('Call George Calendar Booking').first().json || {};

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const query = `
WITH ctx AS (
  SELECT
    wo.id AS work_order_id,
    wo.description,
    wo.trade_type,
    wo.job_type,
    wo.urgency,
    wo.estimated_amount,
    wo.scheduled_window,
    rp.address,
    rp.suburb,
    t.name AS tenant_name,
    t.email AS tenant_email,
    t.phone AS tenant_phone,
    l.name AS landlord_name,
    l.email AS landlord_email,
    pm.name AS property_manager_name,
    pm.email AS property_manager_email,
    so.id AS selected_option_id,
    so.quote_amount,
    so.scheduled_start,
    so.scheduled_end,
    so.tradie_id,
    tr.name AS tradie_name,
    tr.email AS tradie_email,
    tr.phone AS tradie_phone,
    so.company_id,
    tc.name AS company_name
  FROM work_orders wo
  LEFT JOIN rental_properties rp ON rp.id = wo.property_id
  LEFT JOIN tenants t ON t.id = wo.tenant_id
  LEFT JOIN landlords l ON l.id = wo.landlord_id
  LEFT JOIN property_managers pm ON pm.id = wo.property_manager_id
  LEFT JOIN rental_quote_options so ON so.id = ${sql(approval.selected_option_id)}
  LEFT JOIN tradies tr ON tr.id = so.tradie_id
  LEFT JOIN tradie_companies tc ON tc.id = so.company_id
  WHERE wo.id = ${sql(approval.work_order_id)}
  LIMIT 1
),
event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'work_order', work_order_id, 'rental_approval_calendar_notification_context_loaded', ${jsonSql({ approval, calendar })}
  FROM ctx
)
SELECT jsonb_build_object(
  'success', true,
  'approval', ${jsonSql(approval)},
  'calendar', ${jsonSql(calendar)},
  'context', COALESCE((SELECT to_jsonb(ctx) FROM ctx), '{}'::jsonb)
) AS notification_context;
`;

return [{ json: { sql: query } }];
'@

$buildNotificationEmailsCode = @'
const row = items[0]?.json?.notification_context || items[0]?.json || {};
const approval = row.approval || {};
const calendar = row.calendar || {};
const ctx = row.context || {};

function fmtDate(value) {
  if (!value) return 'the approved time';
  try {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}
function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `$${Math.round(n)}` : 'to be confirmed';
}
function add(list, role, to, subject, message) {
  if (!to) return;
  list.push({
    json: {
      role,
      to,
      subject,
      message,
      work_order_id: ctx.work_order_id || approval.work_order_id,
      approval_id: approval.approval_id,
      selected_option_id: approval.selected_option_id,
      schedule_slot_id: approval.schedule_slot_id,
    },
  });
}

const start = fmtDate(ctx.scheduled_start || approval.scheduled_start);
const end = fmtDate(ctx.scheduled_end || approval.scheduled_end);
const job = ctx.description || 'the approved maintenance job';
const address = [ctx.address, ctx.suburb].filter(Boolean).join(', ');
const amount = money(ctx.quote_amount || approval.quote_amount);
const tradie = ctx.tradie_name || approval.tradie_id || 'the assigned tradie';
const calendarStatus = calendar.success ? 'booked in the company calendar' : 'ready for calendar review';
const trackingUrl = `https://app.1pacent.com/job-status?work_order_id=${encodeURIComponent(ctx.work_order_id || approval.work_order_id || '')}`;

const emails = [];

add(
  emails,
  'tenant',
  ctx.tenant_email,
  `Maintenance appointment confirmed for ${start}`,
  [
    `Hi ${ctx.tenant_name || 'there'},`,
    '',
    `Your maintenance appointment has been approved and ${calendarStatus}.`,
    '',
    `Job: ${job}`,
    `Property: ${address || 'your rental property'}`,
    `Appointment: ${start} to ${end}`,
    `Tradie: ${tradie}`,
    '',
    'Please make sure access is available during this window. If this no longer works, contact Sally as soon as possible.',
    '',
    `Track this job: ${trackingUrl}`,
  ].join('\n')
);

add(
  emails,
  'tradie',
  ctx.tradie_email,
  `Approved rental maintenance job: ${ctx.work_order_id || approval.work_order_id}`,
  [
    `Hi ${ctx.tradie_name || 'there'},`,
    '',
    'A landlord-approved rental maintenance job has been assigned to you.',
    '',
    `Work order: ${ctx.work_order_id || approval.work_order_id}`,
    `Job: ${job}`,
    `Property: ${address || 'address to be confirmed'}`,
    `Appointment: ${start} to ${end}`,
    `Approved amount: ${amount}`,
    '',
    'Confirm final scope before work begins and record parts, labour, notes and evidence when complete.',
  ].join('\n')
);

add(
  emails,
  'landlord',
  ctx.landlord_email,
  `Approved maintenance scheduled: ${ctx.work_order_id || approval.work_order_id}`,
  [
    `Hi ${ctx.landlord_name || 'there'},`,
    '',
    'Thanks, your selected maintenance option has been approved and moved to scheduling.',
    '',
    `Work order: ${ctx.work_order_id || approval.work_order_id}`,
    `Job: ${job}`,
    `Property: ${address || 'the rental property'}`,
    `Approved amount: ${amount}`,
    `Appointment: ${start} to ${end}`,
    `Tradie: ${tradie}`,
    '',
    'The tradie will confirm final scope before work begins and completion evidence will be captured for your records.',
  ].join('\n')
);

add(
  emails,
  'property_manager',
  ctx.property_manager_email,
  `Rental job approved and scheduled: ${ctx.work_order_id || approval.work_order_id}`,
  [
    `Hi ${ctx.property_manager_name || 'there'},`,
    '',
    'A landlord-approved maintenance option has been scheduled automatically.',
    '',
    `Work order: ${ctx.work_order_id || approval.work_order_id}`,
    `Tenant: ${ctx.tenant_name || 'Tenant'}`,
    `Landlord: ${ctx.landlord_name || 'Landlord'}`,
    `Job: ${job}`,
    `Property: ${address || 'address to be confirmed'}`,
    `Approved amount: ${amount}`,
    `Appointment: ${start} to ${end}`,
    `Tradie: ${tradie}`,
    `Calendar status: ${calendarStatus}`,
    '',
    'This avoided the normal tenant-tradie-landlord back-and-forth by approving a costed option already matched to tenant and tradie availability.',
  ].join('\n')
);

if (!emails.length) {
  emails.push({
    json: {
      role: 'ops',
      to: 'mac@1pacent.com',
      subject: `Rental job scheduled but contacts missing: ${ctx.work_order_id || approval.work_order_id || 'work order'}`,
      message: [
        'A rental quote option was approved and scheduled, but no role emails were available on the demo records.',
        '',
        `Work order: ${ctx.work_order_id || approval.work_order_id || ''}`,
        `Selected option: ${approval.selected_option_id || ''}`,
        `Schedule slot: ${approval.schedule_slot_id || ''}`,
        `Calendar status: ${calendar.success ? 'booked' : 'needs review'}`,
      ].join('\n'),
      work_order_id: ctx.work_order_id || approval.work_order_id,
      approval_id: approval.approval_id,
      selected_option_id: approval.selected_option_id,
      schedule_slot_id: approval.schedule_slot_id,
    },
  });
}

return emails;
'@

$notificationLogSqlCode = @'
const preparedItems = $('Build Rental Notification Emails').all().map(item => item.json || {});
const sentItems = items.map(item => item.json || {});
const approval = $('Approve Rental Quote Option').first().json?.quote_option_approval_result || $('Approve Rental Quote Option').first().json || {};
const calendar = $('Call George Calendar Booking').first().json?.body || $('Call George Calendar Booking').first().json || {};

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const query = `
INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
VALUES (
  'work_order',
  ${sql(approval.work_order_id)},
  'rental_notifications_sent_after_landlord_approval',
  ${jsonSql({ approval, calendar, notifications: preparedItems.map(i => ({ role: i.role, to: i.to, subject: i.subject })), gmail_results: sentItems.map(i => ({ id: i.id || null, threadId: i.threadId || null, error: i.error || null })) })}
);

SELECT jsonb_build_object(
  'success', true,
  'approval_result', ${jsonSql(approval)},
  'calendar_booking_result', ${jsonSql(calendar)},
  'notifications_sent', ${jsonSql(preparedItems.map(i => ({ role: i.role, to: i.to, subject: i.subject })))},
  'gmail_results', ${jsonSql(sentItems.map(i => ({ id: i.id || null, threadId: i.threadId || null, error: i.error || null })))},
  'next_action', 'monitor_tenant_tradie_confirmation_and_job_completion',
  'message', 'Tenant, tradie, landlord and property manager notifications have been prepared and sent where email addresses are available.'
) AS notification_result;
`;

return [{ json: { sql: query } }];
'@

$confirmationResponseCode = @'
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
function normaliseStatus(value) {
  const text = String(value || '').toLowerCase();
  if (['yes', 'y', 'confirm', 'confirmed', 'accept', 'accepted', 'ok'].includes(text)) return 'confirmed';
  if (['no', 'n', 'decline', 'declined', 'reject', 'rejected', 'cannot_attend'].includes(text)) return 'declined';
  if (['timeout', 'expired', 'no_response'].includes(text)) return 'timeout';
  return text || 'pending';
}

const actorType = String(first(body.actor_type, body.role, 'tenant')).toLowerCase();
const status = normaliseStatus(first(body.confirmation_status, body.status, body.response));
const quoteOptionId = first(body.quote_option_id, body.selected_option_id, body.option_id);
const scheduleSlotId = first(body.schedule_slot_id, body.slot_id);
const workOrderId = first(body.work_order_id);
const actorId = first(body.actor_id, body.tenant_id, body.tradie_id);
const responseDueAt = first(body.response_due_at, body.due_at);

const query = `
WITH selected_option AS (
  SELECT ro.*
  FROM rental_quote_options ro
  WHERE (${sql(quoteOptionId)} IS NOT NULL AND ro.id = ${sql(quoteOptionId)})
     OR (${sql(quoteOptionId)} IS NULL AND ${sql(workOrderId)} IS NOT NULL AND ro.work_order_id = ${sql(workOrderId)} AND ro.status = 'approved_selected')
  ORDER BY ro.option_rank
  LIMIT 1
),
target AS (
  SELECT
    COALESCE(${sql(workOrderId)}, so.work_order_id) AS work_order_id,
    so.id AS quote_option_id,
    (
      SELECT s.id
      FROM job_schedule_slots s
      WHERE s.id IN (${sql(scheduleSlotId)}, 'SLOT-' || so.id)
      ORDER BY CASE WHEN s.id = ${sql(scheduleSlotId)} THEN 0 ELSE 1 END
      LIMIT 1
    ) AS schedule_slot_id,
    so.batch_id,
    so.option_rank
  FROM selected_option so
),
insert_confirmation AS (
  INSERT INTO rental_confirmation_events (
    work_order_id, quote_option_id, schedule_slot_id, actor_type, actor_id,
    confirmation_status, response_channel, response_due_at, fallback_triggered,
    payload
  )
  SELECT
    target.work_order_id,
    target.quote_option_id,
    target.schedule_slot_id,
    ${sql(actorType)},
    ${sql(actorId)},
    ${sql(status)},
    ${sql(first(body.response_channel, 'webhook'))},
    ${sql(responseDueAt)}::timestamptz,
    ${status === 'declined' || status === 'timeout' ? 'true' : 'false'},
    ${jsonSql(body)}
  FROM target
  RETURNING *
),
latest AS (
  SELECT
    target.work_order_id,
    target.quote_option_id,
    bool_or(actor_type = 'tenant' AND confirmation_status = 'confirmed') AS tenant_confirmed,
    bool_or(actor_type = 'tradie' AND confirmation_status = 'confirmed') AS tradie_confirmed,
    bool_or(confirmation_status IN ('declined','timeout')) AS any_failed
  FROM target
  LEFT JOIN (
    SELECT work_order_id, quote_option_id, actor_type, confirmation_status
    FROM rental_confirmation_events
    UNION ALL
    SELECT work_order_id, quote_option_id, actor_type, confirmation_status
    FROM insert_confirmation
  ) rce ON rce.work_order_id = target.work_order_id
   AND rce.quote_option_id = target.quote_option_id
  GROUP BY target.work_order_id, target.quote_option_id
),
fallback_option AS (
  SELECT next_ro.*
  FROM target
  JOIN rental_quote_options current_ro ON current_ro.id = target.quote_option_id
  JOIN rental_quote_options next_ro
    ON next_ro.batch_id = current_ro.batch_id
   AND next_ro.option_rank > current_ro.option_rank
   AND next_ro.status IN ('proposed','not_selected')
  WHERE EXISTS (SELECT 1 FROM latest WHERE any_failed = true)
  ORDER BY next_ro.option_rank
  LIMIT 1
),
mark_current AS (
  UPDATE rental_quote_options ro
  SET status = CASE
      WHEN EXISTS (SELECT 1 FROM latest WHERE any_failed = true) THEN 'confirmation_failed'
      WHEN EXISTS (SELECT 1 FROM latest WHERE tenant_confirmed = true AND tradie_confirmed = true) THEN 'fully_confirmed'
      ELSE ro.status
    END,
    payload = ro.payload || jsonb_build_object(
      'tenant_confirmed', (SELECT tenant_confirmed FROM latest),
      'tradie_confirmed', (SELECT tradie_confirmed FROM latest),
      'confirmation_failed', (SELECT any_failed FROM latest)
    ),
    updated_at = now()
  WHERE ro.id = (SELECT quote_option_id FROM target)
  RETURNING *
),
mark_fallback AS (
  UPDATE rental_quote_options ro
  SET status = 'fallback_candidate',
      payload = ro.payload || jsonb_build_object('fallback_from_option_id', (SELECT quote_option_id FROM target), 'fallback_reason', ${sql(status)}),
      updated_at = now()
  WHERE ro.id = (SELECT id FROM fallback_option)
  RETURNING *
),
update_slot AS (
  UPDATE job_schedule_slots s
  SET status = CASE
      WHEN EXISTS (SELECT 1 FROM latest WHERE any_failed = true) THEN 'confirmation_failed_needs_fallback'
      WHEN EXISTS (SELECT 1 FROM latest WHERE tenant_confirmed = true AND tradie_confirmed = true) THEN 'ready_to_attend'
      ELSE 'awaiting_confirmation'
    END,
    route_context = route_context || jsonb_build_object(
      'tenant_confirmed', (SELECT tenant_confirmed FROM latest),
      'tradie_confirmed', (SELECT tradie_confirmed FROM latest),
      'confirmation_failed', (SELECT any_failed FROM latest),
      'fallback_quote_option_id', (SELECT id FROM fallback_option)
    ),
    updated_at = now()
  WHERE s.id = (SELECT schedule_slot_id FROM target)
  RETURNING *
),
update_work_order AS (
  UPDATE work_orders wo
  SET status = CASE
      WHEN EXISTS (SELECT 1 FROM latest WHERE any_failed = true) THEN 'confirmation_failed_fallback_needed'
      WHEN EXISTS (SELECT 1 FROM latest WHERE tenant_confirmed = true AND tradie_confirmed = true) THEN 'ready_to_attend'
      ELSE 'awaiting_tenant_tradie_confirmation'
    END,
    tenant_access_confirmed = CASE WHEN EXISTS (SELECT 1 FROM latest WHERE tenant_confirmed = true) THEN true ELSE tenant_access_confirmed END,
    payload = payload || jsonb_build_object(
      'tenant_confirmed', (SELECT tenant_confirmed FROM latest),
      'tradie_confirmed', (SELECT tradie_confirmed FROM latest),
      'confirmation_failed', (SELECT any_failed FROM latest),
      'fallback_quote_option_id', (SELECT id FROM fallback_option)
    ),
    updated_at = now()
  WHERE wo.id = (SELECT work_order_id FROM target)
  RETURNING *
),
patch_event AS (
  UPDATE rental_confirmation_events rce
  SET fallback_quote_option_id = (SELECT id FROM fallback_option)
  WHERE rce.id IN (SELECT id FROM insert_confirmation)
  RETURNING *
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'work_order', work_order_id, 'rental_confirmation_response_processed', jsonb_build_object(
    'actor_type', ${sql(actorType)},
    'status', ${sql(status)},
    'quote_option_id', quote_option_id,
    'schedule_slot_id', schedule_slot_id,
    'tenant_confirmed', (SELECT tenant_confirmed FROM latest),
    'tradie_confirmed', (SELECT tradie_confirmed FROM latest),
    'fallback_quote_option_id', (SELECT id FROM fallback_option)
  )
  FROM target
)
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'success', true,
      'work_order_id', target.work_order_id,
      'quote_option_id', target.quote_option_id,
      'schedule_slot_id', target.schedule_slot_id,
      'actor_type', ${sql(actorType)},
      'confirmation_status', ${sql(status)},
      'tenant_confirmed', latest.tenant_confirmed,
      'tradie_confirmed', latest.tradie_confirmed,
      'ready_to_attend', latest.tenant_confirmed AND latest.tradie_confirmed AND NOT latest.any_failed,
      'fallback_required', latest.any_failed,
      'fallback_quote_option_id', (SELECT id FROM fallback_option),
      'next_action', CASE
        WHEN latest.tenant_confirmed AND latest.tradie_confirmed AND NOT latest.any_failed THEN 'job_ready_to_attend'
        WHEN latest.any_failed AND EXISTS (SELECT 1 FROM fallback_option) THEN 'offer_next_ranked_option_to_landlord_or_auto_confirm_by_policy'
        WHEN latest.any_failed THEN 'manual_intervention_required_no_fallback_option'
        ELSE 'wait_for_other_party_confirmation'
      END
    )
    FROM target
    JOIN latest ON latest.work_order_id = target.work_order_id
    LIMIT 1
  ),
  jsonb_build_object('success', false, 'message', 'No selected quote option matched the confirmation response.')
) AS confirmation_result;
`;

return [{ json: { sql: query } }];
'@

$rentalJobCompletionCode = @'
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
function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}
function arraySql(value) {
  const arr = Array.isArray(value) ? value : value ? String(value).split(/,|\n/).map(v => v.trim()).filter(Boolean) : [];
  return `ARRAY[${arr.map(v => sql(v)).join(',')}]::text[]`;
}
function minutes(value, fallbackHours) {
  const n = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  if (Number.isFinite(n)) return Math.round(n);
  const h = Number(String(fallbackHours ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(h) ? Math.round(h * 60) : null;
}
function normaliseParts(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return value.split(/\n|,/).map((line) => {
      const text = line.trim();
      if (!text) return null;
      const match = text.match(/^(\d+(?:\.\d+)?)\s*x?\s+(.+)$/i);
      return { description: match ? match[2].trim() : text, quantity: match ? Number(match[1]) : 1 };
    }).filter(Boolean);
  }
  return [];
}

const now = new Date();
const workOrderId = first(body.work_order_id);
const quoteOptionId = first(body.quote_option_id, body.selected_option_id);
const scheduleSlotId = first(body.schedule_slot_id);
const tradieId = first(body.tradie_id);
const jobId = first(body.job_id, workOrderId ? `JOB-${workOrderId}` : '');
const invoiceId = first(body.invoice_id, `INV-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const actualDurationMinutes = minutes(first(body.actual_duration_minutes, body.labour_minutes), body.labour_hours);
const actualTravelMinutes = minutes(first(body.actual_travel_minutes, body.travel_minutes), body.travel_hours);
const labourHours = actualDurationMinutes === null ? first(body.labour_hours, body.actual_labour_hours) : (actualDurationMinutes / 60).toFixed(2);
const finalAmount = first(body.final_amount, body.final_invoice_amount, body.invoice_amount);
const completionNotes = first(body.completion_notes, body.tradie_notes, body.notes, 'Completed as agreed.');
const varianceReason = first(body.variance_reason, completionNotes);
const beforePhotoUrls = first(body.before_photo_urls, body.before_photos, []);
const afterPhotoUrls = first(body.after_photo_urls, body.after_photos, []);
const certificateUrls = first(body.certificate_urls, body.certificates, []);
const parts = normaliseParts(first(body.parts_used, body.parts, body.materials));
const partsTotal = parts.reduce((sum, part) => {
  const total = Number(first(part.total_cost, part.totalCost));
  if (Number.isFinite(total)) return sum + total;
  const qty = Number(first(part.quantity, part.qty, 1));
  const unit = Number(first(part.unit_cost, part.unitCost, 0));
  return sum + (Number.isFinite(qty) && Number.isFinite(unit) ? qty * unit : 0);
}, 0);

const partRows = parts.map(part => `(
  ${sql(jobId)},
  ${sql(first(part.description, part.name, part.item, 'Material'))},
  ${num(first(part.quantity, part.qty, 1))},
  ${num(first(part.unit_cost, part.unitCost))},
  ${num(first(part.total_cost, part.totalCost))}
)`).join(',\n');

const query = `
WITH wo AS (
  SELECT * FROM work_orders WHERE id = ${sql(workOrderId)} LIMIT 1
),
selected_option AS (
  SELECT *
  FROM rental_quote_options
  WHERE (${sql(quoteOptionId)} IS NOT NULL AND id = ${sql(quoteOptionId)})
     OR (${sql(quoteOptionId)} IS NULL AND work_order_id = ${sql(workOrderId)} AND status IN ('fully_confirmed','approved_selected'))
  ORDER BY CASE WHEN status = 'fully_confirmed' THEN 0 ELSE 1 END, option_rank
  LIMIT 1
),
resolved AS (
  SELECT
    COALESCE(${sql(jobId)}, wo.job_id, 'JOB-' || wo.id) AS job_id,
    wo.id AS work_order_id,
    wo.lead_id,
    wo.quote_id,
    wo.trade_type,
    wo.description,
    wo.estimated_amount,
    wo.compliance_required,
    COALESCE(${sql(tradieId)}, so.tradie_id) AS tradie_id,
    so.id AS quote_option_id,
    so.quote_amount AS approved_amount,
    COALESCE(${sql(scheduleSlotId)}, 'SLOT-' || so.id) AS schedule_slot_id
  FROM wo
  LEFT JOIN selected_option so ON true
),
upsert_job AS (
  INSERT INTO jobs (id, lead_id, quote_id, status, completed_at, updated_at)
  SELECT job_id, lead_id, quote_id, 'Rental Job Complete - Invoice Ready', now(), now()
  FROM resolved
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    completed_at = EXCLUDED.completed_at,
    updated_at = now()
  RETURNING *
),
insert_actuals AS (
  INSERT INTO job_actuals (
    job_id, lead_id, quote_id, tradie_id, actual_start, actual_end,
    actual_duration_minutes, actual_travel_minutes, completion_notes
  )
  SELECT
    job_id,
    lead_id,
    quote_id,
    tradie_id,
    ${sql(first(body.actual_start, body.started_at))}::timestamptz,
    COALESCE(${sql(first(body.actual_end, body.completed_at))}::timestamptz, now()),
    ${num(actualDurationMinutes)},
    ${num(actualTravelMinutes)},
    ${sql(completionNotes)}
  FROM resolved
  RETURNING *
),
insert_evidence AS (
  INSERT INTO rental_job_evidence (
    work_order_id, job_id, quote_option_id, tradie_id, evidence_type,
    before_photo_urls, after_photo_urls, certificate_urls, parts_used,
    labour_hours, travel_minutes, final_amount, completion_notes, variance_reason, payload
  )
  SELECT
    work_order_id,
    job_id,
    quote_option_id,
    tradie_id,
    'completion',
    ${arraySql(beforePhotoUrls)},
    ${arraySql(afterPhotoUrls)},
    ${arraySql(certificateUrls)},
    ${jsonSql(parts)},
    ${num(labourHours)},
    ${num(actualTravelMinutes)},
    ${num(finalAmount)},
    ${sql(completionNotes)},
    ${sql(varianceReason)},
    ${jsonSql(body)}
  FROM resolved
  RETURNING *
),
insert_invoice AS (
  INSERT INTO invoices (id, job_id, quote_id, status, amount, sent_at, created_at, updated_at)
  SELECT ${sql(invoiceId)}, job_id, quote_id, 'Invoice Ready - Payment Request Pending', ${sql(finalAmount)}, now(), now(), now()
  FROM resolved
  ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    status = EXCLUDED.status,
    sent_at = now(),
    updated_at = now()
  RETURNING *
),
insert_quote_accuracy AS (
  INSERT INTO quote_accuracy_metrics (
    lead_id, quote_id, trade_type, initial_estimate, confirmed_quote, final_invoice,
    estimated_labour_hours, actual_labour_hours, estimated_materials_cost, actual_materials_cost,
    variance_reason, accuracy_score
  )
  SELECT
    lead_id,
    quote_id,
    trade_type,
    estimated_amount::text,
    approved_amount::text,
    ${sql(finalAmount)},
    NULL,
    ${num(labourHours)},
    NULL,
    ${num(partsTotal)},
    ${sql(varianceReason)},
    CASE
      WHEN approved_amount IS NULL OR ${num(finalAmount)} IS NULL OR approved_amount = 0 THEN NULL
      ELSE GREATEST(0, LEAST(100, 100 - ABS(((${num(finalAmount)} - approved_amount) / approved_amount) * 100)))
    END
  FROM resolved
  RETURNING *
),
insert_materials AS (
  INSERT INTO job_materials (job_id, description, quantity, unit_cost, total_cost)
  SELECT * FROM (
    ${partRows ? `VALUES ${partRows}` : "SELECT NULL::text, NULL::text, NULL::numeric, NULL::numeric, NULL::numeric WHERE false"}
  ) AS v(job_id, description, quantity, unit_cost, total_cost)
  WHERE v.job_id IS NOT NULL
  RETURNING *
),
insert_certificates AS (
  INSERT INTO compliance_certificates (id, property_id, work_order_id, requirement_type, certificate_url, issued_by_tradie_id, issued_at, status, payload)
  SELECT
    'CERT-' || resolved.work_order_id || '-' || row_number() OVER (),
    wo.property_id,
    resolved.work_order_id,
    COALESCE(resolved.trade_type, 'rental_maintenance'),
    cert_url,
    resolved.tradie_id,
    now(),
    'captured',
    ${jsonSql(body)}
  FROM resolved
  JOIN wo ON true
  JOIN unnest(${arraySql(certificateUrls)}) cert_url ON true
  WHERE cert_url IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET certificate_url = EXCLUDED.certificate_url, payload = EXCLUDED.payload
  RETURNING *
),
commercial_terms AS (
  SELECT t.*
  FROM resolved
  JOIN tradie_commercial_terms t
    ON t.active = true
   AND (t.tradie_id IS NULL OR t.tradie_id = resolved.tradie_id)
   AND (t.company_id IS NULL OR t.company_id = (SELECT company_id FROM tradies WHERE id = resolved.tradie_id))
   AND (t.trade_type IS NULL OR lower(t.trade_type) = lower(COALESCE(resolved.trade_type, '')))
   AND (t.job_type IS NULL OR lower(t.job_type) = lower(COALESCE((SELECT job_type FROM wo), '')))
   AND t.effective_from <= current_date
   AND (t.effective_to IS NULL OR t.effective_to >= current_date)
  ORDER BY t.tradie_id NULLS LAST, t.job_type NULLS LAST, t.effective_from DESC
  LIMIT 1
),
insert_warranties AS (
  INSERT INTO work_order_warranties (
    warranty_key, original_work_order_id, job_id, quote_option_id, tradie_id, property_id,
    trade_type, job_type, warranty_type, commercial_terms_id, labour_warranty_days, parts_warranty_days,
    consumer_guarantee_reference_keys, warranty_start, warranty_end, warranty_terms,
    callout_fee_policy, landlord_charge_policy, status, payload
  )
  SELECT
    'WARR-' || resolved.work_order_id,
    resolved.work_order_id,
    resolved.job_id,
    resolved.quote_option_id,
    resolved.tradie_id,
    wo.property_id,
    resolved.trade_type,
    wo.job_type,
    'workmanship_and_parts',
    (SELECT id FROM commercial_terms),
    COALESCE(${num(first(body.warranty_days, body.default_warranty_days))}::integer, (SELECT labour_warranty_days FROM commercial_terms), 90),
    (SELECT parts_warranty_days FROM commercial_terms),
    ARRAY['AU_ACL_CONSUMER_GUARANTEES_AUTOMATIC_2026_05_21','AU_ACL_SERVICES_DUE_CARE_SKILL_2026_05_21','AU_ACL_WARRANTIES_ADDITIONAL_2026_05_21']::text[],
    current_date,
    current_date + COALESCE(${num(first(body.warranty_days, body.default_warranty_days))}::integer, (SELECT labour_warranty_days FROM commercial_terms), 90),
    COALESCE(${sql(first(body.warranty_terms))}, (SELECT 'Labour warranty: ' || labour_warranty_days || ' days. Parts policy: ' || parts_warranty_policy FROM commercial_terms), 'Default workmanship and supplied-parts warranty captured from completion evidence. Warranty scope must be reviewed before approving any duplicate charge.'),
    (SELECT callout_waiver_policy FROM commercial_terms),
    'no_charge_if_same_issue_within_warranty',
    'active',
    jsonb_build_object(
      'source', 'rental_job_completion',
      'parts_used', ${jsonSql(parts)},
      'completion_notes', ${sql(completionNotes)},
      'final_amount', ${num(finalAmount)},
      'commercial_terms', (SELECT to_jsonb(commercial_terms) FROM commercial_terms),
      'consumer_guarantee_keys', jsonb_build_array('AU_ACL_CONSUMER_GUARANTEES_AUTOMATIC_2026_05_21','AU_ACL_SERVICES_DUE_CARE_SKILL_2026_05_21','AU_ACL_WARRANTIES_ADDITIONAL_2026_05_21')
    )
  FROM resolved
  JOIN wo ON true
  WHERE resolved.work_order_id IS NOT NULL
  ON CONFLICT (warranty_key) DO UPDATE SET
    job_id = EXCLUDED.job_id,
    quote_option_id = EXCLUDED.quote_option_id,
    tradie_id = EXCLUDED.tradie_id,
    property_id = EXCLUDED.property_id,
    trade_type = EXCLUDED.trade_type,
    job_type = EXCLUDED.job_type,
    commercial_terms_id = EXCLUDED.commercial_terms_id,
    labour_warranty_days = EXCLUDED.labour_warranty_days,
    parts_warranty_days = EXCLUDED.parts_warranty_days,
    consumer_guarantee_reference_keys = EXCLUDED.consumer_guarantee_reference_keys,
    warranty_end = EXCLUDED.warranty_end,
    warranty_terms = EXCLUDED.warranty_terms,
    callout_fee_policy = EXCLUDED.callout_fee_policy,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
update_work_order AS (
  UPDATE work_orders
  SET status = 'completed_invoice_ready',
      job_id = (SELECT job_id FROM resolved),
      estimated_amount = COALESCE(${num(finalAmount)}, estimated_amount),
      payload = payload || jsonb_build_object(
        'completion_evidence_id', (SELECT id FROM insert_evidence LIMIT 1),
        'invoice_id', ${sql(invoiceId)},
        'final_amount', ${num(finalAmount)},
        'completion_notes', ${sql(completionNotes)},
        'certificate_count', (SELECT count(*) FROM insert_certificates),
        'parts_count', (SELECT count(*) FROM insert_materials),
        'warranty_key', (SELECT warranty_key FROM insert_warranties LIMIT 1),
        'warranty_end', (SELECT warranty_end FROM insert_warranties LIMIT 1)
      ),
      updated_at = now()
  WHERE id = ${sql(workOrderId)}
  RETURNING *
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'work_order', id, 'rental_job_completed_evidence_invoice_ready', jsonb_build_object(
    'job_id', job_id,
    'invoice_id', ${sql(invoiceId)},
    'final_amount', ${num(finalAmount)},
    'evidence_id', (SELECT id FROM insert_evidence LIMIT 1),
    'quote_accuracy_metric_id', (SELECT id FROM insert_quote_accuracy LIMIT 1),
    'warranty_key', (SELECT warranty_key FROM insert_warranties LIMIT 1),
    'next_agents', jsonb_build_array('penny', 'mia_social', 'quintino', 'wally_warranty')
  )
  FROM update_work_order
)
SELECT jsonb_build_object(
  'success', true,
  'work_order_id', ${sql(workOrderId)},
  'job_id', (SELECT job_id FROM resolved),
  'invoice_id', ${sql(invoiceId)},
  'final_amount', ${num(finalAmount)},
  'evidence_id', (SELECT id FROM insert_evidence LIMIT 1),
  'quote_accuracy_metric_id', (SELECT id FROM insert_quote_accuracy LIMIT 1),
  'certificate_count', (SELECT count(*) FROM insert_certificates),
  'material_count', (SELECT count(*) FROM insert_materials),
  'warranty_key', (SELECT warranty_key FROM insert_warranties LIMIT 1),
  'warranty_end', (SELECT warranty_end FROM insert_warranties LIMIT 1),
  'next_action', 'trigger_penny_invoice_payment_request_and_mia_feedback',
  'message', 'Rental job completion evidence captured, invoice prepared, warranty tracked, and quote accuracy learning recorded.'
) AS rental_completion_result;
`;

return [{ json: { sql: query } }];
'@

$scheduleForecastCode = @'
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
function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const now = new Date();
const forecastId = first(body.forecast_id, `RSF-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const startDate = first(body.start_date, now.toISOString().slice(0, 10));
const days = Math.max(1, Math.min(28, Number(first(body.days, 14)) || 14));
const agencyId = first(body.agency_id);
const jurisdiction = first(body.jurisdiction, 'VIC');

const query = `
WITH params AS (
  SELECT
    ${sql(forecastId)}::text AS forecast_id,
    ${sql(startDate)}::date AS start_date,
    (${sql(startDate)}::date + (${days} || ' days')::interval)::date AS end_date,
    ${sql(agencyId)}::text AS agency_id,
    ${sql(jurisdiction)}::text AS jurisdiction
),
candidate_work_orders AS (
  SELECT
    wo.id AS work_order_id,
    wo.agency_id,
    wo.property_id,
    wo.tenant_id,
    wo.trade_type,
    wo.job_type,
    wo.urgency,
    COALESCE(wo.estimated_amount, 250) AS landlord_cost_estimate,
    rp.suburb,
    rp.state AS jurisdiction,
    tw.id AS tenant_availability_window_id,
    tw.window_start,
    tw.window_end,
    tw.preference_rank
  FROM work_orders wo
  JOIN rental_properties rp ON rp.id = wo.property_id
  LEFT JOIN tenant_availability_windows tw
    ON tw.work_order_id = wo.id
   AND tw.status IN ('offered','preferred','confirmed')
   AND tw.window_start::date >= (SELECT start_date FROM params)
   AND tw.window_start::date < (SELECT end_date FROM params)
  WHERE wo.status IN ('triaged','triaged_from_inspection','landlord_approved_scheduling_ready','awaiting_tenant_tradie_confirmation','confirmation_failed_fallback_needed','ready_to_attend')
    AND ((SELECT agency_id FROM params) IS NULL OR wo.agency_id = (SELECT agency_id FROM params))
),
compliance_due AS (
  SELECT
    'COMPLIANCE-' || cr.id::text AS work_order_id,
    rp.agency_id,
    rp.id AS property_id,
    t.tenant_id,
    crc.activity_key AS trade_type,
    crc.activity_key AS job_type,
    CASE WHEN cr.due_date <= (SELECT start_date FROM params) + interval '3 days' THEN 'urgent' ELSE 'normal' END AS urgency,
    COALESCE(b.fixed_fee_amount, 129) AS landlord_cost_estimate,
    rp.suburb,
    rp.state AS jurisdiction,
    tw.id AS tenant_availability_window_id,
    tw.window_start,
    tw.window_end,
    tw.preference_rank,
    crc.requirement_key,
    b.bundle_key
  FROM compliance_requirements cr
  JOIN rental_properties rp ON rp.id = cr.property_id
  LEFT JOIN tenancies t ON t.property_id = rp.id AND t.status = 'active'
  LEFT JOIN tenant_availability_windows tw
    ON tw.tenant_id = t.tenant_id
   AND tw.status IN ('offered','preferred','confirmed')
   AND tw.window_start::date >= (SELECT start_date FROM params)
   AND tw.window_start::date < (SELECT end_date FROM params)
  JOIN compliance_requirement_catalogue crc
    ON crc.jurisdiction = rp.state
   AND crc.activity_key = cr.requirement_type
   AND crc.status = 'active'
  LEFT JOIN compliance_bundle_catalogue b
    ON (b.jurisdiction = rp.state OR b.jurisdiction = 'NATIONAL')
   AND b.status = 'active'
   AND crc.activity_key = ANY(b.included_activity_keys)
  WHERE cr.status IN ('due','scheduled','overdue')
    AND cr.due_date <= (SELECT end_date FROM params)
    AND ((SELECT agency_id FROM params) IS NULL OR rp.agency_id = (SELECT agency_id FROM params))
),
all_candidates AS (
  SELECT
    work_order_id, agency_id, property_id, tenant_id, trade_type, job_type, urgency,
    landlord_cost_estimate, suburb, jurisdiction, tenant_availability_window_id,
    window_start, window_end, preference_rank, NULL::text AS requirement_key, NULL::text AS bundle_key
  FROM candidate_work_orders
  UNION ALL
  SELECT
    work_order_id, agency_id, property_id, tenant_id, trade_type, job_type, urgency,
    landlord_cost_estimate, suburb, jurisdiction, tenant_availability_window_id,
    window_start, window_end, preference_rank, requirement_key, bundle_key
  FROM compliance_due
),
tradie_matches AS (
  SELECT
    ac.*,
    tr.id AS tradie_id,
    tr.company_id,
    COALESCE(tm.average_rating * 20, tr.on_time_rate, tr.quote_accuracy_score, 70) AS trust_score,
    LEAST(ac.window_end, ac.window_start + interval '2 hours') AS scheduled_end
  FROM all_candidates ac
  JOIN tradies tr ON tr.active = true
  LEFT JOIN tradie_skills ts ON ts.tradie_id = tr.id AND lower(ts.trade_type) = lower(COALESCE(ac.trade_type, 'general_maintenance'))
  LEFT JOIN trust_metrics tm ON tm.tradie_id = tr.id AND (tm.trade_type IS NULL OR lower(tm.trade_type) = lower(COALESCE(ac.trade_type, 'general_maintenance')))
  WHERE ac.window_start IS NOT NULL
    AND (ts.id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM tradie_skills WHERE tradie_id = tr.id))
    AND NOT EXISTS (
      SELECT 1
      FROM job_schedule_slots s
      WHERE s.tradie_id = tr.id
        AND s.status IN ('booked','confirmed','scheduled','ready_to_attend')
        AND tstzrange(s.scheduled_start, s.scheduled_end, '[)') && tstzrange(ac.window_start, LEAST(ac.window_end, ac.window_start + interval '2 hours'), '[)')
    )
),
scored AS (
  SELECT
    *,
    regexp_replace(lower(COALESCE(suburb, 'unknown')), '[^a-z0-9]+', '-', 'g') || '-' || to_char(window_start AT TIME ZONE 'Australia/Sydney', 'YYYYMMDD') AS route_cluster_key,
    CASE
      WHEN urgency IN ('urgent','emergency') THEN 25
      ELSE 0
    END AS urgency_score,
    GREATEST(0, 100 - (COALESCE(preference_rank, 3) * 10)) AS tenant_fit_score,
    GREATEST(0, LEAST(100, COALESCE(trust_score, 70))) AS trust_fit_score,
    CASE WHEN bundle_key IS NOT NULL THEN 15 ELSE 0 END AS bundle_score,
    CASE WHEN suburb IS NOT NULL THEN 15 ELSE 0 END AS route_score
  FROM tradie_matches
),
ranked AS (
  SELECT
    *,
    round((tenant_fit_score * 0.25 + trust_fit_score * 0.30 + urgency_score + bundle_score + route_score)::numeric, 2) AS productivity_score,
    row_number() OVER (
      PARTITION BY work_order_id
      ORDER BY (tenant_fit_score * 0.25 + trust_fit_score * 0.30 + urgency_score + bundle_score + route_score) DESC, window_start
    ) AS candidate_rank
  FROM scored
),
top_options AS (
  SELECT *
  FROM ranked
  WHERE candidate_rank <= 3
),
insert_forecast AS (
  INSERT INTO rental_schedule_forecasts (
    id, forecast_window_start, forecast_window_end, generated_by_agent, scope, status,
    total_candidate_jobs, total_forecast_options, estimated_travel_minutes_saved,
    estimated_landlord_savings, payload
  )
  SELECT
    (SELECT forecast_id FROM params),
    (SELECT start_date FROM params),
    (SELECT end_date FROM params),
    'george_foreman',
    'rental_maintenance_and_compliance',
    'generated',
    (SELECT count(DISTINCT work_order_id) FROM all_candidates),
    (SELECT count(*) FROM top_options),
    GREATEST(0, (SELECT count(*) FROM top_options) * 12),
    COALESCE((SELECT sum(CASE WHEN bundle_key IS NOT NULL THEN 35 ELSE 12 END) FROM top_options), 0),
    jsonb_build_object(
      'jurisdiction', (SELECT jurisdiction FROM params),
      'forecast_days', ${days},
      'strategy', 'Match tenant availability to tradie capacity and cluster by suburb/date while surfacing compliance bundles.'
    )
  ON CONFLICT (id) DO UPDATE SET
    total_candidate_jobs = EXCLUDED.total_candidate_jobs,
    total_forecast_options = EXCLUDED.total_forecast_options,
    estimated_travel_minutes_saved = EXCLUDED.estimated_travel_minutes_saved,
    estimated_landlord_savings = EXCLUDED.estimated_landlord_savings,
    payload = EXCLUDED.payload
  RETURNING *
),
delete_old AS (
  DELETE FROM rental_schedule_forecast_options WHERE forecast_id = (SELECT forecast_id FROM params)
),
insert_options AS (
  INSERT INTO rental_schedule_forecast_options (
    forecast_id, work_order_id, compliance_requirement_key, bundle_key,
    tradie_id, company_id, tenant_availability_window_id, scheduled_start, scheduled_end,
    suburb, urgency, route_cluster_key, productivity_score, landlord_cost_estimate,
    travel_minutes_estimate, status, payload
  )
  SELECT
    (SELECT forecast_id FROM params),
    work_order_id,
    requirement_key,
    bundle_key,
    tradie_id,
    company_id,
    tenant_availability_window_id,
    window_start,
    scheduled_end,
    suburb,
    urgency,
    route_cluster_key,
    productivity_score,
    landlord_cost_estimate,
    CASE WHEN bundle_key IS NOT NULL THEN 15 ELSE 28 END,
    'forecast',
    jsonb_build_object(
      'candidate_rank', candidate_rank,
      'tenant_fit_score', tenant_fit_score,
      'trust_fit_score', trust_fit_score,
      'bundle_score', bundle_score,
      'route_score', route_score
    )
  FROM top_options
  RETURNING *
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'schedule_forecast', id, 'rental_two_week_schedule_forecast_generated', to_jsonb(insert_forecast)
  FROM insert_forecast
)
SELECT jsonb_build_object(
  'success', true,
  'forecast_id', (SELECT id FROM insert_forecast),
  'forecast_window_start', (SELECT forecast_window_start FROM insert_forecast),
  'forecast_window_end', (SELECT forecast_window_end FROM insert_forecast),
  'total_candidate_jobs', (SELECT total_candidate_jobs FROM insert_forecast),
  'total_forecast_options', (SELECT total_forecast_options FROM insert_forecast),
  'estimated_travel_minutes_saved', (SELECT estimated_travel_minutes_saved FROM insert_forecast),
  'estimated_landlord_savings', (SELECT estimated_landlord_savings FROM insert_forecast),
  'options', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'work_order_id', work_order_id,
    'tradie_id', tradie_id,
    'company_id', company_id,
    'scheduled_start', scheduled_start,
    'scheduled_end', scheduled_end,
    'suburb', suburb,
    'bundle_key', bundle_key,
    'route_cluster_key', route_cluster_key,
    'productivity_score', productivity_score,
    'landlord_cost_estimate', landlord_cost_estimate
  ) ORDER BY productivity_score DESC, scheduled_start) FROM insert_options), '[]'::jsonb),
  'next_action', 'review_forecast_clusters_and_offer_best_options'
) AS schedule_forecast_result;
`;

return [{ json: { sql: query } }];
'@

$warrantyReviewCode = @'
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
function num(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}
function signature(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the','and','for','with','needs','repair','replace','broken','faulty','issue','again'].includes(w))
    .slice(0, 8)
    .join(' ');
}

const workOrderId = first(body.work_order_id);
const propertyId = first(body.property_id);
const tradeType = first(body.trade_type);
const jobType = first(body.job_type);
const description = first(body.description, body.job_description, body.issue);
const issueSignature = first(body.issue_signature, signature(description));
const lookbackDays = Math.max(7, Math.min(730, Number(first(body.lookback_days, 180)) || 180));
const warrantyDays = Math.max(7, Math.min(730, Number(first(body.default_warranty_days, 90)) || 90));
const reviewKey = first(body.review_key, `WREV-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);

const query = `
WITH target AS (
  SELECT
    wo.*,
    COALESCE(${sql(propertyId)}, wo.property_id) AS resolved_property_id,
    COALESCE(${sql(tradeType)}, wo.trade_type) AS resolved_trade_type,
    COALESCE(${sql(jobType)}, wo.job_type) AS resolved_job_type,
    COALESCE(${sql(description)}, wo.description) AS resolved_description,
    ${sql(issueSignature)} AS issue_signature
  FROM work_orders wo
  WHERE (${sql(workOrderId)} IS NOT NULL AND wo.id = ${sql(workOrderId)})
     OR (${sql(workOrderId)} IS NULL AND ${sql(propertyId)} IS NOT NULL AND wo.property_id = ${sql(propertyId)})
  ORDER BY wo.created_at DESC
  LIMIT 1
),
prior_work AS (
  SELECT
    prev.*,
    rje.tradie_id AS evidence_tradie_id,
    rje.final_amount,
    rje.parts_used,
    rje.created_at AS completed_at
  FROM target t
  JOIN work_orders prev
    ON prev.property_id = t.resolved_property_id
   AND prev.id <> t.id
   AND prev.created_at >= now() - (${lookbackDays} || ' days')::interval
  LEFT JOIN rental_job_evidence rje ON rje.work_order_id = prev.id
  WHERE
    lower(COALESCE(prev.trade_type, '')) = lower(COALESCE(t.resolved_trade_type, prev.trade_type, ''))
    AND (
      lower(COALESCE(prev.job_type, '')) = lower(COALESCE(t.resolved_job_type, prev.job_type, ''))
      OR lower(COALESCE(prev.description, '')) LIKE '%' || split_part(t.issue_signature, ' ', 1) || '%'
      OR lower(COALESCE(t.resolved_description, '')) LIKE '%' || split_part(lower(COALESCE(prev.description, '')), ' ', 1) || '%'
    )
),
matched_warranty AS (
  SELECT wow.*
  FROM target t
  JOIN work_order_warranties wow
    ON wow.property_id = t.resolved_property_id
   AND wow.status = 'active'
   AND now()::date <= COALESCE(wow.warranty_end, now()::date)
   AND (wow.trade_type IS NULL OR lower(wow.trade_type) = lower(COALESCE(t.resolved_trade_type, '')))
   AND (wow.job_type IS NULL OR lower(wow.job_type) = lower(COALESCE(t.resolved_job_type, '')))
  ORDER BY wow.warranty_end DESC
  LIMIT 1
),
implicit_warranty AS (
  SELECT
    'AUTO-WARRANTY-' || pw.id AS warranty_key,
    pw.id AS original_work_order_id,
    pw.evidence_tradie_id AS tradie_id,
    (pw.completed_at::date + (${warrantyDays} || ' days')::interval)::date AS warranty_end
  FROM prior_work pw
  WHERE pw.completed_at IS NOT NULL
    AND pw.completed_at >= now() - (${warrantyDays} || ' days')::interval
  ORDER BY pw.completed_at DESC
  LIMIT 1
),
repeat_stats AS (
  SELECT
    count(*)::integer AS repeat_count,
    count(*) FILTER (WHERE completed_at >= now() - interval '30 days')::integer AS repeat_count_30d,
    max(completed_at) AS last_completed_at,
    COALESCE(
      (SELECT warranty_key FROM matched_warranty),
      (SELECT warranty_key FROM implicit_warranty)
    ) AS matched_warranty_key,
    COALESCE(
      (SELECT tradie_id FROM matched_warranty),
      (SELECT tradie_id FROM implicit_warranty),
      (SELECT evidence_tradie_id FROM prior_work WHERE evidence_tradie_id IS NOT NULL ORDER BY completed_at DESC LIMIT 1)
    ) AS previous_tradie_id
  FROM prior_work
),
decision AS (
  SELECT
    t.id AS work_order_id,
    t.resolved_property_id AS property_id,
    t.tenant_id,
    t.resolved_trade_type AS trade_type,
    t.resolved_job_type AS job_type,
    t.issue_signature,
    rs.repeat_count,
    rs.repeat_count_30d,
    rs.last_completed_at,
    rs.matched_warranty_key,
    rs.previous_tradie_id,
    (rs.matched_warranty_key IS NOT NULL OR rs.repeat_count_30d > 0) AS warranty_candidate,
    CASE
      WHEN rs.matched_warranty_key IS NOT NULL THEN 'no_landlord_charge_until_warranty_scope_reviewed'
      WHEN rs.repeat_count_30d > 0 THEN 'hold_duplicate_callout_fee_pending_repeat_issue_review'
      ELSE 'standard_charge_policy'
    END AS landlord_charge_recommendation,
    CASE
      WHEN rs.repeat_count >= 4 THEN 'higher_than_average_requests_review_property_condition_and_usage_neutrally'
      WHEN rs.repeat_count >= 2 THEN 'repeat_issue_monitoring_recommended'
      ELSE 'no_unusual_pattern_detected'
    END AS tenant_responsibility_signal,
    CASE
      WHEN rs.matched_warranty_key IS NOT NULL OR rs.repeat_count_30d > 0 THEN 'route_to_previous_tradie_for_warranty_or_repeat_issue_review'
      WHEN rs.repeat_count >= 4 THEN 'property_manager_review_before_charge_or_scope_expansion'
      ELSE 'continue_standard_quote_and_schedule_flow'
    END AS recommended_action
  FROM target t
  CROSS JOIN repeat_stats rs
),
insert_review AS (
  INSERT INTO repeat_issue_reviews (
    review_key, work_order_id, property_id, tenant_id, trade_type, job_type,
    issue_signature, repeat_count, warranty_candidate, matched_warranty_key,
    previous_tradie_id, landlord_charge_recommendation, tenant_responsibility_signal,
    recommended_action, status, payload
  )
  SELECT
    ${sql(reviewKey)},
    work_order_id,
    property_id,
    tenant_id,
    trade_type,
    job_type,
    issue_signature,
    repeat_count,
    warranty_candidate,
    matched_warranty_key,
    previous_tradie_id,
    landlord_charge_recommendation,
    tenant_responsibility_signal,
    recommended_action,
    'reviewed',
    jsonb_build_object(
      'request', ${jsonSql(body)},
      'last_completed_at', last_completed_at,
      'repeat_count_30d', repeat_count_30d,
      'lookback_days', ${lookbackDays},
      'default_warranty_days', ${warrantyDays}
    )
  FROM decision
  ON CONFLICT (review_key) DO UPDATE SET
    repeat_count = EXCLUDED.repeat_count,
    warranty_candidate = EXCLUDED.warranty_candidate,
    matched_warranty_key = EXCLUDED.matched_warranty_key,
    previous_tradie_id = EXCLUDED.previous_tradie_id,
    landlord_charge_recommendation = EXCLUDED.landlord_charge_recommendation,
    tenant_responsibility_signal = EXCLUDED.tenant_responsibility_signal,
    recommended_action = EXCLUDED.recommended_action,
    payload = EXCLUDED.payload
  RETURNING *
),
update_work_order AS (
  UPDATE work_orders wo
  SET status = CASE
      WHEN (SELECT warranty_candidate FROM insert_review) THEN 'warranty_review_required'
      WHEN (SELECT repeat_count FROM insert_review) >= 4 THEN 'repeat_issue_property_manager_review'
      ELSE wo.status
    END,
    approval_status = CASE
      WHEN (SELECT warranty_candidate FROM insert_review) THEN 'warranty_or_repeat_issue_hold'
      ELSE wo.approval_status
    END,
    approval_required = CASE
      WHEN (SELECT warranty_candidate FROM insert_review) THEN false
      ELSE wo.approval_required
    END,
    payload = wo.payload || jsonb_build_object(
      'latest_warranty_review_key', ${sql(reviewKey)},
      'warranty_candidate', (SELECT warranty_candidate FROM insert_review),
      'matched_warranty_key', (SELECT matched_warranty_key FROM insert_review),
      'previous_tradie_id', (SELECT previous_tradie_id FROM insert_review),
      'landlord_charge_recommendation', (SELECT landlord_charge_recommendation FROM insert_review),
      'tenant_responsibility_signal', (SELECT tenant_responsibility_signal FROM insert_review)
    ),
    updated_at = now()
  WHERE wo.id = (SELECT work_order_id FROM insert_review)
  RETURNING *
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  SELECT 'work_order', work_order_id, 'warranty_repeat_issue_reviewed', to_jsonb(insert_review)
  FROM insert_review
)
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'success', true,
      'review_key', review_key,
      'work_order_id', work_order_id,
      'property_id', property_id,
      'repeat_count', repeat_count,
      'warranty_candidate', warranty_candidate,
      'matched_warranty_key', matched_warranty_key,
      'previous_tradie_id', previous_tradie_id,
      'scheduling_constraint', CASE
        WHEN warranty_candidate AND previous_tradie_id IS NOT NULL THEN 'previous_tradie_only'
        WHEN warranty_candidate THEN 'warranty_review_before_new_tradie_assignment'
        ELSE 'standard_scheduling'
      END,
      'landlord_charge_recommendation', landlord_charge_recommendation,
      'tenant_responsibility_signal', tenant_responsibility_signal,
      'recommended_action', recommended_action,
      'next_action', CASE
        WHEN warranty_candidate AND previous_tradie_id IS NOT NULL THEN 'route_to_previous_tradie_before_new_quote'
        WHEN warranty_candidate THEN 'property_manager_review_warranty_before_charge'
        WHEN repeat_count >= 4 THEN 'property_manager_review_repeat_pattern_neutrally'
        ELSE 'continue_standard_flow'
      END,
      'customer_safe_language', CASE
        WHEN repeat_count >= 4 THEN 'There have been several similar requests at this property, so the team should review the history and property condition before deciding responsibility.'
        WHEN warranty_candidate THEN 'This may relate to recent work, so the team should check warranty coverage before any new landlord charge is approved.'
        ELSE 'No warranty or unusual repeat pattern was detected.'
      END
    )
    FROM insert_review
    LIMIT 1
  ),
  jsonb_build_object('success', false, 'message', 'No work order matched warranty review input.')
) AS warranty_review_result;
`;

return [{ json: { sql: query } }];
'@

$setupNodes = @(
    (New-WebhookNode "Rental Foundation Setup Webhook" "rental/setup" "POST" 0 0),
    (New-CodeNode "Build Rental Foundation SQL" $setupCode 260 0),
    (New-PostgresNode "Setup Rental Foundation" 520 0),
    (New-RespondNode "Respond Rental Setup" '={{$json.setup_result || $json}}' 780 0)
)
$setupConnections = @{
    "Rental Foundation Setup Webhook" = @{ main = @(, @(@{ node = "Build Rental Foundation SQL"; type = "main"; index = 0 })) }
    "Build Rental Foundation SQL" = @{ main = @(, @(@{ node = "Setup Rental Foundation"; type = "main"; index = 0 })) }
    "Setup Rental Foundation" = @{ main = @(, @(@{ node = "Respond Rental Setup"; type = "main"; index = 0 })) }
}
$setup = Upsert-WorkflowByName "TRADIE-RENTAL-100-Property-Management-Setup" $setupNodes $setupConnections

$workOrderNodes = @(
    (New-WebhookNode "Rental Work Order Intake Webhook" "rental/work-orders/intake" "POST" 0 0),
    (New-CodeNode "Build Work Order Intake SQL" $workOrderCode 260 0),
    (New-PostgresNode "Save Rental Work Order" 520 0),
    (New-CodeNode "Prepare Wally Intake Review" $workOrderWallyHandoffCode 780 0),
    (New-CodeNode "Build Work Order Intake Response" $workOrderIntakeResponseCode 1040 0),
    (New-RespondNode "Respond Work Order Intake" '={{JSON.stringify($json)}}' 1300 0)
)
$workOrderConnections = @{
    "Rental Work Order Intake Webhook" = @{ main = @(, @(@{ node = "Build Work Order Intake SQL"; type = "main"; index = 0 })) }
    "Build Work Order Intake SQL" = @{ main = @(, @(@{ node = "Save Rental Work Order"; type = "main"; index = 0 })) }
    "Save Rental Work Order" = @{ main = @(, @(@{ node = "Prepare Wally Intake Review"; type = "main"; index = 0 })) }
    "Prepare Wally Intake Review" = @{ main = @(, @(@{ node = "Build Work Order Intake Response"; type = "main"; index = 0 })) }
    "Build Work Order Intake Response" = @{ main = @(, @(@{ node = "Respond Work Order Intake"; type = "main"; index = 0 })) }
}
$workOrder = Upsert-WorkflowByName "TRADIE-RENTAL-101-Work-Order-Intake-Approval-Rules" $workOrderNodes $workOrderConnections

$feedbackNodes = @(
    (New-WebhookNode "Tenant Feedback Webhook" "rental/tenant-feedback/capture" "POST" 0 0),
    (New-CodeNode "Build Tenant Feedback SQL" $feedbackCode 260 0),
    (New-PostgresNode "Save Tenant Feedback" 520 0),
    (New-RespondNode "Respond Tenant Feedback" '={{$json.feedback_result || $json}}' 780 0)
)
$feedbackConnections = @{
    "Tenant Feedback Webhook" = @{ main = @(, @(@{ node = "Build Tenant Feedback SQL"; type = "main"; index = 0 })) }
    "Build Tenant Feedback SQL" = @{ main = @(, @(@{ node = "Save Tenant Feedback"; type = "main"; index = 0 })) }
    "Save Tenant Feedback" = @{ main = @(, @(@{ node = "Respond Tenant Feedback"; type = "main"; index = 0 })) }
}
$feedback = Upsert-WorkflowByName "TRADIE-RENTAL-102-Tenant-Feedback-Trust-Score" $feedbackNodes $feedbackConnections

$complianceNodes = @(
    (New-WebhookNode "Compliance Offer Webhook" "rental/compliance/offer" "POST" 0 0),
    (New-CodeNode "Build Compliance Offer SQL" $complianceOfferCode 260 0),
    (New-PostgresNode "Save Compliance Offer" 520 0),
    (New-RespondNode "Respond Compliance Offer" '={{$json.compliance_offer_result || $json}}' 780 0)
)
$complianceConnections = @{
    "Compliance Offer Webhook" = @{ main = @(, @(@{ node = "Build Compliance Offer SQL"; type = "main"; index = 0 })) }
    "Build Compliance Offer SQL" = @{ main = @(, @(@{ node = "Save Compliance Offer"; type = "main"; index = 0 })) }
    "Save Compliance Offer" = @{ main = @(, @(@{ node = "Respond Compliance Offer"; type = "main"; index = 0 })) }
}
$compliance = Upsert-WorkflowByName "TRADIE-RENTAL-103-Compliance-Service-Offer" $complianceNodes $complianceConnections

$inspectionNodes = @(
    (New-WebhookNode "Inspection Report Ingest Webhook" "rental/inspection-reports/ingest" "POST" 0 0),
    (New-CodeNode "Build Inspection Report SQL" $inspectionReportCode 260 0),
    (New-PostgresNode "Save Inspection Report And Work Orders" 520 0),
    (New-RespondNode "Respond Inspection Report" '={{$json.inspection_report_result || $json}}' 780 0)
)
$inspectionConnections = @{
    "Inspection Report Ingest Webhook" = @{ main = @(, @(@{ node = "Build Inspection Report SQL"; type = "main"; index = 0 })) }
    "Build Inspection Report SQL" = @{ main = @(, @(@{ node = "Save Inspection Report And Work Orders"; type = "main"; index = 0 })) }
    "Save Inspection Report And Work Orders" = @{ main = @(, @(@{ node = "Respond Inspection Report"; type = "main"; index = 0 })) }
}
$inspection = Upsert-WorkflowByName "TRADIE-RENTAL-104-Inspection-Report-To-Work-Orders" $inspectionNodes $inspectionConnections

$quoteOptionNodes = @(
    (New-WebhookNode "Rental Quote Options Webhook" "rental/quote-options/generate" "POST" 0 0),
    (New-CodeNode "Build Rental Quote Options SQL" $quoteOptionsCode 260 0),
    (New-PostgresNode "Save Rental Quote Options" 520 0),
    (New-RespondNode "Respond Rental Quote Options" '={{$json.quote_options_result || $json}}' 780 0)
)
$quoteOptionConnections = @{
    "Rental Quote Options Webhook" = @{ main = @(, @(@{ node = "Build Rental Quote Options SQL"; type = "main"; index = 0 })) }
    "Build Rental Quote Options SQL" = @{ main = @(, @(@{ node = "Save Rental Quote Options"; type = "main"; index = 0 })) }
    "Save Rental Quote Options" = @{ main = @(, @(@{ node = "Respond Rental Quote Options"; type = "main"; index = 0 })) }
}
$quoteOptions = Upsert-WorkflowByName "TRADIE-RENTAL-105-Quote-Options-Landlord-Approval" $quoteOptionNodes $quoteOptionConnections

$quoteOptionApprovalNodes = @(
    (New-WebhookNode "Approve Rental Quote Option Webhook" "rental/quote-options/approve" "POST" 0 0),
    (New-CodeNode "Build Rental Quote Option Approval SQL" $quoteOptionApprovalCode 260 0),
    (New-PostgresNode "Approve Rental Quote Option" 520 0),
    (New-CodeNode "Prepare George Calendar Booking Handoff" $quoteOptionCalendarHandoffCode 780 0),
    (New-HttpRequestNode "Call George Calendar Booking" "http://localhost:5678/webhook/agents/george/calendar-book-job" 1040 0),
    (New-CodeNode "Build Rental Notification Context SQL" $notificationContextSqlCode 1300 0),
    (New-PostgresNode "Load Rental Notification Context" 1560 0),
    (New-CodeNode "Build Rental Notification Emails" $buildNotificationEmailsCode 1820 0),
    (New-GmailNode "Send Rental Approval Notifications" 2080 0),
    (New-CodeNode "Build Rental Notification Log SQL" $notificationLogSqlCode 2340 0),
    (New-PostgresNode "Log Rental Notifications" 2600 0),
    (New-CodeNode "Build Quote Option Approval Response" $quoteOptionApprovalResponseCode 2860 0),
    (New-RespondNode "Respond Rental Quote Option Approval" '={{$json}}' 3120 0)
)
$quoteOptionApprovalConnections = @{
    "Approve Rental Quote Option Webhook" = @{ main = @(, @(@{ node = "Build Rental Quote Option Approval SQL"; type = "main"; index = 0 })) }
    "Build Rental Quote Option Approval SQL" = @{ main = @(, @(@{ node = "Approve Rental Quote Option"; type = "main"; index = 0 })) }
    "Approve Rental Quote Option" = @{ main = @(, @(@{ node = "Prepare George Calendar Booking Handoff"; type = "main"; index = 0 })) }
    "Prepare George Calendar Booking Handoff" = @{ main = @(, @(@{ node = "Call George Calendar Booking"; type = "main"; index = 0 })) }
    "Call George Calendar Booking" = @{ main = @(, @(@{ node = "Build Rental Notification Context SQL"; type = "main"; index = 0 })) }
    "Build Rental Notification Context SQL" = @{ main = @(, @(@{ node = "Load Rental Notification Context"; type = "main"; index = 0 })) }
    "Load Rental Notification Context" = @{ main = @(, @(@{ node = "Build Rental Notification Emails"; type = "main"; index = 0 })) }
    "Build Rental Notification Emails" = @{ main = @(, @(@{ node = "Send Rental Approval Notifications"; type = "main"; index = 0 })) }
    "Send Rental Approval Notifications" = @{ main = @(, @(@{ node = "Build Rental Notification Log SQL"; type = "main"; index = 0 })) }
    "Build Rental Notification Log SQL" = @{ main = @(, @(@{ node = "Log Rental Notifications"; type = "main"; index = 0 })) }
    "Log Rental Notifications" = @{ main = @(, @(@{ node = "Build Quote Option Approval Response"; type = "main"; index = 0 })) }
    "Build Quote Option Approval Response" = @{ main = @(, @(@{ node = "Respond Rental Quote Option Approval"; type = "main"; index = 0 })) }
}
$quoteOptionApproval = Upsert-WorkflowByName "TRADIE-RENTAL-106-Approve-Quote-Option-Lock-Slot" $quoteOptionApprovalNodes $quoteOptionApprovalConnections

$confirmationNodes = @(
    (New-WebhookNode "Rental Confirmation Response Webhook" "rental/confirmations/respond" "POST" 0 0),
    (New-CodeNode "Build Rental Confirmation Response SQL" $confirmationResponseCode 260 0),
    (New-PostgresNode "Save Rental Confirmation Response" 520 0),
    (New-RespondNode "Respond Rental Confirmation" '={{$json.confirmation_result || $json}}' 780 0)
)
$confirmationConnections = @{
    "Rental Confirmation Response Webhook" = @{ main = @(, @(@{ node = "Build Rental Confirmation Response SQL"; type = "main"; index = 0 })) }
    "Build Rental Confirmation Response SQL" = @{ main = @(, @(@{ node = "Save Rental Confirmation Response"; type = "main"; index = 0 })) }
    "Save Rental Confirmation Response" = @{ main = @(, @(@{ node = "Respond Rental Confirmation"; type = "main"; index = 0 })) }
}
$confirmation = Upsert-WorkflowByName "TRADIE-RENTAL-107-Tenant-Tradie-Confirmation-Monitor" $confirmationNodes $confirmationConnections

$completionNodes = @(
    (New-WebhookNode "Rental Job Completion Webhook" "rental/jobs/complete" "POST" 0 0),
    (New-CodeNode "Build Rental Completion SQL" $rentalJobCompletionCode 260 0),
    (New-PostgresNode "Save Rental Completion Evidence" 520 0),
    (New-RespondNode "Respond Rental Completion" '={{$json.rental_completion_result || $json}}' 780 0)
)
$completionConnections = @{
    "Rental Job Completion Webhook" = @{ main = @(, @(@{ node = "Build Rental Completion SQL"; type = "main"; index = 0 })) }
    "Build Rental Completion SQL" = @{ main = @(, @(@{ node = "Save Rental Completion Evidence"; type = "main"; index = 0 })) }
    "Save Rental Completion Evidence" = @{ main = @(, @(@{ node = "Respond Rental Completion"; type = "main"; index = 0 })) }
}
$completion = Upsert-WorkflowByName "TRADIE-RENTAL-108-Job-Completion-Evidence-Invoice-Trigger" $completionNodes $completionConnections

$scheduleForecastNodes = @(
    (New-WebhookNode "Rental Schedule Forecast Webhook" "rental/schedule/forecast" "POST" 0 0),
    (New-CodeNode "Build Rental Schedule Forecast SQL" $scheduleForecastCode 260 0),
    (New-PostgresNode "Save Rental Schedule Forecast" 520 0),
    (New-RespondNode "Respond Rental Schedule Forecast" '={{$json.schedule_forecast_result || $json}}' 780 0)
)
$scheduleForecastConnections = @{
    "Rental Schedule Forecast Webhook" = @{ main = @(, @(@{ node = "Build Rental Schedule Forecast SQL"; type = "main"; index = 0 })) }
    "Build Rental Schedule Forecast SQL" = @{ main = @(, @(@{ node = "Save Rental Schedule Forecast"; type = "main"; index = 0 })) }
    "Save Rental Schedule Forecast" = @{ main = @(, @(@{ node = "Respond Rental Schedule Forecast"; type = "main"; index = 0 })) }
}
$scheduleForecast = Upsert-WorkflowByName "TRADIE-RENTAL-109-Two-Week-Schedule-Optimiser" $scheduleForecastNodes $scheduleForecastConnections

$warrantyReviewNodes = @(
    (New-WebhookNode "Rental Warranty Review Webhook" "rental/warranty/review" "POST" 0 0),
    (New-CodeNode "Build Rental Warranty Review SQL" $warrantyReviewCode 260 0),
    (New-PostgresNode "Save Rental Warranty Review" 520 0),
    (New-RespondNode "Respond Rental Warranty Review" '={{$json.warranty_review_result || $json}}' 780 0)
)
$warrantyReviewConnections = @{
    "Rental Warranty Review Webhook" = @{ main = @(, @(@{ node = "Build Rental Warranty Review SQL"; type = "main"; index = 0 })) }
    "Build Rental Warranty Review SQL" = @{ main = @(, @(@{ node = "Save Rental Warranty Review"; type = "main"; index = 0 })) }
    "Save Rental Warranty Review" = @{ main = @(, @(@{ node = "Respond Rental Warranty Review"; type = "main"; index = 0 })) }
}
$warrantyReview = Upsert-WorkflowByName "TRADIE-RENTAL-110-Warranty-Repeat-Issue-Guard" $warrantyReviewNodes $warrantyReviewConnections

@{
    workflows = @(
        ($setup | Select-Object name,id,active),
        ($workOrder | Select-Object name,id,active),
        ($feedback | Select-Object name,id,active),
        ($compliance | Select-Object name,id,active),
        ($inspection | Select-Object name,id,active),
        ($quoteOptions | Select-Object name,id,active),
        ($quoteOptionApproval | Select-Object name,id,active),
        ($confirmation | Select-Object name,id,active),
        ($completion | Select-Object name,id,active),
        ($scheduleForecast | Select-Object name,id,active),
        ($warrantyReview | Select-Object name,id,active)
    )
    endpoints = @{
        setup = "$BaseUrl/webhook/rental/setup"
        work_order_intake = "$BaseUrl/webhook/rental/work-orders/intake"
        tenant_feedback = "$BaseUrl/webhook/rental/tenant-feedback/capture"
        compliance_offer = "$BaseUrl/webhook/rental/compliance/offer"
        inspection_report_ingest = "$BaseUrl/webhook/rental/inspection-reports/ingest"
        quote_options = "$BaseUrl/webhook/rental/quote-options/generate"
        quote_option_approve = "$BaseUrl/webhook/rental/quote-options/approve"
        confirmation_response = "$BaseUrl/webhook/rental/confirmations/respond"
        job_completion = "$BaseUrl/webhook/rental/jobs/complete"
        schedule_forecast = "$BaseUrl/webhook/rental/schedule/forecast"
        warranty_review = "$BaseUrl/webhook/rental/warranty/review"
    }
} | ConvertTo-Json -Depth 10
