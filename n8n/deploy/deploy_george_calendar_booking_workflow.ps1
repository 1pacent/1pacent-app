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

$googleCalendarCredential = @{
    id = "Qy3Z3GZ8CX5ruMLE"
    name = "Google Calendar account"
}

function New-NodeId { return [guid]::NewGuid().ToString() }

function New-WebhookNode($X, $Y) {
    return @{
        parameters = @{
            httpMethod = "POST"
            path = "agents/george/calendar-book-job"
            responseMode = "responseNode"
            options = @{}
        }
        type = "n8n-nodes-base.webhook"
        typeVersion = 2.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Book Job In Company Calendar"
        webhookId = New-NodeId
    }
}

function New-ExecuteWorkflowTriggerNode($X, $Y) {
    return @{
        parameters = @{ inputSource = "passthrough" }
        type = "n8n-nodes-base.executeWorkflowTrigger"
        typeVersion = 1.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "When George Calendar Booking Tool Is Called"
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

function New-GoogleCalendarCreateNode($X, $Y) {
    return @{
        parameters = @{
            operation = "create"
            calendar = "={{`$json.calendar_id}}"
            start = "={{`$json.event_start}}"
            end = "={{`$json.event_end}}"
            useDefaultReminders = $true
            additionalFields = @{
                summary = "={{`$json.event_summary}}"
                description = "={{`$json.event_description}}"
                location = "={{`$json.location}}"
            }
        }
        type = "n8n-nodes-base.googleCalendar"
        typeVersion = 1.3
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Create Labelled Calendar Event"
        continueOnFail = $true
        credentials = @{ googleCalendarOAuth2Api = $googleCalendarCredential }
    }
}

function New-RespondNode($Body, $X, $Y) {
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
        name = "Return Calendar Booking Result"
    }
}

function New-HttpRequestNode($X, $Y) {
    return @{
        parameters = @{
            method = "POST"
            url = "http://localhost:5678/webhook/agents/george/calendar-book-job"
            sendBody = $true
            contentType = "json"
            specifyBody = "json"
            jsonBody = "={{ JSON.stringify(`$json) }}"
            options = @{ timeout = 20000 }
        }
        type = "n8n-nodes-base.httpRequest"
        typeVersion = 4.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Call Calendar Booking Endpoint"
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

    $webhookPaths = @()
    foreach ($node in $Nodes) {
        if ($node.type -eq "n8n-nodes-base.webhook" -and $node.parameters.path) {
            $webhookPaths += $node.parameters.path
        }
    }

    $pathConflicts = $all.data | Where-Object {
        $_.active -and (!$existing -or $_.id -ne $existing.id) -and (
            @($_.nodes | Where-Object {
                $_.type -eq "n8n-nodes-base.webhook" -and
                $webhookPaths -contains $_.parameters.path
            }).Count -gt 0
        )
    }

    foreach ($conflict in $pathConflicts) {
        Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($conflict.id)/deactivate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
    }

    if ($existing) {
        $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($existing.id)" -Headers $Headers -Method Put -Body $body -ContentType "application/json"
    } else {
        $updated = Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows" -Headers $Headers -Method Post -Body $body -ContentType "application/json"
    }
    Invoke-RestMethod -Uri "$BaseUrl/api/v1/workflows/$($updated.id)/activate" -Headers $Headers -Method Post -Body "{}" -ContentType "application/json" | Out-Null
    return $updated
}

$bootstrapSqlCode = @'
const raw = $('Book Job In Company Calendar').first().json ?? items[0]?.json ?? {};
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

const companyId = first(body.company_id, 'COMP-1PACENT-DEFAULT');
const calendarId = first(body.calendar_id, 'primary');

const query = `
ALTER TABLE IF EXISTS tradies ADD COLUMN IF NOT EXISTS company_id text;

CREATE TABLE IF NOT EXISTS tradie_companies (
  id text primary key,
  name text not null,
  calendar_id text,
  max_tradies_per_job integer not null default 5,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS job_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id text,
  lead_id text references leads(id),
  quote_id text references quotes(id),
  schedule_slot_id text references job_schedule_slots(id),
  company_id text references tradie_companies(id),
  tradie_id text references tradies(id),
  role text not null default 'assigned_tradie',
  status text not null default 'assigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_slot_id, tradie_id)
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid primary key default gen_random_uuid(),
  schedule_slot_id text references job_schedule_slots(id),
  job_id text,
  lead_id text references leads(id),
  quote_id text references quotes(id),
  company_id text references tradie_companies(id),
  calendar_id text not null,
  google_event_id text,
  event_summary text not null,
  event_start timestamptz,
  event_end timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_job_assignments_schedule_slot ON job_assignments(schedule_slot_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_tradie ON job_assignments(tradie_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_schedule_slot ON calendar_events(schedule_slot_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_google_event ON calendar_events(google_event_id);

INSERT INTO tradie_companies (id, name, calendar_id, max_tradies_per_job, active)
VALUES (${sql(companyId)}, '1pacent Tradies', ${sql(calendarId)}, 5, true)
ON CONFLICT (id) DO UPDATE SET
  calendar_id = EXCLUDED.calendar_id,
  max_tradies_per_job = 5,
  updated_at = now();

INSERT INTO tradies (id, company_id, name, home_suburb, active)
VALUES
  ('TRD-ELECTRICAL-001', ${sql(companyId)}, 'Electrical Tradie 1', 'Melbourne', true),
  ('TRD-ELECTRICAL-002', ${sql(companyId)}, 'Electrical Tradie 2', 'Melbourne', true),
  ('TRD-ELECTRICAL-003', ${sql(companyId)}, 'Electrical Tradie 3', 'Melbourne', true),
  ('TRD-ELECTRICAL-004', ${sql(companyId)}, 'Electrical Tradie 4', 'Melbourne', true),
  ('TRD-ELECTRICAL-005', ${sql(companyId)}, 'Electrical Tradie 5', 'Melbourne', true)
ON CONFLICT (id) DO UPDATE SET
  company_id = EXCLUDED.company_id,
  active = true,
  updated_at = now();

INSERT INTO tradie_skills (tradie_id, trade_type, skill_name, verified)
SELECT t.id, 'electrical', 'General electrical jobs', false
FROM tradies t
WHERE t.id like 'TRD-ELECTRICAL-%'
  AND NOT EXISTS (
    SELECT 1 FROM tradie_skills s
    WHERE s.tradie_id = t.id AND lower(s.trade_type) = 'electrical'
  );

INSERT INTO tradie_availability (tradie_id, day_of_week, start_time, end_time, active)
SELECT t.id, d.day_of_week, time '08:00', time '16:30', true
FROM tradies t
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(day_of_week)
WHERE t.id like 'TRD-ELECTRICAL-%'
  AND NOT EXISTS (
    SELECT 1 FROM tradie_availability a
    WHERE a.tradie_id = t.id
      AND a.day_of_week = d.day_of_week
      AND a.start_time = time '08:00'
      AND a.end_time = time '16:30'
  );

SELECT true AS bootstrap_complete;
`;

return [{ json: { sql: query } }];
'@

$prepareSqlCode = @'
const raw = $('Book Job In Company Calendar').first().json ?? items[0]?.json ?? {};
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

const scheduleSlotId = first(body.schedule_slot_id, body.slot_id);
const leadId = first(body.lead_id);
const jobId = first(body.job_id);
const quoteId = first(body.quote_id);
const companyId = first(body.company_id, 'COMP-1PACENT-DEFAULT');
const preferredTradieId = first(body.preferred_tradie_id, body.tradie_id, body.selected_tradie_id);
const requestedTradieCount = Math.min(Math.max(Number(first(body.tradie_count, 1)), 1), 5);
const tradeType = String(first(body.trade_type, 'electrical')).toLowerCase();
const calendarId = first(body.calendar_id, 'primary');
const dryRun = ['true', 'yes', '1'].includes(String(first(body.dry_run, false)).toLowerCase());

if (!scheduleSlotId && !leadId && !jobId) {
  return [{
    json: {
      success: false,
      status: 'needs_input',
      missing_information: ['schedule_slot_id or lead_id or job_id'],
      sql: 'select 1 as noop;',
    },
  }];
}

const query = `
WITH target_slot AS (
  SELECT s.*
  FROM job_schedule_slots s
  WHERE
    (${sql(scheduleSlotId)} IS NOT NULL AND s.id = ${sql(scheduleSlotId)})
    OR (${sql(scheduleSlotId)} IS NULL AND ${sql(leadId)} IS NOT NULL AND s.lead_id = ${sql(leadId)})
    OR (${sql(scheduleSlotId)} IS NULL AND ${sql(jobId)} IS NOT NULL AND s.job_id = ${sql(jobId)})
  ORDER BY s.created_at DESC
  LIMIT 1
),
lead_context AS (
  SELECT
    l.id AS lead_id,
    l.trade_type,
    l.job_description,
    l.urgency,
    l.address AS lead_address,
    c.name AS customer_name,
    c.email AS customer_email,
    c.phone AS customer_phone
  FROM target_slot s
  LEFT JOIN leads l ON l.id = COALESCE(s.lead_id, ${sql(leadId)})
  LEFT JOIN customers c ON c.id = l.customer_id
),
company AS (
  SELECT * FROM tradie_companies WHERE id = ${sql(companyId)} AND active = true LIMIT 1
),
available_tradies AS (
  SELECT DISTINCT t.id, t.name, t.email, t.phone
  FROM tradies t
  JOIN company co ON co.id = t.company_id
  LEFT JOIN tradie_skills sk ON sk.tradie_id = t.id
  CROSS JOIN target_slot s
  WHERE t.active = true
    AND (lower(coalesce(sk.trade_type, ${sql(tradeType)})) = ${sql(tradeType)} OR sk.trade_type IS NULL)
    AND (${sql(preferredTradieId)} IS NULL OR t.id = ${sql(preferredTradieId)})
    AND NOT EXISTS (
      SELECT 1
      FROM job_assignments ja
      JOIN job_schedule_slots js ON js.id = ja.schedule_slot_id
      WHERE ja.tradie_id = t.id
        AND ja.status NOT IN ('cancelled', 'declined')
        AND tstzrange(js.scheduled_start, js.scheduled_end, '[)') && tstzrange(s.scheduled_start, s.scheduled_end, '[)')
    )
  ORDER BY t.id
  LIMIT ${requestedTradieCount}
),
payload AS (
  SELECT
    true AS success,
    ${dryRun ? 'true' : 'false'}::boolean AS dry_run,
    s.id AS schedule_slot_id,
    COALESCE(s.job_id, ${sql(jobId)}, 'JOB-' || s.id) AS job_id,
    COALESCE(s.lead_id, lc.lead_id, ${sql(leadId)}) AS lead_id,
    COALESCE(s.quote_id, ${sql(quoteId)}) AS quote_id,
    co.id AS company_id,
    co.name AS company_name,
    COALESCE(co.calendar_id, ${sql(calendarId)}) AS calendar_id,
    s.scheduled_start AS event_start,
    s.scheduled_end AS event_end,
    COALESCE(lc.customer_name, 'Customer') AS customer_name,
    COALESCE(lc.customer_email, '') AS customer_email,
    COALESCE(lc.customer_phone, '') AS customer_phone,
    COALESCE(s.customer_suburb, s.customer_address, lc.lead_address, '') AS location,
    COALESCE(lc.trade_type, ${sql(tradeType)}) AS trade_type,
    COALESCE(lc.job_description, 'Trade service job') AS job_description,
    COALESCE(lc.urgency, 'normal') AS urgency,
    (
      SELECT jsonb_agg(jsonb_build_object('tradie_id', id, 'tradie_name', name, 'email', email, 'phone', phone))
      FROM available_tradies
    ) AS assigned_tradies,
    (SELECT count(*) FROM available_tradies) AS assigned_tradie_count,
    LEAST(${requestedTradieCount}, co.max_tradies_per_job, 5) AS requested_tradie_count
  FROM target_slot s
  CROSS JOIN company co
  LEFT JOIN lead_context lc ON true
)
SELECT * FROM payload;
`;

return [{ json: { sql: query, requested_tradie_count: requestedTradieCount, dry_run: dryRun } }];
'@

$buildEventPayloadCode = @'
const row = items[0]?.json ?? {};

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}

if (!row.success || !row.schedule_slot_id) {
  return [{
    json: {
      success: false,
      status: 'needs_schedule_slot',
      customer_message: 'I could not find a scheduled slot to add to the calendar.',
      raw: row,
    },
  }];
}

const assignedTradies = asArray(row.assigned_tradies);
if (!assignedTradies.length || Number(row.assigned_tradie_count || 0) < Number(row.requested_tradie_count || 1)) {
  return [{
    json: {
      success: false,
      status: 'not_enough_available_tradies',
      schedule_slot_id: row.schedule_slot_id,
      requested_tradie_count: Number(row.requested_tradie_count || 1),
      assigned_tradie_count: Number(row.assigned_tradie_count || 0),
      customer_message: 'The team needs to manually confirm tradie availability for this booking.',
      raw: row,
    },
  }];
}

const tradieNames = assignedTradies.map((t) => t.tradie_name || t.name || t.tradie_id).join(', ');
const trade = String(row.trade_type || 'trade').toUpperCase();
const summary = `[1pacent] ${trade} | ${row.lead_id || row.job_id || row.schedule_slot_id} | ${row.location || 'Job'} | ${row.customer_name || 'Customer'} | ${tradieNames}`;
const description = [
  `1pacent job booking`,
  `Lead ID: ${row.lead_id || ''}`,
  `Job ID: ${row.job_id || ''}`,
  `Quote ID: ${row.quote_id || ''}`,
  `Company: ${row.company_name || row.company_id || ''}`,
  `Assigned tradies: ${tradieNames}`,
  `Customer: ${row.customer_name || ''}`,
  `Phone: ${row.customer_phone || ''}`,
  `Email: ${row.customer_email || ''}`,
  `Trade: ${row.trade_type || ''}`,
  `Urgency: ${row.urgency || ''}`,
  `Job: ${row.job_description || ''}`,
  `Address/Suburb: ${row.location || ''}`,
  ``,
  `Operational note: tradie must confirm final scope and pricing before work begins. No work proceeds until customer accepts the confirmed quote.`,
].join('\n');

return [{
  json: {
    success: true,
    dry_run: row.dry_run === true || row.dry_run === 'true',
    schedule_slot_id: row.schedule_slot_id,
    job_id: row.job_id,
    lead_id: row.lead_id,
    quote_id: row.quote_id,
    company_id: row.company_id,
    company_name: row.company_name,
    calendar_id: row.calendar_id || 'mac@1pacent.com',
    event_start: row.event_start,
    event_end: row.event_end,
    event_summary: summary,
    event_description: description,
    location: row.location || '',
    assigned_tradies: assignedTradies,
    assigned_tradie_count: assignedTradies.length,
    customer_message: `The booking request is now in the company calendar for ${tradieNames}.`,
  },
}];
'@

$saveCalendarSqlCode = @'
const event = items[0]?.json ?? {};
const input = $('Build Calendar Event Payload').first().json;
input.calendar_id = input.calendar_id || 'mac@1pacent.com';
input.event_summary = input.event_summary || `[1pacent] ${input.schedule_slot_id || input.job_id || 'Calendar booking'}`;
input.event_start = input.event_start || input.scheduled_start || new Date().toISOString();
input.event_end = input.event_end || input.scheduled_end || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const payload = { ...input, google_calendar_response: event };
const googleEventId = event.id || event.htmlLink || '';
const calendarError = event.error?.message || event.message || '';
const calendarCreated = Boolean(googleEventId && !calendarError);
const status = calendarCreated ? 'calendar_booked' : 'calendar_booking_needs_calendar_fix';
const customerMessage = calendarCreated
  ? input.customer_message
  : 'The job has been assigned internally, but the Google Calendar event needs the calendar connection checked.';

function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const assignments = (input.assigned_tradies || []).map((tradie) => `
INSERT INTO job_assignments (job_id, lead_id, quote_id, schedule_slot_id, company_id, tradie_id, role, status)
VALUES (${sql(input.job_id)}, ${sql(input.lead_id)}, ${sql(input.quote_id)}, ${sql(input.schedule_slot_id)}, ${sql(input.company_id)}, ${sql(tradie.tradie_id)}, 'assigned_tradie', 'assigned')
ON CONFLICT (schedule_slot_id, tradie_id) DO UPDATE SET
  status = 'assigned',
  updated_at = now();
`).join('\n');

const query = `
${assignments}

INSERT INTO calendar_events (
  schedule_slot_id, job_id, lead_id, quote_id, company_id, calendar_id, google_event_id,
  event_summary, event_start, event_end, payload
)
VALUES (
  ${sql(input.schedule_slot_id)},
  ${sql(input.job_id)},
  ${sql(input.lead_id)},
  ${sql(input.quote_id)},
  ${sql(input.company_id)},
  ${sql(input.calendar_id)},
  ${sql(googleEventId)},
  ${sql(input.event_summary)},
  ${sql(input.event_start)},
  ${sql(input.event_end)},
  ${jsonSql(payload)}
);

UPDATE job_schedule_slots
SET status = ${sql(status)}, updated_at = now()
WHERE id = ${sql(input.schedule_slot_id)};

UPDATE jobs
SET status = ${sql(calendarCreated ? 'Calendar Booked - Awaiting Tradie Confirmation' : 'Assigned - Calendar Connection Needs Review')},
    scheduled_window = ${sql(`${input.event_start} to ${input.event_end}`)},
    updated_at = now()
WHERE id = ${sql(input.job_id)};

INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
VALUES ('schedule_slot', ${sql(input.schedule_slot_id)}, ${sql(calendarCreated ? 'calendar_job_booked' : 'calendar_booking_failed')}, ${jsonSql(payload)});

SELECT
  ${calendarCreated ? 'true' : 'false'} AS success,
  ${sql(status)} AS status,
  ${sql(input.schedule_slot_id)} AS schedule_slot_id,
  ${sql(input.job_id)} AS job_id,
  ${sql(input.lead_id)} AS lead_id,
  ${sql(input.calendar_id)} AS calendar_id,
  ${sql(googleEventId)} AS google_event_id,
  ${sql(calendarError)} AS calendar_error,
  ${sql(input.event_summary)} AS event_summary,
  ${jsonSql(input.assigned_tradies)} AS assigned_tradies,
  ${sql(customerMessage)} AS customer_message;
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
    schedule_slot_id: first(raw.schedule_slot_id, raw.slot_id, field('schedule_slot_id'), field('slot_id')),
    lead_id: first(raw.lead_id, field('lead_id')),
    job_id: first(raw.job_id, field('job_id')),
    quote_id: first(raw.quote_id, field('quote_id')),
    company_id: first(raw.company_id, field('company_id'), 'COMP-1PACENT-DEFAULT'),
    tradie_id: first(raw.tradie_id, raw.preferred_tradie_id, field('tradie_id'), field('preferred_tradie_id')),
    preferred_tradie_id: first(raw.preferred_tradie_id, raw.tradie_id, field('preferred_tradie_id'), field('tradie_id')),
    tradie_count: first(raw.tradie_count, field('tradie_count'), 1),
    trade_type: first(raw.trade_type, field('trade_type'), 'electrical'),
    calendar_id: first(raw.calendar_id, field('calendar_id'), 'mac@1pacent.com'),
  },
}];
'@

$workflowNodes = @(
    (New-WebhookNode 0 0),
    (New-CodeNode "Prepare Calendar Bootstrap SQL" $bootstrapSqlCode 240 0),
    (New-PostgresNode "Bootstrap Calendar Booking Tables" 480 0),
    (New-CodeNode "Prepare Assignment SQL" $prepareSqlCode 720 0),
    (New-PostgresNode "Load Slot And Assign Tradies" 960 0),
    (New-CodeNode "Build Calendar Event Payload" $buildEventPayloadCode 1200 0),
    (New-GoogleCalendarCreateNode 1440 0),
    (New-CodeNode "Build Save Calendar SQL" $saveCalendarSqlCode 1680 0),
    (New-PostgresNode "Save Calendar Booking" 1920 0),
    (New-RespondNode '={{ JSON.stringify($json) }}' 2160 0)
)

$workflowConnections = @{
    "Book Job In Company Calendar" = @{ main = @(, @(@{ node = "Prepare Calendar Bootstrap SQL"; type = "main"; index = 0 })) }
    "Prepare Calendar Bootstrap SQL" = @{ main = @(, @(@{ node = "Bootstrap Calendar Booking Tables"; type = "main"; index = 0 })) }
    "Bootstrap Calendar Booking Tables" = @{ main = @(, @(@{ node = "Prepare Assignment SQL"; type = "main"; index = 0 })) }
    "Prepare Assignment SQL" = @{ main = @(, @(@{ node = "Load Slot And Assign Tradies"; type = "main"; index = 0 })) }
    "Load Slot And Assign Tradies" = @{ main = @(, @(@{ node = "Build Calendar Event Payload"; type = "main"; index = 0 })) }
    "Build Calendar Event Payload" = @{ main = @(, @(@{ node = "Create Labelled Calendar Event"; type = "main"; index = 0 })) }
    "Create Labelled Calendar Event" = @{ main = @(, @(@{ node = "Build Save Calendar SQL"; type = "main"; index = 0 })) }
    "Build Save Calendar SQL" = @{ main = @(, @(@{ node = "Save Calendar Booking"; type = "main"; index = 0 })) }
    "Save Calendar Booking" = @{ main = @(, @(@{ node = "Return Calendar Booking Result"; type = "main"; index = 0 })) }
}

$workflowResult = Upsert-WorkflowByName "TRADIE-SCHEDULE-034-George-Calendar-Book-Job" $workflowNodes $workflowConnections

$toolNodes = @(
    (New-ExecuteWorkflowTriggerNode 0 0),
    (New-CodeNode "Normalise Calendar Booking Tool Input" $toolNormaliseCode 260 0),
    (New-HttpRequestNode 520 0)
)

$toolConnections = @{
    "When George Calendar Booking Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Calendar Booking Tool Input"; type = "main"; index = 0 })) }
    "Normalise Calendar Booking Tool Input" = @{ main = @(, @(@{ node = "Call Calendar Booking Endpoint"; type = "main"; index = 0 })) }
}

$toolResult = Upsert-WorkflowByName "TRADIE-TOOL-George-Calendar-Book-Job" $toolNodes $toolConnections

@{
    calendar_booking_workflow = @{
        name = $workflowResult.name
        id = $workflowResult.id
        active = $workflowResult.active
        endpoint = "$BaseUrl/webhook/agents/george/calendar-book-job"
    }
    george_tool_workflow = @{
        name = $toolResult.name
        id = $toolResult.id
        active = $toolResult.active
    }
} | ConvertTo-Json -Depth 10
