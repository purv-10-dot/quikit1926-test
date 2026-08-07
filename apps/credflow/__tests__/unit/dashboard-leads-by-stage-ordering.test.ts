/**
 * Bug 13 regression — leads-by-stage sort is deterministic and matches
 * the tenant pipeline order.
 *
 * The groupBy lacked an orderBy, so Postgres' return order was
 * implementation-defined. Now: (1) groupBy carries an orderBy, (2) the
 * service post-sorts by canonical pipeline order, with non-canonical
 * stages appended alphabetically.
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
  db.qcfLead.count.mockResolvedValue(0);
  db.qcfAccount.count.mockResolvedValue(0);
  db.qcfOpportunity.count.mockResolvedValue(0);
  asMock(db.qcfOpportunity.groupBy).mockResolvedValue([]);
  db.qcfTask.count.mockResolvedValue(0);
  db.qcfActivity.count.mockResolvedValue(0);
}

describe("Bug 13 — leads-by-stage ordering", () => {
  beforeEach(() => {
    armPrismaDefaults();
  });

  it("groupBy call carries an orderBy clause", async () => {
    asMock(db.qcfLead.groupBy).mockResolvedValue([]);
    db.qcfOrgWorkspaceSettings.findUnique.mockResolvedValue(null as never);
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, {
      range: RANGE,
      resolvedOwnerId: null,
      ownerId: null,
    } as never);
    const args = (asMock(db.qcfLead.groupBy)).mock.calls[0]?.[0] as {
      orderBy?: unknown;
    };
    expect(args.orderBy).toBeDefined();
  });

  it("output is sorted by canonical pipeline order; junk stages last alphabetically", async () => {
    db.qcfOrgWorkspaceSettings.findUnique.mockResolvedValue({
      orgId: "t1",
      settings: {
        dashboard: {
          qualifiedStages: ["Qualified"],
          funnelStages: ["New", "Contacted", "Qualified"],
        },
      },
    } as never);
    asMock(db.qcfLead.groupBy).mockResolvedValue([
      // Intentionally scrambled to prove the sort is doing the work.
      { stage: "Qualified", _count: 5 },
      { stage: "opopopopopo", _count: 1 },
      { stage: "New", _count: 10 },
      { stage: "abc-junk", _count: 2 },
      { stage: "Contacted", _count: 7 },
    ]);

    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    const summary = await buildSummary(USER as never, {
      range: RANGE,
      resolvedOwnerId: null,
      ownerId: null,
    } as never);

    expect(summary.leadsByStage.map((s) => s.stage)).toEqual([
      "New",
      "Contacted",
      "Qualified",
      "abc-junk", // alpha-first non-canonical
      "opopopopopo",
    ]);
  });
});
