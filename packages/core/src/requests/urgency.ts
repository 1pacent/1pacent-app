/**
 * VIC urgent repairs, per the Residential Tenancies Act 1997 (Vic) s 3
 * definition of "urgent repairs" (as amended by the 2021 reforms).
 *
 * Classification here is deterministic: AI triage (Sally) may *propose*
 * a category, but whether that category is urgent is decided by this list,
 * not by a model.
 */

export const VIC_URGENT_REPAIR_CATEGORIES = [
  "burst_water_service",
  "blocked_or_broken_toilet",
  "serious_roof_leak",
  "gas_leak",
  "dangerous_electrical_fault",
  "flooding_or_serious_flood_damage",
  "serious_storm_or_fire_damage",
  "failure_of_essential_service_hot_water",
  "failure_of_essential_service_water",
  "failure_of_essential_service_cooking",
  "failure_of_essential_service_heating",
  "failure_of_essential_service_laundering",
  "failure_of_supplied_appliance",
  "safety_device_fault_smoke_alarm_or_pool_barrier",
  "unsafe_or_insecure_premises",
  "serious_injury_hazard",
  "air_conditioning_failure",
] as const;

export type UrgentRepairCategory = (typeof VIC_URGENT_REPAIR_CATEGORIES)[number];

export const REQUEST_CATEGORIES = [
  ...VIC_URGENT_REPAIR_CATEGORIES,
  "plumbing_general",
  "electrical_general",
  "appliance_general",
  "heating_cooling_general",
  "doors_windows_locks",
  "walls_ceilings_floors",
  "pest_control",
  "garden_external",
  "other",
] as const;

export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

export function isUrgentCategory(category: RequestCategory): boolean {
  return (VIC_URGENT_REPAIR_CATEGORIES as readonly string[]).includes(category);
}

/**
 * VIC statutory cap: a renter may arrange urgent repairs up to $2,500
 * and be reimbursed (RTA 1997 s 72). We use it as the default urgent
 * auto-approval ceiling; orgs may configure a lower one.
 */
export const VIC_URGENT_REPAIR_STATUTORY_CAP_CENTS = 250_000;
