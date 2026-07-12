import { describe, expect, it } from "vitest";
import {
  earliestSlotStart,
  formatSlot,
  proposeSlots,
  type WeeklyAvailabilityWindow,
} from "../src/scheduling/slots.js";

// 2026-07-12 is a Sunday.
const NOW = new Date("2026-07-12T03:30:00Z");

const weekdays: WeeklyAvailabilityWindow[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "08:00",
  endTime: "12:00",
}));

describe("proposeSlots", () => {
  it("proposes two-hour slots inside availability windows, earliest first", () => {
    const slots = proposeSlots(weekdays, { from: NOW, count: 3 });
    expect(slots).toHaveLength(3);
    // Monday 13th 08:00, 10:00, then Tuesday 14th 08:00.
    expect(slots[0]!.startAt.toISOString()).toBe("2026-07-13T08:00:00.000Z");
    expect(slots[0]!.endAt.toISOString()).toBe("2026-07-13T10:00:00.000Z");
    expect(slots[1]!.startAt.toISOString()).toBe("2026-07-13T10:00:00.000Z");
    expect(slots[2]!.startAt.toISOString()).toBe("2026-07-14T08:00:00.000Z");
  });

  it("never proposes a slot before `from`", () => {
    const monday1030 = new Date("2026-07-13T10:30:00Z");
    const slots = proposeSlots(weekdays, { from: monday1030, count: 2 });
    for (const slot of slots) {
      expect(slot.startAt.getTime()).toBeGreaterThanOrEqual(monday1030.getTime());
    }
    // 10:00 Monday slot is gone; next is Tuesday 08:00.
    expect(slots[0]!.startAt.toISOString()).toBe("2026-07-14T08:00:00.000Z");
  });

  it("falls back to Mon-Fri 8-16 when the tradie has no windows", () => {
    const slots = proposeSlots([], { from: NOW, count: 4 });
    expect(slots).toHaveLength(4);
    expect(slots[0]!.startAt.getUTCDay()).toBe(1); // Monday
    expect(slots[0]!.startAt.getUTCHours()).toBe(8);
  });

  it("respects the horizon", () => {
    const saturdayOnly: WeeklyAvailabilityWindow[] = [
      { dayOfWeek: 6, startTime: "09:00", endTime: "11:00" },
    ];
    const slots = proposeSlots(saturdayOnly, { from: NOW, count: 5, horizonDays: 5 });
    // Next Saturday is 6 days out — beyond the 5-day horizon.
    expect(slots).toHaveLength(0);
  });
});

describe("earliestSlotStart", () => {
  it("urgent jobs may start immediately", () => {
    expect(earliestSlotStart(NOW, true).getTime()).toBe(NOW.getTime());
  });
  it("routine jobs start from the next day", () => {
    expect(earliestSlotStart(NOW, false).toISOString()).toBe("2026-07-13T00:00:00.000Z");
  });
});

describe("formatSlot", () => {
  it("renders the Slot card line", () => {
    const [slot] = proposeSlots(weekdays, { from: NOW, count: 1 });
    expect(formatSlot(slot!)).toMatch(/Mon.*13.*Jul/);
    expect(formatSlot(slot!)).toContain("8:00");
  });
});
