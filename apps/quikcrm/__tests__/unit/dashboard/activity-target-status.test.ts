/**
 * Pure attainment thresholds for the Activity Targets feature.
 *   green  >= 100%, yellow 80–99%, red < 80%.
 */
import { describe, expect, it } from "vitest";
import { computeAttainment } from "@/lib/services/dashboard/activity-target-status";

describe("computeAttainment", () => {
  it("green when actual meets or exceeds target (>=100%)", () => {
    expect(computeAttainment(10, 10).status).toBe("green");
    expect(computeAttainment(10, 15).status).toBe("green");
    expect(computeAttainment(10, 10).completionPct).toBe(100);
    expect(computeAttainment(10, 10).remaining).toBe(0);
  });

  it("yellow between 80% and 99%", () => {
    expect(computeAttainment(10, 8).status).toBe("yellow"); // 80%
    expect(computeAttainment(10, 9).status).toBe("yellow"); // 90%
    expect(computeAttainment(10, 8).remaining).toBe(2);
  });

  it("red below 80%", () => {
    expect(computeAttainment(10, 7).status).toBe("red"); // 70%
    expect(computeAttainment(10, 0).status).toBe("red");
    expect(computeAttainment(10, 0).completionPct).toBe(0);
  });

  it("regression: actual < 80% of target must flag red", () => {
    const r = computeAttainment(20, 15); // 75%
    expect(r.status).toBe("red");
    expect(r.completionPct).toBe(75);
  });

  it("zero target is never red (feature off for that user)", () => {
    const r = computeAttainment(0, 0);
    expect(r.status).toBe("green");
    expect(r.remaining).toBe(0);
    expect(r.completionPct).toBe(100);
  });

  it("clamps negative/fractional inputs", () => {
    const r = computeAttainment(10, -5);
    expect(r.actual).toBe(0);
    expect(r.status).toBe("red");
  });
});
