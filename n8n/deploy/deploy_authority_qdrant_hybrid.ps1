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

function New-HttpNode($Name, $Method, $Url, $JsonBody, $X, $Y, $Continue = $false) {
    return @{
        parameters = @{
            method = $Method
            url = $Url
            sendBody = $true
            contentType = "json"
            specifyBody = "json"
            jsonBody = $JsonBody
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

$selectChunksCode = @'
const body = $json.body || $json || {};
const limit = Math.min(Math.max(parseInt(body.limit || '100', 10) || 100, 1), 500);
const sql = `
SELECT
  c.chunk_key,
  c.authority_document_key,
  c.chunk_text,
  c.jurisdiction,
  c.industry,
  c.trade_type,
  c.topic_tags,
  c.obligation_type,
  c.risk_level,
  c.source_url,
  c.current_version,
  c.effective_from,
  c.effective_to,
  d.document_type,
  d.document_title,
  d.authority_name,
  d.official_source,
  d.sme_interpretation_status
FROM authority_document_chunks c
JOIN authority_documents d ON d.authority_document_key = c.authority_document_key
WHERE d.status = 'active'
ORDER BY c.updated_at DESC, c.chunk_order
LIMIT ${limit};
`;
return [{ json: { sql } }];
'@

$buildPointsCode = @'
const dims = 384;
const stop = new Set(['the','and','or','a','an','to','of','in','for','on','with','is','are','be','by','as','at','from','that','this','it','must','should','may','can']);
function hash32(text, seed = 2166136261) {
  let h = seed >>> 0;
  for (let i = 0; i < String(text).length; i++) {
    h ^= String(text).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pointId(key) {
  const part = n => hash32(`${key}:${n}`).toString(16).padStart(8, '0');
  const h = `${part(1)}${part(2)}${part(3)}${part(4)}`;
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}
function hashToken(token) {
  return hash32(token) % dims;
}
function vector(text) {
  const values = new Array(dims).fill(0);
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const token of tokens) {
    if (token.length < 2 || stop.has(token)) continue;
    const idx = hashToken(token);
    values[idx] += 1;
    if (token.endsWith('ing') && token.length > 5) values[hashToken(token.slice(0, -3))] += 0.5;
    if (token.endsWith('ed') && token.length > 4) values[hashToken(token.slice(0, -2))] += 0.5;
    if (token.endsWith('s') && token.length > 3) values[hashToken(token.slice(0, -1))] += 0.5;
  }
  const norm = Math.sqrt(values.reduce((sum, n) => sum + n * n, 0)) || 1;
  return values.map(n => Number((n / norm).toFixed(6)));
}

const rows = $input.all().map(item => item.json);
const points = rows.map(row => {
  const text = [
    row.document_title,
    row.authority_name,
    row.document_type,
    row.jurisdiction,
    row.industry,
    row.trade_type,
    row.current_version,
    row.chunk_text
  ].filter(Boolean).join('\n');
  return {
    id: pointId(row.chunk_key),
    vector: vector(text),
    payload: {
      authority_document_key: row.authority_document_key,
      chunk_key: row.chunk_key,
      chunk_text: row.chunk_text,
      jurisdiction: row.jurisdiction,
      industry: row.industry,
      trade_type: row.trade_type,
      document_type: row.document_type,
      document_title: row.document_title,
      authority_name: row.authority_name,
      official_source: row.official_source,
      source_url: row.source_url,
      current_version: row.current_version,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
      obligation_type: row.obligation_type,
      risk_level: row.risk_level,
      sme_interpretation_status: row.sme_interpretation_status,
      vector_backend: 'qdrant_hybrid_hash_v1'
    }
  };
});

return [{ json: { points, indexed_count: points.length } }];
'@

$buildSearchCode = @'
const body = $json.body || $json || {};
const dims = 384;
const stop = new Set(['the','and','or','a','an','to','of','in','for','on','with','is','are','be','by','as','at','from','that','this','it','must','should','may','can']);
function hash32(text, seed = 2166136261) {
  let h = seed >>> 0;
  for (let i = 0; i < String(text).length; i++) {
    h ^= String(text).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function hashToken(token) {
  return hash32(token) % dims;
}
function vector(text) {
  const values = new Array(dims).fill(0);
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const token of tokens) {
    if (token.length < 2 || stop.has(token)) continue;
    values[hashToken(token)] += 1;
    if (token.endsWith('ing') && token.length > 5) values[hashToken(token.slice(0, -3))] += 0.5;
    if (token.endsWith('ed') && token.length > 4) values[hashToken(token.slice(0, -2))] += 0.5;
    if (token.endsWith('s') && token.length > 3) values[hashToken(token.slice(0, -1))] += 0.5;
  }
  const norm = Math.sqrt(values.reduce((sum, n) => sum + n * n, 0)) || 1;
  return values.map(n => Number((n / norm).toFixed(6)));
}

const query = body.query || body.question || body.search || 'authority document compliance obligation';
const jurisdiction = body.jurisdiction || 'AU';
const industry = body.industry || 'all';
const tradeType = body.trade_type || '';
const limit = Math.min(Math.max(parseInt(body.limit || '8', 10) || 8, 1), 20);
const filterMust = [
  { key: 'jurisdiction', match: { any: [jurisdiction, 'AU'] } }
];
if (industry && industry !== 'all') filterMust.push({ key: 'industry', match: { any: [industry, 'all'] } });
if (tradeType) filterMust.push({ key: 'trade_type', match: { any: [tradeType, null] } });

return [{
  json: {
    vector: vector(`${query}\n${jurisdiction}\n${industry}\n${tradeType}`),
    limit,
    with_payload: true,
    filter: { must: filterMust },
    request: { query, jurisdiction, industry, trade_type: tradeType }
  }
}];
'@

$formatSearchCode = @'
const raw = $input.first()?.json || {};
const result = raw.result || [];
return [{
  json: {
    success: true,
    retrieval_backend: 'qdrant_hybrid_hash_v1',
    collection: 'authority_documents_hybrid',
    request: raw.request || {},
    count: Array.isArray(result) ? result.length : 0,
    documents: (Array.isArray(result) ? result : []).map(point => ({
      score: point.score,
      authority_document_key: point.payload?.authority_document_key,
      chunk_key: point.payload?.chunk_key,
      document_title: point.payload?.document_title,
      authority_name: point.payload?.authority_name,
      jurisdiction: point.payload?.jurisdiction,
      industry: point.payload?.industry,
      trade_type: point.payload?.trade_type,
      document_type: point.payload?.document_type,
      current_version: point.payload?.current_version,
      effective_from: point.payload?.effective_from,
      source_url: point.payload?.source_url,
      chunk_text: point.payload?.chunk_text,
      risk_level: point.payload?.risk_level,
      caution: 'Grounding reference only. Use source, jurisdiction, version, and effective date; do not present as legal advice.'
    })),
    next_upgrade: 'Replace qdrant_hybrid_hash_v1 vectors with managed semantic embeddings once an embeddings credential is available.'
  }
}];
'@

$collectionBody = '{"vectors":{"size":384,"distance":"Cosine"}}'
$upsertBody = '={{ JSON.stringify({ points: $json.points }) }}'
$searchBody = '={{ JSON.stringify({ vector: $json.vector, limit: $json.limit, with_payload: true, filter: $json.filter }) }}'

$ingestNodes = @(
    (New-WebhookNode "Authority Hybrid Ingest Webhook" "core/authority-documents/qdrant-hybrid/ingest" "POST" 0 0),
    (New-CodeNode "Build Chunk SQL" $selectChunksCode 240 0),
    (New-PostgresNode "Fetch Authority Chunks" 500 0),
    (New-CodeNode "Build Hybrid Points" $buildPointsCode 760 0),
    (New-HttpNode "Upsert Hybrid Points" "PUT" "http://qdrant:6333/collections/authority_documents_hybrid/points?wait=true" $upsertBody 1040 0 $false),
    (New-RespondNode "Return Hybrid Ingest Result" '={{ JSON.stringify({success:true, collection:"authority_documents_hybrid", qdrant:$json}) }}' 1300 0)
)
$ingestConnections = @{
    "Authority Hybrid Ingest Webhook" = @{ main = @(, @(@{ node = "Build Chunk SQL"; type = "main"; index = 0 })) }
    "Build Chunk SQL" = @{ main = @(, @(@{ node = "Fetch Authority Chunks"; type = "main"; index = 0 })) }
    "Fetch Authority Chunks" = @{ main = @(, @(@{ node = "Build Hybrid Points"; type = "main"; index = 0 })) }
    "Build Hybrid Points" = @{ main = @(, @(@{ node = "Upsert Hybrid Points"; type = "main"; index = 0 })) }
    "Upsert Hybrid Points" = @{ main = @(, @(@{ node = "Return Hybrid Ingest Result"; type = "main"; index = 0 })) }
}

$searchNodes = @(
    (New-WebhookNode "Authority Hybrid Search Webhook" "core/authority-documents/qdrant-hybrid/search" "POST" 0 0),
    (New-CodeNode "Build Hybrid Search" $buildSearchCode 260 0),
    (New-HttpNode "Search Hybrid Collection" "POST" "http://qdrant:6333/collections/authority_documents_hybrid/points/search" $searchBody 540 0 $false),
    (New-CodeNode "Format Hybrid Search" $formatSearchCode 800 0),
    (New-RespondNode "Return Hybrid Search" '={{ JSON.stringify($json) }}' 1060 0)
)
$searchConnections = @{
    "Authority Hybrid Search Webhook" = @{ main = @(, @(@{ node = "Build Hybrid Search"; type = "main"; index = 0 })) }
    "Build Hybrid Search" = @{ main = @(, @(@{ node = "Search Hybrid Collection"; type = "main"; index = 0 })) }
    "Search Hybrid Collection" = @{ main = @(, @(@{ node = "Format Hybrid Search"; type = "main"; index = 0 })) }
    "Format Hybrid Search" = @{ main = @(, @(@{ node = "Return Hybrid Search"; type = "main"; index = 0 })) }
}

$ingestWorkflow = Upsert-WorkflowByName "TRADIE-CORE-024-Authority-Documents-Qdrant-Hybrid-Ingest" $ingestNodes $ingestConnections
$searchWorkflow = Upsert-WorkflowByName "TRADIE-CORE-025-Authority-Documents-Qdrant-Hybrid-Search" $searchNodes $searchConnections

Write-Host "Deployed Authority Qdrant Hybrid workflows:"
Write-Host "- $($ingestWorkflow.name) [$($ingestWorkflow.id)]"
Write-Host "- $($searchWorkflow.name) [$($searchWorkflow.id)]"
Write-Host ""
Write-Host "Ingest:"
Write-Host "POST $BaseUrl/webhook/core/authority-documents/qdrant-hybrid/ingest"
Write-Host ""
Write-Host "Search:"
Write-Host "POST $BaseUrl/webhook/core/authority-documents/qdrant-hybrid/search"
