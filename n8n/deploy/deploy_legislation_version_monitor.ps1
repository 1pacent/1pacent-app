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

function New-ScheduleMonthlyNode($Name, $X, $Y) {
    return @{
        parameters = @{
            rule = @{
                interval = @(
                    @{
                        field = "months"
                        monthsInterval = 1
                        triggerAtDayOfMonth = 1
                        triggerAtHour = 9
                        triggerAtMinute = 0
                    }
                )
            }
        }
        type = "n8n-nodes-base.scheduleTrigger"
        typeVersion = 1.2
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
        credentials = @{ gmailOAuth2 = $gmailCredential }
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
    $url = "$BaseUrl/api/v1/workflows?limit=100"
    $items = @()
    do {
        $page = Invoke-RestMethod -Uri $url -Headers $Headers -Method Get
        $items += $page.data
        if ($page.nextCursor) { $url = "$BaseUrl/api/v1/workflows?limit=100&cursor=$($page.nextCursor)" } else { $url = $null }
    } while ($url)
    $existing = $items | Where-Object { $_.name -eq $WorkflowName } | Select-Object -First 1
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

$buildSqlCode = @'
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
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

const now = new Date();
const runId = first(body.run_id, `LEG-MON-${now.getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const dryRun = bool(first(body.dry_run, false));
const notifyUpcomingDays = Math.max(1, Math.min(180, Number(first(body.notify_upcoming_days, 60)) || 60));
const requestedBy = first(body.requested_by, 'connie_compliance');

const pendingChanges = Array.isArray(body.pending_changes) ? body.pending_changes : [];
const pendingRows = pendingChanges.map((change, index) => `(
  ${sql(first(change.change_key, `LEG-CHANGE-${runId}-${index + 1}`))},
  ${sql(first(change.jurisdiction, 'AU'))},
  ${sql(first(change.source_table, 'compliance_requirement_catalogue'))},
  ${sql(first(change.source_key, change.requirement_key, change.guarantee_key))},
  ${sql(first(change.target_table, change.source_table, 'compliance_requirement_catalogue'))},
  ${sql(first(change.target_key, change.requirement_key, change.guarantee_key, change.source_key))},
  ${sql(first(change.change_type, 'version_update'))},
  ${sql(first(change.current_version))},
  ${sql(first(change.new_version, change.legislation_version))},
  ${sql(first(change.change_title, change.title, 'Legislation version update'))},
  ${sql(first(change.layman_summary, change.summary, 'A configured legislation or compliance reference has changed.'))},
  ${sql(first(change.gov_source_url, change.source_url))},
  ${sql(first(change.effective_from, change.start_date))}::date,
  ${sql(first(change.effective_to, change.end_date))}::date,
  ${jsonSql(change)}
)`).join(',\n');

const noPendingRows = `
  SELECT
    NULL::text AS change_key,
    NULL::text AS jurisdiction,
    NULL::text AS source_table,
    NULL::text AS source_key,
    NULL::text AS target_table,
    NULL::text AS target_key,
    NULL::text AS change_type,
    NULL::text AS current_version,
    NULL::text AS new_version,
    NULL::text AS change_title,
    NULL::text AS layman_summary,
    NULL::text AS gov_source_url,
    NULL::date AS effective_from,
    NULL::date AS effective_to,
    NULL::jsonb AS payload
  WHERE false`;

const query = `
CREATE TABLE IF NOT EXISTS legislation_version_checks (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  source_table text not null,
  source_key text not null,
  jurisdiction text not null default 'AU',
  source_url text,
  observed_version text,
  verified_at timestamptz not null default now(),
  check_status text not null default 'checked_configured_version',
  next_review_due date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS legislation_version_change_schedule (
  id uuid primary key default gen_random_uuid(),
  change_key text not null unique,
  jurisdiction text not null default 'AU',
  source_table text not null,
  source_key text,
  target_table text not null,
  target_key text,
  change_type text not null default 'version_update',
  current_version text,
  new_version text,
  change_title text not null,
  layman_summary text not null,
  gov_source_url text not null,
  effective_from date,
  effective_to date,
  scheduled_apply_at timestamptz,
  applied_at timestamptz,
  status text not null default 'scheduled',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS legislation_change_notifications (
  id uuid primary key default gen_random_uuid(),
  change_id uuid references legislation_version_change_schedule(id),
  notification_stage text not null,
  recipient_role text not null,
  recipient_email text not null,
  recipient_name text,
  property_id text,
  subject text not null,
  message text not null,
  status text not null default 'pending',
  sent_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(change_id, notification_stage, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_legislation_version_checks_run ON legislation_version_checks(run_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_legislation_change_schedule_due ON legislation_version_change_schedule(status, effective_from, jurisdiction);
CREATE INDEX IF NOT EXISTS idx_legislation_change_notifications_pending ON legislation_change_notifications(status, notification_stage, recipient_email);

WITH input_changes AS (
  ${pendingRows ? `SELECT * FROM (VALUES ${pendingRows}) AS v(change_key, jurisdiction, source_table, source_key, target_table, target_key, change_type, current_version, new_version, change_title, layman_summary, gov_source_url, effective_from, effective_to, payload)` : noPendingRows}
),
insert_input_changes AS (
  INSERT INTO legislation_version_change_schedule (
    change_key, jurisdiction, source_table, source_key, target_table, target_key,
    change_type, current_version, new_version, change_title, layman_summary,
    gov_source_url, effective_from, effective_to, scheduled_apply_at, status, payload, updated_at
  )
  SELECT
    change_key,
    jurisdiction,
    source_table,
    source_key,
    target_table,
    target_key,
    change_type,
    current_version,
    new_version,
    change_title,
    layman_summary,
    gov_source_url,
    effective_from,
    effective_to,
    CASE WHEN effective_from IS NULL THEN NULL ELSE effective_from::timestamptz END,
    CASE WHEN effective_from IS NOT NULL AND effective_from <= current_date THEN 'scheduled' ELSE 'scheduled' END,
    payload,
    now()
  FROM input_changes
  WHERE change_key IS NOT NULL AND gov_source_url IS NOT NULL
  ON CONFLICT (change_key) DO UPDATE SET
    jurisdiction = EXCLUDED.jurisdiction,
    source_table = EXCLUDED.source_table,
    source_key = EXCLUDED.source_key,
    target_table = EXCLUDED.target_table,
    target_key = EXCLUDED.target_key,
    current_version = EXCLUDED.current_version,
    new_version = EXCLUDED.new_version,
    change_title = EXCLUDED.change_title,
    layman_summary = EXCLUDED.layman_summary,
    gov_source_url = EXCLUDED.gov_source_url,
    effective_from = EXCLUDED.effective_from,
    effective_to = EXCLUDED.effective_to,
    scheduled_apply_at = EXCLUDED.scheduled_apply_at,
    payload = EXCLUDED.payload,
    updated_at = now()
  RETURNING *
),
configured_sources AS (
  SELECT 'compliance_legislation_sources'::text AS source_table, source_key, jurisdiction, source_url, legislation_version AS observed_version, verified_at
  FROM compliance_legislation_sources
  UNION ALL
  SELECT 'consumer_guarantee_references'::text AS source_table, guarantee_key AS source_key, jurisdiction, source_url, legislation_version AS observed_version, verified_at
  FROM consumer_guarantee_references
),
insert_checks AS (
  INSERT INTO legislation_version_checks (
    run_id, source_table, source_key, jurisdiction, source_url, observed_version,
    check_status, next_review_due, payload
  )
  SELECT
    ${sql(runId)},
    source_table,
    source_key,
    jurisdiction,
    source_url,
    observed_version,
    CASE
      WHEN verified_at < now() - interval '30 days' THEN 'review_due_official_source'
      ELSE 'checked_configured_version'
    END,
    (current_date + interval '30 days')::date,
    jsonb_build_object('official_source_url', source_url, 'dry_run', ${dryRun ? 'true' : 'false'})
  FROM configured_sources
  RETURNING *
),
due_changes AS (
  UPDATE legislation_version_change_schedule
  SET status = CASE WHEN ${dryRun ? 'true' : 'false'} THEN 'scheduled' ELSE 'applied' END,
      applied_at = CASE WHEN ${dryRun ? 'true' : 'false'} THEN applied_at ELSE now() END,
      updated_at = now()
  WHERE status IN ('scheduled','approved')
    AND effective_from IS NOT NULL
    AND effective_from <= current_date
  RETURNING *
),
apply_compliance_requirements AS (
  UPDATE compliance_requirement_catalogue crc
  SET legislation_version = dc.new_version,
      legislation_reference = COALESCE(dc.payload->>'legislation_reference', crc.legislation_reference),
      requirement_summary = COALESCE(dc.payload->>'requirement_summary', crc.requirement_summary),
      effective_from = COALESCE(dc.effective_from, crc.effective_from),
      effective_to = dc.effective_to,
      verified_at = now(),
      payload = crc.payload || jsonb_build_object(
        'last_legislation_change_key', dc.change_key,
        'last_legislation_change_summary', dc.layman_summary,
        'gov_source_url', dc.gov_source_url,
        'updated_by_workflow', 'TRADIE-RENTAL-111-Legislation-Version-Monitor'
      ),
      updated_at = now()
  FROM due_changes dc
  WHERE ${dryRun ? 'false' : 'true'}
    AND dc.target_table = 'compliance_requirement_catalogue'
    AND crc.requirement_key = dc.target_key
  RETURNING crc.*
),
apply_consumer_guarantees AS (
  UPDATE consumer_guarantee_references cgr
  SET legislation_version = dc.new_version,
      summary = COALESCE(dc.payload->>'summary', cgr.summary),
      operational_rule = COALESCE(dc.payload->>'operational_rule', cgr.operational_rule),
      effective_from = COALESCE(dc.effective_from, cgr.effective_from),
      effective_to = dc.effective_to,
      verified_at = now(),
      payload = cgr.payload || jsonb_build_object(
        'last_legislation_change_key', dc.change_key,
        'last_legislation_change_summary', dc.layman_summary,
        'gov_source_url', dc.gov_source_url,
        'updated_by_workflow', 'TRADIE-RENTAL-111-Legislation-Version-Monitor'
      ),
      updated_at = now()
  FROM due_changes dc
  WHERE ${dryRun ? 'false' : 'true'}
    AND dc.target_table = 'consumer_guarantee_references'
    AND cgr.guarantee_key = dc.target_key
  RETURNING cgr.*
),
events_to_notify AS (
  SELECT
    dc.*,
    'effective_now'::text AS notification_stage
  FROM due_changes dc
  UNION ALL
  SELECT
    s.*,
    'upcoming_change'::text AS notification_stage
  FROM legislation_version_change_schedule s
  WHERE s.status IN ('scheduled','approved')
    AND s.effective_from > current_date
    AND s.effective_from <= current_date + (${notifyUpcomingDays} || ' days')::interval
),
impacted_properties AS (
  SELECT DISTINCT rp.id AS property_id, rp.state, rp.property_manager_id, rp.landlord_id
  FROM rental_properties rp
  JOIN events_to_notify e ON e.jurisdiction IN ('AU','NATIONAL') OR upper(e.jurisdiction) = upper(rp.state)
  WHERE rp.active = true
),
audience AS (
  SELECT ip.property_id, 'property_manager'::text AS recipient_role, pm.email AS recipient_email, pm.name AS recipient_name
  FROM impacted_properties ip
  JOIN property_managers pm ON pm.id = ip.property_manager_id
  WHERE pm.email IS NOT NULL
  UNION
  SELECT ip.property_id, 'landlord'::text AS recipient_role, ll.email AS recipient_email, ll.name AS recipient_name
  FROM impacted_properties ip
  JOIN landlords ll ON ll.id = ip.landlord_id
  WHERE ll.email IS NOT NULL
  UNION
  SELECT ip.property_id, 'tenant'::text AS recipient_role, t.email AS recipient_email, t.name AS recipient_name
  FROM impacted_properties ip
  JOIN tenancies tn ON tn.property_id = ip.property_id AND tn.status = 'active'
  JOIN tenants t ON t.id = tn.tenant_id
  WHERE t.email IS NOT NULL
),
insert_notifications AS (
  INSERT INTO legislation_change_notifications (
    change_id, notification_stage, recipient_role, recipient_email, recipient_name,
    property_id, subject, message, status, payload
  )
  SELECT
    e.id,
    e.notification_stage,
    a.recipient_role,
    a.recipient_email,
    a.recipient_name,
    a.property_id,
    CASE
      WHEN e.notification_stage = 'effective_now' THEN '1pacent update: rental compliance rule now in effect'
      ELSE '1pacent heads-up: rental compliance rule changing soon'
    END,
    concat(
      'Hi ', COALESCE(a.recipient_name, 'there'), E',\n\n',
      CASE
        WHEN e.notification_stage = 'effective_now' THEN 'A rental compliance or consumer-rights reference used by 1pacent has now changed.'
        ELSE 'A rental compliance or consumer-rights reference used by 1pacent is scheduled to change soon.'
      END,
      E'\n\nWhat changed: ', e.change_title,
      E'\n\nPlain-English summary: ', e.layman_summary,
      E'\n\nEffective date: ', COALESCE(e.effective_from::text, 'To be confirmed'),
      E'\nOfficial source: ', e.gov_source_url,
      E'\n\nWhat this means: 1pacent will use the updated version for future compliance checks, reminders, work orders, approval rules and customer/tradie guidance from the effective date.',
      E'\n\nThis is an operational update, not legal advice. For legal advice, please speak to a qualified professional.',
      E'\n\n- 1pacent'
    ),
    CASE WHEN ${dryRun ? 'true' : 'false'} THEN 'dry_run' ELSE 'pending' END,
    jsonb_build_object(
      'run_id', ${sql(runId)},
      'requested_by', ${sql(requestedBy)},
      'source_table', e.source_table,
      'source_key', e.source_key,
      'target_table', e.target_table,
      'target_key', e.target_key,
      'new_version', e.new_version,
      'dry_run', ${dryRun ? 'true' : 'false'}
    )
  FROM events_to_notify e
  JOIN audience a ON true
  ON CONFLICT (change_id, notification_stage, recipient_email) DO UPDATE SET
    subject = EXCLUDED.subject,
    message = EXCLUDED.message,
    payload = EXCLUDED.payload
  RETURNING *
),
insert_internal_summary AS (
  INSERT INTO legislation_change_notifications (
    change_id, notification_stage, recipient_role, recipient_email, recipient_name,
    property_id, subject, message, status, payload
  )
  SELECT
    e.id,
    e.notification_stage || '_internal',
    'internal',
    'mac@1pacent.com',
    '1pacent Admin',
    NULL,
    '1pacent legislation monitor summary',
    concat(
      'Legislation monitor run: ', ${sql(runId)}, E'\n',
      'Stage: ', e.notification_stage, E'\n',
      'Change: ', e.change_title, E'\n',
      'Jurisdiction: ', e.jurisdiction, E'\n',
      'Effective date: ', COALESCE(e.effective_from::text, 'To be confirmed'), E'\n',
      'New version: ', COALESCE(e.new_version, 'Not supplied'), E'\n',
      'Official source: ', e.gov_source_url, E'\n\n',
      e.layman_summary
    ),
    CASE WHEN ${dryRun ? 'true' : 'false'} THEN 'dry_run' ELSE 'pending' END,
    jsonb_build_object('run_id', ${sql(runId)}, 'dry_run', ${dryRun ? 'true' : 'false'})
  FROM events_to_notify e
  ON CONFLICT (change_id, notification_stage, recipient_email) DO UPDATE SET
    subject = EXCLUDED.subject,
    message = EXCLUDED.message,
    payload = EXCLUDED.payload
  RETURNING *
),
all_notifications AS (
  SELECT * FROM insert_notifications
  UNION ALL
  SELECT * FROM insert_internal_summary
),
insert_event AS (
  INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
  VALUES (
    'legislation_monitor',
    ${sql(runId)},
    'monthly_legislation_version_monitor_completed',
    jsonb_build_object(
      'dry_run', ${dryRun ? 'true' : 'false'},
      'checks_inserted', (SELECT count(*) FROM insert_checks),
      'pending_changes_inserted', (SELECT count(*) FROM insert_input_changes),
      'due_changes_applied', (SELECT count(*) FROM due_changes),
      'notifications_created', (SELECT count(*) FROM all_notifications)
    )
  )
)
SELECT jsonb_build_object(
  'success', true,
  'run_id', ${sql(runId)},
  'dry_run', ${dryRun ? 'true' : 'false'},
  'checks_inserted', (SELECT count(*) FROM insert_checks),
  'pending_changes_inserted', (SELECT count(*) FROM insert_input_changes),
  'due_changes_applied', (SELECT count(*) FROM due_changes),
  'upcoming_changes_found', (SELECT count(*) FROM events_to_notify WHERE notification_stage = 'upcoming_change'),
  'notifications_created', (SELECT count(*) FROM all_notifications),
  'notifications', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'notification_id', id,
    'stage', notification_stage,
    'to', recipient_email,
    'role', recipient_role,
    'subject', subject,
    'message', message,
    'status', status
  ) ORDER BY created_at DESC) FROM all_notifications), '[]'::jsonb)
) AS legislation_monitor_result;
`;

return [{ json: { sql: query } }];
'@

$prepareEmailsCode = @'
const row = items[0]?.json?.legislation_monitor_result ?? items[0]?.json ?? {};
const notifications = Array.isArray(row.notifications) ? row.notifications : [];
const emailItems = notifications
  .filter(n => n.to && n.message && n.status === 'pending')
  .map(n => ({
    json: {
      run_id: row.run_id,
      notification_id: n.notification_id,
      to: n.to,
      subject: n.subject,
      message: n.message,
      role: n.role,
      stage: n.stage,
      monitor_result: row,
    }
  }));

if (emailItems.length) return emailItems;

return [{
  json: {
    run_id: row.run_id,
    to: 'mac@1pacent.com',
    subject: '1pacent legislation monitor ran with no outbound recipient emails',
    message: `Legislation monitor run ${row.run_id || ''} completed.\n\nChecks inserted: ${row.checks_inserted || 0}\nPending changes inserted: ${row.pending_changes_inserted || 0}\nDue changes applied: ${row.due_changes_applied || 0}\nUpcoming changes found: ${row.upcoming_changes_found || 0}\nNotifications created: ${row.notifications_created || 0}\nDry run: ${row.dry_run ? 'yes' : 'no'}`,
    monitor_result: row,
  }
}];
'@

$logEmailCode = @'
let rows = [];
try {
  rows = $items("Prepare Legislation Emails").map(item => item.json ?? {});
} catch (error) {
  rows = items.map(item => item.json ?? {});
}
const ids = rows.map(r => r.notification_id).filter(Boolean);
function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
const query = `
WITH updated AS (
  UPDATE legislation_change_notifications
  SET status = 'sent',
      sent_at = now()
  WHERE id IN (${ids.length ? ids.map(sql).join(',') : 'NULL'} )
  RETURNING *
)
SELECT jsonb_build_object(
  'success', true,
  'emails_sent_or_attempted', ${rows.length},
  'notifications_marked_sent', (SELECT count(*) FROM updated),
  'run_id', ${sql(rows[0]?.run_id)}
) AS legislation_email_result;
`;
return [{ json: { sql: query, monitor_result: rows[0]?.monitor_result ?? {} } }];
'@

$manualNodes = @(
    (New-WebhookNode "Legislation Monitor Manual Webhook" "rental/legislation/monitor/run" "POST" 0 0),
    (New-CodeNode "Build Legislation Monitor SQL" $buildSqlCode 260 0),
    (New-PostgresNode "Run Legislation Monitor" 520 0),
    (New-CodeNode "Prepare Legislation Emails" $prepareEmailsCode 780 0),
    (New-GmailNode "Email Legislation Update" 1040 0),
    (New-CodeNode "Build Legislation Email Log SQL" $logEmailCode 1300 0),
    (New-PostgresNode "Log Legislation Emails" 1560 0),
    (New-RespondNode "Respond Legislation Monitor" '={{$json.legislation_email_result || $json.monitor_result || $json}}' 1820 0)
)
$manualConnections = @{
    "Legislation Monitor Manual Webhook" = @{ main = @(, @(@{ node = "Build Legislation Monitor SQL"; type = "main"; index = 0 })) }
    "Build Legislation Monitor SQL" = @{ main = @(, @(@{ node = "Run Legislation Monitor"; type = "main"; index = 0 })) }
    "Run Legislation Monitor" = @{ main = @(, @(@{ node = "Prepare Legislation Emails"; type = "main"; index = 0 })) }
    "Prepare Legislation Emails" = @{ main = @(, @(@{ node = "Email Legislation Update"; type = "main"; index = 0 })) }
    "Email Legislation Update" = @{ main = @(, @(@{ node = "Build Legislation Email Log SQL"; type = "main"; index = 0 })) }
    "Build Legislation Email Log SQL" = @{ main = @(, @(@{ node = "Log Legislation Emails"; type = "main"; index = 0 })) }
    "Log Legislation Emails" = @{ main = @(, @(@{ node = "Respond Legislation Monitor"; type = "main"; index = 0 })) }
}

$monthlyNodes = @(
    (New-ScheduleMonthlyNode "Monthly Legislation Monitor Schedule" 0 0),
    (New-CodeNode "Build Legislation Monitor SQL" $buildSqlCode 260 0),
    (New-PostgresNode "Run Legislation Monitor" 520 0),
    (New-CodeNode "Prepare Legislation Emails" $prepareEmailsCode 780 0),
    (New-GmailNode "Email Legislation Update" 1040 0),
    (New-CodeNode "Build Legislation Email Log SQL" $logEmailCode 1300 0),
    (New-PostgresNode "Log Legislation Emails" 1560 0)
)
$monthlyConnections = @{
    "Monthly Legislation Monitor Schedule" = @{ main = @(, @(@{ node = "Build Legislation Monitor SQL"; type = "main"; index = 0 })) }
    "Build Legislation Monitor SQL" = @{ main = @(, @(@{ node = "Run Legislation Monitor"; type = "main"; index = 0 })) }
    "Run Legislation Monitor" = @{ main = @(, @(@{ node = "Prepare Legislation Emails"; type = "main"; index = 0 })) }
    "Prepare Legislation Emails" = @{ main = @(, @(@{ node = "Email Legislation Update"; type = "main"; index = 0 })) }
    "Email Legislation Update" = @{ main = @(, @(@{ node = "Build Legislation Email Log SQL"; type = "main"; index = 0 })) }
    "Build Legislation Email Log SQL" = @{ main = @(, @(@{ node = "Log Legislation Emails"; type = "main"; index = 0 })) }
}

$manual = Upsert-WorkflowByName "TRADIE-RENTAL-111-Legislation-Version-Monitor-Manual" $manualNodes $manualConnections
$monthly = Upsert-WorkflowByName "TRADIE-RENTAL-112-Monthly-Legislation-Version-Monitor" $monthlyNodes $monthlyConnections

@{
    workflows = @(
        ($manual | Select-Object name,id,active),
        ($monthly | Select-Object name,id,active)
    )
    endpoints = @{
        manual_run = "$BaseUrl/webhook/rental/legislation/monitor/run"
        monthly_schedule = "First day of every month at 09:00 Australia/Sydney"
    }
} | ConvertTo-Json -Depth 10
