/**
 * George's Runs (Developer Brief v8 §5, R2): order a tradie's day into a
 * drivable route with honest travel estimates. Pure — no Maps calls in core.
 * Without coordinates the estimate falls back to a suburb heuristic; the API
 * tier may upgrade legs with real Directions data when a key is configured,
 * but the plan itself is deterministic and works with the ledger alone.
 */

export interface RunJob {
  workOrderId: string;
  requestId: string;
  title: string;
  address: string;
  suburb: string;
  /** Booked slot, when one was confirmed by acceptance. */
  slotStartAt: Date | null;
  slotEndAt: Date | null;
  typicalMinutes: number;
  urgent: boolean;
}

export interface RunLeg {
  job: RunJob;
  /** Estimated minutes driving from the previous stop (0 for the first). */
  travelMinutes: number;
  /** Planned arrival — slot start when booked, otherwise rolling estimate. */
  arriveAt: Date;
  departAt: Date;
  /** True when the plan cannot make the booked slot from the previous stop. */
  conflict: boolean;
}

export interface Run {
  legs: RunLeg[];
  totalTravelMinutes: number;
  totalOnSiteMinutes: number;
  startAt: Date | null;
  endAt: Date | null;
}

/** Suburb-heuristic travel estimate: same suburb is a short hop, different
 * suburb a cross-town drive. Deliberately conservative; Maps refines later. */
export function travelEstimateMinutes(fromSuburb: string, toSuburb: string): number {
  if (!fromSuburb || !toSuburb) return 25;
  return fromSuburb.trim().toLowerCase() === toSuburb.trim().toLowerCase() ? 12 : 28;
}

const BUFFER_MINUTES = 10;
const MS_PER_MIN = 60_000;

/**
 * Build the day's run. Slotted jobs anchor the route in slot order; unslotted
 * jobs (urgent first) are threaded into the gaps nearest-suburb-first after
 * the last anchor. Every leg gets travel + buffer; a leg that cannot reach
 * its booked slot on time is flagged `conflict` rather than silently moved —
 * George proposes, humans re-book.
 */
export function buildRun(jobs: readonly RunJob[], options: { dayStart: Date; baseSuburb?: string }): Run {
  const slotted = jobs
    .filter((j) => j.slotStartAt !== null)
    .sort((a, b) => a.slotStartAt!.getTime() - b.slotStartAt!.getTime());
  const unslotted = [...jobs.filter((j) => j.slotStartAt === null)].sort(
    (a, b) => Number(b.urgent) - Number(a.urgent),
  );

  const legs: RunLeg[] = [];
  let cursor = options.dayStart;
  let atSuburb = options.baseSuburb ?? slotted[0]?.suburb ?? unslotted[0]?.suburb ?? "";

  for (const job of slotted) {
    const travel = legs.length === 0 && !options.baseSuburb ? 0 : travelEstimateMinutes(atSuburb, job.suburb);
    const earliestArrival = new Date(cursor.getTime() + (travel + (legs.length === 0 ? 0 : BUFFER_MINUTES)) * MS_PER_MIN);
    const arriveAt = job.slotStartAt!.getTime() >= earliestArrival.getTime() ? job.slotStartAt! : earliestArrival;
    const conflict = earliestArrival.getTime() > job.slotStartAt!.getTime();
    const departAt = new Date(arriveAt.getTime() + job.typicalMinutes * MS_PER_MIN);
    legs.push({ job, travelMinutes: travel, arriveAt, departAt, conflict });
    cursor = departAt;
    atSuburb = job.suburb;
  }

  // Thread unslotted work after the anchors, nearest suburb first.
  const remaining = [...unslotted];
  while (remaining.length > 0) {
    remaining.sort(
      (a, b) =>
        Number(b.urgent) - Number(a.urgent) ||
        travelEstimateMinutes(atSuburb, a.suburb) - travelEstimateMinutes(atSuburb, b.suburb),
    );
    const job = remaining.shift()!;
    const travel = legs.length === 0 && !options.baseSuburb ? 0 : travelEstimateMinutes(atSuburb, job.suburb);
    const arriveAt = new Date(cursor.getTime() + (travel + (legs.length === 0 ? 0 : BUFFER_MINUTES)) * MS_PER_MIN);
    const departAt = new Date(arriveAt.getTime() + job.typicalMinutes * MS_PER_MIN);
    legs.push({ job, travelMinutes: travel, arriveAt, departAt, conflict: false });
    cursor = departAt;
    atSuburb = job.suburb;
  }

  return {
    legs,
    totalTravelMinutes: legs.reduce((sum, l) => sum + l.travelMinutes, 0),
    totalOnSiteMinutes: legs.reduce((sum, l) => sum + l.job.typicalMinutes, 0),
    startAt: legs[0]?.arriveAt ?? null,
    endAt: legs[legs.length - 1]?.departAt ?? null,
  };
}

/** Straight-line distance (km) between two points — the ETA fallback when
 * no Directions provider is configured. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** ETA in minutes at urban driving pace (straight-line × a winding factor). */
export function etaMinutesFromDistance(km: number): number {
  const roadKm = km * 1.4; // streets are not crow-flight
  return Math.max(3, Math.round((roadKm / 30) * 60)); // 30 km/h urban average
}
