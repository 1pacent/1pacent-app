/**
 * Compliance requirement catalogue — the moat (audit §1.3).
 * Seed ruleset: Victoria, per the Residential Tenancies Regulations 2021.
 *
 * `frequencyMonths: null` means a one-off requirement (e.g. minimum
 * standards) that stays satisfied once evidenced, unless invalidated.
 */

export type Jurisdiction = "VIC" | "NSW" | "QLD";

export interface ComplianceRequirement {
  key: string;
  jurisdiction: Jurisdiction;
  name: string;
  description: string;
  frequencyMonths: number | null;
  evidenceRequired: readonly string[];
  legislationRef: string;
  /** Only applies when the property has this attribute (e.g. gas, pool). */
  appliesWhen?: "has_gas" | "has_pool";
}

export const VIC_COMPLIANCE_CATALOGUE: readonly ComplianceRequirement[] = [
  {
    key: "vic_smoke_alarm_check",
    jurisdiction: "VIC",
    name: "Smoke alarm safety check",
    description:
      "All smoke alarms tested and in working order, checked by a suitably qualified person at least once every 12 months.",
    frequencyMonths: 12,
    evidenceRequired: ["service_report", "technician_details", "check_date"],
    legislationRef: "Residential Tenancies Regulations 2021 (Vic) reg 12A / Sch 3",
  },
  {
    key: "vic_gas_safety_check",
    jurisdiction: "VIC",
    name: "Gas safety check",
    description:
      "Gas installations and fittings checked by a licensed gasfitter at least once every 2 years.",
    frequencyMonths: 24,
    evidenceRequired: ["compliance_certificate", "gasfitter_licence_number", "check_date"],
    legislationRef: "Residential Tenancies Regulations 2021 (Vic) reg 12B",
    appliesWhen: "has_gas",
  },
  {
    key: "vic_electrical_safety_check",
    jurisdiction: "VIC",
    name: "Electrical safety check",
    description:
      "Electrical installations and fittings checked by a licensed electrician at least once every 2 years.",
    frequencyMonths: 24,
    evidenceRequired: ["compliance_certificate", "electrician_licence_number", "check_date"],
    legislationRef: "Residential Tenancies Regulations 2021 (Vic) reg 12C",
  },
  {
    key: "vic_switchboard_rcd",
    jurisdiction: "VIC",
    name: "Switchboard safety switches (RCDs)",
    description:
      "Modern switchboard with circuit breakers and residual current devices fitted (rental minimum standards).",
    frequencyMonths: null,
    evidenceRequired: ["electrician_report_or_photo"],
    legislationRef: "Residential Tenancies Regulations 2021 (Vic) Sch 4 (minimum standards)",
  },
  {
    key: "vic_pool_barrier",
    jurisdiction: "VIC",
    name: "Pool/spa barrier compliance certificate",
    description:
      "Swimming pool or spa barrier inspected and certificate of compliance lodged with council every 4 years.",
    frequencyMonths: 48,
    evidenceRequired: ["form_23_certificate", "inspection_date"],
    legislationRef: "Building Regulations 2018 (Vic) Part 9A",
    appliesWhen: "has_pool",
  },
  {
    key: "vic_minimum_standards",
    jurisdiction: "VIC",
    name: "Rental minimum standards",
    description:
      "Property meets the 14 rental minimum standards (locks, bins, toilet, hot/cold water, heating in main living area, ventilation, mould-free, structural soundness, lighting, window coverings, electrical safety).",
    frequencyMonths: null,
    evidenceRequired: ["self_assessment_checklist"],
    legislationRef: "Residential Tenancies Act 1997 (Vic) s 65A; Regulations 2021 Sch 4",
  },
] as const;

export interface PropertyComplianceProfile {
  jurisdiction: Jurisdiction;
  hasGas: boolean;
  hasPool: boolean;
}

/** Which catalogue requirements apply to a given property. */
export function applicableRequirements(
  profile: PropertyComplianceProfile,
  catalogue: readonly ComplianceRequirement[] = VIC_COMPLIANCE_CATALOGUE,
): ComplianceRequirement[] {
  return catalogue.filter((req) => {
    if (req.jurisdiction !== profile.jurisdiction) return false;
    if (req.appliesWhen === "has_gas") return profile.hasGas;
    if (req.appliesWhen === "has_pool") return profile.hasPool;
    return true;
  });
}
