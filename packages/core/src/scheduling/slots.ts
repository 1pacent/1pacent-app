/**
 * George's slot proposal (Developer Brief v7 §3): when a quote is accepted,
 * propose concrete visit slots from the winning tradie's recurring weekly
 * availability windows. Deterministic and pure — no calendars, no routing;
 * the tenant confirms one on a card (`confirmSlot` is a card action, never
 * a tool). Urgent jobs get the earliest possible slots; routine jobs start
 * the next business day.
 */

export interface WeeklyAvailabilityWindow {
  /** 0 = Sunday … 6 = Saturday (matches tradie_availability_windows.day_of_week). */
  dayOfWeek: number;
  /** "08:00" 24h local time. */
  startTime: string;
  /** "16:00" 24h local time. */
  endTime: string;
}

export interface ProposedSlot {
  /** Slot start, inclusive. */
  startAt: Date;
  /** Slot end, exclusive. */
  endAt: Date;
}

const SLOT_LENGTH_HOURS = 2;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Default trading window used when the tradie has no recorded availability
 * — proposing nothing would stall the job; a Mon–Fri 8–16 assumption is
 * honest and visibly editable later. */
const DEFAULT_WINDOWS: WeeklyAvailabilityWindow[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "08:00",
  endTime: "16:00",
}));

function parseTimeToHours(time: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) throw new RangeError(`Unparseable time "${time}"`);
  return Number(match[1]) + Number(match[2]) / 60;
}

/**
 * Propose up to `count` two-hour visit slots from recurring weekly windows.
 * Slots are aligned to whole hours inside each window, earliest first.
 * `from` is the earliest instant a slot may start (already offset by the
 * caller for urgency: now for urgent, next business day for routine).
 */
export function proposeSlots(
  windows: readonly WeeklyAvailabilityWindow[],
  options: { from: Date; count?: number; horizonDays?: number },
): ProposedSlot[] {
  const usable = windows.length > 0 ? windows : DEFAULT_WINDOWS;
  const count = options.count ?? 3;
  const horizonDays = options.horizonDays ?? 14;
  const slots: ProposedSlot[] = [];

  for (let dayOffset = 0; dayOffset <= horizonDays && slots.length < count; dayOffset += 1) {
    const dayStart = new Date(
      Date.UTC(
        options.from.getUTCFullYear(),
        options.from.getUTCMonth(),
        options.from.getUTCDate(),
      ) +
        dayOffset * MS_PER_DAY,
    );
    const dow = dayStart.getUTCDay();
    const todaysWindows = usable
      .filter((w) => w.dayOfWeek === dow)
      .sort((a, b) => parseTimeToHours(a.startTime) - parseTimeToHours(b.startTime));

    for (const w of todaysWindows) {
      const windowStartH = parseTimeToHours(w.startTime);
      const windowEndH = parseTimeToHours(w.endTime);
      for (
        let h = Math.ceil(windowStartH);
        h + SLOT_LENGTH_HOURS <= windowEndH && slots.length < count;
        h += SLOT_LENGTH_HOURS
      ) {
        const startAt = new Date(dayStart.getTime() + h * MS_PER_HOUR);
        if (startAt.getTime() < options.from.getTime()) continue;
        slots.push({ startAt, endAt: new Date(startAt.getTime() + SLOT_LENGTH_HOURS * MS_PER_HOUR) });
      }
    }
  }
  return slots;
}

/** Earliest allowed slot start for a job: urgent jobs may start immediately;
 * routine jobs start from the next UTC day (breathing room for the tradie). */
export function earliestSlotStart(now: Date, urgent: boolean): Date {
  if (urgent) return now;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + MS_PER_DAY,
  );
}

/** "Thu 25 Sep, 8:00–10:00 am" — the line on the Slot card. */
export function formatSlot(slot: ProposedSlot): string {
  const day = slot.startAt.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const fmt = (d: Date) =>
    d
      .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" })
      .replace(/\s/g, "");
  return `${day}, ${fmt(slot.startAt)}–${fmt(slot.endAt)}`;
}
