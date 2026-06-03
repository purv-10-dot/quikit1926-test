/**
 * Bug 3 PR 1 regression test.
 *
 * The package-level soft-delete middleware (packages/database/index.ts) does
 * NOT yet register CrmLead / CrmOpportunity / CrmAccount, so the dashboard
 * must filter `deletedAt: null` explicitly. This test fails if anyone drops
 * those clauses before the middleware registration lands (PR 2).
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { mockDb } from "../helpers/mockDb";

const db = mockDb();

// Prisma's `groupBy` has a deeply-overloaded generic signature that
// vitest-mock-extended cannot narrow to a callable mock. The runtime stub is
// a vi.fn — we just need to convince TS of that for the type-checker.
type AnyMock = Mock<(...args: unknown[]) => unknown>;
const asMock = (fn: unknown): AnyMock => fn as unknown as AnyMock;

const RANGE = {
  from: new Date("2026-04-25T00:00:00Z"),
  to: new Date("2026-05-01T23:59:59.999Z"),
  tz: "UTC",
};

const USER = { userId: "u1", orgId: "t1", role: "SalesUser" };
const FILTERS = { range: RANGE, resolvedOwnerId: null, ownerId: null };

function armPrismaDefaults(): void {
  db.crmLead.count.mockResolvedValue(0);
  asMock(db.crmLead.groupBy).mockResolvedValue([]);
  db.crmAccount.count.mockResolvedValue(0);
  db.crmOpportunity.count.mockResolvedValue(0);
  asMock(db.crmOpportunity.groupBy).mockResolvedValue([]);
  db.crmTask.count.mockResolvedValue(0);
  db.crmActivity.count.mockResolvedValue(0);
  db.crmOrgWorkspaceSettings.findUnique.mockResolvedValue(null as never);
}

type WhereCarrier = { where?: Record<string, unknown> };
function whereArgs(mock: unknown): Record<string, unknown>[] {
  const m = mock as AnyMock;
  return m.mock.calls
    .map((call) => (call[0] as WhereCarrier | undefined)?.where ?? {})
    .filter((w) => Object.keys(w).length > 0);
}

describe("dashboard summary-service: soft-delete filtering", () => {
  beforeEach(() => {
    armPrismaDefaults();
  });

  it("CrmLead.count always passes `deletedAt: null`", async () => {
    const { buildSummary } = await import("@/lib/services/dashboard/summary-service");
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmLead.count);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toHaveProperty("deletedAt", null);
  });

  it("CrmLead.groupBy (leads-by-stage) passes `deletedAt: null`", async () => {
    const { buildSummary } = await import("@/lib/services/dashboard/summary-service");
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmLead.groupBy);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toHaveProperty("deletedAt", null);
  });

  it("CrmOpportunity.count always passes `deletedAt: null`", async () => {
    const { buildSummary } = await import("@/lib/services/dashboard/summary-service");
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmOpportunity.count);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toHaveProperty("deletedAt", null);
  });

  it("CrmOpportunity.groupBy (pipeline + opps-by-stage) passes `deletedAt: null`", async () => {
    const { buildSummary } = await import("@/lib/services/dashboard/summary-service");
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmOpportunity.groupBy);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toHaveProperty("deletedAt", null);
  });

  it("CrmAccount.count always passes `deletedAt: null`", async () => {
    const { buildSummary } = await import("@/lib/services/dashboard/summary-service");
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmAccount.count);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toHaveProperty("deletedAt", null);
  });

  it("CrmActivity.count is unchanged (no `deletedAt` column)", async () => {
    const { buildSummary } = await import("@/lib/services/dashboard/summary-service");
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmActivity.count);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).not.toHaveProperty("deletedAt");
  });
});
