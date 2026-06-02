$ErrorActionPreference = "Stop"

$outputDir = Join-Path $PSScriptRoot "n8n-workflows"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

function New-Id {
    param([string]$Seed)
    $md5 = [System.Security.Cryptography.MD5]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Seed)
    $hash = $md5.ComputeHash($bytes)
    $hex = -join ($hash | ForEach-Object { $_.ToString("x2") })
    return "{0}-{1}-{2}-{3}-{4}" -f $hex.Substring(0,8), $hex.Substring(8,4), $hex.Substring(12,4), $hex.Substring(16,4), $hex.Substring(20,12)
}

function ConvertTo-Slug {
    param([string]$Text)
    return (($Text.ToLowerInvariant() -replace '[^a-z0-9]+','-') -replace '(^-|-$)','')
}

$sharedWorkflows = @(
    @{ Name = "TRADIE-CORE-001-Validate-Payload"; Capability = "Payload validation"; Path = "/core/validate-payload"; Agent = "Oscar"; Steps = @("Check required fields", "Reject incomplete requests", "Return validation summary") },
    @{ Name = "TRADIE-CORE-002-Load-Tenant-Config"; Capability = "Tenant configuration"; Path = "/core/load-tenant-config"; Agent = "Oscar"; Steps = @("Validate tenant_id", "Load business settings", "Load agents, calendar rules, and invoice settings") },
    @{ Name = "TRADIE-CORE-003-Load-Customer-Profile"; Capability = "Customer profile lookup"; Path = "/core/load-customer-profile"; Agent = "Oscar"; Steps = @("Validate customer identifier", "Retrieve customer history", "Return address, prior jobs, and ratings") },
    @{ Name = "TRADIE-CORE-004-Load-Tradie-Profile"; Capability = "Tradie profile lookup"; Path = "/core/load-tradie-profile"; Agent = "Oscar"; Steps = @("Validate tradie identifier", "Retrieve tradie/team profile", "Return skills and certifications") },
    @{ Name = "TRADIE-CORE-005-Write-Audit-Log"; Capability = "Workflow audit logging"; Path = "/core/write-audit-log"; Agent = "Oscar"; Steps = @("Capture workflow action", "Attach entity references", "Persist audit log placeholder") },
    @{ Name = "TRADIE-CORE-006-Notify-Customer"; Capability = "Customer notifications"; Path = "/core/notify-customer"; Agent = "Nora"; Steps = @("Validate destination", "Prepare SMS/email/app message", "Return notification intent") },
    @{ Name = "TRADIE-CORE-007-Notify-Tradie"; Capability = "Tradie notifications"; Path = "/core/notify-tradie"; Agent = "Nora"; Steps = @("Validate tradie destination", "Prepare app/Telegram/SMS message", "Return notification intent") },
    @{ Name = "TRADIE-CORE-008-Generate-Internal-Reference"; Capability = "Internal reference generation"; Path = "/core/generate-internal-reference"; Agent = "Oscar"; Steps = @("Read reference type", "Generate internal reference", "Return vendor-neutral ID") },
    @{ Name = "TRADIE-CORE-009-Agent-Memory-Load"; Capability = "Agent memory load"; Path = "/core/agent-memory-load"; Agent = "Oscar"; Steps = @("Validate context references", "Load conversation/job context", "Return memory bundle") },
    @{ Name = "TRADIE-CORE-010-Agent-Memory-Save"; Capability = "Agent memory save"; Path = "/core/agent-memory-save"; Agent = "Oscar"; Steps = @("Capture agent interaction", "Capture decision trail", "Persist memory placeholder") }
)

$moduleWorkflows = @(
    @{ Name = "TRADIE-TRUST-070-Generate-Customer-Passport"; Capability = "Customer Trust Passport"; Path = "/trust/passport/generate"; Agent = "Rita"; Required = @("tenant_id","tradie_id","customer_id","lead_id"); Entity = "trust_passport"; Steps = @("Validate payload", "Load tenant profile", "Load tradie/business profile", "Load certifications", "Load insurance status", "Load ratings and similar jobs", "Calculate trust score", "Generate customer-facing passport", "Store passport against lead") },
    @{ Name = "TRADIE-LEADS-010-Capture-New-Lead"; Capability = "Lead Capture"; Path = "/leads/capture"; Agent = "Sally"; Required = @("tenant_id","channel","customer","job_request","consent"); Entity = "lead"; Steps = @("Validate consent", "Generate lead ID", "Check existing customer", "Create or update customer", "Classify job category", "Identify missing information", "Score lead quality", "Generate customer acknowledgement", "Notify Sally", "Store lead") },
    @{ Name = "TRADIE-LEADS-011-Qualify-Lead"; Capability = "Lead Qualification"; Path = "/leads/qualify"; Agent = "Sally"; Required = @("tenant_id","lead_id"); Entity = "lead_qualification"; Steps = @("Load lead", "Review customer request", "Identify missing detail", "Ask next best question", "Update quote readiness", "Return qualification summary") },
    @{ Name = "TRADIE-QUOTES-020-Generate-Estimate"; Capability = "Estimate and Quote Generation"; Path = "/quotes/generate-estimate"; Agent = "Nelly"; Required = @("tenant_id","lead_id","job_request"); Entity = "quote"; Steps = @("Validate quote inputs", "Load tenant pricing rules", "Estimate labour", "Estimate materials", "Calculate margin", "Create assumptions", "Flag risks", "Generate quote draft", "Return quote summary") },
    @{ Name = "TRADIE-QUOTES-025-Approve-Quote-Convert-To-Job"; Capability = "Quote Approval and Conversion to Job"; Path = "/quotes/approve"; Agent = "Sally"; Required = @("tenant_id","quote_id","customer_approved"); Entity = "job"; Steps = @("Validate quote approval", "Load quote", "Create job reference", "Convert accepted quote to job", "Notify tradie", "Notify customer", "Return job summary") },
    @{ Name = "TRADIE-SCHEDULE-030-Book-Job"; Capability = "Scheduling and Calendar Optimisation"; Path = "/schedule/book-job"; Agent = "George Foreman"; Required = @("tenant_id","job_id","preferred_times"); Entity = "calendar_event"; Steps = @("Validate job and preferred times", "Load calendar rules", "Check calendar availability", "Score travel and urgency", "Recommend booking slot", "Create calendar event placeholder", "Notify customer and tradie") },
    @{ Name = "TRADIE-SCHEDULE-031-Daily-Foreman-Brief"; Capability = "Daily Foreman Brief"; Path = "/schedule/daily-brief"; Agent = "George Foreman"; Required = @("tenant_id","work_date"); Entity = "daily_brief"; Steps = @("Load jobs for day", "Load addresses and notes", "Check required parts", "Check compliance requirements", "Summarise route and risks", "Send brief to tradie") },
    @{ Name = "TRADIE-JOBS-040-Start-Job"; Capability = "Job Start"; Path = "/jobs/start"; Agent = "George Foreman"; Required = @("tenant_id","job_id"); Entity = "job_start"; Steps = @("Validate job", "Record arrival/start time", "Load job notes", "Open checklist", "Notify customer", "Return start confirmation") },
    @{ Name = "TRADIE-KNOWLEDGE-080-SME-Assistant"; Capability = "AI Subject Matter Expert Support"; Path = "/knowledge/sme-assistant"; Agent = "Athena"; Required = @("tenant_id","question"); Entity = "knowledge_answer"; Steps = @("Validate question", "Load trade context", "Search knowledge base placeholder", "Generate guidance", "Flag uncertainty and compliance limits", "Return answer") },
    @{ Name = "TRADIE-JOBS-041-Capture-Job-Evidence"; Capability = "Job Evidence Capture"; Path = "/jobs/evidence/capture"; Agent = "Connie"; Required = @("tenant_id","job_id","evidence"); Entity = "job_evidence"; Steps = @("Validate evidence payload", "Generate evidence reference", "Classify photos/notes", "Attach to job", "Update compliance checklist", "Return evidence summary") },
    @{ Name = "TRADIE-JOBS-042-Manage-Variation"; Capability = "Variation Management"; Path = "/jobs/variations/manage"; Agent = "Nelly"; Required = @("tenant_id","job_id","variation"); Entity = "job_variation"; Steps = @("Validate variation", "Estimate added labour/materials", "Create variation summary", "Request customer approval", "Update job and quote records") },
    @{ Name = "TRADIE-MATERIALS-043-Manage-Materials-Inventory"; Capability = "Materials and Inventory"; Path = "/materials/inventory/manage"; Agent = "Max"; Required = @("tenant_id","job_id"); Entity = "job_materials"; Steps = @("Load job materials", "Check stock placeholder", "Identify supplier lookup needs", "Record parts used", "Update material cost estimate", "Return materials summary") },
    @{ Name = "TRADIE-JOBS-045-Complete-Job"; Capability = "Job Completion"; Path = "/jobs/complete"; Agent = "George Foreman"; Required = @("tenant_id","job_id"); Entity = "job_completion"; Steps = @("Validate completion request", "Check required evidence", "Capture completion notes", "Confirm parts and time", "Prepare invoice handoff", "Notify customer") },
    @{ Name = "TRADIE-INVOICE-050-Prepare-Invoice"; Capability = "Invoice Preparation"; Path = "/invoice/prepare"; Agent = "Envy"; Required = @("tenant_id","job_id"); Entity = "invoice"; Steps = @("Load completed job", "Validate approved quote and variations", "Validate time and materials", "Create invoice reference", "Build invoice line items", "Prepare accounting export placeholder", "Return invoice draft") },
    @{ Name = "TRADIE-TRUST-071-Customer-Review-Reputation-Loop"; Capability = "Customer Review and Reputation Loop"; Path = "/trust/reviews/request"; Agent = "Rita"; Required = @("tenant_id","job_id","customer_id"); Entity = "customer_review_request"; Steps = @("Validate completed job", "Prepare review request", "Send customer follow-up", "Track review status", "Update reputation metrics placeholder") },
    @{ Name = "TRADIE-BAS-060-Prepare-BAS-Pack"; Capability = "BAS and Tax Preparation Pack"; Path = "/bas/prepare-pack"; Agent = "Barry"; Required = @("tenant_id","period_start","period_end"); Entity = "bas_pack"; Steps = @("Validate BAS period", "Collect invoice records", "Collect payment records", "Classify tax categories", "Summarise GST and income", "Prepare accountant handover") },
    @{ Name = "TRADIE-COMMS-090-Customer-Communication-Hub"; Capability = "Customer Communication Hub"; Path = "/comms/customer-hub"; Agent = "Nora"; Required = @("tenant_id","customer_id","message_type"); Entity = "customer_message"; Steps = @("Validate communication request", "Load customer preferences", "Prepare channel-specific message", "Send notification placeholder", "Save communication record") },
    @{ Name = "TRADIE-CORE-000-Orchestrator"; Capability = "Orchestrator"; Path = "/orchestrator/intake"; Agent = "Oscar"; Required = @("tenant_id","event_type"); Entity = "orchestration_result"; Steps = @("Receive app/voice/webhook event", "Validate payload", "Load tenant config", "Route by business capability", "Prepare sub-workflow invocation", "Write audit log", "Return routing decision") },
    @{ Name = "TRADIE-QUOTES-021-Quote-Accuracy-Learning-Loop"; Capability = "Quote Accuracy Learning Loop"; Path = "/quotes/accuracy/learn"; Agent = "Nelly"; Required = @("tenant_id","job_id","quote_id"); Entity = "quote_accuracy_record"; Steps = @("Load original quote", "Load actual job time and materials", "Compare estimate to actual", "Calculate quote accuracy", "Store learning signal", "Update pricing guidance placeholder") },
    @{ Name = "TRADIE-SMB-100-Small-Business-Module-Expansion"; Capability = "Small Business Module Expansion"; Path = "/smb/module-expansion"; Agent = "Oscar"; Required = @("tenant_id","module_request"); Entity = "small_business_module"; Steps = @("Validate module request", "Classify capability", "Check tenant eligibility", "Prepare implementation task list", "Return expansion summary") }
)

function New-Code {
    param([hashtable]$Workflow)
    $required = ($Workflow.Required | ForEach-Object { "'$_'" }) -join ", "
    $steps = ($Workflow.Steps | ForEach-Object { "'$_'" }) -join ", "
    $entity = if ($Workflow.Entity) { $Workflow.Entity } else { "core_result" }

    $template = @'
const body = items[0]?.json?.body ?? items[0]?.json ?? {};
const required = [__REQUIRED__];
const missing = required.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
const now = new Date().toISOString();
const referencePrefix = '__REFERENCE_PREFIX__';
const sequence = Math.floor(Date.now() / 1000).toString().slice(-6);

const result = {
  workflow: '__WORKFLOW_NAME__',
  status: missing.length ? 'needs_input' : 'ready_for_integration',
  capability: '__CAPABILITY__',
  agent: '__AGENT__',
  received_at: now,
  missing_fields: missing,
  reference: `${referencePrefix}-${new Date().getFullYear()}-${sequence}`,
  deterministic_steps: [__STEPS__],
  data_contract: {
    required_fields: required,
    received_fields: Object.keys(body),
  },
  integration_notes: [
    'Replace this Code node with database/API nodes as services are connected.',
    'Use Supabase/Postgres as the source of truth for tenant, customer, job, quote, invoice, and audit records.',
    'Keep generated IDs vendor-neutral and map external system IDs separately.',
  ],
  payload: body,
};

return [{ json: result }];
'@

    return $template.
        Replace("__REQUIRED__", $required).
        Replace("__REFERENCE_PREFIX__", ($entity.ToUpperInvariant() -replace '[^A-Z0-9]+','_')).
        Replace("__WORKFLOW_NAME__", $Workflow.Name).
        Replace("__CAPABILITY__", $Workflow.Capability).
        Replace("__AGENT__", $Workflow.Agent).
        Replace("__STEPS__", $steps)
}

function New-Workflow {
    param([hashtable]$Workflow)
    $webhookId = New-Id "$($Workflow.Name)-webhook"
    $codeId = New-Id "$($Workflow.Name)-code"
    $respondId = New-Id "$($Workflow.Name)-respond"
    $path = ($Workflow.Path.TrimStart("/") -replace '^webhook/','')
    $code = New-Code $Workflow

    return [ordered]@{
        name = $Workflow.Name
        nodes = @(
            [ordered]@{
                parameters = [ordered]@{
                    httpMethod = "POST"
                    path = $path
                    responseMode = "responseNode"
                    options = [ordered]@{}
                }
                type = "n8n-nodes-base.webhook"
                typeVersion = 2.1
                position = @(0,0)
                id = $webhookId
                name = "Webhook"
                webhookId = $webhookId
            },
            [ordered]@{
                parameters = [ordered]@{ jsCode = $code }
                type = "n8n-nodes-base.code"
                typeVersion = 2
                position = @(260,0)
                id = $codeId
                name = "Build Workflow Response"
            },
            [ordered]@{
                parameters = [ordered]@{ options = [ordered]@{} }
                type = "n8n-nodes-base.respondToWebhook"
                typeVersion = 1.5
                position = @(520,0)
                id = $respondId
                name = "Respond to Webhook"
            }
        )
        pinData = [ordered]@{}
        connections = [ordered]@{
            "Webhook" = [ordered]@{ main = @(, @([ordered]@{ node = "Build Workflow Response"; type = "main"; index = 0 })) }
            "Build Workflow Response" = [ordered]@{ main = @(, @([ordered]@{ node = "Respond to Webhook"; type = "main"; index = 0 })) }
        }
        active = $false
        settings = [ordered]@{ executionOrder = "v1" }
        versionId = New-Id "$($Workflow.Name)-version"
        meta = [ordered]@{
            templateCredsSetupCompleted = $true
            tradieAppGenerated = $true
            generatedFrom = "ChatGPT shared developer requirements"
        }
        tags = @("tradie-app", "generated", (ConvertTo-Slug $Workflow.Capability))
    }
}

$all = @()
$all += $sharedWorkflows
$all += $moduleWorkflows

foreach ($workflow in $all) {
    $export = New-Workflow $workflow
    $fileName = "$(ConvertTo-Slug $workflow.Name).json"
    $filePath = Join-Path $outputDir $fileName
    $json = $export | ConvertTo-Json -Depth 30
    Set-Content -LiteralPath $filePath -Value $json -Encoding UTF8
}

$manifest = [ordered]@{
    generated_at = (Get-Date).ToString("o")
    workflow_count = $all.Count
    output_directory = $outputDir
    workflows = $all | ForEach-Object {
        [ordered]@{
            name = $_.Name
            file = "$(ConvertTo-Slug $_.Name).json"
            webhook_path = $_.Path
            capability = $_.Capability
            agent = $_.Agent
        }
    }
}

$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outputDir "manifest.json") -Encoding UTF8
"Generated $($all.Count) n8n workflow JSON files in $outputDir"
