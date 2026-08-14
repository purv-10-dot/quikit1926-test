/**
 * Bug 3 PR 1 regression test.
 *
 * The package-level soft-delete middleware (packages/database/index.ts) does
 * NOT yet register QceLead / QceOpportunity / QceAccount, so the dashboard
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
  db.qceLead.count.mockResolvedValue(0);
  asMock(db.qceLead.groupBy).mockResolvedValue([]);
  db.qceAccount.count.mockResolvedValue(0);
  db.qceOpportunity.count.mockResolvedValue(0);
  asMock(db.qceOpportunity.groupBy).mockResolvedValue([]);
  db.qceTask.count.mockResolvedValue(0);
  db.qceActivity.count.mockResolvedValue(0);
  db.qceOrgWorkspaceSettings.findUnique.mockResolvedValue(null as never);
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
    const wheres = whereArgs(db.qceLead.count);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toHaveProperty("deletedAt", null);
  });

  it("CrmLead.groupBy (leads-by-stage) passes `deletedAt: null`", async () => {
    const { buildSummary } = await import("@/lib/services/dashboard/summary-service");
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.qceLead.groupBy);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toHaveProperty("deletedAt", null);
  });

  it("CrmOpportunity.count always passes `deletedAt: null`", async () => {
    const { buildSummary } = await import("@/lib/services/dashboard/summary-service");
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.qceOpportunity.count);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toHaveProperty("deletedAt", null);
  });

  it("CrmOpportunity.groupBy (pipeline + opps-by-stage) passes `deletedAt: null`", async () => {
    const { buildSummary } = await import("@/lib/services/dashboard/summary-service");
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.qceOpportunity.groupBy);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toHaveProperty("deletedAt", null);
  });

  it("CrmAccount.count always passes `deletedAt: null`", async () => {
    const { buildSummary } = await import("@/lib/services/dashboard/summary-service");
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.qceAccount.count);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toHaveProperty("deletedAt", null);
  });

  it("CrmActivity.count is unchanged (no `deletedAt` column)", async () => {
    const { buildSummary } = await import("@/lib/services/dashboard/summary-service");
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.qceActivity.count);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).not.toHaveProperty("deletedAt");
  });
});
