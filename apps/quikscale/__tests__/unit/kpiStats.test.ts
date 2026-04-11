import { describe, it, expect } from "vitest";
import { computeKPIStats } from "@/app/(dashboard)/kpi/components/kpiStats";
import type { KPIRow } from "@/lib/types/kpi";

function makeKPI(
  weeklyValues: Array<{ weekNumber: number; value: number | null }>,
): KPIRow {
  return {
    id: "kpi-1",
    tenantId: "t-1",
    name: "Test KPI",
    target: 100,
    qtdGoal: 100,
    qtdAchieved: 0,
    progressPercent: 0,
    status: "active",
    year: 2026,
    quarter: "Q1",
    kpiLevel: "individual",
    measurementUnit: "Number",
    healthStatus: "on-track",
    weeklyValues,
  } as unknown as KPIRow;
}

describe("computeKPIStats — empty input", () => {
  it("returns empty stats when weeklyValues is undefined", () => {
    const kpi = makeKPI([]);
    delete (kpi as Partial<KPIRow>).weeklyValues;
    const out = computeKPIStats(kpi);
    expect(out).toEqual({ filledWeeks: [], avgPerWeek: 0, bestWeek: 0 });
  });

  it("returns empty stats when weeklyValues is an empty array", () => {
    const out = computeKPIStats(makeKPI([]));
    expect(out).toEqual({ filledWeeks: [], avgPerWeek: 0, bestWeek: 0 });
  });

  it("treats null values as unfilled", () => {
    const kpi = makeKPI([
      { weekNumber: 1, value: null },
      { weekNumber: 2, value: null },
    ]);
    const out = computeKPIStats(kpi);
    expect(out.filledWeeks).toHaveLength(0);
    expect(out.avgPerWeek).toBe(0);
  });
});

describe("computeKPIStats — single week", () => {
  it("finds the only filled week", () => {
    const out = computeKPIStats(makeKPI([{ weekNumber: 5, value: 42 }]));
    expect(out.filledWeeks).toEqual([5]);
    expect(out.avgPerWeek).toBe(42);
    expect(out.bestWeek).toBe(5);
  });
});

describe("computeKPIStats — multi-week", () => {
  it("averages all filled weeks", () => {
    const out = computeKPIStats(
      makeKPI([
        { weekNumber: 1, value: 10 },
        { weekNumber: 2, value: 20 },
        { weekNumber: 3, value: 30 },
      ]),
    );
    expect(out.filledWeeks).toEqual([1, 2, 3]);
    expect(out.avgPerWeek).toBe(20);
  });

  it("picks the week with the highest value as bestWeek", () => {
    const out = computeKPIStats(
      makeKPI([
        { weekNumber: 1, value: 10 },
        { weekNumber: 5, value: 100 },
        { weekNumber: 3, value: 50 },
      ]),
    );
    expect(out.bestWeek).toBe(5);
  });

  it("excludes null values from the average", () => {
    const out = computeKPIStats(
      makeKPI([
        { weekNumber: 1, value: 10 },
        { weekNumber: 2, value: null },
        { weekNumber: 3, value: 30 },
      ]),
    );
    // Average should be (10 + 30) / 2 = 20, not (10 + 0 + 30) / 3
    expect(out.avgPerWeek).toBe(20);
    expect(out.filledWeeks).toEqual([1, 3]);
  });
});

describe("computeKPIStats — full quarter", () => {
  it("handles all 13 weeks filled", () => {
    const values = Array.from({ length: 13 }, (_, i) => ({
      weekNumber: i + 1,
      value: (i + 1) * 10,
    }));
    const out = computeKPIStats(makeKPI(values));
    expect(out.filledWeeks).toHaveLength(13);
    // Average of 10..130 = 70
    expect(out.avgPerWeek).toBe(70);
    expect(out.bestWeek).toBe(13);
  });
});
