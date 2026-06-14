import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// stock-reconciliation + internal-return routes gate through `withOrgAuth`
// (getServerSession → getTenantId → userCan) instead of `requireStoreAction`.
// None of that chain is mocked by the harness, so we replace the whole
// wrapper with a context-injecting passthrough driven by the harness'
// `getTenantContext` mock (same `setContext()` control surface as every
// other store test). It reproduces the wrapper's auth contract:
//   - no context           → 401
//   - missing `permission`  → 403   (admin "*" passes)
//   - otherwise             → handler({ session, userId, orgId }, req, routeCtx)
// ---------------------------------------------------------------------------
vi.mock("@/lib/api/withOrgAuth", async () => {
  const { NextResponse } = await vi.importActual<typeof import("next/server")>("next/server");
  const { getTenantContext } = await import("@/lib/auth/context");

  const wrap = (handler: any, options: any = {}) => {
    return async (req: any, routeCtx: any) => {
      const ctx: any = await (getTenantContext as any)();
      if (!ctx) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      if (options.permission) {
        const key = `${options.permission.resource}.${options.permission.action}`;
        if (!ctx.permissions.has("*") && !ctx.permissions.has(key)) {
          return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }
      }
      return handler(
        { session: { user: { id: ctx.userId, orgId: ctx.orgId } }, userId: ctx.userId, orgId: ctx.orgId },
        req,
        routeCtx ?? { params: {} },
      );
    };
  };

  return {
    withOrgAuth: (handler: any, options: any = {}) => wrap(handler, options),
    withOrgAuthForModule: (_moduleKey: string) => (handler: any, options: any = {}) => wrap(handler, options),
    withOrgAuthForResource: (resource: string) => ({
      view: (h: any, o: any = {}) => wrap(h, { permission: { resource, action: "view" }, ...o }),
      create: (h: any, o: any = {}) => wrap(h, { permission: { resource, action: "create" }, ...o }),
      edit: (h: any, o: any = {}) => wrap(h, { permission: { resource, action: "edit" }, ...o }),
      delete: (h: any, o: any = {}) => wrap(h, { permission: { resource, action: "delete" }, ...o }),
      approve: (h: any, o: any = {}) => wrap(h, { permission: { resource, action: "approve" }, ...o }),
    }),
    forbidden: () => NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

import { GET, POST } from "@/app/api/store/stock-reconciliation/route";
import { GET as GET_ID, DELETE } from "@/app/api/store/stock-reconciliation/[id]/route";
import { POST as POST_LEDGER } from "@/app/api/store/stock-reconciliation/[id]/post/route";

const db = mockDb as any;
const ID = "r1";
const idParams = { params: { id: ID } };

function getReq(): NextRequest {
  return new NextRequest("http://localhost/api/store/stock-reconciliation", { method: "GET" });
}
function postReq(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/store/stock-reconciliation", {
    method: "POST",
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}
function delReq(): NextRequest {
  return new NextRequest("http://localhost/api/store/stock-reconciliation", { method: "DELETE" });
}

const VALID_BODY = {
  reconciliationNumber: "REC-9001",
  projectId: "proj1",
  locationId: "loc1",
  reconciliationDate: "2026-01-15",
  lines: [{ itemId: "i1", systemQty: 10, physicalQty: 8, uomId: "u1", unitRate: 0 }],
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/store/stock-reconciliation  (construction.reconciliation.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/stock-reconciliation", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(getReq(), idParams as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.reconciliation.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(getReq(), idParams as any)).status).toBe(403);
  });

  it("lists reconciliations scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findMany.mockResolvedValue([{ id: ID, status: "draft" }]);
    const res = await GET(getReq(), idParams as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(db.cnStockReconciliation.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/stock-reconciliation  (construction.reconciliation.create)
// ═══════════════════════════════════════════════

describe("POST /api/store/stock-reconciliation", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(postReq(VALID_BODY), idParams as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.reconciliation.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(postReq(VALID_BODY), idParams as any)).status).toBe(403);
  });

  it("returns 409 when the reconciliation number already exists", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue({ id: "dup" });
    const res = await POST(postReq(VALID_BODY), idParams as any);
    expect(res.status).toBe(409);
  });

  it("creates a reconciliation scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(null);
    db.cnStockReconciliation.create.mockResolvedValue({ id: ID, status: "draft", lines: [] });
    const res = await POST(postReq(VALID_BODY), idParams as any);
    expect(res.status).toBe(201);
    const data = db.cnStockReconciliation.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.conductedById).toBe(TEST_USER);
  });
});

// ═══════════════════════════════════════════════
// GET / DELETE /api/store/stock-reconciliation/[id]
// ═══════════════════════════════════════════════

describe("GET /api/store/stock-reconciliation/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET_ID(getReq(), idParams as any)).status).toBe(401);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(null);
    expect((await GET_ID(getReq(), idParams as any)).status).toBe(404);
  });

  it("returns the reconciliation scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue({ id: ID, status: "draft", lines: [] });
    const res = await GET_ID(getReq(), idParams as any);
    expect(res.status).toBe(200);
    expect(db.cnStockReconciliation.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

describe("DELETE /api/store/stock-reconciliation/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(delReq(), idParams as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.reconciliation.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(delReq(), idParams as any)).status).toBe(403);
  });

  it("returns 400 when cancelling a posted reconciliation", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue({ id: ID, status: "posted" });
    const res = await DELETE(delReq(), idParams as any);
    expect(res.status).toBe(400);
  });

  it("cancels a draft reconciliation and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue({ id: ID, status: "draft" });
    db.cnStockReconciliation.update.mockResolvedValue({ id: ID, status: "cancelled" });
    const res = await DELETE(delReq(), idParams as any);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/stock-reconciliation/[id]/post  (ledger posting; construction.reconciliation.approve)
// ═══════════════════════════════════════════════

describe("POST /api/store/stock-reconciliation/[id]/post", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST_LEDGER(postReq(VALID_BODY), idParams as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.reconciliation.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await POST_LEDGER(postReq(VALID_BODY), idParams as any)).status).toBe(403);
  });

  it("returns 404 when the reconciliation does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(null);
    expect((await POST_LEDGER(postReq(VALID_BODY), idParams as any)).status).toBe(404);
  });

  it("returns 409 when already posted", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue({ id: ID, status: "posted", lines: [] });
    const res = await POST_LEDGER(postReq(VALID_BODY), idParams as any);
    expect(res.status).toBe(409);
  });

  it("posts adjustment ledger rows and flips status to posted", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue({
      id: ID,
      status: "draft",
      projectId: "proj1",
      locationId: "loc1",
      reconciliationNumber: "REC-9001",
      reconciliationDate: new Date("2026-01-15"),
      lines: [
        { itemId: "i1", varianceQty: 5, uomId: "u1" }, // surplus → qtyIn
      ],
    });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnStockLedger.create.mockResolvedValue({ id: "led1" });
    db.cnStockReconciliation.update.mockResolvedValue({ id: ID, status: "posted" });

    const res = await POST_LEDGER(postReq(VALID_BODY), idParams as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("posted");
    expect(db.cnStockLedger.create).toHaveBeenCalled();
  });
});
