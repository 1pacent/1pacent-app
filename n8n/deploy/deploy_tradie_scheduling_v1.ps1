$ErrorActionPreference = "Stop"

$BaseUrl = "https://vmi3305336.contaboserver.net"
$ApiKey = $env:N8N_API_KEY
if (-not $ApiKey) {
    throw "Set N8N_API_KEY in the environment before running this script."
}

$Headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "accept" = "application/json"
}

$postgresCredential = @{
    id = "fTq1Q3oE59B59Y0Y"
    name = "Tradie App Postgres"
}

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
        id = [guid]::NewGuid().ToString()
        name = $Name
        webhookId = [guid]::NewGuid().ToString()
    }
}

function New-CodeNode($Name, $Code, $X, $Y) {
    return @{
        parameters = @{ jsCode = $Code }
        type = "n8n-nodes-base.code"
        typeVersion = 2
        position = @([int]$X, [int]$Y)
        id = [guid]::NewGuid().ToString()
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
        id = [guid]::NewGuid().ToString()
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
        id = [guid]::NewGuid().ToString()
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

$buildCandidateSqlCode = @'
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

function parsePreferredDate(value) {
  const text = String(value || '').toLowerCase();
  const now = new Date();
  if (text.includes('tomorrow')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const target = days.findIndex((d) => text.includes(d));
  if (target >= 0) {
    const d = new Date(now);
    const delta = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
  }
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  return fallback.toISOString().slice(0, 10);
}

const leadId = first(body.lead_id, body.reference, '');
const quoteId = first(body.quote_id, '');
const jobId = first(body.job_id, `JOB-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`);
const tradeType = first(body.trade_type, body.category, 'electrical').toLowerCase();
const address = first(body.address, body.customer_address, '');
const suburb = first(body.suburb, body.customer_suburb, address.split(',')[0], address);
const preferredTime = first(body.preferred_time, body.preferred_window, body.booking_window, 'tomorrow morning');
const preferredDate = parsePreferredDate(first(body.preferred_date, preferredTime));
const durationMinutes = Number.parseInt(first(body.estimated_duration_minutes, body.duration_minutes, 120), 10) || 120;
const urgency = first(body.urgency, 'normal');
const persistRaw = first(body.persist_schedule, body.hold_slot, body.create_hold, false);
const persistSchedule = Boolean(leadId) && persistRaw !== false && String(persistRaw).toLowerCase() !== 'false';

const query = `
CREATE TABLE IF NOT EXISTS tradies (
  id text primary key,
  name text not null,
  phone text,
  email text,
  home_suburb text,
  active boolean not null default true,
  licence_status text not null default 'Not yet verified',
  insurance_status text not null default 'Not yet verified',
  quote_accuracy_score numeric,
  on_time_rate numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS tradie_skills (
  id uuid primary key default gen_random_uuid(),
  tradie_id text references tradies(id),
  trade_type text not null,
  skill_name text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS tradie_availability (
  id uuid primary key default gen_random_uuid(),
  tradie_id text references tradies(id),
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS job_schedule_slots (
  id text primary key,
  job_id text,
  lead_id text references leads(id),
  quote_id text,
  tradie_id text references tradies(id),
  status text not null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  customer_address text,
  customer_suburb text,
  estimated_duration_minutes integer,
  estimated_travel_minutes integer,
  scheduling_score numeric,
  scheduling_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_job_schedule_slots_tradie_start ON job_schedule_slots(tradie_id, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_job_schedule_slots_lead_id ON job_schedule_slots(lead_id);
ALTER TABLE job_schedule_slots ADD COLUMN IF NOT EXISTS inbound_travel_minutes integer;
ALTER TABLE job_schedule_slots ADD COLUMN IF NOT EXISTS outbound_travel_minutes integer;
ALTER TABLE job_schedule_slots ADD COLUMN IF NOT EXISTS previous_schedule_slot_id text;
ALTER TABLE job_schedule_slots ADD COLUMN IF NOT EXISTS next_schedule_slot_id text;
ALTER TABLE job_schedule_slots ADD COLUMN IF NOT EXISTS route_context jsonb not null default '{}'::jsonb;

INSERT INTO tradies (id, name, phone, email, home_suburb, active, licence_status, insurance_status, quote_accuracy_score, on_time_rate)
VALUES ('TRD-DEFAULT-ELECTRICAL', 'Default Electrical Tradie', NULL, NULL, 'Melbourne', true, 'Not yet verified', 'Not yet verified', 90, 92)
ON CONFLICT (id) DO UPDATE SET active = true, updated_at = now();

INSERT INTO tradie_skills (tradie_id, trade_type, skill_name, verified)
SELECT 'TRD-DEFAULT-ELECTRICAL', 'electrical', 'General electrical', false
WHERE NOT EXISTS (
  SELECT 1 FROM tradie_skills WHERE tradie_id = 'TRD-DEFAULT-ELECTRICAL' AND trade_type = 'electrical'
);

INSERT INTO tradie_availability (tradie_id, day_of_week, start_time, end_time)
SELECT 'TRD-DEFAULT-ELECTRICAL', day, '08:00'::time, '16:30'::time
FROM generate_series(1, 5) AS day
WHERE NOT EXISTS (
  SELECT 1 FROM tradie_availability WHERE tradie_id = 'TRD-DEFAULT-ELECTRICAL'
);

WITH request AS (
  SELECT
    ${sql(leadId)}::text AS lead_id,
    ${sql(quoteId)}::text AS quote_id,
    ${sql(jobId)}::text AS job_id,
    ${sql(tradeType)}::text AS trade_type,
    ${sql(address)}::text AS customer_address,
    ${sql(suburb)}::text AS customer_suburb,
    ${sql(preferredTime)}::text AS preferred_time,
    ${sql(preferredDate)}::date AS preferred_date,
    ${durationMinutes}::integer AS estimated_duration_minutes,
    ${sql(urgency)}::text AS urgency,
    ${persistSchedule ? 'true' : 'false'}::boolean AS persist_schedule
),
candidate_tradies AS (
  SELECT
    t.id AS tradie_id,
    t.name AS tradie_name,
    t.home_suburb,
    t.quote_accuracy_score,
    t.on_time_rate,
    ts.trade_type,
    ta.start_time,
    ta.end_time,
    r.*
  FROM request r
  JOIN tradie_skills ts ON lower(ts.trade_type) = lower(r.trade_type)
  JOIN tradies t ON t.id = ts.tradie_id AND t.active = true
  JOIN tradie_availability ta
    ON ta.tradie_id = t.id
   AND ta.active = true
   AND ta.day_of_week = EXTRACT(DOW FROM r.preferred_date)::integer
),
existing_slots AS (
  SELECT
    jss.tradie_id,
    jsonb_agg(jsonb_build_object(
      'slot_id', jss.id,
      'scheduled_start', jss.scheduled_start,
      'scheduled_end', jss.scheduled_end,
      'customer_suburb', jss.customer_suburb,
      'estimated_travel_minutes', jss.estimated_travel_minutes
    ) ORDER BY jss.scheduled_start) AS slots
  FROM job_schedule_slots jss
  JOIN request r ON (jss.scheduled_start AT TIME ZONE 'Australia/Sydney')::date = r.preferred_date
  WHERE jss.status NOT IN ('cancelled', 'declined')
  GROUP BY jss.tradie_id
)
SELECT
  ct.*,
  COALESCE(es.slots, '[]'::jsonb) AS existing_slots
FROM candidate_tradies ct
LEFT JOIN existing_slots es ON es.tradie_id = ct.tradie_id;
`;

return [{ json: { lead_id: leadId, quote_id: quoteId, job_id: jobId, preferred_date: preferredDate, preferred_time: preferredTime, estimated_duration_minutes: durationMinutes, customer_address: address, customer_suburb: suburb, trade_type: tradeType, urgency, persist_schedule: persistSchedule, sql: query } }];
'@

$optimiseCode = @'
const rows = items.map((item) => item.json);

function normaliseSuburb(value) {
  return String(value || '').trim().toLowerCase();
}

function travelMinutes(fromSuburb, toSuburb) {
  const from = normaliseSuburb(fromSuburb);
  const to = normaliseSuburb(toSuburb);
  if (!from || !to) return 35;
  if (from === to) return 15;
  if (from.includes(to) || to.includes(from)) return 20;
  return 35;
}

function firstSunday(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  const day = d.getUTCDay();
  const offset = (7 - day) % 7;
  return 1 + offset;
}

function sydneyOffset(datePart) {
  const [year, month, day] = String(datePart).split('-').map(Number);
  const octStart = `${year}-10-${String(firstSunday(year, 9)).padStart(2, '0')}`;
  const aprEnd = `${year}-04-${String(firstSunday(year, 3)).padStart(2, '0')}`;
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const inDst = value >= octStart || value < aprEnd;
  return inDst ? '+11:00' : '+10:00';
}

function parseDateTime(date, time) {
  const datePart = String(date || '').slice(0, 10);
  return new Date(`${datePart}T${time}${sydneyOffset(datePart)}`);
}

function formatLocal(date) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

if (!rows.length || !rows[0].tradie_id) {
  return [{
    json: {
      success: false,
      status: 'No Tradie Available',
      reason: 'No active tradie with matching skill and availability was found.',
      missing_information: ['tradie_availability_or_skill'],
    },
  }];
}

const candidates = [];
for (const row of rows) {
  const date = row.preferred_date;
  const duration = Number(row.estimated_duration_minutes || 120);
  const availabilityStart = parseDateTime(date, row.start_time);
  const availabilityEnd = parseDateTime(date, row.end_time);
  const existing = Array.isArray(row.existing_slots) ? row.existing_slots : [];

  const preferredText = String(row.preferred_time || '').toLowerCase();
  const preferredHour = preferredText.includes('afternoon') || preferredText.includes('2') || preferredText.includes('14') ? 14 : preferredText.includes('morning') ? 9 : 10;
  const preferredStart = parseDateTime(date, `${String(preferredHour).padStart(2, '0')}:00:00`);
  const windowStart = preferredText.includes('afternoon') ? parseDateTime(date, '12:00:00') : preferredText.includes('morning') ? parseDateTime(date, '08:00:00') : availabilityStart;
  const windowEnd = preferredText.includes('afternoon') ? parseDateTime(date, '16:30:00') : preferredText.includes('morning') ? parseDateTime(date, '12:30:00') : availabilityEnd;
  const searchStart = new Date(Math.max(availabilityStart.getTime(), windowStart.getTime()));
  const searchEnd = new Date(Math.min(availabilityEnd.getTime(), windowEnd.getTime()));
  const sorted = existing
    .map((slot) => ({
      ...slot,
      start: new Date(slot.scheduled_start),
      end: new Date(slot.scheduled_end),
    }))
    .sort((a, b) => a.start - b.start);

  for (let t = searchStart.getTime(); t + duration * 60000 <= availabilityEnd.getTime(); t += 15 * 60000) {
    const slotStart = new Date(t);
    const slotEnd = new Date(slotStart.getTime() + duration * 60000);
    const overlaps = sorted.some((slot) => slotStart < slot.end && slotEnd > slot.start);
    if (overlaps) continue;

    const previous = [...sorted].reverse().find((slot) => slot.end <= slotStart);
    const next = sorted.find((slot) => slot.start >= slotEnd);
    const inboundFrom = previous?.customer_suburb || row.home_suburb;
    const outboundTo = next?.customer_suburb || row.home_suburb;
    const inboundTravel = travelMinutes(inboundFrom, row.customer_suburb);
    const outboundTravel = travelMinutes(row.customer_suburb, outboundTo);
    const hasInboundBuffer = previous ? slotStart.getTime() >= previous.end.getTime() + inboundTravel * 60000 : slotStart >= availabilityStart;
    const hasOutboundBuffer = next ? slotEnd.getTime() + outboundTravel * 60000 <= next.start.getTime() : slotEnd <= availabilityEnd;
    if (!hasInboundBuffer || !hasOutboundBuffer) continue;

    const preferredPenalty = Math.abs(slotStart.getTime() - preferredStart.getTime()) / 60000 / 10;
    const totalRouteTravel = inboundTravel + outboundTravel;
    let score = 60;
    score += Number(row.quote_accuracy_score || 0) * 0.18;
    score += Number(row.on_time_rate || 0) * 0.18;
    score -= totalRouteTravel * 0.45;
    score -= preferredPenalty;
    score -= existing.length * 3;
    if (String(row.urgency).toLowerCase() === 'urgent') score += 10;
    if (slotStart < searchStart || slotEnd > searchEnd) score -= 12;

    candidates.push({
      ...row,
      feasible: true,
      scheduled_start: slotStart.toISOString(),
      scheduled_end: slotEnd.toISOString(),
      estimated_travel_minutes: totalRouteTravel,
      inbound_travel_minutes: inboundTravel,
      outbound_travel_minutes: outboundTravel,
      previous_schedule_slot_id: previous?.slot_id || '',
      next_schedule_slot_id: next?.slot_id || '',
      route_context: {
        inbound_from_suburb: inboundFrom || '',
        customer_suburb: row.customer_suburb || '',
        outbound_to_suburb: outboundTo || '',
        existing_jobs_on_day: existing.length,
      },
      scheduling_score: Math.round(score),
      scheduling_reason: `Best route-aware fit based on ${row.tradie_name}'s ${row.trade_type} skill, preferred window, existing day plan, and ${totalRouteTravel} minutes estimated total travel around this job.`,
    });
  }
}

if (!candidates.length) {
  const row = rows[0];
  return [{
    json: {
      success: false,
      status: 'No Feasible Slot',
      lead_id: row.lead_id,
      quote_id: row.quote_id,
      job_id: row.job_id,
      tradie_id: row.tradie_id,
      tradie_name: row.tradie_name,
      customer_address: row.customer_address,
      customer_suburb: row.customer_suburb,
      estimated_duration_minutes: Number(row.estimated_duration_minutes || 120),
      scheduling_reason: 'George could not find a slot that fits availability, existing bookings, and travel buffers.',
      missing_information: ['manual_schedule_review'],
    },
  }];
}

const best = candidates.sort((a, b) => b.scheduling_score - a.scheduling_score)[0];
const slotId = `SCH-${new Date().getFullYear()}-${Math.floor(Date.now() / 1000).toString().slice(-6)}`;

return [{
  json: {
    success: best.feasible,
    schedule_slot_id: slotId,
    status: best.feasible ? 'Schedule Proposed' : 'No Feasible Slot',
    lead_id: best.lead_id,
    quote_id: best.quote_id,
    job_id: best.job_id,
    tradie_id: best.tradie_id,
    tradie_name: best.tradie_name,
    scheduled_start: best.scheduled_start,
    scheduled_end: best.scheduled_end,
    scheduled_start_local: formatLocal(new Date(best.scheduled_start)),
    scheduled_end_local: formatLocal(new Date(best.scheduled_end)),
    timezone: 'Australia/Sydney',
    customer_address: best.customer_address,
    customer_suburb: best.customer_suburb,
    estimated_duration_minutes: Number(best.estimated_duration_minutes || 120),
    estimated_travel_minutes: best.estimated_travel_minutes,
    inbound_travel_minutes: best.inbound_travel_minutes,
    outbound_travel_minutes: best.outbound_travel_minutes,
    previous_schedule_slot_id: best.previous_schedule_slot_id,
    next_schedule_slot_id: best.next_schedule_slot_id,
    route_context: best.route_context,
    persist_schedule: best.persist_schedule !== false,
    scheduling_score: best.scheduling_score,
    scheduling_reason: best.scheduling_reason,
    alternatives: candidates.slice(1, 4),
  },
}];
'@

$saveScheduleSqlCode = @'
const s = items[0]?.json ?? {};
function sql(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function num(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? String(parsed) : 'NULL';
}
function jsonSql(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

if (!s.success) {
  return [{ json: { ...s, sql: `INSERT INTO workflow_events (entity_type, entity_id, event_type, payload) VALUES ('schedule', ${sql(s.lead_id || 'unknown')}, 'schedule_failed', ${jsonSql(s)}); SELECT ${sql(s.status)} AS status;` } }];
}

if (s.persist_schedule === false) {
  return [{ json: { ...s, sql: `SELECT ${jsonSql(s)} AS schedule_preview;` } }];
}

const query = `
INSERT INTO job_schedule_slots (
  id, job_id, lead_id, quote_id, tradie_id, status, scheduled_start, scheduled_end,
  customer_address, customer_suburb, estimated_duration_minutes, estimated_travel_minutes,
  inbound_travel_minutes, outbound_travel_minutes, previous_schedule_slot_id, next_schedule_slot_id,
  route_context, scheduling_score, scheduling_reason, updated_at
)
VALUES (
  ${sql(s.schedule_slot_id)},
  ${sql(s.job_id)},
  ${sql(s.lead_id)},
  ${sql(s.quote_id)},
  ${sql(s.tradie_id)},
  ${sql(s.status)},
  ${sql(s.scheduled_start)}::timestamptz,
  ${sql(s.scheduled_end)}::timestamptz,
  ${sql(s.customer_address)},
  ${sql(s.customer_suburb)},
  ${num(s.estimated_duration_minutes)},
  ${num(s.estimated_travel_minutes)},
  ${num(s.inbound_travel_minutes)},
  ${num(s.outbound_travel_minutes)},
  ${sql(s.previous_schedule_slot_id)},
  ${sql(s.next_schedule_slot_id)},
  ${jsonSql(s.route_context)},
  ${num(s.scheduling_score)},
  ${sql(s.scheduling_reason)},
  now()
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  scheduled_start = EXCLUDED.scheduled_start,
  scheduled_end = EXCLUDED.scheduled_end,
  estimated_travel_minutes = EXCLUDED.estimated_travel_minutes,
  inbound_travel_minutes = EXCLUDED.inbound_travel_minutes,
  outbound_travel_minutes = EXCLUDED.outbound_travel_minutes,
  previous_schedule_slot_id = EXCLUDED.previous_schedule_slot_id,
  next_schedule_slot_id = EXCLUDED.next_schedule_slot_id,
  route_context = EXCLUDED.route_context,
  scheduling_score = EXCLUDED.scheduling_score,
  scheduling_reason = EXCLUDED.scheduling_reason,
  updated_at = now();

UPDATE jobs
SET status = 'Schedule Proposed',
    scheduled_window = ${sql(`${s.scheduled_start} to ${s.scheduled_end}`)},
    updated_at = now()
WHERE id = ${sql(s.job_id)};

INSERT INTO workflow_events (entity_type, entity_id, event_type, payload)
VALUES ('schedule', ${sql(s.schedule_slot_id)}, 'schedule_proposed', ${jsonSql(s)});

SELECT ${sql(s.schedule_slot_id)} AS schedule_slot_id;
`;

return [{ json: { ...s, sql: query } }];
'@

$nodes = @(
    (New-WebhookNode "Schedule Booking Webhook" "schedule/book-job" "POST" 0 0),
    (New-CodeNode "Build Candidate Schedule SQL" $buildCandidateSqlCode 260 0),
    (New-PostgresNode "Read Schedule Candidates" 520 0),
    (New-CodeNode "Optimise Tradie Schedule" $optimiseCode 780 0),
    (New-CodeNode "Build Save Schedule SQL" $saveScheduleSqlCode 1040 0),
    (New-PostgresNode "Save Schedule Proposal" 1300 0),
    (New-RespondNode "Respond Schedule" '={{$node["Optimise Tradie Schedule"].json}}' 1560 0)
)

$connections = @{
    "Schedule Booking Webhook" = @{ main = @(, @(@{ node = "Build Candidate Schedule SQL"; type = "main"; index = 0 })) }
    "Build Candidate Schedule SQL" = @{ main = @(, @(@{ node = "Read Schedule Candidates"; type = "main"; index = 0 })) }
    "Read Schedule Candidates" = @{ main = @(, @(@{ node = "Optimise Tradie Schedule"; type = "main"; index = 0 })) }
    "Optimise Tradie Schedule" = @{ main = @(, @(@{ node = "Build Save Schedule SQL"; type = "main"; index = 0 })) }
    "Build Save Schedule SQL" = @{ main = @(, @(@{ node = "Save Schedule Proposal"; type = "main"; index = 0 })) }
    "Save Schedule Proposal" = @{ main = @(, @(@{ node = "Respond Schedule"; type = "main"; index = 0 })) }
}

$result = Upsert-WorkflowByName "TRADIE-SCHEDULE-030-Book-Job" $nodes $connections
$result | Select-Object name,id,active | ConvertTo-Json -Depth 5
