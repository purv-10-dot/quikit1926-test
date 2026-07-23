/**
 * getActivityTargetTracker (OPT-IN): shows ONLY assigned (enabled) users,
 * excludes unassigned users entirely, resolves targets, maps attainment, and
 * sorts by largest daily shortfall first. Config + count service mocked.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";

const db = mockDb();

type Assignment = { enabled: boolean; dailyTarget?: number };
type Cfg = { defaultDailyTarget: number; weeklyWorkingDays: number; perUser: Record<string, Assignment> };

vi.mock("@/lib/services/workspace/activity-target-config", () => ({
  getActivityTargetConfig: vi.fn(async () => ({
    defaultDailyTarget: 10,
    weeklyWorkingDays: 5,
    perUser: {
      u1: { enabled: true }, // assigned, default target 10
      u2: { enabled: true, dailyTarget: 20 }, // assigned, custom 20
      u3: { enabled: true }, // assigned, default 10
      u4: { enabled: false, dailyTarget: 99 }, // NOT assigned → excluded
      // u5 has no entry at all → NOT assigned → excluded
    } as Record<string, Assignment>,
  })),
  isTargetAssigned: (cfg: Cfg, id: string) => cfg.perUser[id]?.enabled === true,
  resolveDailyTarget: (cfg: Cfg, id: string) => cfg.perUser[id]?.dailyTarget ?? cfg.defaultDailyTarget,
  resolveWeeklyTarget: (cfg: Cfg, id: string) =>
    (cfg.perUser[id]?.dailyTarget ?? cfg.defaultDailyTarget) * cfg.weeklyWorkingDays,
}));

vi.mock("@/lib/services/dashboard/activity-target-count", () => ({
  activityWindow: vi.fn(() => ({ todayFrom: new Date(0), todayTo: new Date(1), weekFrom: new Date(0), weekTo: new Date(1) })),
  countActivitiesForUsers: vi.fn(async (_org: string, ids: string[]) => {
    const all = new Map([
      ["u1", { today: 9, week: 40 }], // 10 → remaining 1 (yellow)
      ["u2", { today: 2, week: 10 }], // 20 → remaining 18 (red, biggest)
      ["u3", { today: 10, week: 55 }], // 10 → remaining 0 (green)
    ]);
    // Only return counts for the ids the service actually asked for.
    return new Map(ids.filter((id) => all.has(id)).map((id) => [id, all.get(id)!]));
  }),
}));

import { getActivityTargetTracker } from "@/lib/services/dashboard/activity-target-tracker-service";
import { countActivitiesForUsers } from "@/lib/services/dashboard/activity-target-count";

beforeEach(() => {
  vi.mocked(db.orgMember.findMany).mockReset();
  vi.mocked(db.orgMember.findMany).mockResolvedValue([
    { userId: "u1", user: { firstName: "Aa", lastName: null, email: "a@x.co" } },
    { userId: "u2", user: { firstName: "Bb", lastName: null, email: "b@x.co" } },
    { userId: "u3", user: { firstName: "Cc", lastName: null, email: "c@x.co" } },
    { userId: "u4", user: { firstName: "Dd", lastName: null, email: "d@x.co" } }, // disabled
    { userId: "u5", user: { firstName: "Ee", lastName: null, email: "e@x.co" } }, // no entry
  ] as never);
  vi.mocked(countActivitiesForUsers).mockClear();
});

describe("getActivityTargetTracker (opt-in)", () => {
  it("includes ONLY assigned users, excludes unassigned entirely", async () => {
    const dto = await getActivityTargetTracker("t1", "Asia/Kolkata");
    const ids = dto.rows.map((r) => r.userId);
    expect(ids).toContain("u1");
    expect(ids).toContain("u2");
    expect(ids).toContain("u3");
    expect(ids).not.toContain("u4"); // disabled
    expect(ids).not.toContain("u5"); // never assigned
    expect(dto.rows).toHaveLength(3);
  });

  it("does not even count activity for unassigned users", async () => {
    await getActivityTargetTracker("t1", "UTC");
    const askedIds = vi.mocked(countActivitiesForUsers).mock.calls[0][1];
    expect(askedIds.sort()).toEqual(["u1", "u2", "u3"]);
  });

  it("sorts by largest shortfall first and maps attainment", async () => {
    const dto = await getActivityTargetTracker("t1", "Asia/Kolkata");
    expect(dto.rows.map((r) => r.userId)).toEqual(["u2", "u1", "u3"]); // 18 > 1 > 0
    expect(dto.rows[0].dailyTarget).toBe(20);
    expect(dto.rows[0].weeklyTarget).toBe(100);
    expect(dto.rows[0].status).toBe("red");
    expect(dto.rows[2].status).toBe("green");
  });
});
