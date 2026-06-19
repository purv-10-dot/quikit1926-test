import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/purchase/orders/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/purchase/orders${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/purchase/orders", {
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
// GET /api/purchase/orders  (gate: construction.po.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/orders", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.po.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("lists POs scoped to the org (legacy {data,total} shape)", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findMany.mockResolvedValue([
      {
        id: "po1",
        orgId: TEST_TENANT,
        poNumber: "PO-SITE-26-0001",
        projectId: "proj1",
        vendorId: "v1",
        status: "draft",
        lines: [],
        createdBy: TEST_USER,
        updatedBy: TEST_USER,
        freightCharges: "0",
        closedAt: null,
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.data[0].poNumber).toBe("PO-SITE-26-0001");
    expect(db.cnPurchaseOrder.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("returns the paginated envelope when page/pageSize are supplied", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findMany.mockResolvedValue([]);
    const res = await GET(buildGET("page=2&pageSize=10"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/orders  (gate: getTenantContext + matrix purchase.po:add)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/orders", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({}))).status).toBe(401);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx([], { permissionMatrix: { "purchase.po": { add: false } } }),
    );
    expect((await POST(buildPOST({}))).status).toBe(403);
  });

  it("returns 400 when no vendor is supplied", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ projectId: "proj1", lines: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VENDOR_NOT_SELECTED");
  });

  it("returns 400 when projectId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ vendorId: "v1", lines: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/project is required/i);
  });

  it("creates an urgent-local PO scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    // Vendor lookup (findVendorsByIds → cnVendor.findMany)
    db.cnVendor.findMany.mockResolvedValue([
      { id: "v1", orgId: TEST_TENANT, name: "Acme", status: "active", gstin: "" },
    ]);
    // Project lookup (findProjectById → cnProject.findFirst)
    db.cnProject.findFirst.mockResolvedValue({
      id: "proj1",
      orgId: TEST_TENANT,
      code: "SITE",
      name: "Site One",
      client: null,
    });
    // Item master pre-resolution
    db.cnItem.findMany.mockResolvedValue([]);
    // UOM resolution inside createPO (buildPOLines drops uomId, keeps uomCode)
    db.cnUOM.findFirst.mockResolvedValue({ id: "u1" });
    // Doc-number generation (nextProjectScopedDocNumber → cnPurchaseOrder.findMany)
    db.cnPurchaseOrder.findMany.mockResolvedValue([]);
    db.cnPurchaseOrder.create.mockResolvedValue({
      id: "po1",
      orgId: TEST_TENANT,
      poNumber: "PO-SITE-26-0001",
      projectId: "proj1",
      vendorId: "v1",
      status: "draft",
      lines: [],
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
      freightCharges: "0",
      closedAt: null,
    });

    const res = await POST(
      buildPOST({
        projectId: "proj1",
        vendorId: "v1",
        isUrgentLocal: true,
        urgentLocalReason: "Emergency cement",
        lines: [
          { itemId: "i1", uomCode: "NOS", poQty: "10", unitRate: "100", gstRate: "0" },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("po1");
    const created = db.cnPurchaseOrder.create.mock.calls[0][0].data;
    expect(created.orgId).toBe(TEST_TENANT);
    expect(created.createdBy).toBe(TEST_USER);
  });
});
