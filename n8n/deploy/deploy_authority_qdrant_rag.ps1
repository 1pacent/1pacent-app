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

$openAiCredential = @{
    id = "ABcQFR9XPcZIxLan"
    name = "OpenAI account"
}

$qdrantCredential = @{
    id = "4Bkccs08lXED2IfL"
    name = "Qdrant account"
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
    $params = @{
        method = $Method
        url = $Url
        options = @{ timeout = 30000 }
    }
    if ($null -ne $JsonBody -and $JsonBody -ne "") {
        $params.sendBody = $true
        $params.contentType = "json"
        $params.specifyBody = "json"
        $params.jsonBody = $JsonBody
    }
    return @{
        parameters = $params
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

function New-QdrantVectorNode($Name, $Mode, $X, $Y, $PromptExpression = $null) {
    $params = @{
        mode = $Mode
        options = @{}
        qdrantCollection = @{
            __rl = $true
            mode = "id"
            value = "authority_documents"
            cachedResultName = "authority_documents"
        }
    }
    if ($Mode -eq "load") {
        $params.topK = '={{ $json.limit || 8 }}'
        $params.prompt = $PromptExpression
    }
    return @{
        parameters = $params
        type = "@n8n/n8n-nodes-langchain.vectorStoreQdrant"
        typeVersion = 1.1
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = $Name
        credentials = @{ qdrantApi = $qdrantCredential }
        alwaysOutputData = $true
    }
}

function New-OpenAiEmbeddingsNode($Name, $X, $Y) {
    return @{
        parameters = @{
            model = "text-embedding-3-small"
            options = @{
                dimensions = 1536
                stripNewLines = $true
            }
        }
        type = "@n8n/n8n-nodes-langchain.embeddingsOpenAi"
        typeVersion = 1.2
        position = @([int]$X, [int]$Y)
        id = New-NodeId
        name = $Name
        credentials = @{ openAiApi = $openAiCredential }
    }
}

function New-DefaultDataLoaderNode($Name, $X, $Y) {
    return @{
        parameters = @{
            dataType = "json"
            jsonMode = "expressionData"
            jsonData = "={{ `$json.page_content }}"
            textSplittingMode = "simple"
            options = @{
                metadata = @{
                    metadataValues = @(
                        @{ name = "authority_document_key"; value = "={{ `$json.metadata.authority_document_key }}" },
                        @{ name = "chunk_key"; value = "={{ `$json.metadata.chunk_key }}" },
                        @{ name = "jurisdiction"; value = "={{ `$json.metadata.jurisdiction }}" },
                        @{ name = "industry"; value = "={{ `$json.metadata.industry }}" },
                        @{ name = "trade_type"; value = "={{ `$json.metadata.trade_type }}" },
                        @{ name = "document_type"; value = "={{ `$json.metadata.document_type }}" },
                        @{ name = "current_version"; value = "={{ `$json.metadata.current_version }}" },
                        @{ name = "source_url"; value = "={{ `$json.metadata.source_url }}" }
                    )
                }
            }
        }
        type = "@n8n/n8n-nodes-langchain.documentDefaultDataLoader"
        typeVersion = 1.1
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

$ingestSqlCode = @'
const body = $json.body || $json || {};
const limit = Math.min(Math.max(parseInt(body.limit || '50', 10) || 50, 1), 200);
const includeEmbedded = body.include_embedded === true || body.include_embedded === 'true';
const where = includeEmbedded ? 'true' : "embedding_status in ('pending','failed')";
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
  d.authority_name
FROM authority_document_chunks c
JOIN authority_documents d ON d.authority_document_key = c.authority_document_key
WHERE ${where}
ORDER BY c.updated_at DESC, c.chunk_order
LIMIT ${limit};
`;
return [{ json: { sql } }];
'@

$normaliseChunksCode = @'
const rows = $input.all().map(item => item.json);
return rows.map(row => ({
  json: {
    page_content: [
      `Title: ${row.document_title || ''}`,
      `Authority: ${row.authority_name || ''}`,
      `Jurisdiction: ${row.jurisdiction || ''}`,
      `Industry: ${row.industry || ''}`,
      `Trade type: ${row.trade_type || ''}`,
      `Document type: ${row.document_type || ''}`,
      `Version: ${row.current_version || ''}`,
      `Effective from: ${row.effective_from || ''}`,
      `Source URL: ${row.source_url || ''}`,
      '',
      row.chunk_text || ''
    ].join('\n'),
    metadata: {
      authority_document_key: row.authority_document_key,
      chunk_key: row.chunk_key,
      jurisdiction: row.jurisdiction,
      industry: row.industry,
      trade_type: row.trade_type,
      document_type: row.document_type,
      document_title: row.document_title,
      authority_name: row.authority_name,
      risk_level: row.risk_level,
      obligation_type: row.obligation_type,
      current_version: row.current_version,
      source_url: row.source_url,
      effective_from: row.effective_from,
      effective_to: row.effective_to,
      indexed_by: 'TRADIE-CORE-022-Authority-Documents-Qdrant-Ingest'
    }
  }
}));
'@

$searchInputCode = @'
const body = $json.body || $json || {};
const query = body.query || body.question || body.search || 'authority document compliance obligations';
const jurisdiction = body.jurisdiction || 'AU';
const industry = body.industry || 'all';
const tradeType = body.trade_type || '';
const agentKey = body.agent_key || 'unknown_agent';
const limit = Math.min(Math.max(parseInt(body.limit || '8', 10) || 8, 1), 20);
return [{
  json: {
    query,
    jurisdiction,
    industry,
    trade_type: tradeType,
    agent_key: agentKey,
    limit,
    prompt: [
      `Question: ${query}`,
      `Jurisdiction: ${jurisdiction}`,
      `Industry: ${industry}`,
      `Trade type: ${tradeType}`,
      'Find relevant authority document obligations, interpretations, evidence requirements, and versioned references.'
    ].join('\n')
  }
}];
'@

$searchOutputCode = @'
const rows = $input.all().map(item => item.json);
return [{
  json: {
    success: true,
    retrieval_backend: 'qdrant',
    collection: 'authority_documents',
    result_count: rows.length,
    documents: rows,
    caution: 'Use Authority Documents as grounding references. Cite jurisdiction, version/effective date and source URL where available. Do not present interpretation as legal advice.'
}
}];
'@

$reindexSqlCode = @'
const body = $json.body || $json || {};
const limit = Math.min(Math.max(parseInt(body.limit || '500', 10) || 500, 1), 1000);
const sql = `
UPDATE authority_document_chunks
SET embedding_status = 'pending',
    embedding_provider = 'openai',
    embedding_model = 'text-embedding-3-small',
    updated_at = now()
WHERE authority_document_key IN (
  SELECT authority_document_key
  FROM authority_documents
  WHERE status = 'active'
);

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
  d.authority_name
FROM authority_document_chunks c
JOIN authority_documents d ON d.authority_document_key = c.authority_document_key
WHERE d.status = 'active'
ORDER BY c.authority_document_key, c.chunk_order
LIMIT ${limit};
`;
return [{ json: { sql } }];
'@

$markEmbeddedSqlCode = @'
const sql = `
UPDATE authority_document_chunks c
SET embedding_status = 'embedded',
    embedding_provider = 'openai',
    embedding_model = 'text-embedding-3-small',
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM authority_documents d
  WHERE d.authority_document_key = c.authority_document_key
    AND d.status = 'active'
);

SELECT jsonb_build_object(
  'success', true,
  'collection', 'authority_documents',
  'embedding_provider', 'openai',
  'embedding_model', 'text-embedding-3-small',
  'embedded_chunks', (SELECT count(*) FROM authority_document_chunks WHERE embedding_status = 'embedded'),
  'note', 'Clean semantic Qdrant reindex completed. Qdrant was recreated and active Authority Document chunks were re-embedded.'
) AS reindex_result;
`;
return [{ json: { sql } }];
'@

$registrySqlCode = @'
const sql = `
INSERT INTO mcp_services (
  service_key, service_name, provider, category, capability, endpoint_path, credential_name, status, available_to_agents, config
) VALUES (
  'authority_documents_repository',
  'Authority Documents Repository',
  '1pacent_postgres_qdrant_n8n',
  'knowledge_repository',
  'Primary semantic search and governed reference access for Authority Documents across SME agents.',
  '/webhook/core/authority-documents/qdrant/search',
  'Tradie App Postgres + Qdrant account + OpenAI account',
  'active',
  ARRAY['sparky_electrical','connie_compliance','wally_warranty','george_foreman','nelly_quote_intelligence','patricia_property_manager','quintino_skills_intelligence'],
  jsonb_build_object(
    'primary_search_endpoint', '/webhook/core/authority-documents/qdrant/search',
    'primary_retrieval_backend', 'qdrant_semantic_openai',
    'semantic_collection', 'authority_documents',
    'embedding_provider', 'openai',
    'embedding_model', 'text-embedding-3-small',
    'fallback_sql_endpoint', '/webhook/core/authority-documents/search',
    'fallback_hybrid_endpoint', '/webhook/core/authority-documents/qdrant-hybrid/search',
    'clean_reindex_endpoint', '/webhook/core/authority-documents/qdrant/reindex',
    'versioned', true,
    'modular', true,
    'paid_modules', jsonb_build_array('sparky_pro','rental_compliance')
  )
) ON CONFLICT (service_key) DO UPDATE SET
  provider = excluded.provider,
  capability = excluded.capability,
  endpoint_path = excluded.endpoint_path,
  credential_name = excluded.credential_name,
  status = excluded.status,
  available_to_agents = excluded.available_to_agents,
  config = excluded.config,
  updated_at = now();

INSERT INTO mcp_service_tools (
  service_key, tool_key, tool_name, description, endpoint_path, input_schema, output_contract, active
) VALUES
(
  'authority_documents_repository',
  'authority_documents_semantic_search',
  'Authority Documents Semantic Search',
  'Primary semantic Qdrant search for Authority Documents using OpenAI embeddings.',
  '/webhook/core/authority-documents/qdrant/search',
  '{"agent_key":"text","industry":"text","trade_type":"text","jurisdiction":"text","query":"text","limit":"number"}'::jsonb,
  '{"success":"boolean","retrieval_backend":"qdrant","documents":"array","caution":"text"}'::jsonb,
  true
),
(
  'authority_documents_repository',
  'authority_documents_clean_reindex',
  'Authority Documents Clean Reindex',
  'Delete and rebuild the semantic Qdrant Authority Documents collection from active Postgres chunks.',
  '/webhook/core/authority-documents/qdrant/reindex',
  '{"limit":"number"}'::jsonb,
  '{"success":"boolean","collection":"text","embedded_chunks":"number"}'::jsonb,
  true
),
(
  'authority_documents_repository',
  'authority_documents_hybrid_search',
  'Authority Documents Hybrid Fallback Search',
  'Fallback Qdrant hash-vector search when semantic embeddings are unavailable.',
  '/webhook/core/authority-documents/qdrant-hybrid/search',
  '{"agent_key":"text","industry":"text","trade_type":"text","jurisdiction":"text","query":"text","limit":"number"}'::jsonb,
  '{"success":"boolean","retrieval_backend":"qdrant_hybrid_hash_v1","documents":"array","caution":"text"}'::jsonb,
  true
)
ON CONFLICT (tool_key) DO UPDATE SET
  description = excluded.description,
  endpoint_path = excluded.endpoint_path,
  input_schema = excluded.input_schema,
  output_contract = excluded.output_contract,
  active = true,
  updated_at = now();

SELECT jsonb_build_object(
  'success', true,
  'service_key', 'authority_documents_repository',
  'primary_search_endpoint', '/webhook/core/authority-documents/qdrant/search',
  'fallback_sql_endpoint', '/webhook/core/authority-documents/search',
  'fallback_hybrid_endpoint', '/webhook/core/authority-documents/qdrant-hybrid/search',
  'clean_reindex_endpoint', '/webhook/core/authority-documents/qdrant/reindex'
) AS registry_update;
`;
return [{ json: { sql } }];
'@

$ingestNodes = @(
    (New-WebhookNode "Authority Qdrant Ingest Webhook" "core/authority-documents/qdrant/ingest" "POST" 0 0),
    (New-CodeNode "Build Chunk Select SQL" $ingestSqlCode 240 0),
    (New-PostgresNode "Fetch Authority Chunks" 500 0),
    (New-CodeNode "Prepare Documents For Qdrant" $normaliseChunksCode 760 0),
    (New-QdrantVectorNode "Insert Authority Documents Into Qdrant" "insert" 1040 0),
    (New-RespondNode "Return Ingest Result" '={{ JSON.stringify({success:true, collection:"authority_documents", output:$json}) }}' 1320 0),
    (New-OpenAiEmbeddingsNode "Embeddings OpenAI" 1040 260),
    (New-DefaultDataLoaderNode "Default Data Loader" 1040 440)
)

$ingestConnections = @{
    "Authority Qdrant Ingest Webhook" = @{ main = @(, @(@{ node = "Build Chunk Select SQL"; type = "main"; index = 0 })) }
    "Build Chunk Select SQL" = @{ main = @(, @(@{ node = "Fetch Authority Chunks"; type = "main"; index = 0 })) }
    "Fetch Authority Chunks" = @{ main = @(, @(@{ node = "Prepare Documents For Qdrant"; type = "main"; index = 0 })) }
    "Prepare Documents For Qdrant" = @{ main = @(, @(@{ node = "Insert Authority Documents Into Qdrant"; type = "main"; index = 0 })) }
    "Insert Authority Documents Into Qdrant" = @{ main = @(, @(@{ node = "Return Ingest Result"; type = "main"; index = 0 })) }
    "Embeddings OpenAI" = @{ ai_embedding = @(, @(@{ node = "Insert Authority Documents Into Qdrant"; type = "ai_embedding"; index = 0 })) }
    "Default Data Loader" = @{ ai_document = @(, @(@{ node = "Insert Authority Documents Into Qdrant"; type = "ai_document"; index = 0 })) }
}

$searchNodes = @(
    (New-WebhookNode "Authority Qdrant Search Webhook" "core/authority-documents/qdrant/search" "POST" 0 0),
    (New-CodeNode "Prepare Qdrant Search Input" $searchInputCode 240 0),
    (New-QdrantVectorNode "Search Authority Documents In Qdrant" "load" 520 0 '={{ $json.prompt }}'),
    (New-CodeNode "Format Qdrant Search Results" $searchOutputCode 800 0),
    (New-RespondNode "Return Qdrant Search Results" '={{ JSON.stringify($json) }}' 1060 0),
    (New-OpenAiEmbeddingsNode "Embeddings OpenAI Search" 520 260)
)

$searchConnections = @{
    "Authority Qdrant Search Webhook" = @{ main = @(, @(@{ node = "Prepare Qdrant Search Input"; type = "main"; index = 0 })) }
    "Prepare Qdrant Search Input" = @{ main = @(, @(@{ node = "Search Authority Documents In Qdrant"; type = "main"; index = 0 })) }
    "Search Authority Documents In Qdrant" = @{ main = @(, @(@{ node = "Format Qdrant Search Results"; type = "main"; index = 0 })) }
    "Format Qdrant Search Results" = @{ main = @(, @(@{ node = "Return Qdrant Search Results"; type = "main"; index = 0 })) }
    "Embeddings OpenAI Search" = @{ ai_embedding = @(, @(@{ node = "Search Authority Documents In Qdrant"; type = "ai_embedding"; index = 0 })) }
}

$reindexNodes = @(
    (New-WebhookNode "Authority Qdrant Reindex Webhook" "core/authority-documents/qdrant/reindex" "POST" 0 0),
    (New-HttpNode "Delete Authority Documents Collection" "DELETE" "http://qdrant:6333/collections/authority_documents" "" 240 -160 $true),
    (New-CodeNode "Build Reindex Select SQL" $reindexSqlCode 240 0),
    (New-PostgresNode "Fetch Reindex Chunks" 500 0),
    (New-CodeNode "Prepare Reindex Documents" $normaliseChunksCode 760 0),
    (New-QdrantVectorNode "Insert Reindex Documents Into Qdrant" "insert" 1040 0),
    (New-CodeNode "Build Mark Embedded SQL" $markEmbeddedSqlCode 1280 0),
    (New-PostgresNode "Mark Authority Chunks Embedded" 1520 0),
    (New-RespondNode "Return Reindex Result" '={{ JSON.stringify($json.reindex_result || $json) }}' 1780 0),
    (New-OpenAiEmbeddingsNode "Embeddings OpenAI Reindex" 1040 260),
    (New-DefaultDataLoaderNode "Default Data Loader Reindex" 1040 440)
)

$reindexConnections = @{
    "Authority Qdrant Reindex Webhook" = @{ main = @(, @(@{ node = "Delete Authority Documents Collection"; type = "main"; index = 0 })) }
    "Delete Authority Documents Collection" = @{ main = @(, @(@{ node = "Build Reindex Select SQL"; type = "main"; index = 0 })) }
    "Build Reindex Select SQL" = @{ main = @(, @(@{ node = "Fetch Reindex Chunks"; type = "main"; index = 0 })) }
    "Fetch Reindex Chunks" = @{ main = @(, @(@{ node = "Prepare Reindex Documents"; type = "main"; index = 0 })) }
    "Prepare Reindex Documents" = @{ main = @(, @(@{ node = "Insert Reindex Documents Into Qdrant"; type = "main"; index = 0 })) }
    "Insert Reindex Documents Into Qdrant" = @{ main = @(, @(@{ node = "Build Mark Embedded SQL"; type = "main"; index = 0 })) }
    "Build Mark Embedded SQL" = @{ main = @(, @(@{ node = "Mark Authority Chunks Embedded"; type = "main"; index = 0 })) }
    "Mark Authority Chunks Embedded" = @{ main = @(, @(@{ node = "Return Reindex Result"; type = "main"; index = 0 })) }
    "Embeddings OpenAI Reindex" = @{ ai_embedding = @(, @(@{ node = "Insert Reindex Documents Into Qdrant"; type = "ai_embedding"; index = 0 })) }
    "Default Data Loader Reindex" = @{ ai_document = @(, @(@{ node = "Insert Reindex Documents Into Qdrant"; type = "ai_document"; index = 0 })) }
}

$registryNodes = @(
    (New-WebhookNode "Authority Registry Update Webhook" "core/authority-documents/registry/update" "POST" 0 0),
    (New-CodeNode "Build Registry Update SQL" $registrySqlCode 260 0),
    (New-PostgresNode "Update Authority Registry" 520 0),
    (New-RespondNode "Return Registry Update" '={{ JSON.stringify($json.registry_update || $json) }}' 780 0)
)

$registryConnections = @{
    "Authority Registry Update Webhook" = @{ main = @(, @(@{ node = "Build Registry Update SQL"; type = "main"; index = 0 })) }
    "Build Registry Update SQL" = @{ main = @(, @(@{ node = "Update Authority Registry"; type = "main"; index = 0 })) }
    "Update Authority Registry" = @{ main = @(, @(@{ node = "Return Registry Update"; type = "main"; index = 0 })) }
}

$ingestWorkflow = Upsert-WorkflowByName "TRADIE-CORE-022-Authority-Documents-Qdrant-Ingest" $ingestNodes $ingestConnections
$searchWorkflow = Upsert-WorkflowByName "TRADIE-CORE-023-Authority-Documents-Qdrant-Search" $searchNodes $searchConnections
$reindexWorkflow = Upsert-WorkflowByName "TRADIE-CORE-026-Authority-Documents-Qdrant-Clean-Reindex" $reindexNodes $reindexConnections
$registryWorkflow = Upsert-WorkflowByName "TRADIE-CORE-027-Authority-Documents-Registry-Primary" $registryNodes $registryConnections

Write-Host "Deployed Authority Qdrant RAG workflows:"
Write-Host "- $($ingestWorkflow.name) [$($ingestWorkflow.id)]"
Write-Host "- $($searchWorkflow.name) [$($searchWorkflow.id)]"
Write-Host "- $($reindexWorkflow.name) [$($reindexWorkflow.id)]"
Write-Host "- $($registryWorkflow.name) [$($registryWorkflow.id)]"
Write-Host ""
Write-Host "Ingest:"
Write-Host "POST $BaseUrl/webhook/core/authority-documents/qdrant/ingest"
Write-Host ""
Write-Host "Search:"
Write-Host "POST $BaseUrl/webhook/core/authority-documents/qdrant/search"
Write-Host ""
Write-Host "Clean reindex:"
Write-Host "POST $BaseUrl/webhook/core/authority-documents/qdrant/reindex"
Write-Host ""
Write-Host "Registry update:"
Write-Host "POST $BaseUrl/webhook/core/authority-documents/registry/update"
