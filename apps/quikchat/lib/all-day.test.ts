import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allDayDatePart,
  allDayStartIso,
  exclusiveEndFor,
  formatAllDayRange,
  inclusiveEndFor,
  isMidnightUtc,
} from "./all-day";

describe("all-day exclusive ↔ inclusive", () => {
  it("a one-day event on the 14th stores 14th → 15th", () => {
    expect(allDayStartIso("2026-08-14")).toBe("2026-08-14T00:00:00.000Z");
    expect(exclusiveEndFor("2026-08-14")).toBe("2026-08-15T00:00:00.000Z");
  });

  it("round-trips: the DTO's inclusive end is the exact inverse", () => {
    for (const date of ["2026-08-14", "2026-01-01", "2026-12-31", "2026-02-28"]) {
      expect(allDayDatePart(inclusiveEndFor(exclusiveEndFor(date)))).toBe(date);
    }
  });

  it("survives a DST boundary — the conversion is pure UTC arithmetic", () => {
    // 29 Mar 2026 is the European DST spring-forward. A ±1 day computed in
    // local time would land an hour out and, near midnight, a DAY out.
    expect(exclusiveEndFor("2026-03-29")).toBe("2026-03-30T00:00:00.000Z");
    expect(inclusiveEndFor("2026-03-30T00:00:00.000Z")).toBe("2026-03-29T00:00:00.000Z");
  });

  it("spans multiple days without drifting", () => {
    expect(exclusiveEndFor("2026-08-16")).toBe("2026-08-17T00:00:00.000Z");
    expect(allDayDatePart(inclusiveEndFor("2026-08-17T00:00:00.000Z"))).toBe("2026-08-16");
  });

  it("isMidnightUtc is what Graph's isAllDay precondition needs", () => {
    expect(isMidnightUtc("2026-08-14T00:00:00.000Z")).toBe(true);
    // An IST organiser's naive local→UTC conversion of "14 Aug 00:00".
    expect(isMidnightUtc("2026-08-13T18:30:00.000Z")).toBe(false);
    expect(isMidnightUtc("2026-08-14T00:00:00.001Z")).toBe(false);
  });
});

/**
 * THE ONE THAT MATTERS.
 *
 * Storing midnight UTC is only half the fix. Rendering 2026-08-14T00:00:00Z with
 * `toLocaleDateString` and no timeZone shows **13 Aug** to a viewer at UTC−5 —
 * database right, screen wrong. These assert the rendering half, and they are
 * written to FAIL if `formatAllDayRange` stops pinning to UTC.
 *
 * Note they do NOT depend on the machine's timezone: `formatAllDayRange` passes
 * `timeZone: "UTC"` explicitly, and the comparison strings below are produced by
 * an Intl formatter forced to a NEGATIVE-offset zone. On a UTC dev box a naive
 * implementation passes by luck; forcing the zone here removes the luck.
 */
describe("all-day rendering is immune to the viewer's timezone", () => {
  /** What a naive, local-zone renderer would produce for a UTC−5 viewer. */
  const naiveInNewYork = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    });

  afterEach(() => vi.restoreAllMocks());

  /**
   * ASSERTS THE MECHANISM, not the output — deliberately, and this is the whole
   * reason the suite is trustworthy.
   *
   * An output-only assertion is machine-dependent: this repo's dev box runs
   * IST (UTC+05:30), where a NAIVE local render of 2026-08-14T00:00:00Z is
   * still "14 Aug", so deleting the `timeZone: "UTC"` pin leaves every output
   * assertion green. Verified by doing exactly that — removing the pin and
   * re-running: 9/9 still passed. Any positive-offset zone hides the bug, and
   * UTC hides it too; only a negative-offset viewer exposes it.
   *
   * So assert what cannot be faked by the ambient zone: that the formatter
   * pins to UTC when it asks Intl for a string.
   */
  it("pins to UTC when formatting — the assertion the machine's zone cannot fake", () => {
    const spy = vi.spyOn(Date.prototype, "toLocaleDateString");
    formatAllDayRange("2026-08-14T00:00:00.000Z", "2026-08-16T00:00:00.000Z");

    expect(spy).toHaveBeenCalled();
    for (const call of spy.mock.calls) {
      const opts = call[1] as Intl.DateTimeFormatOptions | undefined;
      expect(opts?.timeZone).toBe("UTC");
    }
  });

  it("the 14th renders as the 14th, not the 13th", () => {
    const start = "2026-08-14T00:00:00.000Z";
    const out = formatAllDayRange(start, start);

    // Documents the bug: a local-zone render of this instant is a DIFFERENT day
    // for a UTC−5 viewer. (On a positive-offset dev box this passes either way,
    // which is why the spy above carries the real weight.)
    expect(naiveInNewYork(start)).toContain("13");
    expect(out).toContain("14");
    expect(out).not.toContain("13");
  });

  it("says All day, and collapses a single day to one date", () => {
    const start = "2026-08-14T00:00:00.000Z";
    expect(formatAllDayRange(start, start)).toMatch(/All day$/);
    expect(formatAllDayRange(start, start)).not.toContain("–");
  });

  it("renders a multi-day span with both inclusive endpoints", () => {
    const out = formatAllDayRange("2026-08-14T00:00:00.000Z", "2026-08-16T00:00:00.000Z");
    expect(out).toContain("14");
    expect(out).toContain("16");
    // 17 is the EXCLUSIVE end — it must never surface to a user.
    expect(out).not.toContain("17");
  });

  it("holds at a month boundary, where an off-by-one is most visible", () => {
    const start = "2026-09-01T00:00:00.000Z";
    expect(naiveInNewYork(start)).toContain("Aug"); // naive render slips to August
    expect(formatAllDayRange(start, start)).toContain("Sep");
  });
});
