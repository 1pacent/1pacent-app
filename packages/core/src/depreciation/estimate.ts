import { assertCents, type Cents } from "../money";
import type { RequestCategory } from "../requests/urgency";

/**
 * Depreciation *planning estimates* from a curated effective-life table
 * (Developer Brief v6 §3, honesty constraint from Product Design v6 §1.1).
 *
 * These are planning estimates only — an ATO-defensible capital-works
 * schedule requires a registered quantity surveyor. The Property Data Pack
 * is the verified data feed that makes the QS/accountant's job trivial; it
 * is never a tax schedule. That constraint is enforced in the type: every
 * output carries `disclaimer: "planning_estimate"`.
 */

/** Curated effective lives (years) for the asset categories we track.
 * Values follow the common ATO effective-life ranges for residential
 * rental assets; deliberately small and reviewable. */
export const EFFECTIVE_LIFE_YEARS: Partial<Record<RequestCategory, number>> = {
  failure_of_essential_service_hot_water: 12, // hot water system
  failure_of_essential_service_heating: 15, // ducted/space heating
  air_conditioning_failure: 10, // split system A/C
  failure_of_essential_service_cooking: 12, // stove / oven
  failure_of_supplied_appliance: 8, // supplied whitegoods
  safety_device_fault_smoke_alarm_or_pool_barrier: 6, // smoke alarms
  plumbing_general: 20, // fixed plumbing assets
  electrical_general: 20, // fixed electrical assets
  appliance_general: 8,
  heating_cooling_general: 10,
  doors_windows_locks: 20,
  garden_external: 15,
};

const DEFAULT_EFFECTIVE_LIFE_YEARS = 10;

export function effectiveLifeYears(category: RequestCategory): number {
  return EFFECTIVE_LIFE_YEARS[category] ?? DEFAULT_EFFECTIVE_LIFE_YEARS;
}

export interface DepreciationEstimate {
  /** Enforced honesty: this is a planning estimate, never a tax schedule. */
  disclaimer: "planning_estimate";
  category: RequestCategory;
  effectiveLifeYears: number;
  /** Whole years elapsed since install (floored, >= 0). */
  ageYears: number;
  remainingLifeYears: number;
  replacementCostCents: Cents;
  /** Diminishing value: base rate 200% / effective life, applied to the
   * written-down value for the current year. */
  annualDiminishingValueCents: Cents;
  /** Prime cost: straight line over the effective life. */
  annualPrimeCostCents: Cents;
}

const MS_PER_YEAR = 365.25 * 86_400_000;

/**
 * Annual depreciation planning estimate for one asset. `replacementCostCents`
 * should be the median from comparable invoices where available (the caller
 * owns sourcing it — core stays IO-free).
 */
export function estimateDepreciation(input: {
  category: RequestCategory;
  installedAt: Date;
  replacementCostCents: Cents;
  today: Date;
}): DepreciationEstimate {
  assertCents(input.replacementCostCents);
  const life = effectiveLifeYears(input.category);
  const ageYears = Math.max(
    0,
    Math.floor((input.today.getTime() - input.installedAt.getTime()) / MS_PER_YEAR),
  );
  const remainingLifeYears = Math.max(0, life - ageYears);

  // Prime cost: straight line, zero once fully written down.
  const annualPrimeCostCents =
    remainingLifeYears > 0 ? Math.round(input.replacementCostCents / life) : 0;

  // Diminishing value: rate = 200% / life applied to written-down value.
  const dvRate = 2 / life;
  let writtenDown = input.replacementCostCents;
  for (let y = 0; y < ageYears; y += 1) writtenDown -= writtenDown * dvRate;
  const annualDiminishingValueCents =
    remainingLifeYears > 0 ? Math.round(Math.max(0, writtenDown) * dvRate) : 0;

  return {
    disclaimer: "planning_estimate",
    category: input.category,
    effectiveLifeYears: life,
    ageYears,
    remainingLifeYears,
    replacementCostCents: input.replacementCostCents,
    annualDiminishingValueCents,
    annualPrimeCostCents,
  };
}

export interface AssetHorizonAssessment {
  disclaimer: "planning_estimate";
  category: RequestCategory;
  ageYears: number;
  effectiveLifeYears: number;
  remainingLifeYears: number;
  /** Fraction of effective life consumed, 0..1+ (may exceed 1 for overdue assets). */
  lifeConsumed: number;
  status: "healthy" | "plan_soon" | "due_now";
}

/** Where an asset sits on its replacement horizon — the "HWS at year 9 of
 * 10–12" line on the owner's Asset Horizon card. */
export function assessAssetHorizon(input: {
  category: RequestCategory;
  installedAt: Date;
  today: Date;
}): AssetHorizonAssessment {
  const life = effectiveLifeYears(input.category);
  const ageYears = Math.max(
    0,
    Math.floor((input.today.getTime() - input.installedAt.getTime()) / MS_PER_YEAR),
  );
  const remainingLifeYears = Math.max(0, life - ageYears);
  const lifeConsumed = ageYears / life;
  const status: AssetHorizonAssessment["status"] =
    lifeConsumed >= 1 ? "due_now" : lifeConsumed >= 0.75 ? "plan_soon" : "healthy";
  return {
    disclaimer: "planning_estimate",
    category: input.category,
    ageYears,
    effectiveLifeYears: life,
    remainingLifeYears,
    lifeConsumed,
    status,
  };
}
