import { describe, it, expect } from "vitest";
import {
  isLeapYear,
  addDays,
  diffDays,
  fyContainsLeapDay,
  computeFiscalYearRange,
  generateQuarterDates,
} from "@/lib/utils/quarterGen";

const UTC = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

describe("isLeapYear", () => {
  it("accepts divisible-by-4 non-century years", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2028)).toBe(true);
  });
  it("rejects non-divisible-by-4 years", () => {
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2026)).toBe(false);
  });
  it("rejects century years not divisible by 400", () => {
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
  });
  it("accepts century years divisible by 400", () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2400)).toBe(true);
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    expect(addDays(UTC(2026, 0, 1), 5)).toEqual(UTC(2026, 0, 6));
  });
  it("subtracts with negative days", () => {
    expect(addDays(UTC(2026, 0, 5), -4)).toEqual(UTC(2026, 0, 1));
  });
  it("handles month rollover", () => {
    expect(addDays(UTC(2026, 0, 30), 5)).toEqual(UTC(2026, 1, 4));
  });
  it("handles year rollover", () => {
    expect(addDays(UTC(2026, 11, 30), 5)).toEqual(UTC(2027, 0, 4));
  });
  it("returns a new Date (does not mutate input)", () => {
    const d = UTC(2026, 0, 1);
    const out = addDays(d, 10);
    expect(d).toEqual(UTC(2026, 0, 1));
    expect(out).not.toBe(d);
  });
});

describe("diffDays", () => {
  it("returns 0 for the same date", () => {
    expect(diffDays(UTC(2026, 0, 1), UTC(2026, 0, 1))).toBe(0);
  });
  it("returns positive for future", () => {
    expect(diffDays(UTC(2026, 0, 1), UTC(2026, 0, 11))).toBe(10);
  });
  it("returns negative for past", () => {
    expect(diffDays(UTC(2026, 0, 11), UTC(2026, 0, 1))).toBe(-10);
  });
  it("handles year crossings", () => {
    expect(diffDays(UTC(2025, 11, 31), UTC(2026, 0, 1))).toBe(1);
  });
});

describe("fyContainsLeapDay", () => {
  it("detects leap day in a standard April-March FY2023", () => {
    // FY2023 = Apr 1 2023 – Mar 31 2024 → contains Feb 29 2024
    expect(
      fyContainsLeapDay(UTC(2023, 3, 1), UTC(2024, 2, 31)),
    ).toBe(true);
  });
  it("rejects an FY with no Feb 29 in range", () => {
    // FY2024 = Apr 1 2024 – Mar 31 2025 → no Feb 29 (Feb 29 2024 was before start)
    expect(
      fyContainsLeapDay(UTC(2024, 3, 1), UTC(2025, 2, 31)),
    ).toBe(false);
  });
  it("handles Feb 29 exactly on start", () => {
    expect(
      fyContainsLeapDay(UTC(2024, 1, 29), UTC(2024, 1, 29)),
    ).toBe(true);
  });
  it("handles Feb 29 exactly on end", () => {
    expect(
      fyContainsLeapDay(UTC(2023, 5, 1), UTC(2024, 1, 29)),
    ).toBe(true);
  });
});

describe("computeFiscalYearRange", () => {
  it("uses 1st of fiscalStartMonth when fyStartDate omitted", () => {
    const { fyStart, fyEnd } = computeFiscalYearRange(2026, 4);
    expect(fyStart).toEqual(UTC(2026, 3, 1));
    expect(fyEnd).toEqual(UTC(2027, 2, 31));
  });
  it("uses fyStartDate when provided", () => {
    const { fyStart, fyEnd } = computeFiscalYearRange(
      2026,
      4,
      UTC(2026, 3, 15),
    );
    expect(fyStart).toEqual(UTC(2026, 3, 15));
    expect(fyEnd).toEqual(UTC(2027, 3, 14));
  });
  it("supports Jan-based fiscal year", () => {
    const { fyStart, fyEnd } = computeFiscalYearRange(2026, 1);
    expect(fyStart).toEqual(UTC(2026, 0, 1));
    expect(fyEnd).toEqual(UTC(2026, 11, 31));
  });
  it("supports July-based fiscal year", () => {
    const { fyStart, fyEnd } = computeFiscalYearRange(2026, 7);
    expect(fyStart).toEqual(UTC(2026, 6, 1));
    expect(fyEnd).toEqual(UTC(2027, 5, 30));
  });
  it("FY span is always 365 or 366 days", () => {
    for (let y = 2020; y <= 2030; y++) {
      const { fyStart, fyEnd } = computeFiscalYearRange(y, 4);
      const total = diffDays(fyStart, fyEnd) + 1;
      expect([365, 366]).toContain(total);
    }
  });
});

describe("generateQuarterDates", () => {
  it("produces exactly 4 quarters labelled Q1-Q4", () => {
    const q = generateQuarterDates(2026, 4);
    expect(q).toHaveLength(4);
    expect(q.map((r) => r.quarter)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  });

  it("non-leap FY2026 (Apr) — Q1-Q3=91 days, Q4=92", () => {
    // FY2026 = Apr 1 2026 – Mar 31 2027 → 365 days, no leap day
    const q = generateQuarterDates(2026, 4);
    expect(diffDays(q[0].startDate, q[0].endDate) + 1).toBe(91);
    expect(diffDays(q[1].startDate, q[1].endDate) + 1).toBe(91);
    expect(diffDays(q[2].startDate, q[2].endDate) + 1).toBe(91);
    expect(diffDays(q[3].startDate, q[3].endDate) + 1).toBe(92);
  });

  it("leap FY2023 (Apr) — Q1-Q3=91 days, Q4=93", () => {
    // FY2023 = Apr 1 2023 – Mar 31 2024 → 366 days, contains Feb 29 2024
    const q = generateQuarterDates(2023, 4);
    expect(diffDays(q[0].startDate, q[0].endDate) + 1).toBe(91);
    expect(diffDays(q[1].startDate, q[1].endDate) + 1).toBe(91);
    expect(diffDays(q[2].startDate, q[2].endDate) + 1).toBe(91);
    expect(diffDays(q[3].startDate, q[3].endDate) + 1).toBe(93);
  });

  it("quarters are contiguous with no gaps or overlaps", () => {
    const q = generateQuarterDates(2026, 4);
    expect(addDays(q[0].endDate, 1)).toEqual(q[1].startDate);
    expect(addDays(q[1].endDate, 1)).toEqual(q[2].startDate);
    expect(addDays(q[2].endDate, 1)).toEqual(q[3].startDate);
  });

  it("sum of quarter days equals full FY length", () => {
    const q = generateQuarterDates(2026, 4);
    const total =
      q.reduce((acc, r) => acc + diffDays(r.startDate, r.endDate) + 1, 0);
    expect(total).toBe(365);
  });

  it("sum equals 366 in a leap FY", () => {
    const q = generateQuarterDates(2023, 4);
    const total =
      q.reduce((acc, r) => acc + diffDays(r.startDate, r.endDate) + 1, 0);
    expect(total).toBe(366);
  });

  it("Q1 starts on the FY start date", () => {
    const q = generateQuarterDates(2026, 4);
    expect(q[0].startDate).toEqual(UTC(2026, 3, 1));
  });

  it("honours a custom fyStartDate mid-month", () => {
    const q = generateQuarterDates(2026, 4, UTC(2026, 3, 15));
    expect(q[0].startDate).toEqual(UTC(2026, 3, 15));
    // Q4 ends exactly 1 year - 1 day later
    expect(q[3].endDate).toEqual(UTC(2027, 3, 14));
  });

  it("supports January-based FY (calendar year)", () => {
    const q = generateQuarterDates(2026, 1);
    expect(q[0].startDate).toEqual(UTC(2026, 0, 1));
    expect(q[3].endDate).toEqual(UTC(2026, 11, 31));
  });
});
