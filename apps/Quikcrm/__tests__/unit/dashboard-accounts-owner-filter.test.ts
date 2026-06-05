/**
 * Bug 7 regression — Accounts KPI honours the Owner dropdown.
 *
 * The crmAccount.count calls used to hardcode { orgId, createdAt }
 * and ignored the resolvedOwnerId from filters. This test fails if
 * the Accounts KPI ever bypasses tenantOwnerWhere again.
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { mockDb } from "../helpers/mockDb";

const db = mockDb();

type AnyMock = Mock<(...args: unknown[]) => unknown>;
const asMock = (fn: unknown): AnyMock => fn as unknown as AnyMock;

const RANGE = {
  from: new Date("2026-04-25T00:00:00Z"),
  to: new Date("2026-05-01T23:59:59.999Z"),
  tz: "UTC",
};
const USER = { userId: "u1", orgId: "t1", role: "SalesUser" };

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

describe("Bug 7 — Accounts KPI owner filter", () => {
  beforeEach(() => {
    armPrismaDefaults();
  });

  it("includes ownerId when resolvedOwnerId is set", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, {
      range: RANGE,
      resolvedOwnerId: "user-X",
      ownerId: "user-X",
    } as never);
    const wheres = whereArgs(db.crmAccount.count);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w).toMatchObject({ ownerId: "user-X" });
  });

  it("omits ownerId when resolvedOwnerId is null", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, {
      range: RANGE,
      resolvedOwnerId: null,
      ownerId: null,
    } as never);
    const wheres = whereArgs(db.crmAccount.count);
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect("ownerId" in w).toBe(false);
  });
});
