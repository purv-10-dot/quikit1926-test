/**
 * Stage C — getCompletedTasksByRep (RED→GREEN). The digest §4 data source.
 *
 * Tasks COMPLETED in the rolling window, per rep, tier-scoped. Mirrors the
 * activity-metrics per-recipient scoping EXACTLY (role-based tier via
 * resolveManagerTeam — the SHIPPED SalesGroup mechanism, NOT getScope/
 * resolveTeamScope which hit the dead CrmTeamManager table), swapping the owner
 * field ownerId → assignedToUserId (CrmTask's owner).
 *
 *   where: { orgId, status: "Completed", completedAt: { gte: from, lt: to },
 *            <tier: assignedToUserId restriction> }
 *   groupBy: ["assignedToUserId"], _count
 *
 * NULL-completedAt rows (pre-column completions) are excluded automatically by the
 * completedAt: {gte,lt} bound (a non-null filter).
 *
 * Mock-level: prisma + resolveManagerTeam mocked; asserts the where-clause shape.
 * Real in/out-of-window filtering is the live check (FR-4.3-style), not here.
 * Module does not exist yet → RED.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";

vi.mock("@/lib/services/dashboard/team", () => ({ resolveManagerTeam: vi.fn() }));
import { resolveManagerTeam } from "@/lib/services/dashboard/team";
import { getCompletedTasksByRep } from "@/lib/services/dashboard/completed-tasks";

const RANGE = { from: new Date("2026-06-24T15:00:00.000Z"), to: new Date("2026-06-25T15:00:00.000Z") };
function user(role: string) {
  return { userId: "u1", orgId: "t1", role, email: "u@x.co", name: "U" } as never;
}
const groupByMock = prismaMock.crmTask.groupBy as unknown as {
  mockResolvedValue: (v: unknown) => void;
  mock: { calls: { 0: { by: string[]; where: Record<string, unknown> } }[] };
};
function lastWhere() {
  const calls = groupByMock.mock.calls;
  return calls[calls.length - 1]![0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
  groupByMock.mockResolvedValue([]);
  // User name lookup (for rep names) — default empty
  (prismaMock.user.findMany as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);
  vi.mocked(resolveManagerTeam).mockResolvedValue(null as never);
});

describe("getCompletedTasksByRep — completed-in-window, tier-scoped (Stage C)", () => {
  it("queries status=Completed AND completedAt in [from,to), grouped by assignedToUserId", async () => {
    await getCompletedTasksByRep(user("Administrator"), { range: RANGE });
    const w = lastWhere();
    expect(w.status).toBe("Completed");
    expect(w.completedAt).toEqual({ gte: RANGE.from, lt: RANGE.to }); // window + excludes NULL completedAt
    const calls = groupByMock.mock.calls;
    expect(calls[calls.length - 1]![0].by).toEqual(["assignedToUserId"]);
  });

  it("Administrator → org-only (no assignedToUserId restriction)", async () => {
    await getCompletedTasksByRep(user("Administrator"), { range: RANGE });
    const w = lastWhere();
    expect(w.orgId).toBe("t1");
    expect(w.assignedToUserId).toBeUndefined(); // org-wide
  });

  it("SalesManager → assignedToUserId in resolveManagerTeam memberIds (SAME boundary as activity metrics)", async () => {
    vi.mocked(resolveManagerTeam).mockResolvedValue({ memberIds: ["m1", "m2"], memberNames: [], size: 2 } as never);
    await getCompletedTasksByRep(user("SalesManager"), { range: RANGE });
    const w = lastWhere();
    expect(w.assignedToUserId).toEqual({ in: ["m1", "m2"] });
  });

  it("SalesManager with NO team → own-only fallback (parity with role-metrics)", async () => {
    vi.mocked(resolveManagerTeam).mockResolvedValue({ memberIds: [], memberNames: [], size: 0 } as never);
    await getCompletedTasksByRep(user("SalesManager"), { range: RANGE });
    expect(lastWhere().assignedToUserId).toBe("u1");
  });

  it("SalesUser → own-only (assignedToUserId = self)", async () => {
    await getCompletedTasksByRep(user("SalesUser"), { range: RANGE });
    expect(lastWhere().assignedToUserId).toBe("u1");
  });

  it("maps groupBy rows → perRep {userId, count} + total", async () => {
    groupByMock.mockResolvedValue([
      { assignedToUserId: "m1", _count: { _all: 3 } },
      { assignedToUserId: "m2", _count: { _all: 1 } },
    ]);
    (prismaMock.user.findMany as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([
      { id: "m1", firstName: "Rep", lastName: "One" },
      { id: "m2", firstName: "Rep", lastName: "Two" },
    ]);
    const res = await getCompletedTasksByRep(user("Administrator"), { range: RANGE });
    expect(res.total).toBe(4);
    expect(res.perRep).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "m1", count: 3 }),
        expect.objectContaining({ userId: "m2", count: 1 }),
      ]),
    );
  });
});
