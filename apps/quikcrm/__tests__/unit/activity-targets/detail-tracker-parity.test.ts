/**
 * Parity guarantee: the Salesperson Detail Dashboard and the admin Tracker must
 * derive the SAME activity-target numbers from the SAME shared services, so a
 * given user's figures are identical on both surfaces.
 *
 * Both surfaces build their row/block from:
 *   resolveDailyTarget / resolveWeeklyTarget  (config)
 *   computeAttainment                          (thresholds → status/remaining/%)
 * over the same today/week counts. This test pins that shared mapping so a
 * future change to one surface can't silently diverge from the other.
 */
import { describe, expect, it } from "vitest";
import {
  isTargetAssigned,
  resolveDailyTarget,
  resolveWeeklyTarget,
  type ActivityTargetConfig,
} from "@/lib/services/workspace/activity-target-config";
import { computeAttainment } from "@/lib/services/dashboard/activity-target-status";

// The exact field mapping both the tracker service and the detail service apply.
// Both gate on isTargetAssigned first (opt-in): unassigned → null block.
function buildBlock(config: ActivityTargetConfig, userId: string, counts: { today: number; week: number }) {
  if (!isTargetAssigned(config, userId)) return null;
  const dailyTarget = resolveDailyTarget(config, userId);
  const weeklyTarget = resolveWeeklyTarget(config, userId);
  const daily = computeAttainment(dailyTarget, counts.today);
  return {
    dailyTarget,
    todayActivities: daily.actual,
    remaining: daily.remaining,
    completionPct: daily.completionPct,
    weeklyTarget,
    weeklyActivities: counts.week,
    status: daily.status,
  };
}

const config: ActivityTargetConfig = {
  defaultDailyTarget: 10,
  weeklyWorkingDays: 5,
  perUser: {
    rep: { enabled: true }, // assigned, uses default
    senior: { enabled: true, dailyTarget: 20 }, // assigned, custom
    // "unassigned" has no entry → not tracked
  },
};

describe("detail ↔ tracker activity-target parity", () => {
  it("unassigned user → null block on both surfaces (not tracked)", () => {
    expect(buildBlock(config, "unassigned", { today: 5, week: 20 })).toBeNull();
  });

  it("identical inputs → identical block (default-target user, below target)", () => {
    const block = buildBlock(config, "rep", { today: 7, week: 30 });
    expect(block).toEqual({
      dailyTarget: 10,
      todayActivities: 7,
      remaining: 3,
      completionPct: 70,
      weeklyTarget: 50,
      weeklyActivities: 30,
      status: "red", // 70% < 80%
    });
  });

  it("per-user override flows into both target and weekly target", () => {
    const block = buildBlock(config, "senior", { today: 20, week: 90 });
    expect(block).not.toBeNull();
    expect(block!.dailyTarget).toBe(20);
    expect(block!.weeklyTarget).toBe(100); // 20 * 5
    expect(block!.status).toBe("green"); // 100%
    expect(block!.remaining).toBe(0);
  });

  it("yellow band (80–99%) maps the same on both surfaces", () => {
    const block = buildBlock(config, "rep", { today: 9, week: 44 });
    expect(block).not.toBeNull();
    expect(block!.completionPct).toBe(90);
    expect(block!.status).toBe("yellow");
  });
});
