/**
 * Pure, side-effect-free transforms from the server's CalendarEventDto shape
 * into the exact { WeekEvent } / { MonthEvent } shapes Ram's CalendarModule
 * renders. No React, no fetch — trivially unit-testable. Times are read in
 * LOCAL time (getHours/getMinutes), consistent with Ram's timeLabel and
 * FreeBusyGrid.localMinutes, so decimal hours line up with the grid math.
 */
import { differenceInCalendarDays, isSameMonth } from "date-fns";
import type { CalendarEventDto } from "@/lib/shared";

export type WeekEvent = {
  day: number;
  start: number;
  end: number;
  title: string;
  color: string;
  // Optional because two legacy inline literals in CalendarModule
  // (openNewMeeting + the month-cell onClick) construct a WeekEvent with only
  // {day,start,end,title,color} and must stay byte-identical. The transforms
  // below always populate these; nothing in the render reads them (they exist
  // for the Stage 3b write-path). Keep them optional until 3b revisits the modal.
  id?: string;
  source?: "event" | "meeting";
  editable?: boolean;
  calendarId?: string | null;
};

export type MonthEvent = {
  id: string;
  d: number;
  title: string;
  time: string;
  start: number;
  end: number;
  color: string;
  source: "event" | "meeting";
  editable: boolean;
  calendarId: string | null;
};

/** Local decimal hour of an ISO timestamp (e.g. 09:45 local → 9.75). */
export function decimalHour(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

/** Ram's exact month time-string format (e.g. 9.75 → "9.45am"). */
export function timeLabelOf(hour: number): string {
  const hr = Math.floor(hour);
  const min = Math.round((hour - hr) * 60);
  const suffix = hr < 12 ? "am" : "pm";
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}.${String(min).padStart(2, "0")}${suffix}`;
}

/** Events whose local date lands in [weekStart, weekStart+6], as WeekEvents. */
export function toWeekEvents(events: CalendarEventDto[], weekStart: Date): WeekEvent[] {
  const out: WeekEvent[] = [];
  for (const e of events) {
    const day = differenceInCalendarDays(new Date(e.start), weekStart);
    if (day < 0 || day > 6) continue;
    out.push({
      id: e.id,
      day,
      start: decimalHour(e.start),
      end: decimalHour(e.end),
      title: e.title,
      color: e.color,
      source: e.source,
      editable: e.editable,
      calendarId: e.calendarId,
    });
  }
  return out;
}

/** Events in the same local month as `cursor`, as MonthEvents. */
export function toMonthEvents(events: CalendarEventDto[], cursor: Date): MonthEvent[] {
  const out: MonthEvent[] = [];
  for (const e of events) {
    const startDate = new Date(e.start);
    if (!isSameMonth(startDate, cursor)) continue;
    const start = decimalHour(e.start);
    out.push({
      id: e.id,
      d: startDate.getDate(),
      title: e.title,
      time: timeLabelOf(start),
      start,
      end: decimalHour(e.end),
      color: e.color,
      source: e.source,
      editable: e.editable,
      calendarId: e.calendarId,
    });
  }
  return out;
}
