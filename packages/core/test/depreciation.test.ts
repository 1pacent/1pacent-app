import { describe, expect, it } from "vitest";
import {
  assessAssetHorizon,
  effectiveLifeYears,
  estimateDepreciation,
} from "../src/depreciation/estimate.js";

const TODAY = new Date("2026-07-12T00:00:00Z");

describe("estimateDepreciation", () => {
  it("carries the planning_estimate disclaimer in the type and value", () => {
    const est = estimateDepreciation({
      category: "failure_of_essential_service_hot_water",
      installedAt: new Date("2020-07-01T00:00:00Z"),
      replacementCostCents: 240_000,
      today: TODAY,
    });
    // The honesty constraint from Product Design v6 §1.1, enforced in a test.
    expect(est.disclaimer).toBe("planning_estimate");
  });

  it("computes prime cost as straight line over the effective life", () => {
    const est = estimateDepreciation({
      category: "failure_of_essential_service_hot_water", // 12-year life
      installedAt: new Date("2024-07-01T00:00:00Z"),
      replacementCostCents: 240_000,
      today: TODAY,
    });
    expect(est.effectiveLifeYears).toBe(12);
    expect(est.annualPrimeCostCents).toBe(20_000); // 240k / 12
  });

  it("diminishing value declines with age", () => {
    const young = estimateDepreciation({
      category: "appliance_general", // 8-year life
      installedAt: new Date("2026-07-01T00:00:00Z"), // age 0 — first year
      replacementCostCents: 100_000,
      today: TODAY,
    });
    const old = estimateDepreciation({
      category: "appliance_general",
      installedAt: new Date("2020-07-01T00:00:00Z"),
      replacementCostCents: 100_000,
      today: TODAY,
    });
    expect(young.annualDiminishingValueCents).toBeGreaterThan(old.annualDiminishingValueCents);
    // Year 1 DV at 2/8 = 25% of cost.
    expect(young.annualDiminishingValueCents).toBe(25_000);
  });

  it("returns zero annual deductions once fully written down", () => {
    const est = estimateDepreciation({
      category: "safety_device_fault_smoke_alarm_or_pool_barrier", // 6-year life
      installedAt: new Date("2010-01-01T00:00:00Z"),
      replacementCostCents: 15_000,
      today: TODAY,
    });
    expect(est.remainingLifeYears).toBe(0);
    expect(est.annualPrimeCostCents).toBe(0);
    expect(est.annualDiminishingValueCents).toBe(0);
  });

  it("rejects invalid money", () => {
    expect(() =>
      estimateDepreciation({
        category: "other",
        installedAt: new Date("2020-01-01T00:00:00Z"),
        replacementCostCents: 12.5,
        today: TODAY,
      }),
    ).toThrow(RangeError);
  });
});

describe("assessAssetHorizon", () => {
  it("flags an asset late in life as plan_soon", () => {
    // HWS at year 10 of 12 => 83% consumed.
    const a = assessAssetHorizon({
      category: "failure_of_essential_service_hot_water",
      installedAt: new Date("2016-07-01T00:00:00Z"),
      today: TODAY,
    });
    expect(a.status).toBe("plan_soon");
    expect(a.ageYears).toBe(10);
    expect(a.remainingLifeYears).toBe(2);
  });

  it("flags an asset past its effective life as due_now", () => {
    const a = assessAssetHorizon({
      category: "air_conditioning_failure", // 10-year life
      installedAt: new Date("2014-01-01T00:00:00Z"),
      today: TODAY,
    });
    expect(a.status).toBe("due_now");
  });

  it("young assets are healthy", () => {
    const a = assessAssetHorizon({
      category: "plumbing_general", // 20-year life
      installedAt: new Date("2024-01-01T00:00:00Z"),
      today: TODAY,
    });
    expect(a.status).toBe("healthy");
  });

  it("unknown categories fall back to the default life", () => {
    expect(effectiveLifeYears("other")).toBe(10);
  });
});
