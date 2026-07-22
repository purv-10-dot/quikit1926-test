import type { CalendarEventDto } from "@/lib/shared";
import { describe, expect, it } from "vitest";
import { decimalHour, timeLabelOf, toMonthEvents, toWeekEvents } from "./calendar-transform";

// Build ISO strings from LOCAL wall-clock parts so decimalHour round-trips
// deterministically regardless of the runner's timezone (local → UTC → local).
function localIso(y: number, m: number, d: number, hh: number, mm = 0): string {
  return new Date(y, m, d, hh, mm, 0, 0).toISOString();
}

function ev(partial: Partial<CalendarEventDto> & { start: string; end: string }): CalendarEventDto {
  return {
    id: "e1",
    calendarId: "cal-default",
    source: "event",
    title: "Sample",
    description: null,
    location: null,
    allDay: false,
    color: "#3b82f6",
    joinUrl: null,
    channelId: null,
    editable: true,
    ...partial,
  };
}

// Sunday June 14 2026, local midnight — the week anchor used across the tests.
const weekStart = new Date(2026, 5, 14, 0, 0, 0, 0);

describe("decimalHour / timeLabelOf", () => {
  it("reads local decimal hours and formats Ram's month time string", () => {
    expect(decimalHour(localIso(2026, 5, 16, 9, 45))).toBeCloseTo(9.75, 5);
    expect(timeLabelOf(9.75)).toBe("9.45am");
    expect(timeLabelOf(15.5)).toBe("3.30pm");
    expect(timeLabelOf(12)).toBe("12.00pm");
  });
});

describe("toWeekEvents", () => {
  it("places a mid-week event on the right day index with decimal hours", () => {
    // Tuesday (2 days after Sunday), 10:30–11:00 local.
    const events = [
      ev({ id: "mid", start: localIso(2026, 5, 16, 10, 30), end: localIso(2026, 5, 16, 11, 0) }),
    ];
    const [w] = toWeekEvents(events, weekStart);
    expect(w).toBeDefined();
    expect(w!.day).toBe(2);
    expect(w!.start).toBeCloseTo(10.5, 5);
    expect(w!.end).toBeCloseTo(11, 5);
    expect(w!.title).toBe("Sample");
    expect(w!.color).toBe("#3b82f6");
  });

  it("excludes an event outside the week window", () => {
    const events = [
      ev({ id: "next", start: localIso(2026, 5, 25, 9, 0), end: localIso(2026, 5, 25, 9, 30) }),
    ];
    expect(toWeekEvents(events, weekStart)).toHaveLength(0);
  });

  it("carries editable:false for a meeting-overlay event", () => {
    const events = [
      ev({
        id: "m1",
        source: "meeting",
        editable: false,
        calendarId: null,
        start: localIso(2026, 5, 15, 14, 0),
        end: localIso(2026, 5, 15, 14, 30),
      }),
    ];
    const [w] = toWeekEvents(events, weekStart);
    expect(w).toBeDefined();
    expect(w!.source).toBe("meeting");
    expect(w!.editable).toBe(false);
    expect(w!.day).toBe(1);
  });
});

describe("toMonthEvents", () => {
  it("maps day-of-month + Ram's time string, and excludes other months", () => {
    const cursor = new Date(2026, 5, 14);
    const events = [
      ev({ id: "in", start: localIso(2026, 5, 16, 9, 45), end: localIso(2026, 5, 16, 10, 30) }),
      ev({ id: "out", start: localIso(2026, 6, 3, 9, 0), end: localIso(2026, 6, 3, 9, 30) }),
    ];
    const month = toMonthEvents(events, cursor);
    expect(month).toHaveLength(1);
    expect(month[0]!.id).toBe("in");
    expect(month[0]!.d).toBe(16);
    expect(month[0]!.time).toBe("9.45am");
    expect(month[0]!.start).toBeCloseTo(9.75, 5);
  });

  it("carries editable:false for a meeting-overlay event", () => {
    const cursor = new Date(2026, 5, 14);
    const events = [
      ev({
        id: "m1",
        source: "meeting",
        editable: false,
        calendarId: null,
        start: localIso(2026, 5, 20, 14, 0),
        end: localIso(2026, 5, 20, 14, 30),
      }),
    ];
    const [m] = toMonthEvents(events, cursor);
    expect(m).toBeDefined();
    expect(m!.source).toBe("meeting");
    expect(m!.editable).toBe(false);
  });
});
