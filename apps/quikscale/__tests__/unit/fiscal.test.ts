import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  QUARTER_STARTS,
  ALL_QUARTERS,
  ALL_WEEKS,
  getFiscalYear,
  getFiscalQuarter,
  fiscalYearLabel,
  getQuarterStart,
  getCurrentFiscalWeek,
  getCurrentFiscalWeekFromStart,
  getWeekDateRange,
  weekDateLabel,
} from "@/lib/utils/fiscal";

describe("constants", () => {
  it("has 4 quarters", () => {
    expect(ALL_QUARTERS).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  });

  it("has 13 weeks", () => {
    expect(ALL_WEEKS).toHaveLength(13);
    expect(ALL_WEEKS[0]).toBe(1);
    expect(ALL_WEEKS[12]).toBe(13);
  });

  it("Q1 starts in April (month index 3)", () => {
    expect(QUARTER_STARTS.Q1).toEqual([3, 1]);
  });

  it("Q4 starts in January (month index 0)", () => {
    expect(QUARTER_STARTS.Q4).toEqual([0, 1]);
  });
});

describe("fiscalYearLabel", () => {
  it("formats with en-dash", () => {
    expect(fiscalYearLabel(2026)).toBe("2026–2027");
  });
});

describe("getFiscalYear + getFiscalQuarter (date-dependent)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("March is still last fiscal year, Q4", () => {
    vi.setSystemTime(new Date(2027, 2, 15)); // March 2027
    expect(getFiscalYear()).toBe(2026);
    expect(getFiscalQuarter()).toBe("Q4");
  });

  it("April 1 starts new fiscal year, Q1", () => {
    vi.setSystemTime(new Date(2026, 3, 1)); // April 1, 2026
    expect(getFiscalYear()).toBe(2026);
    expect(getFiscalQuarter()).toBe("Q1");
  });

  it("July is Q2", () => {
    vi.setSystemTime(new Date(2026, 6, 15));
    expect(getFiscalQuarter()).toBe("Q2");
  });

  it("October is Q3", () => {
    vi.setSystemTime(new Date(2026, 9, 15));
    expect(getFiscalQuarter()).toBe("Q3");
  });

  it("January is Q4 of previous fiscal year", () => {
    vi.setSystemTime(new Date(2027, 0, 15)); // Jan 2027
    expect(getFiscalYear()).toBe(2026);
    expect(getFiscalQuarter()).toBe("Q4");
  });
});

describe("getQuarterStart", () => {
  it("Q1 2026 → April 1, 2026", () => {
    const d = getQuarterStart(2026, "Q1");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(1);
  });

  it("Q4 2026 → January 1, 2027 (rolls forward)", () => {
    const d = getQuarterStart(2026, "Q4");
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
});

describe("getCurrentFiscalWeek", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is week 1 on Q1 start day", () => {
    vi.setSystemTime(new Date(2026, 3, 1));
    expect(getCurrentFiscalWeek(2026, "Q1")).toBe(1);
  });

  it("is capped at week 13 after the quarter ends", () => {
    vi.setSystemTime(new Date(2026, 6, 30)); // way past Q1 end
    expect(getCurrentFiscalWeek(2026, "Q1")).toBe(13);
  });

  it("is clamped to week 1 before the quarter starts", () => {
    vi.setSystemTime(new Date(2026, 2, 1)); // March 2026, before Q1
    expect(getCurrentFiscalWeek(2026, "Q1")).toBe(1);
  });
});

describe("getCurrentFiscalWeekFromStart", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns 1 before the start date", () => {
    vi.setSystemTime(new Date(2026, 3, 1));
    expect(getCurrentFiscalWeekFromStart(new Date(2026, 5, 1))).toBe(1);
  });

  it("returns 1 on the start date", () => {
    const start = new Date(2026, 3, 1);
    vi.setSystemTime(start);
    expect(getCurrentFiscalWeekFromStart(start)).toBe(1);
  });

  it("increments week each 7 days from start", () => {
    const start = new Date(2026, 3, 1);
    vi.setSystemTime(new Date(2026, 3, 8)); // +7 days
    expect(getCurrentFiscalWeekFromStart(start)).toBe(2);
    vi.setSystemTime(new Date(2026, 3, 15)); // +14 days
    expect(getCurrentFiscalWeekFromStart(start)).toBe(3);
  });

  it("caps at 13", () => {
    const start = new Date(2026, 3, 1);
    vi.setSystemTime(new Date(2027, 3, 1)); // +365 days
    expect(getCurrentFiscalWeekFromStart(start)).toBe(13);
  });

  it("accepts ISO string", () => {
    // 22 days after start → well into week 4, safe from timezone-offset edge
    // (ISO "2026-04-01" parses as UTC midnight which can shift week calc).
    vi.setSystemTime(new Date(2026, 3, 23));
    const w = getCurrentFiscalWeekFromStart("2026-04-01");
    expect(w).toBeGreaterThanOrEqual(3);
    expect(w).toBeLessThanOrEqual(4);
  });
});

describe("getWeekDateRange", () => {
  it("week 1 Q1 2026 is '1 Apr – 7 Apr'", () => {
    expect(getWeekDateRange(2026, "Q1", 1)).toBe("1 Apr – 7 Apr");
  });

  it("week 1 Q4 rolls into the next calendar year", () => {
    // Q4 starts Jan 1 of year+1, so week 1 Q4 2026 is in 2027
    expect(getWeekDateRange(2026, "Q4", 1)).toBe("1 Jan – 7 Jan");
  });
});

describe("weekDateLabel", () => {
  it("same-month label: '1–7 Apr'", () => {
    expect(weekDateLabel(2026, "Q1", 1)).toBe("1–7 Apr");
  });

  it("cross-month label has both month names", () => {
    // Week 5 of Q1 starts Apr 29, ends May 5
    const label = weekDateLabel(2026, "Q1", 5);
    expect(label).toMatch(/Apr.*May/);
  });
});
