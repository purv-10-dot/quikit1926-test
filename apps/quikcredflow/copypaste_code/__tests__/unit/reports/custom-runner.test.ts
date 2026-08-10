import { describe, expect, it, beforeEach, vi, type Mock } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import { runCustomReport } from "@/lib/services/reports/custom/runner";
import type { ReportRunContext } from "@/lib/services/reports/canned/types";

const db = mockDb();
const asMock = <T>(fn: T): Mock => fn as unknown as Mock;

const ctx: ReportRunContext = {
  tenantId: "t1",
  session: {
    userId: "u1",
    tenantId: "t1",
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
    asMock(db.crmLead.groupBy).mockReset();
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
    asMock(db.crmLead.groupBy).mockResolvedValueOnce([
      { source: "Web", _count: { _all: 3 } },
    ] as never);

    const result = await runCustomReport(
      { object: "leads", groupBy: "source", metric: "count" },
      ctx,
    );

    expect(result.rows).toHaveLength(1);
    expect(asMock(db.crmLead.groupBy)).toHaveBeenCalled();
    const args = asMock(db.crmLead.groupBy).mock.calls[0]?.[0];
    expect(args?.where?.tenantId).toBe("t1");
  });
});
