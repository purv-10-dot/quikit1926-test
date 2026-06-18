import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// The hindrance [id] route gates through `withOrgAuthForModule` (lib/api/
// withOrgAuth), which the shared harness does not mock. Stub the wrapper with
// a passthrough that resolves auth through the SAME `@/lib/auth/context` stub
// and honors the per-handler `options.permission` gate.
vi.mock("@/lib/api/withOrgAuth", async () => {
  const { getTenantContext, hasPermission } = await import("@/lib/auth/context");
  const withOrgAuth = (handler: any, options: any = {}) =>
    async (req: any, routeCtx: any) => {
      const ctx = await (getTenantContext as any)();
      if (!ctx) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      if (options.permission) {
        const key = `${options.permission.resource}.${options.permission.action}`;
        if (!(hasPermission as any)(ctx, key)) {
          return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }
      }
      return handler(
        { session: {}, userId: ctx.userId, orgId: ctx.orgId },
        req,
        routeCtx ?? { params: {} },
      );
    };
  return {
    withOrgAuth,
    withOrgAuthForModule: () => (handler: any, options: any = {}) => withOrgAuth(handler, options),
    withOrgAuthForResource: (resource: string) => {
      const wrap = (action: string) => (handler: any, options: any = {}) =>
        withOrgAuth(handler, { permission: { resource, action }, ...options });
      return {
        view: wrap("view"), create: wrap("create"), edit: wrap("edit"),
        delete: wrap("delete"), approve: wrap("approve"), import: wrap("import"),
        export: wrap("export"), lock: wrap("lock"), manage: wrap("manage"),
        importOrEdit: wrap("edit"),
      };
    },
    forbidden: () => NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

const { GET, DELETE } = await import("@/app/api/projects/hindrance/[id]/route");

const db = mockDb as any;
const ID = "h1";
const params = { params: { id: ID } };

function req(method: string): NextRequest {
  return new NextRequest(`http://localhost/api/projects/hindrance/${ID}`, { method });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

describe("GET /api/projects/hindrance/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.dpr.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnHindrance.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the row scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnHindrance.findFirst.mockResolvedValue({ id: ID, orgId: TEST_TENANT, hindranceNo: "HIND-2026-001" });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(ID);
    expect(db.cnHindrance.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

describe("DELETE /api/projects/hindrance/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.dpr.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when deleting a missing row", async () => {
    setContext(makeAdminCtx());
    db.cnHindrance.findFirst.mockResolvedValue(null);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("soft-cancels the row and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnHindrance.findFirst.mockResolvedValue({ id: ID });
    db.cnHindrance.update.mockResolvedValue({ id: ID, status: "cancelled" });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnHindrance.update.mock.calls[0][0].data.status).toBe("cancelled");
    expect(db.cnHindrance.update.mock.calls[0][0].data.updatedBy).toBe(TEST_USER);
  });
});
