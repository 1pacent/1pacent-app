$ErrorActionPreference = "Stop"

$BaseUrl = "https://vmi3305336.contaboserver.net"
$ApiKey = $env:N8N_API_KEY
if (-not $ApiKey) { throw "Set N8N_API_KEY in the environment before running this script." }

$Headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "accept" = "application/json"
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

$tokenCode = @'
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

const apiKey = first(process.env.ELEVENLABS_API_KEY, process.env.XI_API_KEY);
const agentId = first(
  body.agent_id,
  body.elevenlabs_agent_id,
  body.user?.elevenlabs_agent_id,
  process.env.ELEVENLABS_SALLY_AGENT_ID,
  'agent_4601krtt5j3xf26ac865kpe19yvp'
);
const participantName = first(
  body.participant_name,
  body.user?.name,
  body.customer?.name,
  '1pacent customer'
);
const environment = first(body.environment, process.env.ELEVENLABS_ENVIRONMENT, 'production');

if (!apiKey) {
  return [{
    json: {
      success: false,
      status_key: 'missing_elevenlabs_api_key',
      message: 'Set ELEVENLABS_API_KEY on the n8n server before requesting Sally voice tokens.',
      agent_id: agentId
    }
  }];
}

const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/token');
url.searchParams.set('agent_id', agentId);
url.searchParams.set('participant_name', participantName);
url.searchParams.set('environment', environment);

const response = await fetch(url.toString(), {
  method: 'GET',
  headers: {
    'xi-api-key': apiKey,
    'accept': 'application/json'
  }
});

let payload = {};
try {
  payload = await response.json();
} catch (error) {
  payload = { raw: await response.text() };
}

if (!response.ok || !payload.token) {
  return [{
    json: {
      success: false,
      status_key: 'elevenlabs_token_failed',
      status_code: response.status,
      message: payload.detail || payload.message || 'ElevenLabs did not return a conversation token.',
      agent_id: agentId,
      provider_response: payload
    }
  }];
}

return [{
  json: {
    success: true,
    status_key: 'voice_token_ready',
    token: payload.token,
    conversation_token: payload.token,
    agent_id: agentId,
    participant_name: participantName,
    connection_type: 'webrtc',
    expires_hint: 'short_lived',
    context: {
      source: first(body.source, 'customer_app'),
      conversation_id: first(body.conversation_id),
      user_id: first(body.user?.id, body.customer_id),
      persona: first(body.user?.persona),
      property_id: first(body.user?.property_id, body.property_id),
      property_scenario: first(body.user?.property_scenario, body.property_scenario)
    },
    next_action: 'Start the ElevenLabs WebRTC client session with conversation_token.'
  }
}];
'@

$nodes = @(
    (New-WebhookNode "Sally Conversation Token Webhook" "agents/sally/conversation-token" "POST" 0 0),
    (New-CodeNode "Request ElevenLabs Conversation Token" $tokenCode 300 0),
    (New-RespondNode "Respond Sally Conversation Token" '={{$json}}' 620 0)
)

$connections = @{
    "Sally Conversation Token Webhook" = @{ main = @(, @(@{ node = "Request ElevenLabs Conversation Token"; type = "main"; index = 0 })) }
    "Request ElevenLabs Conversation Token" = @{ main = @(, @(@{ node = "Respond Sally Conversation Token"; type = "main"; index = 0 })) }
}

$workflow = Upsert-WorkflowByName "TRADIE-SALLY-120-ElevenLabs-Voice-Token" $nodes $connections

@{
    workflow = $workflow | Select-Object name,id,active
    endpoint = "$BaseUrl/webhook/agents/sally/conversation-token"
    required_server_env = @("ELEVENLABS_API_KEY")
    agent_id = "agent_4601krtt5j3xf26ac865kpe19yvp"
} | ConvertTo-Json -Depth 10
