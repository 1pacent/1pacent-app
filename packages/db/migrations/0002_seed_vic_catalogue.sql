-- Seed the VIC compliance ruleset (Epic 1). Mirrors packages/core
-- src/compliance/catalogue.ts — core is the canonical definition; a CI
-- check should diff the two when the catalogue grows.

insert into compliance_requirement_catalogue
  (key, jurisdiction, name, description, frequency_months, evidence_required, legislation_ref, applies_when)
values
  ('vic_smoke_alarm_check', 'VIC', 'Smoke alarm safety check',
   'All smoke alarms tested and in working order, checked by a suitably qualified person at least once every 12 months.',
   12, array['service_report','technician_details','check_date'],
   'Residential Tenancies Regulations 2021 (Vic) reg 12A / Sch 3', null),

  ('vic_gas_safety_check', 'VIC', 'Gas safety check',
   'Gas installations and fittings checked by a licensed gasfitter at least once every 2 years.',
   24, array['compliance_certificate','gasfitter_licence_number','check_date'],
   'Residential Tenancies Regulations 2021 (Vic) reg 12B', 'has_gas'),

  ('vic_electrical_safety_check', 'VIC', 'Electrical safety check',
   'Electrical installations and fittings checked by a licensed electrician at least once every 2 years.',
   24, array['compliance_certificate','electrician_licence_number','check_date'],
   'Residential Tenancies Regulations 2021 (Vic) reg 12C', null),

  ('vic_switchboard_rcd', 'VIC', 'Switchboard safety switches (RCDs)',
   'Modern switchboard with circuit breakers and residual current devices fitted (rental minimum standards).',
   null, array['electrician_report_or_photo'],
   'Residential Tenancies Regulations 2021 (Vic) Sch 4 (minimum standards)', null),

  ('vic_pool_barrier', 'VIC', 'Pool/spa barrier compliance certificate',
   'Swimming pool or spa barrier inspected and certificate of compliance lodged with council every 4 years.',
   48, array['form_23_certificate','inspection_date'],
   'Building Regulations 2018 (Vic) Part 9A', 'has_pool'),

  ('vic_minimum_standards', 'VIC', 'Rental minimum standards',
   'Property meets the 14 rental minimum standards (locks, bins, toilet, hot/cold water, heating in main living area, ventilation, mould-free, structural soundness, lighting, window coverings, electrical safety).',
   null, array['self_assessment_checklist'],
   'Residential Tenancies Act 1997 (Vic) s 65A; Regulations 2021 Sch 4', null)
on conflict (key) do nothing;
