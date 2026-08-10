import { describe, expect, it, beforeEach, vi, type Mock } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

const db = mockDb();
// Prisma's `groupBy` has overloaded typings that shadow the vitest-mock-extended
// Mock surface in TS (only). Cast through unknown to access mock control APIs.
const asMock = <T>(fn: T): Mock => fn as unknown as Mock;

describe("GET /api/reports/canned/[id]", () => {
  beforeEach(() => {
    asMock(db.crmOpportunity.groupBy).mockReset();
    db.crmOpportunity.findMany.mockReset();
    asMock(db.crmLead.groupBy).mockReset();
    asMock(db.crmActivity.groupBy).mockReset();
    asMock(db.crmCallLog.groupBy).mockReset();
    db.crmCallLog.findMany.mockReset();
    setSession(null);
    vi.mocked(assertModule).mockReset();
    vi.mocked(assertModule).mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/reports/canned/[id]/route");
    const req = new Request("http://test/api/reports/canned/pipeline-by-stage");
    const res = await GET(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "pipeline-by-stage" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown report id", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "Administrator", email: "a@x.co", name: "A" });
    const { GET } = await import("@/app/api/reports/canned/[id]/route");
    const req = new Request("http://test/api/reports/canned/no-such-report");
    const res = await GET(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "no-such-report" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("forwards the caller's tenantId into the run query", async () => {
    setSession({ userId: "u1", tenantId: "tenant-A", role: "Administrator", email: "a@x.co", name: "A" });
    asMock(db.crmOpportunity.groupBy).mockResolvedValueOnce([] as never);

    const { GET } = await import("@/app/api/reports/canned/[id]/route");
    const req = new Request("http://test/api/reports/canned/pipeline-by-stage");
    const res = await GET(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "pipeline-by-stage" }),
    });
    expect(res.status).toBe(200);

    expect(asMock(db.crmOpportunity.groupBy)).toHaveBeenCalled();
    const args = asMock(db.crmOpportunity.groupBy).mock.calls[0]?.[0];
    expect(args).toBeDefined();
    const where = args!.where as Record<string, unknown>;
    expect(where.tenantId).toBe("tenant-A");
  });

  it("happy path: runs pipeline-by-stage and returns the spec'd shape", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "Administrator", email: "a@x.co", name: "A" });
    asMock(db.crmOpportunity.groupBy).mockResolvedValueOnce([
      {
        stage: "Prospecting",
        _count: { _all: 5 },
        _sum: { amount: "500000", weightedAmount: "100000" },
      },
      {
        stage: "Negotiation",
        _count: { _all: 2 },
        _sum: { amount: "200000", weightedAmount: "120000" },
      },
    ] as never);

    const { GET } = await import("@/app/api/reports/canned/[id]/route");
    const req = new Request("http://test/api/reports/canned/pipeline-by-stage");
    const res = await GET(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "pipeline-by-stage" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "stageLabel" }),
        expect.objectContaining({ key: "count" }),
      ]),
    );
    // 6 stages: Prospecting / Qualification / Proposal / Negotiation / Won / Lost
    expect(body.data.rows).toHaveLength(6);
    const prospecting = body.data.rows.find(
      (r: { stage: string }) => r.stage === "Prospecting",
    );
    expect(prospecting).toMatchObject({ count: 5, weightedAmount: 100000 });
    expect(body.data.total.value).toBe(7);
    expect(body.data.rows[0]).toHaveProperty("_drillUrl");
  });
});
