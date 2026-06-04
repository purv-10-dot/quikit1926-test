import { describe, expect, it, beforeEach, type Mock } from "vitest";
import { mockDb } from "../../../helpers/mockDb";
import { CANNED_REPORTS } from "@/lib/services/reports/canned";
import type { ReportRunContext } from "@/lib/services/reports/canned";

const db = mockDb();
const asMock = <T>(fn: T): Mock => fn as unknown as Mock;

function ctx(overrides: Partial<ReportRunContext> = {}): ReportRunContext {
  return {
    orgId: "t1",
    session: {
      userId: "u1",
      orgId: "t1",
      role: "Administrator",
      email: "a@x.co",
      name: "A",
    },
    from: new Date("2026-04-01T00:00:00Z"),
    to: new Date("2026-05-01T00:00:00Z"),
    tz: "UTC",
    ...overrides,
  };
}

function reportById(id: string) {
  const r = CANNED_REPORTS.find((c) => c.id === id);
  if (!r) throw new Error(`Report ${id} missing from catalog`);
  return r;
}

describe("pipeline-by-stage", () => {
  beforeEach(() => {
    asMock(db.crmOpportunity.groupBy).mockReset();
  });

  it("rows total matches the sum of input groupBy counts", async () => {
    asMock(db.crmOpportunity.groupBy).mockResolvedValueOnce([
      { stage: "Prospecting", _count: { _all: 5 }, _sum: { amount: 0, weightedAmount: 0 } },
      { stage: "Qualification", _count: { _all: 3 }, _sum: { amount: 0, weightedAmount: 0 } },
      { stage: "Proposal", _count: { _all: 2 }, _sum: { amount: 0, weightedAmount: 0 } },
    ] as never);

    const result = await reportById("pipeline-by-stage").run(ctx());
    expect(result.total?.value).toBe(10);
    // Empty stages still appear in the output (stable order)
    expect(result.rows.map((r) => r.stage)).toEqual([
      "Prospecting",
      "Qualification",
      "Proposal",
      "Negotiation",
      "ClosedWon",
      "ClosedLost",
    ]);
  });
});

describe("stuck-deals", () => {
  beforeEach(() => {
    db.crmOpportunity.findMany.mockReset();
  });

  it("filters at the 30-day threshold (lastStageChangeAt < cutoff)", async () => {
    db.crmOpportunity.findMany.mockResolvedValueOnce([] as never);

    await reportById("stuck-deals").run(ctx({ tz: "UTC" }));

    expect(db.crmOpportunity.findMany).toHaveBeenCalled();
    const call = db.crmOpportunity.findMany.mock.calls[0]?.[0];
    const where = call!.where as Record<string, unknown>;
    // The where wraps base + ACL; stuck-deals adds lastStageChangeAt at the
    // top level of the merged where.
    expect(where.lastStageChangeAt).toBeDefined();
    const cutoff = (where.lastStageChangeAt as { lt: Date }).lt;
    const ageDays = (Date.now() - cutoff.getTime()) / 86400000;
    // The threshold is 30 days; allow 1-day rounding for tz boundary cases.
    expect(ageDays).toBeGreaterThanOrEqual(29);
    expect(ageDays).toBeLessThanOrEqual(31);
  });
});

describe("team-disposition-mix", () => {
  beforeEach(() => {
    db.crmSalesGroupManager.findMany.mockReset();
    db.crmSalesGroupMember.findMany.mockReset();
    asMock(db.crmCallLog.groupBy).mockReset();
  });

  it("returns empty rows when the caller manages no sales group", async () => {
    db.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const result = await reportById("team-disposition-mix").run(ctx());
    expect(result.rows).toEqual([]);
    expect(db.crmCallLog.groupBy).not.toHaveBeenCalled();
  });

  it("only counts dispositions for the manager's direct reports", async () => {
    db.crmSalesGroupManager.findMany.mockResolvedValueOnce([
      { groupId: "g1" },
    ] as never);
    db.crmSalesGroupMember.findMany.mockResolvedValueOnce([
      { userId: "report-1" },
      { userId: "report-2" },
    ] as never);
    asMock(db.crmCallLog.groupBy).mockResolvedValueOnce([
      { dispositionName: "Connected", _count: { _all: 8 } },
      { dispositionName: "Voicemail", _count: { _all: 4 } },
    ] as never);

    await reportById("team-disposition-mix").run(ctx());

    const call = asMock(db.crmCallLog.groupBy).mock.calls[0]?.[0];
    const where = call!.where as Record<string, unknown>;
    expect(where.agentUserId).toEqual({ in: ["report-1", "report-2"] });
  });
});
