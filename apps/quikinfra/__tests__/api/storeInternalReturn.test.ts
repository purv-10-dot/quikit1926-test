import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";

// internal-return gates through `withOrgAuth` (getServerSession → getTenantId
// → userCan) — none of that chain is mocked by the harness, so swap the whole
// wrapper for a context-injecting passthrough driven by `setContext()`. Same
// 401/403 contract the real wrapper enforces.
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
    forbidden: () => NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

import { GET, POST } from "@/app/api/store/internal-return/route";
import { GET as GET_ID, DELETE } from "@/app/api/store/internal-return/[id]/route";
import { POST as POST_LEDGER } from "@/app/api/store/internal-return/[id]/post/route";

const db = mockDb as any;
const ID = "ir1";
const idParams = { params: { id: ID } };

function getReq(): NextRequest {
  return new NextRequest("http://localhost/api/store/internal-return", { method: "GET" });
}
function postReq(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/store/internal-return", {
    method: "POST",
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}
function delReq(): NextRequest {
  return new NextRequest("http://localhost/api/store/internal-return", { method: "DELETE" });
}

const VALID_BODY = {
  returnNumber: "IR-9001",
  issueId: "iss1",
  projectId: "proj1",
  locationId: "loc1",
  returnDate: "2026-01-15",
  returnedBy: TEST_USER,
  lines: [{ itemId: "i1", returnQty: 2, uomId: "u1", unitRate: 0 }],
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/store/internal-return  (construction.return.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/internal-return", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(getReq(), idParams as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(getReq(), idParams as any)).status).toBe(403);
  });

  it("lists internal returns scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnInternalReturn.findMany.mockResolvedValue([{ id: ID, status: "draft" }]);
    const res = await GET(getReq(), idParams as any);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnInternalReturn.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/internal-return  (construction.return.create)
// ═══════════════════════════════════════════════

describe("POST /api/store/internal-return", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(postReq(VALID_BODY), idParams as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(postReq(VALID_BODY), idParams as any)).status).toBe(403);
  });

  it("returns 400 when the source issue does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue(null);
    const res = await POST(postReq(VALID_BODY), idParams as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/issue not found/i);
  });

  it("returns 400 when the source issue is not posted", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue({
      id: "iss1",
      status: "draft",
      projectId: "proj1",
      locationId: "loc1",
    });
    const res = await POST(postReq(VALID_BODY), idParams as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/posted issue/i);
  });

  it("returns 400 when project/location mismatch the source issue", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue({
      id: "iss1",
      status: "posted",
      projectId: "OTHER",
      locationId: "loc1",
    });
    const res = await POST(postReq(VALID_BODY), idParams as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/must match source issue/i);
  });

  it("returns 409 when the return number already exists", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue({
      id: "iss1",
      status: "posted",
      projectId: "proj1",
      locationId: "loc1",
    });
    db.cnInternalReturn.findFirst.mockResolvedValue({ id: "dup" });
    const res = await POST(postReq(VALID_BODY), idParams as any);
    expect(res.status).toBe(409);
  });

  it("creates an internal return scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue({
      id: "iss1",
      status: "posted",
      projectId: "proj1",
      locationId: "loc1",
    });
    db.cnInternalReturn.findFirst.mockResolvedValue(null);
    db.cnInternalReturn.create.mockResolvedValue({ id: ID, status: "draft", lines: [] });
    const res = await POST(postReq(VALID_BODY), idParams as any);
    expect(res.status).toBe(201);
    const data = db.cnInternalReturn.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
  });
});

// ═══════════════════════════════════════════════
// GET / DELETE /api/store/internal-return/[id]
// ═══════════════════════════════════════════════

describe("GET /api/store/internal-return/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET_ID(getReq(), idParams as any)).status).toBe(401);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnInternalReturn.findFirst.mockResolvedValue(null);
    expect((await GET_ID(getReq(), idParams as any)).status).toBe(404);
  });

  it("returns the internal return scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnInternalReturn.findFirst.mockResolvedValue({ id: ID, status: "draft", lines: [] });
    const res = await GET_ID(getReq(), idParams as any);
    expect(res.status).toBe(200);
    expect(db.cnInternalReturn.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

describe("DELETE /api/store/internal-return/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(delReq(), idParams as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(delReq(), idParams as any)).status).toBe(403);
  });

  it("returns 400 when cancelling a posted return", async () => {
    setContext(makeAdminCtx());
    db.cnInternalReturn.findFirst.mockResolvedValue({ id: ID, status: "posted" });
    expect((await DELETE(delReq(), idParams as any)).status).toBe(400);
  });

  it("cancels a draft return and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnInternalReturn.findFirst.mockResolvedValue({ id: ID, status: "draft" });
    db.cnInternalReturn.update.mockResolvedValue({ id: ID, status: "cancelled" });
    const res = await DELETE(delReq(), idParams as any);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/internal-return/[id]/post  (ledger posting; construction.return.approve)
// ═══════════════════════════════════════════════

describe("POST /api/store/internal-return/[id]/post", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST_LEDGER(postReq(), idParams as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await POST_LEDGER(postReq(), idParams as any)).status).toBe(403);
  });

  it("returns 404 when the return does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnInternalReturn.findFirst.mockResolvedValue(null);
    expect((await POST_LEDGER(postReq(), idParams as any)).status).toBe(404);
  });

  it("returns 409 when already posted", async () => {
    setContext(makeAdminCtx());
    db.cnInternalReturn.findFirst.mockResolvedValue({ id: ID, status: "posted", lines: [] });
    expect((await POST_LEDGER(postReq(), idParams as any)).status).toBe(409);
  });

  it("posts return_internal: appends a ledger row AND increments the balance cache (the drift fix)", async () => {
    setContext(makeAdminCtx());
    db.cnInternalReturn.findFirst.mockResolvedValue({
      id: ID,
      status: "draft",
      projectId: "proj1",
      locationId: "loc1",
      returnNumber: "IR-9001",
      returnDate: new Date("2026-01-15"),
      lines: [{ itemId: "i1", returnedQty: 2, uomId: "u1" }],
    });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    // 50 on hand at avg rate 10 — the return re-enters at this rate.
    db.cnStockBalance.findUnique.mockResolvedValue({ quantity: 50, avgRate: 10 });
    db.cnStockLedger.create.mockResolvedValue({ id: "led1" });
    db.cnStockBalance.upsert.mockResolvedValue({});
    db.cnInternalReturn.update.mockResolvedValue({ id: ID, status: "posted" });

    const res = await POST_LEDGER(postReq(), idParams as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("posted");

    // (1) Inward ledger row: return_internal, qtyIn from the line, at location rate.
    const ledgerData = db.cnStockLedger.create.mock.calls[0][0].data;
    expect(ledgerData.transactionType).toBe("return_internal");
    expect(Number(ledgerData.qtyIn)).toBe(2);
    expect(Number(ledgerData.unitRate)).toBe(10); // value-neutral, not 0

    // (2) THE FIX: balance cache incremented in the same txn (50 + 2 = 52).
    expect(db.cnStockBalance.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = db.cnStockBalance.upsert.mock.calls[0][0];
    expect(Number(upsertArg.update.quantity)).toBe(52);
  });
});
