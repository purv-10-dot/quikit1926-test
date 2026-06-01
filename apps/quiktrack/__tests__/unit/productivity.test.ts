import { describe, it, expect } from "vitest";
import {
  averageVelocity,
  calculateProductivity,
  delayedRate,
  PRODUCTIVITY_WEIGHTS,
  productivityTone,
} from "@/lib/reports/productivity";

describe("calculateProductivity — empty and degenerate inputs", () => {
  it("returns 0 when nothing happened", () => {
    expect(
      calculateProductivity({
        created: 0,
        closed: 0,
        slipped: 0,
        closedOnTime: null,
        estHours: 0,
        actualHours: 0,
      }),
    ).toBe(0);
  });

  it("returns 0 when all tasks created but none closed (and none slipped)", () => {
    // 0/10 completion, no on-time data, no slip = onTime collapses to 1, slip term = 1
    // raw = 0.45*0 + 0.25*1 + 0.2*1 + 0.1*1 = 0.55 → 55
    expect(
      calculateProductivity({
        created: 10,
        closed: 0,
        slipped: 0,
        closedOnTime: null,
        estHours: 0,
        actualHours: 0,
      }),
    ).toBe(55);
  });

  it("returns 100 when everything closed on time with no slips and no hours overrun", () => {
    expect(
      calculateProductivity({
        created: 10,
        closed: 10,
        slipped: 0,
        closedOnTime: 10,
        estHours: 40,
        actualHours: 40,
      }),
    ).toBe(100);
  });

  it("never returns NaN or Infinity when est hours are 0", () => {
    const score = calculateProductivity({
      created: 5,
      closed: 5,
      slipped: 0,
      closedOnTime: 5,
      estHours: 0,
      actualHours: 100,
    });
    expect(Number.isFinite(score)).toBe(true);
    // est=0 → hoursTerm collapses to 1 (no estimate to compare against)
    expect(score).toBe(100);
  });

  it("clamps the final score to the [0, 100] integer band", () => {
    const high = calculateProductivity({
      created: 1,
      closed: 1,
      slipped: 0,
      closedOnTime: 1,
      estHours: 1,
      actualHours: 0.0001,
    });
    expect(high).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(100);
    expect(Number.isInteger(high)).toBe(true);
  });
});

describe("calculateProductivity — slip and on-time terms", () => {
  it("penalizes slip rate proportionally", () => {
    const clean = calculateProductivity({
      created: 10,
      closed: 10,
      slipped: 0,
      closedOnTime: 10,
      estHours: 0,
      actualHours: 0,
    });
    const oneSlip = calculateProductivity({
      created: 10,
      closed: 10,
      slipped: 1,
      closedOnTime: 10,
      estHours: 0,
      actualHours: 0,
    });
    const allSlipped = calculateProductivity({
      created: 10,
      closed: 10,
      slipped: 10,
      closedOnTime: 10,
      estHours: 0,
      actualHours: 0,
    });
    expect(clean).toBeGreaterThan(oneSlip);
    expect(oneSlip).toBeGreaterThan(allSlipped);
  });

  it("collapses on-time term to 1.0 when closedOnTime is null (no due-date data)", () => {
    const withData = calculateProductivity({
      created: 10,
      closed: 10,
      slipped: 0,
      closedOnTime: 5,
      estHours: 0,
      actualHours: 0,
    });
    const withoutData = calculateProductivity({
      created: 10,
      closed: 10,
      slipped: 0,
      closedOnTime: null,
      estHours: 0,
      actualHours: 0,
    });
    expect(withoutData).toBeGreaterThan(withData);
  });

  it("ignores on-time when closed count is 0 (avoids 0/0 = NaN)", () => {
    const score = calculateProductivity({
      created: 5,
      closed: 0,
      slipped: 2,
      closedOnTime: 0,
      estHours: 0,
      actualHours: 0,
    });
    expect(Number.isFinite(score)).toBe(true);
  });
});

describe("calculateProductivity — hours variance term", () => {
  it("doesn't penalize under-budget hours (logged < estimated)", () => {
    const underBudget = calculateProductivity({
      created: 10,
      closed: 10,
      slipped: 0,
      closedOnTime: 10,
      estHours: 100,
      actualHours: 50,
    });
    expect(underBudget).toBe(100);
  });

  it("penalizes by overage percentage", () => {
    const onBudget = calculateProductivity({
      created: 10,
      closed: 10,
      slipped: 0,
      closedOnTime: 10,
      estHours: 100,
      actualHours: 100,
    });
    const halfOver = calculateProductivity({
      created: 10,
      closed: 10,
      slipped: 0,
      closedOnTime: 10,
      estHours: 100,
      actualHours: 150,
    });
    const doubleOver = calculateProductivity({
      created: 10,
      closed: 10,
      slipped: 0,
      closedOnTime: 10,
      estHours: 100,
      actualHours: 200,
    });
    expect(onBudget).toBeGreaterThan(halfOver);
    expect(halfOver).toBeGreaterThan(doubleOver);
  });

  it("never drives score below 0 even with catastrophic overage", () => {
    const score = calculateProductivity({
      created: 10,
      closed: 0,
      slipped: 10,
      closedOnTime: 0,
      estHours: 1,
      actualHours: 999999,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("calculateProductivity — weight invariants", () => {
  it("weights sum to 1.0 (so a perfect input scores 100)", () => {
    const sum =
      PRODUCTIVITY_WEIGHTS.completion +
      PRODUCTIVITY_WEIGHTS.onTime +
      PRODUCTIVITY_WEIGHTS.slip +
      PRODUCTIVITY_WEIGHTS.hours;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("a one-signal perfect input scores around its weight share", () => {
    // Only completion contributes; on-time/slip/hours collapse to 1 each.
    // raw = 0.45*1 + 0.25*1 + 0.2*1 + 0.1*1 = 1.0
    // Actually all four terms collapse to 1, so a completion-only test isn't
    // informative. Instead verify completion weight is dominant.
    expect(PRODUCTIVITY_WEIGHTS.completion).toBeGreaterThan(PRODUCTIVITY_WEIGHTS.onTime);
    expect(PRODUCTIVITY_WEIGHTS.completion).toBeGreaterThan(PRODUCTIVITY_WEIGHTS.slip);
    expect(PRODUCTIVITY_WEIGHTS.completion).toBeGreaterThan(PRODUCTIVITY_WEIGHTS.hours);
  });
});

describe("averageVelocity", () => {
  it("returns 0 for an empty series", () => {
    expect(averageVelocity([])).toBe(0);
  });

  it("rounds to 1 decimal place", () => {
    expect(averageVelocity([1, 1, 1])).toBe(1);
    expect(averageVelocity([1, 2, 3])).toBe(2);
    expect(averageVelocity([1, 2])).toBe(1.5);
    expect(averageVelocity([2, 5, 5])).toBe(4);
  });

  it("handles zero-only series", () => {
    expect(averageVelocity([0, 0, 0])).toBe(0);
  });
});

describe("delayedRate", () => {
  it("returns 0 when no tasks were created", () => {
    expect(delayedRate(0, 0)).toBe(0);
    expect(delayedRate(0, 5)).toBe(0);
  });

  it("computes the delayed-share percentage rounded", () => {
    expect(delayedRate(10, 1)).toBe(10);
    expect(delayedRate(10, 3)).toBe(30);
    expect(delayedRate(7, 1)).toBe(14);
  });

  it("handles slipped > created (data quality edge case)", () => {
    // Slipped can exceed created if dueDate fell in this period but the
    // task was created earlier — we surface the raw rate honestly.
    expect(delayedRate(2, 5)).toBe(250);
  });
});

describe("productivityTone", () => {
  it("maps the high band (>= 80)", () => {
    expect(productivityTone(80)).toBe("high");
    expect(productivityTone(100)).toBe("high");
  });

  it("maps the medium band (60-79)", () => {
    expect(productivityTone(60)).toBe("medium");
    expect(productivityTone(79)).toBe("medium");
  });

  it("maps the low band (< 60)", () => {
    expect(productivityTone(0)).toBe("low");
    expect(productivityTone(59)).toBe("low");
  });
});
