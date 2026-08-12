/**
 * Clean disposition form — Activity date+time (Option A, WYSIWYG).
 *
 * initialActivityDateTime(now) returns the open-time as a NON-BLANK
 * datetime-local string (YYYY-MM-DDTHH:mm, local wall-clock, zero-padded). This
 * is the prefill that makes "untouched = open-time": because the field opens
 * non-blank at the open instant, an untouched save stores the SHOWN time — never
 * blank, never save-time-stamped. Pinning it here (not just browser) guards the
 * WYSIWYG-untouched behavior against silent regression.
 *
 * TZ-independent: the input is built from numeric LOCAL components and the
 * expected is a literal string, so the helper's local-getter formatting and the
 * test agree in any timezone (new Date("...") as the expected would be flaky).
 *
 * RED until initialActivityDateTime exists in clean-call-log-payload.ts.
 */
import { describe, it, expect } from "vitest";
import { initialActivityDateTime } from "@/lib/services/forms/clean-call-log-payload";

describe("initialActivityDateTime — prefill the field at open-time (WYSIWYG untouched)", () => {
  it("returns a NON-BLANK datetime-local string for the given moment", () => {
    const s = initialActivityDateTime(new Date(2026, 5, 18, 9, 30)); // local: 2026-06-18 09:30
    expect(s).toBe("2026-06-18T09:30");
  });

  it("zero-pads month/day/hour/minute (e.g. 09:05, single-digit month)", () => {
    const s = initialActivityDateTime(new Date(2026, 0, 3, 9, 5)); // local: 2026-01-03 09:05
    expect(s).toBe("2026-01-03T09:05");
  });

  it("is parseable back to the SAME instant it represents (round-trips)", () => {
    const now = new Date(2026, 5, 18, 14, 7);
    const s = initialActivityDateTime(now);
    // datetime-local is local wall-clock; parsing it back yields the same moment.
    expect(new Date(s).getTime()).toBe(new Date(2026, 5, 18, 14, 7).getTime());
  });
});
