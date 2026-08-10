import { describe, it, expect } from "vitest";
import { computeKPIStats, computeKpiOverviewStats } from "@/app/(dashboard)/kpi/components/kpiStats";
import type { KPIRow } from "@/lib/types/kpi";

function makeKPI(
  weeklyValues: Array<{ weekNumber: number; value: number | null }>,
): KPIRow {
  return {
    id: "kpi-1",
    orgId: "t-1",
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
    // Branch added `bestValue` to the result shape.
    expect(out).toEqual({ filledWeeks: [], avgPerWeek: 0, bestWeek: 0, bestValue: 0 });
  });

  it("returns empty stats when weeklyValues is an empty array", () => {
    const out = computeKPIStats(makeKPI([]));
    // Branch added `bestValue` to the result shape.
    expect(out).toEqual({ filledWeeks: [], avgPerWeek: 0, bestWeek: 0, bestValue: 0 });
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

/**
 * Overview-pill buckets. `computeKpiOverviewStats` is driven entirely by the
 * card COLOR that `getColorByPercentage` resolves, so these fixtures pin one
 * KPI per color band.
 *
 * Setup: `weeksPerQuarter = 13`, `currentWeek = 2` → only week 1 is "prior",
 * and with `target = 130` the flat weekly split makes the week-1 goal exactly
 * 10. So the week-1 value IS the percentage, divided by 10.
 */
function makeOverviewKPI(
  id: string,
  weekOneValue: number | null,
  reverseColor = false,
): KPIRow {
  return {
    id,
    orgId: "t-1",
    name: `KPI ${id}`,
    target: 130,
    qtdGoal: 130,
    qtdAchieved: 0,
    progressPercent: 0,
    status: "active",
    year: 2026,
    quarter: "Q1",
    kpiLevel: "individual",
    measurementUnit: "Number",
    healthStatus: "on-track",
    reverseColor,
    weeklyValues: [{ weekNumber: 1, value: weekOneValue }],
  } as unknown as KPIRow;
}

const OVERVIEW_WEEK = 2;
const OVERVIEW_WEEKS_PER_QUARTER = 13;

function overviewStats(kpis: KPIRow[]) {
  return computeKpiOverviewStats(kpis, OVERVIEW_WEEK, OVERVIEW_WEEKS_PER_QUARTER);
}

describe("computeKpiOverviewStats — Over Achieved bucket", () => {
  it("counts a Blue (>=120%) KPI as overAchieved, NOT onTrack", () => {
    // Regression: Blue used to be folded into `onTrack`, hiding over-achievement.
    const out = overviewStats([makeOverviewKPI("blue", 13)]); // 13/10 = 130%
    expect(out.overAchieved).toBe(1);
    expect(out.onTrack).toBe(0);
    expect(out.atRisk).toBe(0);
    expect(out.behind).toBe(0);
  });

  it("counts a Green (100-119%) KPI as onTrack, not overAchieved", () => {
    const out = overviewStats([makeOverviewKPI("green", 10)]); // 100%
    expect(out.onTrack).toBe(1);
    expect(out.overAchieved).toBe(0);
  });

  it("keeps Yellow in atRisk and Red in behind", () => {
    const out = overviewStats([
      makeOverviewKPI("yellow", 9), // 90%
      makeOverviewKPI("red", 5), // 50%
    ]);
    expect(out.atRisk).toBe(1);
    expect(out.behind).toBe(1);
    expect(out.onTrack).toBe(0);
    expect(out.overAchieved).toBe(0);
  });

  it("buckets a mixed set into four mutually exclusive counts", () => {
    const kpis = [
      makeOverviewKPI("blue", 13), // 130% → overAchieved
      makeOverviewKPI("green", 10), // 100% → onTrack
      makeOverviewKPI("yellow", 9), // 90%  → atRisk
      makeOverviewKPI("red", 5), // 50%  → behind
    ];
    const out = overviewStats(kpis);
    expect(out).toMatchObject({ overAchieved: 1, onTrack: 1, atRisk: 1, behind: 1 });
    // Mean of 130/100/90/50 = 92.5 → rounded.
    expect(out.avg).toBe(93);
    expect(out.overAchieved + out.onTrack + out.atRisk + out.behind).toBe(kpis.length);
  });

  it("excludes not-yet-entered KPIs from every bucket", () => {
    const out = overviewStats([
      makeOverviewKPI("blue", 13),
      makeOverviewKPI("empty", null),
    ]);
    expect(out.overAchieved).toBe(1);
    expect(out.onTrack + out.atRisk + out.behind).toBe(0);
    // Neutral card is excluded from the average too.
    expect(out.avg).toBe(130);
  });

  it("routes a reverse-color KPI that beats target into overAchieved", () => {
    // Lower-is-better at 50% of target → Blue under reverse logic.
    const out = overviewStats([makeOverviewKPI("rev", 5, true)]);
    expect(out.overAchieved).toBe(1);
    expect(out.behind).toBe(0);
  });

  it("returns zeroed buckets for an empty KPI list", () => {
    expect(overviewStats([])).toEqual({
      avg: 0,
      onTrack: 0,
      atRisk: 0,
      behind: 0,
      overAchieved: 0,
    });
  });
});
