import { describe, expect, it, beforeEach, type Mock } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import { runCustomReport } from "@/lib/services/reports/custom/runner";
import type { ReportRunContext } from "@/lib/services/reports/canned/types";

const db = mockDb();
const asMock = <T>(fn: T): Mock => fn as unknown as Mock;

const ctx: ReportRunContext = {
  orgId: "t1",
  session: {
    userId: "u1",
    orgId: "t1",
    role: "Administrator",
    email: "a@x.co",
    name: "Admin",
  },
  from: new Date("2026-01-01"),
  to: new Date("2026-01-31"),
  tz: "UTC",
};

describe("runCustomReport", () => {
  beforeEach(() => {
    asMock(db.qceLead.groupBy).mockReset();
    asMock(db.qceCallLog.groupBy).mockReset();
    db.qceLead.findMany.mockReset();
    db.qceOpportunity.findMany.mockReset();
    db.qceCallLog.findMany.mockReset();
    db.orgMember.findMany.mockReset();
  });

  it("rejects invalid group-by fields", async () => {
    await expect(
      runCustomReport(
        { object: "leads", groupBy: "DROP TABLE", metric: "count" },
        ctx,
      ),
    ).rejects.toThrow(/Invalid group-by/);
  });

  it("scopes lead reports to tenantId", async () => {
    asMock(db.qceLead.groupBy).mockResolvedValueOnce([
      { source: "Web", _count: { _all: 3 } },
    ] as never);

    const result = await runCustomReport(
      { object: "leads", groupBy: "source", metric: "count" },
      ctx,
    );

    expect(result.rows).toHaveLength(1);
    expect(asMock(db.qceLead.groupBy)).toHaveBeenCalled();
    const args = asMock(db.qceLead.groupBy).mock.calls[0]?.[0];
    expect(args?.where?.orgId).toBe("t1");
  });

  it("applies a whitelisted filter as an extra where condition", async () => {
    asMock(db.qceLead.groupBy).mockResolvedValueOnce([] as never);
    await runCustomReport(
      {
        object: "leads",
        groupBy: "source",
        metric: "count",
        filters: [{ field: "stage", operator: "equals", value: "Qualified" }],
      },
      ctx,
    );
    const where = asMock(db.qceLead.groupBy).mock.calls[0]?.[0]?.where as {
      AND?: Record<string, unknown>[];
    };
    expect(Array.isArray(where.AND)).toBe(true);
    expect(where.AND).toEqual(expect.arrayContaining([{ stage: "Qualified" }]));
  });

  it("ignores filters on non-whitelisted fields (injection-safe)", async () => {
    asMock(db.qceLead.groupBy).mockResolvedValueOnce([] as never);
    await runCustomReport(
      {
        object: "leads",
        groupBy: "source",
        metric: "count",
        filters: [{ field: "id; DROP TABLE", operator: "equals", value: "x" }],
      },
      ctx,
    );
    const where = asMock(db.qceLead.groupBy).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    // Unknown field dropped → no extra AND wrapper, base where intact.
    expect(where.orgId).toBe("t1");
    expect(where.AND).toBeUndefined();
  });

  it("buckets by month when groupBy is a date grain", async () => {
    db.qceLead.findMany.mockResolvedValueOnce([
      { createdAt: new Date("2026-01-05T10:00:00Z") },
      { createdAt: new Date("2026-01-20T10:00:00Z") },
      { createdAt: new Date("2026-01-28T10:00:00Z") },
    ] as never);
    const result = await runCustomReport(
      { object: "leads", groupBy: "date:month", metric: "count" },
      ctx,
    );
    expect(db.qceLead.findMany).toHaveBeenCalled();
    expect(asMock(db.qceLead.groupBy)).not.toHaveBeenCalled();
    expect(result.rows).toEqual([{ dimension: "2026-01", value: 3 }]);
    expect(result.chart?.type).toBe("line");
  });

  it("resolves owner ids to names when grouping by ownerId", async () => {
    asMock(db.qceLead.groupBy).mockResolvedValueOnce([
      { ownerId: "user-1", _count: { _all: 5 } },
    ] as never);
    db.orgMember.findMany.mockResolvedValueOnce([
      {
        user: {
          id: "user-1",
          firstName: "Asha",
          lastName: "Rao",
          email: "asha@x.co",
        },
      },
    ] as never);

    const result = await runCustomReport(
      { object: "leads", groupBy: "ownerId", metric: "count" },
      ctx,
    );

    expect(result.rows[0]?.dimension).toBe("Asha Rao");
    expect(result.rows[0]?.value).toBe(5);
  });

  // --- Task 1: avg/sum of score (Leads) ---

  it("averages score (rounded to 1dp) for the avgScore metric", async () => {
    asMock(db.qceLead.groupBy).mockResolvedValueOnce([
      { source: "Web", _avg: { score: 42.66 } },
    ] as never);
    const result = await runCustomReport(
      { object: "leads", groupBy: "source", metric: "avgScore" },
      ctx,
    );
    expect(result.rows[0]?.value).toBe(42.7);
    // Sum-of-averages is meaningless → no footer total for avg.
    expect(result.total).toBeUndefined();
  });

  it("sums score for the sumScore metric (with a footer total)", async () => {
    asMock(db.qceLead.groupBy).mockResolvedValueOnce([
      { source: "Web", _sum: { score: 150 } },
      { source: "Referral", _sum: { score: 90 } },
    ] as never);
    const result = await runCustomReport(
      { object: "leads", groupBy: "source", metric: "sumScore" },
      ctx,
    );
    expect(result.rows.find((r) => r.dimension === "Web")?.value).toBe(150);
    expect(result.total?.value).toBe(240);
  });

  // --- Regression: runDateBucket {sum,count} refactor must not change
  // existing count / opp-sum / call-sum behavior ---

  it("date bucket regression — leads count still counts rows per bucket", async () => {
    db.qceLead.findMany.mockResolvedValueOnce([
      { createdAt: new Date("2026-01-05T10:00:00Z") },
      { createdAt: new Date("2026-01-20T10:00:00Z") },
    ] as never);
    const result = await runCustomReport(
      { object: "leads", groupBy: "date:month", metric: "count" },
      ctx,
    );
    expect(result.rows).toEqual([{ dimension: "2026-01", value: 2 }]);
  });

  it("date bucket regression — opportunities sumAmount still sums amounts", async () => {
    db.qceOpportunity.findMany.mockResolvedValueOnce([
      { createdAt: new Date("2026-01-10T00:00:00Z"), amount: 1000 },
      { createdAt: new Date("2026-01-20T00:00:00Z"), amount: 500 },
    ] as never);
    const result = await runCustomReport(
      { object: "opportunities", groupBy: "date:month", metric: "sumAmount" },
      ctx,
    );
    expect(result.rows).toEqual([{ dimension: "2026-01", value: 1500 }]);
  });

  it("date bucket regression — callLogs sumDuration still sums durations", async () => {
    db.qceCallLog.findMany.mockResolvedValueOnce([
      { createdAt: new Date("2026-01-05T00:00:00Z"), durationSec: 60 },
      { createdAt: new Date("2026-01-15T00:00:00Z"), durationSec: 120 },
    ] as never);
    const result = await runCustomReport(
      { object: "callLogs", groupBy: "date:month", metric: "sumDuration" },
      ctx,
    );
    expect(result.rows).toEqual([{ dimension: "2026-01", value: 180 }]);
  });

  it("date bucket — avgScore averages score per bucket", async () => {
    db.qceLead.findMany.mockResolvedValueOnce([
      { createdAt: new Date("2026-01-05T00:00:00Z"), score: 40 },
      { createdAt: new Date("2026-01-25T00:00:00Z"), score: 50 },
    ] as never);
    const result = await runCustomReport(
      { object: "leads", groupBy: "date:month", metric: "avgScore" },
      ctx,
    );
    expect(result.rows).toEqual([{ dimension: "2026-01", value: 45 }]);
  });

  it("date bucket — sumScore sums score per bucket", async () => {
    db.qceLead.findMany.mockResolvedValueOnce([
      { createdAt: new Date("2026-01-05T00:00:00Z"), score: 40 },
      { createdAt: new Date("2026-01-25T00:00:00Z"), score: 50 },
    ] as never);
    const result = await runCustomReport(
      { object: "leads", groupBy: "date:month", metric: "sumScore" },
      ctx,
    );
    expect(result.rows).toEqual([{ dimension: "2026-01", value: 90 }]);
  });

  // --- Task 2: owner/agent as a filter field ---

  it("owner filter is ANDed with tenant scope (never replaces tenantId)", async () => {
    asMock(db.qceLead.groupBy).mockResolvedValueOnce([] as never);
    await runCustomReport(
      {
        object: "leads",
        groupBy: "source",
        metric: "count",
        filters: [{ field: "ownerId", operator: "equals", value: "user-7" }],
      },
      ctx,
    );
    const where = asMock(db.qceLead.groupBy).mock.calls[0]?.[0]?.where as {
      AND?: Array<Record<string, unknown>>;
    };
    expect(Array.isArray(where.AND)).toBe(true);
    // Tenant scope preserved in the base where (AND[0]) — not replaced.
    expect((where.AND![0] as { orgId?: string }).orgId).toBe("t1");
    // Owner condition ANDed in alongside tenant scope.
    expect(where.AND).toEqual(expect.arrayContaining([{ ownerId: "user-7" }]));
  });

  it("owner is_not_empty excludes unassigned (ownerId not null), tenant kept", async () => {
    asMock(db.qceLead.groupBy).mockResolvedValueOnce([] as never);
    await runCustomReport(
      {
        object: "leads",
        groupBy: "source",
        metric: "count",
        filters: [{ field: "ownerId", operator: "is_not_empty" }],
      },
      ctx,
    );
    const where = asMock(db.qceLead.groupBy).mock.calls[0]?.[0]?.where as {
      AND?: Array<Record<string, unknown>>;
    };
    expect((where.AND![0] as { orgId?: string }).orgId).toBe("t1");
    expect(where.AND).toEqual(
      expect.arrayContaining([{ ownerId: { not: null } }]),
    );
  });

  it("agent (agentUserId) is filterable on call logs, ANDed with tenant scope", async () => {
    asMock(db.qceCallLog.groupBy).mockResolvedValueOnce([] as never);
    await runCustomReport(
      {
        object: "callLogs",
        groupBy: "status",
        metric: "count",
        filters: [{ field: "agentUserId", operator: "equals", value: "agent-2" }],
      },
      ctx,
    );
    const where = asMock(db.qceCallLog.groupBy).mock.calls[0]?.[0]?.where as {
      AND?: Array<Record<string, unknown>>;
    };
    expect(Array.isArray(where.AND)).toBe(true);
    expect((where.AND![0] as { orgId?: string }).orgId).toBe("t1");
    expect(where.AND).toEqual(
      expect.arrayContaining([{ agentUserId: "agent-2" }]),
    );
  });

  it("respects an explicit chartType override", async () => {
    asMock(db.qceLead.groupBy).mockResolvedValueOnce([
      { source: "Web", _count: { _all: 3 } },
    ] as never);
    const result = await runCustomReport(
      { object: "leads", groupBy: "source", metric: "count", chartType: "line" },
      ctx,
    );
    expect(result.chart?.type).toBe("line");
  });
});
