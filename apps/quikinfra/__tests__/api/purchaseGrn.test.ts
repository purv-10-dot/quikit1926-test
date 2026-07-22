import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/purchase/grn/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/purchase/grn${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/purchase/grn", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/purchase/grn  (gate: construction.grn.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/grn", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.grn.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("lists GRNs scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findMany.mockResolvedValue([
      {
        id: "grn1",
        orgId: TEST_TENANT,
        grnNumber: "GRN-SITE-26-0001",
        projectId: "proj1",
        status: "draft",
        lines: [],
        createdBy: TEST_USER,
        updatedBy: TEST_USER,
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(db.cnGoodsReceiptNote.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/grn  (gate: getTenantContext + matrix purchase.grn:add)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/grn", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({}))).status).toBe(401);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx([], { permissionMatrix: { "purchase.grn": { add: false } } }),
    );
    expect((await POST(buildPOST({}))).status).toBe(403);
  });

  it("returns 400 when no source PO is supplied (SOURCE_PO_REQUIRED)", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ lines: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("SOURCE_PO_REQUIRED");
  });

  it("returns 400 when the source PO is not found (PO_NOT_FOUND)", async () => {
    setContext(makeAdminCtx());
    // findPOById → cnPurchaseOrder.findFirst returns null
    db.cnPurchaseOrder.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST({ poId: "po-missing", lines: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("PO_NOT_FOUND");
  });

  it("creates a GRN when challan number, date, and attachment are all omitted (all optional)", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue({
      id: "po1",
      orgId: TEST_TENANT,
      status: "approved",
      poNumber: "PO-SITE-26-0001",
      projectId: "proj1",
      vendorId: "v1",
      projectCode: "SITE",
      deliveryLocationId: "loc1",
      freightCharges: "0",
      closedAt: null,
      lines: [
        { id: "pol1", itemId: "i1", orderedQty: "10", receivedQty: "0", pendingQty: "10", unitRate: "100" },
      ],
    });
    db.cnGoodsReceiptNote.findMany.mockResolvedValue([]);
    db.cnItem.findMany.mockResolvedValue([]);
    db.cnUOM.findMany.mockResolvedValue([]);
    db.cnGoodsReceiptNote.create.mockResolvedValue({
      id: "grn2",
      orgId: TEST_TENANT,
      grnNumber: "GRN-SITE-26-0001",
      poId: "po1",
      projectId: "proj1",
      vendorId: "v1",
      status: "draft",
      lines: [],
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST({ poId: "po1", lines: [] }));
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("grn2");
  });

  it("creates a GRN from an eligible PO and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue({
      id: "po1",
      orgId: TEST_TENANT,
      status: "approved",
      poNumber: "PO-SITE-26-0001",
      projectId: "proj1",
      vendorId: "v1",
      projectCode: "SITE",
      deliveryLocationId: "loc1", // short-circuits the location fallback chain
      freightCharges: "0",
      closedAt: null,
      lines: [
        { id: "pol1", itemId: "i1", orderedQty: "10", receivedQty: "0", pendingQty: "10", unitRate: "100" },
      ],
    });
    db.cnGoodsReceiptNote.findMany.mockResolvedValue([]); // doc-number scan
    db.cnItem.findMany.mockResolvedValue([]);
    db.cnUOM.findMany.mockResolvedValue([]);
    db.cnGoodsReceiptNote.create.mockResolvedValue({
      id: "grn1",
      orgId: TEST_TENANT,
      grnNumber: "GRN-SITE-26-0001",
      poId: "po1",
      projectId: "proj1",
      vendorId: "v1",
      status: "draft",
      lines: [],
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(
      buildPOST({
        poId: "po1",
        lines: [],
        challanNo: "CH-1",
        challanDate: "2026-06-01",
        challanAttachment: "scan.pdf",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("grn1");
    const created = db.cnGoodsReceiptNote.create.mock.calls[0][0].data;
    expect(created.orgId).toBe(TEST_TENANT);
    expect(created.createdBy).toBe(TEST_USER);
    expect(created.poId).toBe("po1");
  });
});
