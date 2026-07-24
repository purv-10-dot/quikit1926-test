/**
 * countActivityBreakdownForUser: per-source today counts + week total.
 * total must equal calls + activities + completedTasks (same three sources as
 * the totals path). Prisma counts mocked.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import { countActivityBreakdownForUser } from "@/lib/services/dashboard/activity-target-count";

const db = mockDb();

const win = {
  todayFrom: new Date("2026-07-21T00:00:00Z"),
  todayTo: new Date("2026-07-21T23:59:59Z"),
  weekFrom: new Date("2026-07-20T00:00:00Z"),
  weekTo: new Date("2026-07-21T23:59:59Z"),
};

beforeEach(() => {
  vi.mocked(db.user.findUnique).mockResolvedValue({ firstName: "A", lastName: null, email: "a@x.co" } as never);
  // activity: today=2, week=5 ; call: today=1, week=3 ; task: today=1, week=4
  vi.mocked(db.crmActivity.count).mockReset().mockResolvedValueOnce(2 as never).mockResolvedValueOnce(5 as never);
  vi.mocked(db.crmCallLog.count).mockReset().mockResolvedValueOnce(1 as never).mockResolvedValueOnce(3 as never);
  vi.mocked(db.crmTask.count).mockReset().mockResolvedValueOnce(1 as never).mockResolvedValueOnce(4 as never);
});

describe("countActivityBreakdownForUser", () => {
  it("returns per-source today counts and correct totals", async () => {
    const b = await countActivityBreakdownForUser("t1", "u1", win);
    expect(b.activities).toBe(2);
    expect(b.calls).toBe(1);
    expect(b.completedTasks).toBe(1);
    expect(b.total).toBe(4); // 2 + 1 + 1
    expect(b.weekTotal).toBe(12); // 5 + 3 + 4
  });

  it("scopes every query by orgId", async () => {
    await countActivityBreakdownForUser("t9", "u1", win);
    for (const call of vi.mocked(db.crmActivity.count).mock.calls) {
      expect((call[0] as { where: { orgId: string } }).where.orgId).toBe("t9");
    }
  });
});
