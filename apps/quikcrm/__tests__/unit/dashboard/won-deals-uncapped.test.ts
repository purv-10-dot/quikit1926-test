/**
 * Regression test — "Won deals" count and "Won revenue" must be computed over
 * the COMPLETE matching dataset, not the take:8 display list.
 *
 * Pre-fix, buildExecutiveSummary derived both from a findMany({ take: 8 }):
 *     wonDealsCount: wonList.length          → capped at 8
 *     wonInr: sum over wonList               → capped at 8 deals' worth
 * so an org with 30 wins in the period displayed "8" and a revenue figure
 * missing 22 deals — while the prior-period delta compared against an
 * uncapped count(), making the pill wrong too.
 *
 * After fix: the count comes from crmOpportunity.count and the revenue from a
 * crmOpportunity.groupBy(currency) _sum, both unbounded. The findMany keeps
 * take:8 because it only feeds the Recent Wins list.
 *
 * Also pins the won-date business rule: closeDate → lastStageChangeAt fallback
 * (the sales-cost convention), never updatedAt.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";
import { buildExecutiveSummary } from "@/lib/services/dashboard/executive-metrics";

// crmOpportunity.groupBy carries Prisma's heavily-overloaded generic signature,
// which the mock helper's types don't narrow. Same escape hatch the existing
// role-metrics-window suite uses for crmActivity.groupBy.
const oppGroupBy = prismaMock.crmOpportunity.groupBy as unknown as {
  mockResolvedValue: (v: unknown) => void;
  mock: { calls: unknown[] };
};

const RANGE = {
  from: new Date("2026-08-01T00:00:00Z"),
  to: new Date("2026-08-17T23:59:59.999Z"),
  tz: "Asia/Kolkata",
};
const PRIOR = {
  from: new Date("2026-07-15T00:00:00Z"),
  to: new Date("2026-07-31T23:59:59.999Z"),
  tz: "Asia/Kolkata",
};

// Org-wide scope stub — this suite is about aggregation, not RBAC.
const scope = {
  recordWhere: () => ({ orgId: "t1" }),
  accountWhere: () => ({ orgId: "t1" }),
  activityWhere: () => ({ orgId: "t1" }),
  taskWhere: () => ({ orgId: "t1" }),
  callWhere: () => ({ orgId: "t1" }),
};

/** 8 rows — exactly the take limit, i.e. the list is saturated. */
const EIGHT_ROWS = Array.from({ length: 8 }, (_, i) => ({
  id: `o${i}`,
  name: `Deal ${i}`,
  amount: 1_000,
  currency: "INR",
  ownerName: "Rep",
  closeDate: new Date("2026-08-10T00:00:00Z"),
  lastStageChangeAt: null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.crmCallLog.count.mockResolvedValue(0 as never);
  prismaMock.crmActivity.findMany.mockResolvedValue([] as never);
  prismaMock.crmTask.count.mockResolvedValue(0 as never);
  prismaMock.crmTask.findMany.mockResolvedValue([] as never);
  prismaMock.crmOpportunity.findMany.mockResolvedValue(EIGHT_ROWS as never);
  // 30 wins in range, 11 in the prior window.
  (prismaMock.crmOpportunity.count as unknown as { mockResolvedValueOnce: (v: unknown) => unknown })
    .mockResolvedValueOnce(30 as never);
  prismaMock.crmOpportunity.count.mockResolvedValue(11 as never);
  // ₹450,000 total won — far more than the 8 display rows sum to (₹8,000).
  oppGroupBy.mockResolvedValue([{ currency: "INR", _sum: { amount: 450_000 } }]);
});

describe("Won deals / revenue are not capped by the take:8 display list", () => {
  it("wonDealsCount comes from count(), not wonList.length", async () => {
    const res = await buildExecutiveSummary(RANGE, null, PRIOR, scope as never);
    expect(res.executive.wonDealsCount).toBe(30);
    expect(res.executive.wonDealsCount).not.toBe(EIGHT_ROWS.length);
  });

  it("won revenue comes from the DB-side sum, not the 8 display rows", async () => {
    const res = await buildExecutiveSummary(RANGE, null, PRIOR, scope as never);
    // 8 rows x ₹1,000 = ₹8,000 would be the buggy value.
    expect(res.executive.wonRevenueDisplay).not.toContain("8,000");
    expect(res.executive.wonRevenueDisplay).toContain("4,50,000");
  });

  it("the prior-period count is also unbounded (delta compares like with like)", async () => {
    const res = await buildExecutiveSummary(RANGE, null, PRIOR, scope as never);
    expect(res.wonDealsPrior).toBe(11);
  });

  it("Recent Wins still renders at most 5 rows from the display list", async () => {
    const res = await buildExecutiveSummary(RANGE, null, PRIOR, scope as never);
    expect(res.executive.recentWins.length).toBe(5);
  });

  it("won-date rule = closeDate → lastStageChangeAt, never updatedAt", async () => {
    await buildExecutiveSummary(RANGE, null, PRIOR, scope as never);
    const serialized = JSON.stringify([
      ...prismaMock.crmOpportunity.count.mock.calls,
      ...oppGroupBy.mock.calls,
      ...prismaMock.crmOpportunity.findMany.mock.calls,
    ]);
    expect(serialized).toContain("closeDate");
    expect(serialized).toContain("lastStageChangeAt");
    expect(serialized).not.toContain("updatedAt");
  });

  it("recentWins.closedAt reports the business won date", async () => {
    const res = await buildExecutiveSummary(RANGE, null, PRIOR, scope as never);
    expect(res.executive.recentWins[0].closedAt).toBe(
      new Date("2026-08-10T00:00:00Z").toISOString(),
    );
  });
});
