import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";

// store/grn/* routes are wrapped by `withOrgAuthForModule` (getServerSession →
// getTenantId → userCan), which the shared harness does NOT drive. Re-implement
// the wrapper against the harness's getTenantContext mock so setContext/
// makeAdminCtx/makeUserCtx control these routes. Gate key == `${resource}.${action}`.
vi.mock("@/lib/api/withOrgAuth", async () => {
  const { NextResponse } = await import("next/server");
  const { getTenantContext } = await import("@/lib/auth/context");

  const withOrgAuth = (handler: any, options: any = {}) => {
    return async (req: any, routeCtx: any) => {
      const ctx: any = await (getTenantContext as any)();
      if (!ctx) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      if (options.permission) {
        const key = `${options.permission.resource}.${options.permission.action}`;
        if (!ctx.permissions.has("*") && !ctx.permissions.has(key)) {
          return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }
      }
      try {
        return await handler({ session: {}, userId: ctx.userId, orgId: ctx.orgId }, req, routeCtx ?? { params: {} });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Operation failed";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
      }
    };
  };
  return {
    withOrgAuth,
    withOrgAuthForModule: () => withOrgAuth,
    forbidden: () => NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

// logAudit (grn post) hits db.cnAuditLog — keep it a silent no-op surface.
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { GET as GRN_GET, POST as GRN_POST } from "@/app/api/store/grn/route";
import { GET as GRN_ID_GET, DELETE as GRN_ID_DELETE } from "@/app/api/store/grn/[id]/route";
import { POST as GRN_POST_ACTION } from "@/app/api/store/grn/[id]/post/route";

const db = mockDb as any;

function buildGET(path: string, qs = ""): NextRequest {
  return new NextRequest(`http://localhost${path}${qs ? "?" + qs : ""}`, { method: "GET" });
}
function buildBody(path: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_GRN = {
  grnNumber: "GRN-1",
  poId: "po1",
  projectId: "proj1",
  vendorId: "v1",
  grnDate: "2026-01-01",
  locationId: "loc1",
  receivedById: "u1",
  lines: [
    { poLineId: "pol1", itemId: "i1", receivedQty: 10, acceptedQty: 10, rejectedQty: 0, uomId: "uom1", unitRate: 100 },
  ],
};

const PO_OK = {
  id: "po1",
  status: "sent",
  vendorId: "v1",
  projectId: "proj1",
  lines: [{ id: "pol1", orderedQty: 20, receivedQty: 0, pendingQty: 20, itemId: "i1" }],
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnItem.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/store/grn  (gate: construction.grn.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/grn", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GRN_GET(buildGET("/api/store/grn"), { params: {} } as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.grn.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GRN_GET(buildGET("/api/store/grn"), { params: {} } as any)).status).toBe(403);
  });

  it("lists GRNs scoped to the caller's org", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findMany.mockResolvedValue([
      { id: "g1", orgId: TEST_TENANT, grnNumber: "GRN-1", status: "draft" },
    ]);
    const res = await GRN_GET(buildGET("/api/store/grn"), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(db.cnGoodsReceiptNote.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/grn  (gate: construction.grn.create)
// ═══════════════════════════════════════════════

describe("POST /api/store/grn", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GRN_POST(buildBody("/api/store/grn", "POST", VALID_GRN), { params: {} } as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.grn.create", async () => {
    setContext(makeUserCtx([]));
    expect((await GRN_POST(buildBody("/api/store/grn", "POST", VALID_GRN), { params: {} } as any)).status).toBe(403);
  });

  it("returns 500 (zod throw) when required fields are missing", async () => {
    setContext(makeAdminCtx());
    const res = await GRN_POST(buildBody("/api/store/grn", "POST", { grnNumber: "GRN-1" }), { params: {} } as any);
    expect(res.status).toBe(500);
  });

  it("returns 400 when the PO does not exist in the org", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(null);
    const res = await GRN_POST(buildBody("/api/store/grn", "POST", VALID_GRN), { params: {} } as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/PO not found/i);
  });

  it("returns 400 on over-receipt against the PO line pending qty", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue({
      ...PO_OK,
      lines: [{ id: "pol1", orderedQty: 5, receivedQty: 0, pendingQty: 5, itemId: "i1" }],
    });
    const res = await GRN_POST(
      buildBody("/api/store/grn", "POST", {
        ...VALID_GRN,
        lines: [{ poLineId: "pol1", itemId: "i1", receivedQty: 10, acceptedQty: 10, rejectedQty: 0, uomId: "uom1", unitRate: 100 }],
      }),
      { params: {} } as any,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/over-receipt/i);
  });

  it("returns 409 on a duplicate GRN number", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(PO_OK);
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue({ id: "dup" });
    const res = await GRN_POST(buildBody("/api/store/grn", "POST", VALID_GRN), { params: {} } as any);
    expect(res.status).toBe(409);
  });

  it("creates a draft GRN scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(PO_OK);
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(null);
    db.cnGoodsReceiptNote.create.mockResolvedValue({ id: "g1", orgId: TEST_TENANT, status: "draft", lines: [] });
    const res = await GRN_POST(buildBody("/api/store/grn", "POST", VALID_GRN), { params: {} } as any);
    expect(res.status).toBe(201);
    const data = db.cnGoodsReceiptNote.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.status).toBe("draft");
  });
});

// ═══════════════════════════════════════════════
// GET/DELETE /api/store/grn/[id]
// ═══════════════════════════════════════════════

describe("GET /api/store/grn/[id]", () => {
  const params = { params: { id: "g1" } };

  it("returns 401 when unauthenticated", async () => {
    expect((await GRN_ID_GET(buildGET("/api/store/grn/g1"), params as any)).status).toBe(401);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(null);
    expect((await GRN_ID_GET(buildGET("/api/store/grn/g1"), params as any)).status).toBe(404);
  });

  it("returns the GRN scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue({ id: "g1", orgId: TEST_TENANT, lines: [] });
    const res = await GRN_ID_GET(buildGET("/api/store/grn/g1"), params as any);
    expect(res.status).toBe(200);
    expect(db.cnGoodsReceiptNote.findFirst.mock.calls[0][0].where).toMatchObject({ id: "g1", orgId: TEST_TENANT });
  });
});

describe("DELETE /api/store/grn/[id]", () => {
  const params = { params: { id: "g1" } };

  it("returns 403 when the user lacks construction.grn.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await GRN_ID_DELETE(buildGET("/api/store/grn/g1"), params as any)).status).toBe(403);
  });

  it("returns 404 when not found", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(null);
    expect((await GRN_ID_DELETE(buildGET("/api/store/grn/g1"), params as any)).status).toBe(404);
  });

  it("returns 400 when trying to delete a posted GRN", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue({ id: "g1", status: "posted" });
    const res = await GRN_ID_DELETE(buildGET("/api/store/grn/g1"), params as any);
    expect(res.status).toBe(400);
  });

  it("soft-cancels a draft GRN", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue({ id: "g1", status: "draft" });
    db.cnGoodsReceiptNote.update.mockResolvedValue({ id: "g1", status: "cancelled" });
    const res = await GRN_ID_DELETE(buildGET("/api/store/grn/g1"), params as any);
    expect(res.status).toBe(200);
    expect(db.cnGoodsReceiptNote.update.mock.calls[0][0].data.status).toBe("cancelled");
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/grn/[id]/post  (gate: construction.grn.approve)
// writes the stock ledger inside a transaction
// ═══════════════════════════════════════════════

describe("POST /api/store/grn/[id]/post", () => {
  const params = { params: { id: "g1" } };

  it("returns 401 when unauthenticated", async () => {
    expect((await GRN_POST_ACTION(buildBody("/api/store/grn/g1/post", "POST", {}), params as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.grn.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await GRN_POST_ACTION(buildBody("/api/store/grn/g1/post", "POST", {}), params as any)).status).toBe(403);
  });

  it("returns 404 when the GRN does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(null);
    expect((await GRN_POST_ACTION(buildBody("/api/store/grn/g1/post", "POST", {}), params as any)).status).toBe(404);
  });

  it("returns 409 when the GRN is already posted", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue({ id: "g1", status: "posted", lines: [], po: { lines: [] } });
    expect((await GRN_POST_ACTION(buildBody("/api/store/grn/g1/post", "POST", {}), params as any)).status).toBe(409);
  });

  it("returns 400 when posting from a non-draft status", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue({ id: "g1", status: "cancelled", lines: [], po: { lines: [] } });
    expect((await GRN_POST_ACTION(buildBody("/api/store/grn/g1/post", "POST", {}), params as any)).status).toBe(400);
  });

  it("posts a draft GRN: writes the stock ledger and flips status to posted", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue({
      id: "g1",
      status: "draft",
      grnNumber: "GRN-1",
      grnDate: new Date("2026-01-01"),
      projectId: "proj1",
      locationId: "loc1",
      poId: "po1",
      lines: [
        { itemId: "i1", poLineId: "pol1", acceptedQty: 10, unitRate: 100, amount: 1000, uomId: "uom1" },
      ],
      po: { lines: [{ id: "pol1", orderedQty: 20, receivedQty: 0, pendingQty: 20 }] },
    });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnStockLedger.create.mockResolvedValue({ id: "led1" });
    db.cnPurchaseOrderLine.update.mockResolvedValue({});
    db.cnPurchaseOrderLine.findMany.mockResolvedValue([{ orderedQty: 20, receivedQty: 10 }]);
    db.cnPurchaseOrder.update.mockResolvedValue({});
    db.cnGoodsReceiptNote.update.mockResolvedValue({ id: "g1", status: "posted" });

    const res = await GRN_POST_ACTION(buildBody("/api/store/grn/g1/post", "POST", {}), params as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("posted");
    // ledger row written with qtyIn = acceptedQty, scoped to org
    expect(db.cnStockLedger.create).toHaveBeenCalled();
    expect(db.cnStockLedger.create.mock.calls[0][0].data.orgId).toBe(TEST_TENANT);
    expect(db.cnStockLedger.create.mock.calls[0][0].data.qtyIn).toBe(10);
  });
});
