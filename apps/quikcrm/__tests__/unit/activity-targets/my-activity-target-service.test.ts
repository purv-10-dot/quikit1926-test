/**
 * getMyActivityTarget: self-service data for one user. Returns { assigned:false }
 * for an unassigned user; otherwise builds attainment + breakdown from the same
 * shared services. Config + count-service mocked; prisma (recent list) mocked.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";

const db = mockDb();

type Assignment = { enabled: boolean; dailyTarget?: number };
type Cfg = { defaultDailyTarget: number; weeklyWorkingDays: number; perUser: Record<string, Assignment> };

const config: Cfg = {
  defaultDailyTarget: 4,
  weeklyWorkingDays: 5,
  perUser: { me: { enabled: true } }, // assigned, uses suggested default (4)
};

vi.mock("@/lib/services/workspace/activity-target-config", () => ({
  getActivityTargetConfig: vi.fn(async () => config),
  isTargetAssigned: (c: Cfg, id: string) => c.perUser[id]?.enabled === true,
  resolveDailyTarget: (c: Cfg, id: string) => c.perUser[id]?.dailyTarget ?? c.defaultDailyTarget,
  resolveWeeklyTarget: (c: Cfg, id: string) => (c.perUser[id]?.dailyTarget ?? c.defaultDailyTarget) * c.weeklyWorkingDays,
}));

vi.mock("@/lib/services/dashboard/activity-target-count", () => ({
  activityWindow: vi.fn(() => ({ todayFrom: new Date(0), todayTo: new Date(1), weekFrom: new Date(0), weekTo: new Date(1) })),
  countActivityBreakdownForUser: vi.fn(async () => ({
    calls: 1,
    activities: 1,
    completedTasks: 1,
    total: 3,
    weekTotal: 12,
  })),
}));

import { getMyActivityTarget } from "@/lib/services/dashboard/my-activity-target-service";

beforeEach(() => {
  vi.mocked(db.crmActivity.findMany).mockReset();
  vi.mocked(db.crmActivity.findMany).mockResolvedValue([
    { id: "a1", type: "Call", subject: "Called Acme", occurredAt: new Date("2026-07-21T10:00:00Z") },
  ] as never);
  // resolveOwnerScope reads prisma.user
  vi.mocked(db.user.findUnique).mockResolvedValue({ firstName: "Me", lastName: null, email: "me@x.co" } as never);
});

describe("getMyActivityTarget", () => {
  it("returns { assigned: false } for an unassigned user (no menu/page)", async () => {
    const res = await getMyActivityTarget("t1", "stranger", "UTC");
    expect(res).toEqual({ assigned: false });
  });

  it("builds attainment + breakdown for an assigned user (Target 4, Completed 3 → 75% red)", async () => {
    const res = await getMyActivityTarget("t1", "me", "UTC");
    expect(res.assigned).toBe(true);
    if (!res.assigned) return;
    expect(res.dailyTarget).toBe(4);
    expect(res.todayActivities).toBe(3);
    expect(res.remaining).toBe(1);
    expect(res.completionPct).toBe(75);
    expect(res.status).toBe("red"); // 75% < 80%
    expect(res.weeklyTarget).toBe(20); // 4 * 5
    expect(res.weeklyActivities).toBe(12);
    expect(res.breakdown).toEqual({ calls: 1, activities: 1, completedTasks: 1, total: 3, weekTotal: 12 });
    expect(res.recentToday).toHaveLength(1);
    expect(res.recentToday[0].subject).toBe("Called Acme");
  });
});
