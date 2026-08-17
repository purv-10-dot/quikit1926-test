import { describe, expect, it } from "vitest";
import {
  comparisonLabel,
  decodePeriod,
  encodePeriod,
  isValidWindow,
  MAX_WINDOW_DAYS,
  periodCacheKey,
  periodLabel,
  resolvePeriod,
  trailingWindow,
  windowDays,
} from "@/lib/period/resolve";
import type { PeriodSpec } from "@/lib/period/types";

/** Fixed clock — every assertion below is deterministic. */
const NOW = new Date("2026-08-17T12:00:00Z");

describe("windowDays", () => {
  it("counts inclusively", () => {
    expect(windowDays({ start: "2026-08-11", end: "2026-08-17" })).toBe(7);
    expect(windowDays({ start: "2026-08-17", end: "2026-08-17" })).toBe(1);
  });

  it("returns 0 for malformed input rather than NaN", () => {
    expect(windowDays({ start: "banana", end: "2026-08-17" })).toBe(0);
  });
});

describe("resolvePeriod — current window", () => {
  it("treats a preset as a trailing window ending today, inclusive", () => {
    const sel = resolvePeriod({ preset: 7, compare: "none" }, NOW);
    expect(sel.current).toEqual({ start: "2026-08-11", end: "2026-08-17" });
    expect(windowDays(sel.current)).toBe(7);
  });

  it("honours a valid custom window", () => {
    const sel = resolvePeriod(
      { preset: "custom", customStart: "2026-01-01", customEnd: "2026-01-31", compare: "none" },
      NOW,
    );
    expect(sel.current).toEqual({ start: "2026-01-01", end: "2026-01-31" });
  });

  it("falls back to the default preset when a custom window is reversed", () => {
    const sel = resolvePeriod(
      { preset: "custom", customStart: "2026-03-01", customEnd: "2026-02-01", compare: "none" },
      NOW,
    );
    expect(windowDays(sel.current)).toBe(30);
  });
});

describe("resolvePeriod — baseline window", () => {
  it("returns no baseline when comparison is off", () => {
    const sel = resolvePeriod({ preset: 30, compare: "none" }, NOW);
    expect(sel.previous).toBeNull();
    expect(sel.mode).toBe("none");
  });

  it("wow compares the 7 days immediately before the current 7", () => {
    const sel = resolvePeriod({ preset: 7, compare: "wow" }, NOW);
    expect(sel.current).toEqual({ start: "2026-08-11", end: "2026-08-17" });
    expect(sel.previous).toEqual({ start: "2026-08-04", end: "2026-08-10" });
  });

  it("baseline never overlaps the current window", () => {
    const sel = resolvePeriod({ preset: 30, compare: "previous" }, NOW);
    expect(sel.previous!.end < sel.current.start).toBe(true);
  });

  it("previous/wow baselines are always the same length as current", () => {
    for (const preset of [7, 30, 90, 365] as const) {
      const sel = resolvePeriod({ preset, compare: "previous" }, NOW);
      expect(windowDays(sel.previous!)).toBe(windowDays(sel.current));
    }
  });

  it("mom shifts by calendar month, so lengths may legitimately differ", () => {
    // 1–31 March compared month-over-month lands on 1–28 February.
    const sel = resolvePeriod(
      { preset: "custom", customStart: "2026-03-01", customEnd: "2026-03-31", compare: "mom" },
      NOW,
    );
    expect(sel.previous).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(windowDays(sel.current)).toBe(31);
    expect(windowDays(sel.previous!)).toBe(28);
  });

  it("mom clamps 31 March back to the last day of February", () => {
    const sel = resolvePeriod(
      { preset: "custom", customStart: "2026-03-31", customEnd: "2026-03-31", compare: "mom" },
      NOW,
    );
    expect(sel.previous).toEqual({ start: "2026-02-28", end: "2026-02-28" });
  });

  it("yoy handles a leap day by clamping to 28 Feb in a non-leap year", () => {
    const sel = resolvePeriod(
      { preset: "custom", customStart: "2028-02-29", customEnd: "2028-02-29", compare: "yoy" },
      NOW,
    );
    expect(sel.previous).toEqual({ start: "2027-02-28", end: "2027-02-28" });
  });

  it("accepts an explicit custom baseline", () => {
    const sel = resolvePeriod(
      {
        preset: 7,
        compare: "custom",
        compareStart: "2025-12-01",
        compareEnd: "2025-12-07",
      },
      NOW,
    );
    expect(sel.previous).toEqual({ start: "2025-12-01", end: "2025-12-07" });
  });

  it("drops an invalid custom baseline to no-comparison instead of throwing", () => {
    const sel = resolvePeriod(
      { preset: 7, compare: "custom", compareStart: "2026-01-10", compareEnd: "2026-01-01" },
      NOW,
    );
    expect(sel.previous).toBeNull();
    expect(sel.mode).toBe("none");
  });
});

describe("isValidWindow", () => {
  it("rejects windows longer than the cap", () => {
    expect(isValidWindow(trailingWindow(MAX_WINDOW_DAYS, NOW))).toBe(true);
    expect(isValidWindow({ start: "2020-01-01", end: "2026-01-01" })).toBe(false);
  });

  it("rejects reversed and malformed windows", () => {
    expect(isValidWindow({ start: "2026-08-17", end: "2026-08-11" })).toBe(false);
    expect(isValidWindow({ start: "nope", end: "2026-08-11" })).toBe(false);
    expect(isValidWindow(null)).toBe(false);
  });
});

describe("encode / decode round-trip", () => {
  const cases: PeriodSpec[] = [
    { preset: 7, compare: "none" },
    { preset: 30, compare: "previous" },
    { preset: 7, compare: "wow" },
    { preset: 90, compare: "mom" },
    { preset: 365, compare: "yoy" },
  ];

  it.each(cases)("round-trips %o", (spec) => {
    const decoded = decodePeriod(encodePeriod(spec, NOW));
    const a = resolvePeriod(spec, NOW);
    const b = resolvePeriod(decoded, NOW);
    expect(b.current).toEqual(a.current);
    expect(b.previous).toEqual(a.previous);
  });

  it("keeps the legacy ?days= alias working with no comparison", () => {
    const spec = decodePeriod(new URLSearchParams("days=30"));
    expect(spec).toEqual({ preset: 30, compare: "none" });
    expect(resolvePeriod(spec, NOW).previous).toBeNull();
  });

  it("never adds a comparison to a legacy ?days= request", () => {
    // Both crons and the report builders call with ?days= — silently doubling
    // their outbound API calls would be a regression.
    for (const d of ["1", "7", "45", "400"]) {
      expect(decodePeriod(new URLSearchParams(`days=${d}`)).compare).toBe("none");
    }
  });

  it("degrades hostile input to the default rather than throwing", () => {
    const hostile = [
      "start=banana&end=2026-08-17",
      "start=2026-08-17&end=2026-08-01",
      "cmp=DROP+TABLE",
      "days=-5",
      "days=abc",
      "",
    ];
    for (const q of hostile) {
      const spec = decodePeriod(new URLSearchParams(q));
      const sel = resolvePeriod(spec, NOW);
      expect(isValidWindow(sel.current)).toBe(true);
    }
  });

  it("collapses an explicit 7-day window back onto the preset", () => {
    const spec = decodePeriod(new URLSearchParams("start=2026-08-11&end=2026-08-17"));
    expect(spec.preset).toBe(7);
  });

  it("keeps an odd-length window as custom", () => {
    const spec = decodePeriod(new URLSearchParams("start=2026-08-01&end=2026-08-17"));
    expect(spec.preset).toBe("custom");
    expect(spec.customStart).toBe("2026-08-01");
  });
});

describe("periodCacheKey", () => {
  it("distinguishes comparison-on from comparison-off for the same window", () => {
    const off = periodCacheKey(resolvePeriod({ preset: 7, compare: "none" }, NOW));
    const on = periodCacheKey(resolvePeriod({ preset: 7, compare: "wow" }, NOW));
    expect(off).not.toBe(on);
  });

  it("distinguishes two different comparison modes", () => {
    const wow = periodCacheKey(resolvePeriod({ preset: 30, compare: "previous" }, NOW));
    const mom = periodCacheKey(resolvePeriod({ preset: 30, compare: "mom" }, NOW));
    expect(wow).not.toBe(mom);
  });
});

describe("labels", () => {
  it("prints both windows so a length mismatch is visible", () => {
    const sel = resolvePeriod({ preset: 7, compare: "wow" }, NOW);
    expect(periodLabel(sel)).toBe("11 – 17 Aug 2026 vs 4 – 10 Aug 2026");
  });

  it("prints only the current window when comparison is off", () => {
    const sel = resolvePeriod({ preset: 7, compare: "none" }, NOW);
    expect(periodLabel(sel)).toBe("11 – 17 Aug 2026");
  });

  it("keeps the month when a window spans two months", () => {
    const sel = resolvePeriod(
      { preset: "custom", customStart: "2026-02-28", customEnd: "2026-03-03", compare: "none" },
      NOW,
    );
    expect(periodLabel(sel)).toBe("28 Feb – 3 Mar 2026");
  });

  it("keeps both years when a window spans a year boundary", () => {
    const sel = resolvePeriod(
      { preset: "custom", customStart: "2025-12-20", customEnd: "2026-01-05", compare: "none" },
      NOW,
    );
    expect(periodLabel(sel)).toBe("20 Dec 2025 – 5 Jan 2026");
  });

  it("names each mode", () => {
    expect(comparisonLabel("wow")).toBe("vs. previous week");
    expect(comparisonLabel("mom")).toBe("vs. previous month");
    expect(comparisonLabel("none")).toBe("no comparison");
  });
});
