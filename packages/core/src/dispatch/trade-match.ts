import type { RequestCategory } from "../requests/urgency";
import type { Playbook } from "../playbooks";

/**
 * Trade matching (v8 R8.1): only tradies whose trade covers the category are
 * ever invited — a plumber never sees an electrical job. The one deliberate
 * exception is the handyman (`general_maintenance`): they can take any SMALL
 * job — fixed-band priced AND filing no compliance certificate — because
 * those need hands, not a licence. Anything quoted (big scope) or filing a
 * certificate (gas, smoke alarm) stays with the matching specialists.
 *
 * Deterministic on purpose, like urgency classification: AI proposes the
 * category, this table decides who is allowed to hear about it.
 */

export const TRADE_TYPES = [
  "plumbing",
  "electrical",
  "hvac",
  "appliance_repair",
  "locksmith",
  "carpentry",
  "roofing",
  "painting",
  "pest_control",
  "gardening",
  "general_maintenance",
] as const;

export type TradeType = (typeof TRADE_TYPES)[number];

/** Specialist trades that can take each category. Gas work maps to plumbing
 * because VIC gasfitting licences sit under the plumbing regime. */
const CATEGORY_TRADES: Record<RequestCategory, readonly TradeType[]> = {
  burst_water_service: ["plumbing"],
  blocked_or_broken_toilet: ["plumbing"],
  serious_roof_leak: ["roofing", "plumbing"],
  gas_leak: ["plumbing"],
  dangerous_electrical_fault: ["electrical"],
  flooding_or_serious_flood_damage: ["plumbing"],
  serious_storm_or_fire_damage: ["carpentry", "roofing"],
  failure_of_essential_service_hot_water: ["plumbing"],
  failure_of_essential_service_water: ["plumbing"],
  failure_of_essential_service_cooking: ["appliance_repair", "electrical"],
  failure_of_essential_service_heating: ["hvac", "electrical"],
  failure_of_essential_service_laundering: ["appliance_repair", "plumbing"],
  failure_of_supplied_appliance: ["appliance_repair", "electrical"],
  safety_device_fault_smoke_alarm_or_pool_barrier: ["electrical"],
  unsafe_or_insecure_premises: ["locksmith", "carpentry"],
  serious_injury_hazard: ["general_maintenance", "carpentry"],
  air_conditioning_failure: ["hvac", "electrical"],
  plumbing_general: ["plumbing"],
  electrical_general: ["electrical"],
  appliance_general: ["appliance_repair", "electrical"],
  heating_cooling_general: ["hvac", "electrical"],
  doors_windows_locks: ["locksmith", "carpentry"],
  walls_ceilings_floors: ["carpentry", "painting"],
  pest_control: ["pest_control"],
  garden_external: ["gardening", "general_maintenance"],
  other: ["general_maintenance"],
};

export function tradesForCategory(category: RequestCategory): readonly TradeType[] {
  return CATEGORY_TRADES[category] ?? CATEGORY_TRADES.other;
}

/** The handyman rule: small (fixed-band) job, no certificate to file. */
export function handymanCanCover(playbook: Pick<Playbook, "pricing" | "compliance">): boolean {
  return playbook.pricing.model === "fixed_band" && !playbook.compliance;
}

/**
 * Is this tradie allowed to hear about this job? Unknown/blank trade types
 * are treated as handymen — eligible only where a handyman would be, so an
 * unclassified contact can never land specialist work by accident.
 */
export function tradieMatchesJob(
  tradeType: string | null | undefined,
  category: RequestCategory,
  playbook: Pick<Playbook, "pricing" | "compliance">,
): boolean {
  const specialists = tradesForCategory(category);
  const trade = (tradeType ?? "").trim() as TradeType | "";
  if (trade && specialists.includes(trade as TradeType)) return true;
  if (!trade || trade === "general_maintenance") {
    return specialists.includes("general_maintenance") || handymanCanCover(playbook);
  }
  return false;
}
