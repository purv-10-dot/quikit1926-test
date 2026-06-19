import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// The audit route gates through `withOrgAuthForModule("audit")`. Mock the
// wrapper with the standard passthrough (401 when no auth, handler invoked
// with { session, userId, orgId }, try/catch → 500).
const _auth: { ctx: { orgId: string; userId: string } | null } = { ctx: null };
function setAuth(ctx: { orgId: string; userId: string } | null) {
  _auth.ctx = ctx;
}

vi.mock("@/lib/api/withOrgAuth", () => {
  const wrap =
    (handler: any) =>
    async (req: NextRequest, routeCtx: any) => {
      if (!_auth.ctx) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      try {
        return await handler(
          { session: {}, userId: _auth.ctx.userId, orgId: _auth.ctx.orgId },
          req,
          routeCtx ?? { params: {} },
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Operation failed";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    };
  return {
    withOrgAuth: (h: any) => wrap(h),
    withOrgAuthForModule: () => (h: any) => wrap(h),
    withOrgAuthForResource: () => ({
      view: wrap, create: wrap, edit: wrap, delete: wrap, approve: wrap,
    }),
    forbidden: () => NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

const db = mockDb as any;

const { GET } = await import("@/app/api/audit/route");

function reqGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/audit${qs ? "?" + qs : ""}`, { method: "GET" });
}

beforeEach(() => {
  resetMockDb();
  setAuth(null);
  db.cnAuditLog.findMany.mockResolvedValue([]);
});

describe("GET /api/audit", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(reqGET(), { params: {} });
    expect(res.status).toBe(401);
  });

  it("lists audit-log rows scoped to the org, newest first", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnAuditLog.findMany.mockResolvedValue([
      { id: "a1", orgId: TEST_TENANT, entityType: "po", entityId: "po1", action: "create" },
    ]);
    const res = await GET(reqGET(), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);

    const args = db.cnAuditLog.findMany.mock.calls[0][0];
    expect(args.where.orgId).toBe(TEST_TENANT);
    expect(args.orderBy).toEqual({ timestamp: "desc" });
  });

  it("applies entityType / entityId / userId filters", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    await GET(reqGET("entityType=po&entityId=po1&userId=u9"), { params: {} });
    const where = db.cnAuditLog.findMany.mock.calls[0][0].where;
    expect(where.entityType).toBe("po");
    expect(where.entityId).toBe("po1");
    expect(where.userId).toBe("u9");
  });

  it("defaults the limit to 100 and caps it at 500", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    await GET(reqGET(), { params: {} });
    expect(db.cnAuditLog.findMany.mock.calls[0][0].take).toBe(100);

    db.cnAuditLog.findMany.mockClear();
    await GET(reqGET("limit=9999"), { params: {} });
    expect(db.cnAuditLog.findMany.mock.calls[0][0].take).toBe(500);
  });

  it("omits optional filters from the where clause when not provided", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    await GET(reqGET(), { params: {} });
    const where = db.cnAuditLog.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("entityType");
    expect(where).not.toHaveProperty("entityId");
    expect(where).not.toHaveProperty("userId");
  });
});
