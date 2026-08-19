/**
 * Window helper — rolling24hRangeUtc (RED→GREEN).
 *
 * The digest reports a ROLLING 24-HOUR window: [now − 24h, now), stateless.
 * At the 20:30 IST cron this = [yesterday 20:30 IST, today 20:30 IST) — back-to-
 * back daily windows, no gap/overlap.
 *
 * The rolling helpers do NO IST / calendar math: from/to are plain UTC instants
 * (now and now−24h). These now back the WEEKLY summary (days=7) only.
 *
 * The DAILY digest uses previousIstCalendarDayUtc — covered by its own describe
 * block at the bottom of this file.
 *
 * `now` is injected for determinism. Half-open [from, to): gte from, lt to.
 */
import { describe, it, expect } from "vitest";
import {
  previousIstCalendarDayUtc,
  rolling24hRangeUtc,
  rollingWindowUtc,
} from "@/lib/services/notifications/digest-window";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("rolling24hRangeUtc — [now − 24h, now), pure UTC", () => {
  it("to === now exactly; from === now − 24h exactly", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { from, to } = rolling24hRangeUtc(now);
    expect(to.getTime()).toBe(now.getTime());
    expect(from.getTime()).toBe(now.getTime() - DAY_MS);
  });

  it("window is exactly 24h wide", () => {
    const { from, to } = rolling24hRangeUtc(new Date("2026-06-25T15:00:00.000Z"));
    expect(to.getTime() - from.getTime()).toBe(DAY_MS);
  });

  it("BOUNDARY: activity 23h ago is INSIDE", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { from, to } = rolling24hRangeUtc(now);
    const act = now.getTime() - 23 * 60 * 60 * 1000;
    expect(act >= from.getTime() && act < to.getTime()).toBe(true);
  });

  it("BOUNDARY: activity 25h ago is OUTSIDE (< from)", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { from } = rolling24hRangeUtc(now);
    const act = now.getTime() - 25 * 60 * 60 * 1000;
    expect(act < from.getTime()).toBe(true);
  });

  it("EDGE: activity at exactly now − 24h is INSIDE (from is inclusive, gte)", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { from } = rolling24hRangeUtc(now);
    expect((now.getTime() - DAY_MS)).toBe(from.getTime()); // == from → gte includes it
  });

  it("EDGE: activity at exactly now is OUTSIDE (to is exclusive, lt)", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { to } = rolling24hRangeUtc(now);
    // an activity at exactly `to` (=now) is NOT < to → excluded
    expect(now.getTime() < to.getTime()).toBe(false);
  });

  it("NO IST ARTIFACT: from/to are exactly now and now−24h regardless of wall-clock date", () => {
    // Two very different instants — neither snaps to any calendar/IST boundary;
    // each yields a pure [now−24h, now).
    for (const iso of ["2026-01-01T00:00:00.000Z", "2026-06-25T20:30:45.123Z", "2026-12-31T18:30:00.000Z"]) {
      const now = new Date(iso);
      const { from, to } = rolling24hRangeUtc(now);
      expect(to.toISOString()).toBe(now.toISOString());            // to is exactly now (no rounding)
      expect(from.getTime()).toBe(now.getTime() - DAY_MS);         // from is exactly now−24h (no IST snap)
    }
  });
});

describe("rollingWindowUtc(now, days) — parameterized window (weekly summary)", () => {
  it("days=1 is byte-identical to the 24h alias (helper contract; daily no longer calls it)", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const param = rollingWindowUtc(now, 1);
    const legacy = rolling24hRangeUtc(now);
    expect(param.from.getTime()).toBe(legacy.from.getTime());
    expect(param.to.getTime()).toBe(legacy.to.getTime());
    expect(param.to.getTime() - param.from.getTime()).toBe(DAY_MS);
  });

  it("days=7 → [now − 7*DAY, now); to===now, from===now−7d, exactly 7 days wide", () => {
    const now = new Date("2026-06-25T15:00:00.000Z");
    const { from, to } = rollingWindowUtc(now, 7);
    expect(to.getTime()).toBe(now.getTime());
    expect(from.getTime()).toBe(now.getTime() - 7 * DAY_MS);
    expect(to.getTime() - from.getTime()).toBe(7 * DAY_MS);
  });

  it("rolling24hRangeUtc is the days=1 alias (delegates to rollingWindowUtc)", () => {
    const now = new Date("2026-06-25T20:30:45.123Z");
    expect(rolling24hRangeUtc(now)).toEqual(rollingWindowUtc(now, 1));
  });
});

describe("previousIstCalendarDayUtc — previous IST calendar day (DAILY digest)", () => {
  // IST midnight = 18:30 UTC the previous day. The 10:00 IST cron = 04:30 UTC.
  const at10amIst = (date: string) => new Date(`${date}T04:30:00.000Z`);

  it("19 Aug 10:00 IST run → covers 18 Aug 00:00 IST to 19 Aug 00:00 IST", () => {
    const { from, to } = previousIstCalendarDayUtc(at10amIst("2026-08-19"));
    expect(from.toISOString()).toBe("2026-08-17T18:30:00.000Z"); // 18 Aug 00:00 IST
    expect(to.toISOString()).toBe("2026-08-18T18:30:00.000Z"); // 19 Aug 00:00 IST
  });

  it("20 Aug 10:00 IST run → covers 19 Aug", () => {
    const { from, to } = previousIstCalendarDayUtc(at10amIst("2026-08-20"));
    expect(from.toISOString()).toBe("2026-08-18T18:30:00.000Z"); // 19 Aug 00:00 IST
    expect(to.toISOString()).toBe("2026-08-19T18:30:00.000Z"); // 20 Aug 00:00 IST
  });

  it("21 Aug 10:00 IST run → covers 20 Aug", () => {
    const { from, to } = previousIstCalendarDayUtc(at10amIst("2026-08-21"));
    expect(from.toISOString()).toBe("2026-08-19T18:30:00.000Z"); // 20 Aug 00:00 IST
    expect(to.toISOString()).toBe("2026-08-20T18:30:00.000Z"); // 21 Aug 00:00 IST
  });

  it("window is exactly 24h wide", () => {
    const { from, to } = previousIstCalendarDayUtc(at10amIst("2026-08-19"));
    expect(to.getTime() - from.getTime()).toBe(DAY_MS);
  });

  it("EDGE: 18 Aug 00:00:00.000 IST is INSIDE (from inclusive, gte)", () => {
    const { from } = previousIstCalendarDayUtc(at10amIst("2026-08-19"));
    const act = new Date("2026-08-17T18:30:00.000Z"); // 18 Aug 00:00 IST
    expect(act.getTime() >= from.getTime()).toBe(true);
  });

  it("EDGE: 18 Aug 23:59:59.999 IST is INSIDE (last instant of the day)", () => {
    const { from, to } = previousIstCalendarDayUtc(at10amIst("2026-08-19"));
    const act = new Date("2026-08-18T18:29:59.999Z"); // 18 Aug 23:59:59.999 IST
    expect(act.getTime() >= from.getTime() && act.getTime() < to.getTime()).toBe(true);
  });

  it("EDGE: 19 Aug 00:00:00.000 IST is OUTSIDE (to exclusive — belongs to next digest)", () => {
    const { to } = previousIstCalendarDayUtc(at10amIst("2026-08-19"));
    const act = new Date("2026-08-18T18:30:00.000Z"); // 19 Aug 00:00 IST
    expect(act.getTime() < to.getTime()).toBe(false);
  });

  it("EXCLUDES same-day activity: a 19 Aug 09:00 IST call is not in the 19 Aug run", () => {
    const { to } = previousIstCalendarDayUtc(at10amIst("2026-08-19"));
    const act = new Date("2026-08-19T03:30:00.000Z"); // 19 Aug 09:00 IST
    expect(act.getTime() < to.getTime()).toBe(false);
  });

  it("EXCLUDES the prior day: a 17 Aug 23:00 IST call is not in the 19 Aug run", () => {
    const { from } = previousIstCalendarDayUtc(at10amIst("2026-08-19"));
    const act = new Date("2026-08-17T17:30:00.000Z"); // 17 Aug 23:00 IST
    expect(act.getTime() < from.getTime()).toBe(true);
  });

  it("STABLE across fire time: any run on the same IST day yields the same window", () => {
    // 10:00 IST (on time), 10:47 IST (delayed retry), 23:30 IST (late manual re-fire)
    const base = previousIstCalendarDayUtc(at10amIst("2026-08-19"));
    for (const iso of ["2026-08-19T05:17:00.000Z", "2026-08-19T18:00:00.000Z"]) {
      const other = previousIstCalendarDayUtc(new Date(iso));
      expect(other.from.toISOString()).toBe(base.from.toISOString());
      expect(other.to.toISOString()).toBe(base.to.toISOString());
    }
  });

  it("EDGE: a run just after IST midnight still reports the day that just closed", () => {
    // 2026-08-19T18:35Z = 20 Aug 00:05 IST → previous IST day is 19 Aug
    const { from, to } = previousIstCalendarDayUtc(new Date("2026-08-19T18:35:00.000Z"));
    expect(from.toISOString()).toBe("2026-08-18T18:30:00.000Z"); // 19 Aug 00:00 IST
    expect(to.toISOString()).toBe("2026-08-19T18:30:00.000Z"); // 20 Aug 00:00 IST
  });

  it("EDGE: month and year boundaries roll correctly", () => {
    const month = previousIstCalendarDayUtc(at10amIst("2026-09-01")); // → 31 Aug
    expect(month.from.toISOString()).toBe("2026-08-30T18:30:00.000Z");
    expect(month.to.toISOString()).toBe("2026-08-31T18:30:00.000Z");

    const year = previousIstCalendarDayUtc(at10amIst("2027-01-01")); // → 31 Dec 2026
    expect(year.from.toISOString()).toBe("2026-12-30T18:30:00.000Z");
    expect(year.to.toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });
});
