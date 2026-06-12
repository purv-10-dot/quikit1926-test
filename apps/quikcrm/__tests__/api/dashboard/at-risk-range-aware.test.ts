/**
 * Bug 2 regression — at-risk cutoffs respect filters.range.to.
 *
 * Pre-fix, staleCutoff/stuckCutoff/dispoCutoff were anchored to
 * `new Date()`, ignoring the selected date range. A historical custom
 * range (e.g. April 1-30) still showed today's at-risk numbers.
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

type AnyMock = Mock<(...args: unknown[]) => unknown>;

const MS_DAY = 86_400_000;
const MS_HOUR = 3_600_000;

function makeReq(qs: string): NextRequest {
  return new NextRequest(`http://test/api/dashboard/at-risk?${qs}`, {
    headers: { "X-Client-TZ": "UTC" },
  });
}

async function callRoute(req: NextRequest): Promise<Response> {
  const { GET } = await import("@/app/api/dashboard/at-risk/route");
  return GET(req);
}

beforeEach(() => {
  setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
  // Arm every prisma call buildSummary won't reach but at-risk does.
  db.crmTask.count.mockResolvedValue(0);
  db.crmTask.findMany.mockResolvedValue([]);
  db.crmLead.count.mockResolvedValue(0);
  db.crmLead.findMany.mockResolvedValue([]);
  db.crmOpportunity.count.mockResolvedValue(0);
  db.crmOpportunity.findMany.mockResolvedValue([]);
  db.crmCallLog.count.mockResolvedValue(0);
  db.crmCallLog.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

type WhereCarrier = { where?: Record<string, unknown> };
function whereOf(mock: unknown, callIdx = 0): Record<string, unknown> {
  const m = mock as AnyMock;
  return (m.mock.calls[callIdx]?.[0] as WhereCarrier | undefined)?.where ?? {};
}

function lt(v: unknown): Date | undefined {
  return (v as { lt?: Date } | undefined)?.lt;
}

describe("Bug 2 — at-risk cutoffs anchored to range.to", () => {
  it("custom historical range: cutoffs computed from range.to, not now", async () => {
    // 2026-04-15 00:00 UTC. staleCutoff should be 2026-04-08 00:00 UTC
    // (7 days prior). stuckCutoff: 2026-03-16. dispoCutoff: 2026-04-14 00:00.
    const rangeTo = "2026-04-15";
    const rangeFrom = "2026-04-01";
    await callRoute(makeReq(`from=${rangeFrom}&to=${rangeTo}`));

    const expectedAsOf = new Date("2026-04-15T23:59:59.999Z");
    const expectedStale = new Date(
      expectedAsOf.getTime() - 7 * MS_DAY,
    );
    const expectedStuck = new Date(
      expectedAsOf.getTime() - 30 * MS_DAY,
    );
    const expectedDispo = new Date(
      expectedAsOf.getTime() - 24 * MS_HOUR,
    );

    // taskWhere.dueDate.lt === asOf (range.to)
    const taskWhere = whereOf(db.crmTask.count);
    expect(lt(taskWhere.dueDate)?.getTime()).toBe(expectedAsOf.getTime());

    // leadWhere.updatedAt.lt === staleCutoff
    const leadWhere = whereOf(db.crmLead.count);
    expect(lt(leadWhere.updatedAt)?.getTime()).toBe(expectedStale.getTime());

    // oppWhere.updatedAt.lt === stuckCutoff
    const oppWhere = whereOf(db.crmOpportunity.count);
    expect(lt(oppWhere.updatedAt)?.getTime()).toBe(expectedStuck.getTime());

    // callWhere.createdAt.lt === dispoCutoff
    const callWhere = whereOf(db.crmCallLog.count);
    expect(lt(callWhere.createdAt)?.getTime()).toBe(expectedDispo.getTime());
  });

  it("preset (range.to ≈ now): all cutoffs derived from range.to", async () => {
    // No fake clock — just assert the relative math: staleCutoff should be
    // exactly 7d before whatever asOf the route resolved.
    await callRoute(makeReq("from=2026-05-01&to=2026-05-07"));

    const taskWhere = whereOf(db.crmTask.count);
    const asOf = lt(taskWhere.dueDate)!;
    expect(asOf).toBeDefined();

    const leadWhere = whereOf(db.crmLead.count);
    const stale = lt(leadWhere.updatedAt)!;
    expect(asOf.getTime() - stale.getTime()).toBe(7 * MS_DAY);

    const oppWhere = whereOf(db.crmOpportunity.count);
    const stuck = lt(oppWhere.updatedAt)!;
    expect(asOf.getTime() - stuck.getTime()).toBe(30 * MS_DAY);

    const callWhere = whereOf(db.crmCallLog.count);
    const dispo = lt(callWhere.createdAt)!;
    expect(asOf.getTime() - dispo.getTime()).toBe(24 * MS_HOUR);
  });
});
