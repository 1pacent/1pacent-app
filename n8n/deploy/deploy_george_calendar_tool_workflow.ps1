$ErrorActionPreference = "Stop"

$BaseUrl = "https://vmi3305336.contaboserver.net"
$ApiKey = $env:N8N_API_KEY
if (-not $ApiKey) { throw "Set N8N_API_KEY in the environment before running this script." }

$Headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "accept" = "application/json"
}

$googleCalendarCredential = @{
    id = "Qy3Z3GZ8CX5ruMLE"
    name = "Google Calendar account"
}

function New-NodeId { return [guid]::NewGuid().ToString() }

function New-ExecuteWorkflowTriggerNode($X, $Y) {
    return @{
        parameters = @{ inputSource = "passthrough" }
        type = "n8n-nodes-base.executeWorkflowTrigger"
        typeVersion = 1.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "When George Calendar Tool Is Called"
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

function New-GoogleCalendarNode($X, $Y) {
    return @{
        parameters = @{
            operation = "getAll"
            calendar = @{
                __rl = $true
                value = "={{`$json.calendar_id || 'mac@1pacent.com'}}"
                mode = "id"
            }
            returnAll = $true
            timeMin = "={{`$json.time_min}}"
            timeMax = "={{`$json.time_max}}"
            options = @{}
        }
        type = "n8n-nodes-base.googleCalendar"
        typeVersion = 1.3
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = "Read Google Calendar Busy Events"
        alwaysOutputData = $true
        credentials = @{
            googleCalendarOAuth2Api = $googleCalendarCredential
        }
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

$normaliseCode = @'
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

function offsetForSydney(datePart) {
  return '+10:00';
}

function toIsoWindow(dateText, windowText) {
  const date = first(dateText, new Date().toISOString().slice(0, 10));
  const text = String(windowText || '').toLowerCase();
  let start = '09:00:00';
  let end = '17:00:00';
  if (text.includes('2') || text.includes('14')) {
    start = '14:00:00';
    end = '16:00:00';
  } else if (text.includes('morning')) {
    start = '09:00:00';
    end = '12:00:00';
  } else if (text.includes('afternoon')) {
    start = '13:00:00';
    end = '17:00:00';
  }
  const offset = offsetForSydney(date);
  return {
    time_min: `${date}T${start}${offset}`,
    time_max: `${date}T${end}${offset}`,
  };
}

const preferredDate = first(raw.preferred_date, raw.work_date, raw.date, field('preferred_date'), field('work_date'));
const preferredWindow = first(raw.preferred_window, raw.window, field('preferred_window'), field('window'));
const window = toIsoWindow(preferredDate, preferredWindow);

return [{
  json: {
    calendar_id: first(raw.calendar_id, field('calendar_id'), 'mac@1pacent.com'),
    preferred_date: preferredDate,
    preferred_window: preferredWindow,
    time_min: first(raw.time_min, field('time_min'), window.time_min),
    time_max: first(raw.time_max, field('time_max'), window.time_max),
  },
}];
'@

$summariseCode = @'
const events = items
  .map((item) => item.json || {})
  .filter((event) => event.id || event.summary || event.start || event.end);

return [{
  json: {
    success: true,
    busy: events.length > 0,
    busy_event_count: events.length,
    events: events.map((event) => ({
      id: event.id || '',
      summary: event.summary || '',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      status: event.status || '',
    })),
  },
}];
'@

$nodes = @(
    (New-ExecuteWorkflowTriggerNode 0 0),
    (New-CodeNode "Normalise Calendar Tool Input" $normaliseCode 260 0),
    (New-GoogleCalendarNode 520 0),
    (New-CodeNode "Summarise Calendar Busy Events" $summariseCode 780 0)
)

$connections = @{
    "When George Calendar Tool Is Called" = @{ main = @(, @(@{ node = "Normalise Calendar Tool Input"; type = "main"; index = 0 })) }
    "Normalise Calendar Tool Input" = @{ main = @(, @(@{ node = "Read Google Calendar Busy Events"; type = "main"; index = 0 })) }
    "Read Google Calendar Busy Events" = @{ main = @(, @(@{ node = "Summarise Calendar Busy Events"; type = "main"; index = 0 })) }
}

$result = Upsert-WorkflowByName "TRADIE-TOOL-George-Google-Calendar-Busy" $nodes $connections
$result | Select-Object name,id,active | ConvertTo-Json -Depth 5
