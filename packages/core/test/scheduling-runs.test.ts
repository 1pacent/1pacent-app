import { describe, expect, it } from "vitest";
import {
  buildRun,
  etaMinutesFromDistance,
  haversineKm,
  travelEstimateMinutes,
  type RunJob,
} from "../src/scheduling/runs";

function job(overrides: Partial<RunJob>): RunJob {
  return {
    workOrderId: "wo-1",
    requestId: "req-1",
    title: "Fix tap",
    address: "1 Test St",
    suburb: "Fitzroy",
    slotStartAt: null,
    slotEndAt: null,
    typicalMinutes: 60,
    urgent: false,
    ...overrides,
  };
}

const T = (iso: string) => new Date(iso);

describe("buildRun", () => {
  it("orders slotted jobs by slot start and threads unslotted after", () => {
    const run = buildRun(
      [
        job({ workOrderId: "b", slotStartAt: T("2026-07-14T04:00:00Z"), slotEndAt: T("2026-07-14T06:00:00Z") }),
        job({ workOrderId: "a", slotStartAt: T("2026-07-14T00:00:00Z"), slotEndAt: T("2026-07-14T02:00:00Z") }),
        job({ workOrderId: "c" }),
      ],
      { dayStart: T("2026-07-13T22:00:00Z") },
    );
    expect(run.legs.map((l) => l.job.workOrderId)).toEqual(["a", "b", "c"]);
  });

  it("waits for a booked slot rather than arriving early", () => {
    const run = buildRun(
      [job({ slotStartAt: T("2026-07-14T02:00:00Z"), slotEndAt: T("2026-07-14T04:00:00Z") })],
      { dayStart: T("2026-07-13T22:00:00Z") },
    );
    expect(run.legs[0]!.arriveAt.toISOString()).toBe("2026-07-14T02:00:00.000Z");
    expect(run.legs[0]!.conflict).toBe(false);
  });

  it("flags a conflict when the previous stop makes the slot unreachable, instead of silently moving it", () => {
    const run = buildRun(
      [
        job({
          workOrderId: "long",
          slotStartAt: T("2026-07-14T00:00:00Z"),
          slotEndAt: T("2026-07-14T02:00:00Z"),
          typicalMinutes: 240,
        }),
        job({
          workOrderId: "tight",
          suburb: "Carlton",
          slotStartAt: T("2026-07-14T04:10:00Z"),
          slotEndAt: T("2026-07-14T06:10:00Z"),
        }),
      ],
      { dayStart: T("2026-07-13T23:00:00Z") },
    );
    const tight = run.legs.find((l) => l.job.workOrderId === "tight")!;
    expect(tight.conflict).toBe(true);
    // The booked slot is still respected as data — arrival reflects reality.
    expect(tight.arriveAt.getTime()).toBeGreaterThan(T("2026-07-14T04:10:00Z").getTime());
  });

  it("puts urgent unslotted work before routine and prefers the nearer suburb", () => {
    const run = buildRun(
      [
        job({ workOrderId: "far", suburb: "Dandenong" }),
        job({ workOrderId: "near", suburb: "Fitzroy" }),
        job({ workOrderId: "urgent", suburb: "Dandenong", urgent: true }),
      ],
      { dayStart: T("2026-07-13T22:00:00Z"), baseSuburb: "Fitzroy" },
    );
    expect(run.legs[0]!.job.workOrderId).toBe("urgent");
    expect(run.legs.map((l) => l.job.workOrderId)).toEqual(["urgent", "far", "near"]);
  });

  it("totals travel and on-site minutes", () => {
    const run = buildRun([job({ workOrderId: "a" }), job({ workOrderId: "b", suburb: "Carlton" })], {
      dayStart: T("2026-07-13T22:00:00Z"),
    });
    expect(run.totalOnSiteMinutes).toBe(120);
    expect(run.totalTravelMinutes).toBe(run.legs.reduce((s, l) => s + l.travelMinutes, 0));
    expect(run.startAt).not.toBeNull();
    expect(run.endAt!.getTime()).toBeGreaterThan(run.startAt!.getTime());
  });

  it("returns an empty run for an empty day", () => {
    const run = buildRun([], { dayStart: T("2026-07-13T22:00:00Z") });
    expect(run.legs).toEqual([]);
    expect(run.startAt).toBeNull();
  });
});

describe("travel estimates", () => {
  it("treats same-suburb as a short hop", () => {
    expect(travelEstimateMinutes("Fitzroy", "fitzroy")).toBe(12);
    expect(travelEstimateMinutes("Fitzroy", "Carlton")).toBe(28);
  });

  it("computes a sane ETA from a straight-line distance", () => {
    const km = haversineKm(-37.8136, 144.9631, -37.7963, 144.9614); // CBD → Carlton ≈ 2km
    expect(km).toBeGreaterThan(1);
    expect(km).toBeLessThan(3);
    const eta = etaMinutesFromDistance(km);
    expect(eta).toBeGreaterThanOrEqual(3);
    expect(eta).toBeLessThanOrEqual(15);
  });
});
