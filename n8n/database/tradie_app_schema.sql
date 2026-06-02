create extension if not exists pgcrypto;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  email_confirmed boolean not null default false,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email),
  unique (phone)
);

create table if not exists leads (
  id text primary key,
  customer_id uuid references customers(id),
  tenant_id text not null default 'TENANT-001',
  source text,
  trade_type text,
  job_description text,
  urgency text,
  address text,
  preferred_time text,
  estimated_price_band text,
  status text not null,
  lead_quality_score integer,
  consent_status text,
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quotes (
  id text primary key,
  lead_id text references leads(id),
  customer_id uuid references customers(id),
  status text not null,
  original_amount text,
  current_amount text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quote_versions (
  id text primary key,
  quote_id text references quotes(id),
  lead_id text references leads(id),
  version_number integer not null default 1,
  amount text,
  reason text,
  inclusions text,
  exclusions text,
  acceptance_url text,
  status text not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id text primary key,
  lead_id text references leads(id),
  quote_id text references quotes(id),
  customer_id uuid references customers(id),
  status text not null,
  scheduled_window text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text,
  quantity_on_hand numeric not null default 0,
  reorder_level numeric not null default 0,
  unit_cost numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_materials (
  id uuid primary key default gen_random_uuid(),
  job_id text references jobs(id),
  inventory_item_id uuid references inventory_items(id),
  description text not null,
  quantity numeric,
  unit_cost numeric,
  total_cost numeric,
  created_at timestamptz not null default now()
);

create table if not exists invoices (
  id text primary key,
  job_id text references jobs(id),
  quote_id text references quotes(id),
  customer_id uuid references customers(id),
  status text not null,
  amount text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_requests (
  id text primary key,
  invoice_id text references invoices(id),
  job_id text references jobs(id),
  quote_id text references quotes(id),
  customer_id uuid references customers(id),
  amount numeric,
  currency text not null default 'AUD',
  status text not null default 'payment_requested',
  provider text not null default 'internal_placeholder',
  payment_url text,
  due_at timestamptz,
  sent_at timestamptz,
  paid_at timestamptz,
  reminder_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_request_id text references payment_requests(id),
  invoice_id text references invoices(id),
  event_type text not null,
  provider text,
  amount numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists customer_media_permissions (
  id uuid primary key default gen_random_uuid(),
  job_id text references jobs(id),
  customer_id uuid references customers(id),
  permission_status text not null default 'not_requested',
  approved_media_urls text[] not null default '{}',
  restrictions text,
  approved_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists social_campaigns (
  id text primary key,
  job_id text references jobs(id),
  lead_id text references leads(id),
  customer_id uuid references customers(id),
  campaign_type text not null default 'completed_job_story',
  status text not null default 'draft',
  approval_status text not null default 'approval_required',
  platforms text[] not null default '{}',
  content jsonb not null default '{}'::jsonb,
  created_by_agent text not null default 'mia_social',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists social_posts (
  id text primary key,
  campaign_id text references social_campaigns(id),
  platform text not null,
  status text not null default 'draft',
  caption text,
  media_urls text[] not null default '{}',
  customer_approved boolean not null default false,
  approval_required boolean not null default true,
  scheduled_for timestamptz,
  published_at timestamptz,
  external_post_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists review_requests (
  id text primary key,
  job_id text references jobs(id),
  customer_id uuid references customers(id),
  status text not null default 'requested',
  channel text not null default 'email',
  review_url text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_interactions (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  customer_id uuid references customers(id),
  lead_id text references leads(id),
  conversation_id text,
  transcript text,
  summary text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists workflow_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_definitions (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null unique,
  agent_name text not null,
  agent_role text not null,
  purpose text,
  operating_scope text,
  customer_facing boolean not null default false,
  owner_domain text,
  responsibilities jsonb not null default '[]'::jsonb,
  success_measures jsonb not null default '[]'::jsonb,
  handoff_triggers jsonb not null default '[]'::jsonb,
  guardrails jsonb not null default '[]'::jsonb,
  model_provider text not null default 'google_gemini',
  model_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_business_rules (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_definitions(agent_key),
  rule_group text not null,
  rule_order integer not null default 100,
  rule_text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null,
  agent_name text not null,
  conversation_id text,
  customer_id uuid references customers(id),
  lead_id text references leads(id),
  job_id text references jobs(id),
  memory_type text not null default 'interaction',
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_knowledge_collections (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_definitions(agent_key),
  collection_key text not null,
  collection_name text not null,
  capability text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_key, collection_key)
);

create table if not exists agent_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_definitions(agent_key),
  collection_key text not null,
  source_type text not null default 'manual',
  source_id text,
  title text not null,
  content text not null,
  tags text[] not null default '{}',
  trade_type text,
  entity_type text,
  entity_id text,
  confidence numeric not null default 0.7,
  usefulness_score numeric not null default 0,
  payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mcp_services (
  id uuid primary key default gen_random_uuid(),
  service_key text not null unique,
  service_name text not null,
  provider text not null,
  category text not null,
  capability text not null,
  endpoint_path text,
  workflow_id text,
  credential_name text,
  status text not null default 'active',
  available_to_agents text[] not null default '{}',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mcp_service_tools (
  id uuid primary key default gen_random_uuid(),
  service_key text not null references mcp_services(service_key),
  tool_key text not null unique,
  tool_name text not null,
  description text not null,
  endpoint_path text,
  workflow_id text,
  input_schema jsonb not null default '{}'::jsonb,
  output_contract jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists business_skills (
  id uuid primary key default gen_random_uuid(),
  skill_key text not null unique,
  skill_name text not null,
  capability text not null,
  category text not null,
  description text not null,
  best_practice text not null,
  guardrails text,
  inputs jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  owner_agent_key text references agent_definitions(agent_key),
  version integer not null default 1,
  status text not null default 'active',
  tags text[] not null default '{}',
  source_type text not null default 'manual',
  source_id text,
  usefulness_score numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_skill_assignments (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_definitions(agent_key),
  skill_key text not null references business_skills(skill_key),
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_key, skill_key)
);

create table if not exists skill_usage_events (
  id uuid primary key default gen_random_uuid(),
  skill_key text references business_skills(skill_key),
  agent_key text,
  entity_type text,
  entity_id text,
  event_type text not null,
  outcome text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists business_skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_key text not null references business_skills(skill_key),
  version integer not null,
  skill_name text not null,
  capability text not null,
  category text not null,
  description text not null,
  best_practice text not null,
  guardrails text,
  inputs jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  status text not null default 'archived',
  change_reason text,
  created_by_agent_key text references agent_definitions(agent_key),
  approved_by text,
  promoted_at timestamptz,
  archived_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (skill_key, version)
);

create table if not exists skill_improvement_recommendations (
  id uuid primary key default gen_random_uuid(),
  recommendation_key text not null unique,
  owner_agent_key text references agent_definitions(agent_key),
  target_skill_key text,
  target_workflow_id text,
  recommendation_type text not null,
  priority text not null default 'medium',
  title text not null,
  evidence_summary text not null,
  recommended_change text not null,
  expected_customer_impact text,
  expected_cost_impact text,
  status text not null default 'proposed',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quintino_audit_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null unique,
  scope text not null default 'all_agents',
  metrics jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  template_name text not null,
  owner_agent_key text references agent_definitions(agent_key),
  channel text not null default 'email',
  purpose text not null,
  audience text not null default 'customer',
  subject_template text not null,
  body_template text not null,
  variables_schema jsonb not null default '{}'::jsonb,
  variant_rules jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  status text not null default 'active',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists message_template_variants (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references message_templates(template_key),
  variant_key text not null,
  trade_type text,
  job_type text,
  customer_segment text,
  priority integer not null default 100,
  subject_template text not null,
  body_template text not null,
  variables_schema jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  status text not null default 'active',
  active boolean not null default true,
  change_reason text,
  created_by_agent_key text references agent_definitions(agent_key),
  approved_by text,
  promoted_at timestamptz,
  archived_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_key, variant_key)
);

create table if not exists message_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references message_templates(template_key),
  variant_key text not null default 'default',
  version integer not null,
  template_name text not null,
  owner_agent_key text references agent_definitions(agent_key),
  channel text not null,
  purpose text not null,
  audience text not null,
  subject_template text not null,
  body_template text not null,
  variables_schema jsonb not null default '{}'::jsonb,
  variant_rules jsonb not null default '{}'::jsonb,
  trade_type text,
  job_type text,
  customer_segment text,
  status text not null default 'proposed',
  change_reason text,
  created_by_agent_key text references agent_definitions(agent_key),
  reviewed_by_agent_key text references agent_definitions(agent_key),
  approved_by text,
  promoted_at timestamptz,
  archived_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (template_key, variant_key, version)
);

create table if not exists message_template_usage_events (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  variant_key text,
  version integer,
  owner_agent_key text,
  entity_type text,
  entity_id text,
  channel text,
  outcome text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_customer_id on leads(customer_id);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_quotes_lead_id on quotes(lead_id);
create index if not exists idx_quote_versions_quote_id on quote_versions(quote_id);
create index if not exists idx_jobs_lead_id on jobs(lead_id);
create index if not exists idx_invoices_job_id on invoices(job_id);
create index if not exists idx_payment_requests_invoice_id on payment_requests(invoice_id);
create index if not exists idx_payment_requests_status on payment_requests(status, due_at);
create index if not exists idx_payment_events_payment_request_id on payment_events(payment_request_id, created_at desc);
create index if not exists idx_customer_media_permissions_job on customer_media_permissions(job_id, permission_status);
create index if not exists idx_social_campaigns_job on social_campaigns(job_id, status);
create index if not exists idx_social_posts_campaign on social_posts(campaign_id, status);
create index if not exists idx_review_requests_job on review_requests(job_id, status);
create index if not exists idx_workflow_events_entity on workflow_events(entity_type, entity_id);
create index if not exists idx_agent_interactions_lead_id on agent_interactions(lead_id);
create index if not exists idx_agent_business_rules_agent_key on agent_business_rules(agent_key, active, rule_order);
create index if not exists idx_agent_memory_agent_key on agent_memory(agent_key, lead_id, created_at desc);
create index if not exists idx_agent_knowledge_collections_agent_key on agent_knowledge_collections(agent_key, active);
create index if not exists idx_agent_knowledge_items_agent_key on agent_knowledge_items(agent_key, collection_key, active, updated_at desc);
create index if not exists idx_agent_knowledge_items_entity on agent_knowledge_items(entity_type, entity_id);
create index if not exists idx_mcp_services_category on mcp_services(category, status);
create index if not exists idx_mcp_service_tools_service_key on mcp_service_tools(service_key, active);
create index if not exists idx_business_skills_category on business_skills(category, status);
create index if not exists idx_business_skills_owner_agent on business_skills(owner_agent_key, status);
create index if not exists idx_agent_skill_assignments_agent on agent_skill_assignments(agent_key, active);
create index if not exists idx_skill_usage_events_skill on skill_usage_events(skill_key, created_at desc);
create index if not exists idx_business_skill_versions_skill on business_skill_versions(skill_key, version desc);
create index if not exists idx_business_skill_versions_status on business_skill_versions(status);
create index if not exists idx_skill_recommendations_status on skill_improvement_recommendations(status, priority);
create index if not exists idx_quintino_audit_snapshots_created on quintino_audit_snapshots(created_at desc);
create index if not exists idx_message_templates_owner on message_templates(owner_agent_key, status, active);
create index if not exists idx_message_template_variants_lookup on message_template_variants(template_key, active, trade_type, job_type, customer_segment, priority);
create index if not exists idx_message_template_versions_key on message_template_versions(template_key, variant_key, version desc);
create index if not exists idx_message_template_usage_key on message_template_usage_events(template_key, created_at desc);

create table if not exists tradie_companies (
  id text primary key,
  name text not null,
  calendar_id text,
  max_tradies_per_job integer not null default 5,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tradies (
  id text primary key,
  company_id text references tradie_companies(id),
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

create table if not exists tradie_commercial_terms (
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

create table if not exists tradie_job_offer_overrides (
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

create table if not exists tradie_skills (
  id uuid primary key default gen_random_uuid(),
  tradie_id text references tradies(id),
  trade_type text not null,
  skill_name text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists tradie_availability (
  id uuid primary key default gen_random_uuid(),
  tradie_id text references tradies(id),
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists job_schedule_slots (
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
  inbound_travel_minutes integer,
  outbound_travel_minutes integer,
  previous_schedule_slot_id text,
  next_schedule_slot_id text,
  route_context jsonb not null default '{}'::jsonb,
  scheduling_score numeric,
  scheduling_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_assignments (
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

create table if not exists calendar_events (
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

create table if not exists job_actuals (
  id uuid primary key default gen_random_uuid(),
  job_id text,
  lead_id text references leads(id),
  quote_id text,
  tradie_id text references tradies(id),
  actual_start timestamptz,
  actual_end timestamptz,
  actual_duration_minutes integer,
  actual_travel_minutes integer,
  late_minutes integer,
  completion_notes text,
  created_at timestamptz not null default now()
);

create table if not exists quote_accuracy_metrics (
  id uuid primary key default gen_random_uuid(),
  lead_id text references leads(id),
  quote_id text,
  trade_type text,
  initial_estimate text,
  confirmed_quote text,
  revised_quote text,
  final_invoice text,
  estimated_labour_hours numeric,
  actual_labour_hours numeric,
  estimated_materials_cost numeric,
  actual_materials_cost numeric,
  variance_reason text,
  accuracy_score numeric,
  created_at timestamptz not null default now()
);

create table if not exists price_recommendations (
  id uuid primary key default gen_random_uuid(),
  recommendation_key text not null unique,
  agent_key text not null default 'nelly',
  lead_id text references leads(id),
  quote_id text,
  trade_type text,
  job_description text,
  recommended_low numeric,
  recommended_high numeric,
  recommended_mid numeric,
  confidence_score numeric,
  confidence_label text,
  evidence_count integer not null default 0,
  missing_information text[] not null default '{}',
  assumptions text[] not null default '{}',
  risk_flags text[] not null default '{}',
  similar_jobs jsonb not null default '[]'::jsonb,
  pricing_basis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists quote_sla_metrics (
  id uuid primary key default gen_random_uuid(),
  recommendation_key text,
  lead_id text references leads(id),
  quote_id text,
  source_agent text not null default 'sally',
  trade_type text,
  job_description text,
  requested_at timestamptz not null default now(),
  responded_at timestamptz not null default now(),
  response_ms integer,
  target_sla_ms integer not null default 5000,
  sla_met boolean,
  confidence_score numeric,
  confidence_label text,
  evidence_count integer,
  indicative_price_band text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists trust_metrics (
  id uuid primary key default gen_random_uuid(),
  tradie_id text references tradies(id),
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

create index if not exists idx_tradie_skills_trade_type on tradie_skills(trade_type);
create index if not exists idx_tradie_availability_tradie_day on tradie_availability(tradie_id, day_of_week);
create index if not exists idx_job_schedule_slots_tradie_start on job_schedule_slots(tradie_id, scheduled_start);
create index if not exists idx_job_schedule_slots_lead_id on job_schedule_slots(lead_id);
create index if not exists idx_job_assignments_schedule_slot on job_assignments(schedule_slot_id);
create index if not exists idx_job_assignments_tradie on job_assignments(tradie_id);
create index if not exists idx_calendar_events_schedule_slot on calendar_events(schedule_slot_id);
create index if not exists idx_calendar_events_google_event on calendar_events(google_event_id);
create index if not exists idx_quote_accuracy_metrics_lead_id on quote_accuracy_metrics(lead_id);
create index if not exists idx_price_recommendations_lead on price_recommendations(lead_id, created_at desc);
create index if not exists idx_price_recommendations_trade on price_recommendations(trade_type, created_at desc);
create index if not exists idx_quote_sla_metrics_lead on quote_sla_metrics(lead_id, created_at desc);
create index if not exists idx_quote_sla_metrics_sla on quote_sla_metrics(sla_met, created_at desc);
create index if not exists idx_trust_metrics_tradie_id on trust_metrics(tradie_id);

create table if not exists agencies (
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

create table if not exists property_managers (
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

create table if not exists landlords (
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

create table if not exists tenants (
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

create table if not exists rental_properties (
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

create table if not exists tenancies (
  id text primary key,
  property_id text references rental_properties(id),
  tenant_id text references tenants(id),
  lease_start date,
  lease_end date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approval_rules (
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

create table if not exists work_orders (
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

create table if not exists work_order_warranties (
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

create table if not exists repeat_issue_reviews (
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

create table if not exists landlord_approvals (
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

create table if not exists tenant_availability_windows (
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

create table if not exists rental_quote_options (
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

create table if not exists rental_confirmation_events (
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

create table if not exists rental_job_evidence (
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

create table if not exists tenant_feedback (
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

create table if not exists compliance_requirements (
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

create table if not exists compliance_legislation_sources (
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
create table if not exists consumer_guarantee_references (
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

create table if not exists compliance_requirement_catalogue (
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

create table if not exists compliance_bundle_catalogue (
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

create table if not exists compliance_certificates (
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

create table if not exists compliance_service_offers (
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

create table if not exists property_inspection_reports (
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

create table if not exists property_inspection_findings (
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

create table if not exists rental_schedule_forecasts (
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

create table if not exists rental_schedule_forecast_options (
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

create index if not exists idx_rental_properties_agency on rental_properties(agency_id, active);
create index if not exists idx_work_orders_property_status on work_orders(property_id, status);
create index if not exists idx_work_orders_agency_status on work_orders(agency_id, status);
create index if not exists idx_work_order_warranties_lookup on work_order_warranties(property_id, trade_type, job_type, status, warranty_end);
create index if not exists idx_repeat_issue_reviews_work_order on repeat_issue_reviews(work_order_id, created_at desc);
create index if not exists idx_tradie_commercial_terms_lookup on tradie_commercial_terms(tradie_id, company_id, trade_type, job_type, active, effective_from);
create index if not exists idx_tradie_job_offer_overrides_lookup on tradie_job_offer_overrides(tradie_id, work_order_id, quote_option_id, status);
create index if not exists idx_consumer_guarantee_references_lookup on consumer_guarantee_references(jurisdiction, guarantee_type, applies_to, status);
create index if not exists idx_landlord_approvals_work_order on landlord_approvals(work_order_id, status);
create index if not exists idx_rental_quote_options_work_order on rental_quote_options(work_order_id, status, option_rank);
create index if not exists idx_rental_quote_options_batch on rental_quote_options(batch_id, option_rank);
create index if not exists idx_rental_confirmation_events_work_order on rental_confirmation_events(work_order_id, actor_type, created_at desc);
create index if not exists idx_rental_job_evidence_work_order on rental_job_evidence(work_order_id, created_at desc);
create index if not exists idx_tenant_feedback_work_order on tenant_feedback(work_order_id, created_at desc);
create index if not exists idx_compliance_requirements_due on compliance_requirements(status, due_date);
create index if not exists idx_compliance_requirement_catalogue_lookup on compliance_requirement_catalogue(jurisdiction, status, activity_key);
create index if not exists idx_compliance_bundle_catalogue_lookup on compliance_bundle_catalogue(jurisdiction, status);

create table if not exists legislation_version_checks (
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

create table if not exists legislation_version_change_schedule (
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

create table if not exists legislation_change_notifications (
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

create index if not exists idx_legislation_version_checks_run on legislation_version_checks(run_id, created_at desc);
create index if not exists idx_legislation_change_schedule_due on legislation_version_change_schedule(status, effective_from, jurisdiction);
create index if not exists idx_legislation_change_notifications_pending on legislation_change_notifications(status, notification_stage, recipient_email);
create index if not exists idx_compliance_certificates_property on compliance_certificates(property_id, requirement_type, expires_at);
create index if not exists idx_compliance_service_offers_status on compliance_service_offers(agency_id, status);
create index if not exists idx_property_inspection_reports_property on property_inspection_reports(property_id, report_date desc);
create index if not exists idx_property_inspection_findings_report on property_inspection_findings(inspection_report_id, status);
create index if not exists idx_rental_schedule_forecast_options_forecast on rental_schedule_forecast_options(forecast_id, tradie_id, scheduled_start);

create table if not exists authority_documents (
  id uuid primary key default gen_random_uuid(),
  authority_document_key text not null unique,
  document_type text not null,
  industry text not null default 'all',
  trade_type text,
  jurisdiction text not null default 'AU',
  authority_name text not null,
  issuing_body text,
  document_title text not null,
  document_reference text,
  source_url text not null,
  official_source boolean not null default true,
  current_version text,
  effective_from date,
  effective_to date,
  status text not null default 'active',
  verified_at timestamptz not null default now(),
  verified_by text not null default 'codex',
  owner_agent_key text references agent_definitions(agent_key),
  summary text,
  layman_summary text,
  sme_interpretation_status text not null default 'pending_review',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists authority_document_versions (
  id uuid primary key default gen_random_uuid(),
  authority_document_key text not null references authority_documents(authority_document_key),
  version_label text not null,
  version_date date,
  effective_from date,
  effective_to date,
  source_url text not null,
  change_summary text,
  layman_summary text,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(authority_document_key, version_label)
);

create table if not exists authority_document_topics (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null unique,
  authority_document_key text not null references authority_documents(authority_document_key),
  industry text not null default 'all',
  trade_type text,
  topic_name text not null,
  topic_summary text not null,
  applies_to text,
  risk_level text not null default 'medium',
  required_evidence text[] not null default '{}',
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists authority_document_chunks (
  id uuid primary key default gen_random_uuid(),
  authority_document_key text not null references authority_documents(authority_document_key),
  chunk_key text not null unique,
  chunk_order integer not null default 100,
  heading text,
  chunk_text text not null,
  jurisdiction text not null default 'AU',
  industry text not null default 'all',
  trade_type text,
  topic_tags text[] not null default '{}',
  obligation_type text,
  risk_level text not null default 'medium',
  source_url text,
  current_version text,
  effective_from date,
  effective_to date,
  embedding_provider text,
  embedding_model text,
  embedding_status text not null default 'pending',
  embedding_vector_json jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists authority_document_agent_access (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_definitions(agent_key),
  authority_document_key text not null references authority_documents(authority_document_key),
  access_level text not null default 'reference',
  module_key text,
  paid_module boolean not null default false,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agent_key, authority_document_key, module_key)
);

create table if not exists authority_document_links (
  id uuid primary key default gen_random_uuid(),
  authority_document_key text not null references authority_documents(authority_document_key),
  source_table text not null,
  source_key text not null,
  relationship_type text not null default 'grounds',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(authority_document_key, source_table, source_key, relationship_type)
);

create index if not exists idx_authority_documents_lookup on authority_documents(jurisdiction, industry, trade_type, document_type, status);
create index if not exists idx_authority_documents_owner on authority_documents(owner_agent_key, status);
create index if not exists idx_authority_document_versions_lookup on authority_document_versions(authority_document_key, status, effective_from);
create index if not exists idx_authority_document_topics_lookup on authority_document_topics(authority_document_key, industry, trade_type, status);
create index if not exists idx_authority_document_chunks_lookup on authority_document_chunks(authority_document_key, jurisdiction, industry, trade_type, embedding_status);
create index if not exists idx_authority_document_agent_access_lookup on authority_document_agent_access(agent_key, module_key, status);
