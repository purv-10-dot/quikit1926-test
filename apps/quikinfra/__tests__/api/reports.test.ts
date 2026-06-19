import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// ───────────────────────────────────────────────────────────────────
// The stock-valuation + vendor-performance reports gate through
// `withOrgAuthForModule("reports")`. We mock `@/lib/api/withOrgAuth`
// with a faithful passthrough: 401 when no auth ctx, handler invoked
// with { session, userId, orgId }, try/catch → 500 envelope. (Module /
// RBAC gating is upstream of this surface and not exercised here.)
//
// ap-aging, ar-aging, project-pnl are static stubs that take NO auth —
// they return { success: true, data: [] } unconditionally.
// ───────────────────────────────────────────────────────────────────
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

// Import AFTER mocks are registered.
const apAging = await import("@/app/api/reports/ap-aging/route");
const arAging = await import("@/app/api/reports/ar-aging/route");
const projectPnl = await import("@/app/api/reports/project-pnl/route");
const stockVal = await import("@/app/api/reports/stock-valuation/route");
const vendorPerf = await import("@/app/api/reports/vendor-performance/route");

function reqGET(path: string, qs = ""): NextRequest {
  return new NextRequest(`http://localhost${path}${qs ? "?" + qs : ""}`, { method: "GET" });
}

beforeEach(() => {
  resetMockDb();
  setAuth(null);
});

// ═══════════════════════════════════════════════
// Stubbed finance reports — ap-aging, ar-aging, project-pnl
// ═══════════════════════════════════════════════

describe("GET /api/reports/ap-aging (stub)", () => {
  it("returns an empty data envelope unconditionally", async () => {
    const res = await apAging.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

describe("GET /api/reports/ar-aging (stub)", () => {
  it("returns an empty data envelope unconditionally", async () => {
    const res = await arAging.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

describe("GET /api/reports/project-pnl (stub)", () => {
  it("returns an empty data envelope unconditionally", async () => {
    const res = await projectPnl.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════
// GET /api/reports/stock-valuation
// ═══════════════════════════════════════════════

describe("GET /api/reports/stock-valuation", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await stockVal.GET(reqGET("/api/reports/stock-valuation"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("aggregates qty = ΣqtyIn − ΣqtyOut with a moving-avg value, scoped to the org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    // First groupBy: per project/location/item/uom net movement.
    db.cnStockLedger.groupBy
      .mockResolvedValueOnce([
        {
          projectId: "p1", locationId: "l1", itemId: "i1", uomId: "u1",
          _sum: { qtyIn: 100, qtyOut: 40, amount: 1000 },
        },
      ])
      // Second groupBy: inbound-only for moving-avg rate (qtyIn 100, amount 1000 → rate 10).
      .mockResolvedValueOnce([
        { projectId: "p1", locationId: "l1", itemId: "i1", _sum: { qtyIn: 100, amount: 1000 } },
      ]);
    db.cnProject.findMany.mockResolvedValue([{ id: "p1", code: "PRJ-1", name: "Tower A" }]);
    db.cnLocation.findMany.mockResolvedValue([{ id: "l1", code: "LOC-1", name: "Main Store" }]);
    db.cnItem.findMany.mockResolvedValue([{ id: "i1", code: "ITM-1", name: "Cement" }]);
    db.cnUOM.findMany.mockResolvedValue([{ id: "u1", code: "BAG" }]);

    const res = await stockVal.GET(reqGET("/api/reports/stock-valuation"), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    const row = body.data[0];
    expect(row.projectName).toBe("Tower A");
    expect(row.itemName).toBe("Cement");
    expect(row.qty).toBe(60); // 100 - 40
    expect(row.rate).toBe(10); // 1000 / 100
    expect(row.value).toBe(600); // 60 * 10

    // org scope rides on BOTH groupBy where clauses.
    expect(db.cnStockLedger.groupBy.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
    expect(db.cnStockLedger.groupBy.mock.calls[1][0].where.orgId).toBe(TEST_TENANT);
    expect(db.cnStockLedger.groupBy.mock.calls[1][0].where.qtyIn).toEqual({ gt: 0 });
  });

  it("filters out rows whose net qty is ~zero", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnStockLedger.groupBy
      .mockResolvedValueOnce([
        {
          projectId: "p1", locationId: "l1", itemId: "i1", uomId: "u1",
          _sum: { qtyIn: 50, qtyOut: 50, amount: 500 },
        },
      ])
      .mockResolvedValueOnce([]);
    db.cnProject.findMany.mockResolvedValue([]);
    db.cnLocation.findMany.mockResolvedValue([]);
    db.cnItem.findMany.mockResolvedValue([]);
    db.cnUOM.findMany.mockResolvedValue([]);

    const res = await stockVal.GET(reqGET("/api/reports/stock-valuation"), { params: {} });
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════
// GET /api/reports/vendor-performance
// ═══════════════════════════════════════════════

describe("GET /api/reports/vendor-performance", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await vendorPerf.GET(reqGET("/api/reports/vendor-performance"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("computes per-vendor PO/GRN totals, on-time % and quality-accept %", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const deliveryDate = new Date("2026-01-10");
    const onTimeGrnDate = new Date("2026-01-08"); // <= deliveryDate

    db.cnVendor.findMany.mockResolvedValue([
      { id: "v1", code: "VEN-1", name: "Acme", rating: 4 },
    ]);
    db.cnPurchaseOrder.findMany.mockResolvedValue([
      {
        id: "po1", vendorId: "v1", totalAmount: 1000, deliveryDate,
        grns: [{ id: "g1", grnDate: onTimeGrnDate }],
      },
    ]);
    db.cnGoodsReceiptNote.findMany.mockResolvedValue([
      {
        vendorId: "v1", poId: "po1", grnDate: onTimeGrnDate,
        lines: [{ amount: 600, qualityStatus: "accepted" }, { amount: 200, qualityStatus: "rejected" }],
      },
    ]);
    db.cnGRNLine.findMany.mockResolvedValue([
      { qualityStatus: "accepted", grn: { vendorId: "v1" } },
      { qualityStatus: "rejected", grn: { vendorId: "v1" } },
    ]);

    const res = await vendorPerf.GET(reqGET("/api/reports/vendor-performance"), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    const row = body.data[0];
    expect(row.vendorId).toBe("v1");
    expect(row.poCount).toBe(1);
    expect(row.grnCount).toBe(1);
    expect(row.totalPoAmount).toBe(1000);
    expect(row.totalGrnAmount).toBe(800); // 600 + 200
    expect(row.grnOnTimePct).toBe(100); // 1 of 1 on time
    expect(row.qualityAcceptPct).toBe(50); // 1 accepted of 2 lines

    // org scope on every source query.
    expect(db.cnVendor.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
    expect(db.cnPurchaseOrder.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
    expect(db.cnGoodsReceiptNote.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
    // GRN-line org scope rides through the nested grn relation filter.
    expect(db.cnGRNLine.findMany.mock.calls[0][0].where.grn.orgId).toBe(TEST_TENANT);
  });

  it("drops vendors with no POs and no GRNs", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnVendor.findMany.mockResolvedValue([{ id: "v2", code: "VEN-2", name: "Idle", rating: null }]);
    db.cnPurchaseOrder.findMany.mockResolvedValue([]);
    db.cnGoodsReceiptNote.findMany.mockResolvedValue([]);
    db.cnGRNLine.findMany.mockResolvedValue([]);

    const res = await vendorPerf.GET(reqGET("/api/reports/vendor-performance"), { params: {} });
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
