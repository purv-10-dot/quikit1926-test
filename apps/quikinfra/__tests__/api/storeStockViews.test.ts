import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT } from "../setup";
import { NextRequest } from "next/server";
import { GET as STOCK_BALANCE } from "@/app/api/store/stock-balance/route";
import { GET as STOCK_REGISTER } from "@/app/api/store/stock-register/route";
import {
  GET as ITEMS_STOCK_GET,
  POST as ITEMS_STOCK_POST,
} from "@/app/api/store/items-stock/route";
import { GET as ITEM_STOCK_LOCATIONS } from "@/app/api/store/item-stock-locations/route";

const db = mockDb as any;

function buildGET(path: string, qs = ""): NextRequest {
  return new NextRequest(`http://localhost${path}${qs ? "?" + qs : ""}`, { method: "GET" });
}
function buildPOST(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // Repos batch-fetch + .map — default every model the views touch to [].
  db.cnItem.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
  db.cnLocation.findMany.mockResolvedValue([]);
  db.cnProject.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
  db.cnStockBalance.findMany.mockResolvedValue([]);
  db.cnStockBalance.findUnique.mockResolvedValue(null);
  db.cnStockBalance.groupBy.mockResolvedValue([]);
  // stock-register reads everything through raw SQL.
  db.$queryRawUnsafe.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/store/stock-balance  (gate: construction.stock.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/stock-balance", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await STOCK_BALANCE(buildGET("/api/store/stock-balance", "itemId=i1"))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.stock.view", async () => {
    setContext(makeUserCtx([]));
    expect((await STOCK_BALANCE(buildGET("/api/store/stock-balance", "itemId=i1"))).status).toBe(403);
  });

  it("returns 400 when itemId is missing", async () => {
    setContext(makeUserCtx(["construction.stock.view"]));
    const res = await STOCK_BALANCE(buildGET("/api/store/stock-balance"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/itemId/i);
  });

  it("aggregates quantity scoped to the caller's org", async () => {
    setContext(makeUserCtx(["construction.stock.view"]));
    db.cnStockBalance.findMany.mockResolvedValue([
      { quantity: 10, avgRate: 100 },
      { quantity: 30, avgRate: 200 },
    ]);
    const res = await STOCK_BALANCE(buildGET("/api/store/stock-balance", "itemId=i1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quantity).toBe(40);
    // quantity-weighted avg: (10*100 + 30*200) / 40 = 175
    expect(body.avgRate).toBe(175);
    expect(db.cnStockBalance.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("uses the composite key + org guard for an exact lookup", async () => {
    setContext(makeAdminCtx());
    db.cnStockBalance.findUnique.mockResolvedValue({
      orgId: TEST_TENANT,
      quantity: { toString: () => "5" },
      avgRate: { toString: () => "50" },
    });
    const res = await STOCK_BALANCE(
      buildGET("/api/store/stock-balance", "itemId=i1&projectId=p1&locationId=l1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quantity).toBe(5);
    expect(body.avgRate).toBe(50);
  });

  it("returns zeroes when the exact-lookup row belongs to another org", async () => {
    setContext(makeAdminCtx());
    db.cnStockBalance.findUnique.mockResolvedValue({
      orgId: "other-org",
      quantity: { toString: () => "5" },
      avgRate: { toString: () => "50" },
    });
    const res = await STOCK_BALANCE(
      buildGET("/api/store/stock-balance", "itemId=i1&projectId=p1&locationId=l1"),
    );
    expect((await res.json()).quantity).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// GET /api/store/stock-register  (getTenantContext, raw SQL aggregation)
// NOTE: stock-register does NOT gate — it reads getTenantContext() and
// degrades gracefully (org filter only applied when ctx present).
// ═══════════════════════════════════════════════

describe("GET /api/store/stock-register", () => {
  it("returns 200 with an empty register when there is no movement", async () => {
    setContext(makeAdminCtx());
    const res = await STOCK_REGISTER(buildGET("/api/store/stock-register"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.summary.totalItems).toBe(0);
  });

  it("scopes the raw GRN/PO aggregation to the caller's org", async () => {
    setContext(makeAdminCtx());
    await STOCK_REGISTER(buildGET("/api/store/stock-register"));
    // first raw query is the GRN aggregation — org id rides as a bound param
    const firstCall = db.$queryRawUnsafe.mock.calls[0];
    expect(firstCall).toContain(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// /api/store/items-stock  (GET gate stock.view, POST gate stock.create)
// ═══════════════════════════════════════════════

describe("GET /api/store/items-stock", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await ITEMS_STOCK_GET(buildGET("/api/store/items-stock"))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.stock.view", async () => {
    setContext(makeUserCtx([]));
    expect((await ITEMS_STOCK_GET(buildGET("/api/store/items-stock"))).status).toBe(403);
  });

  it("sums per-item balances scoped to the org via groupBy", async () => {
    setContext(makeUserCtx(["construction.stock.view"]));
    db.cnStockBalance.groupBy.mockResolvedValue([
      { itemId: "i1", _sum: { quantity: { toString: () => "12" } } },
    ]);
    const res = await ITEMS_STOCK_GET(buildGET("/api/store/items-stock", "itemIds=i1,i2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.i1).toBe(12);
    expect(body.data.i2).toBe(0); // missing → backfilled to 0
    expect(db.cnStockBalance.groupBy.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

describe("POST /api/store/items-stock", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await ITEMS_STOCK_POST(buildPOST("/api/store/items-stock", { itemIds: [] }))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.stock.create", async () => {
    setContext(makeUserCtx(["construction.stock.view"])); // view only, not create
    expect((await ITEMS_STOCK_POST(buildPOST("/api/store/items-stock", { itemIds: [] }))).status).toBe(403);
  });

  it("returns the stock map for the posted item ids", async () => {
    setContext(makeUserCtx(["construction.stock.create"]));
    db.cnStockBalance.groupBy.mockResolvedValue([
      { itemId: "i9", _sum: { quantity: { toString: () => "3" } } },
    ]);
    const res = await ITEMS_STOCK_POST(buildPOST("/api/store/items-stock", { itemIds: ["i9"] }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.i9).toBe(3);
  });
});

// ═══════════════════════════════════════════════
// GET /api/store/item-stock-locations  (gate: construction.stock.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/item-stock-locations", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await ITEM_STOCK_LOCATIONS(buildGET("/api/store/item-stock-locations", "itemId=i1"))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.stock.view", async () => {
    setContext(makeUserCtx([]));
    expect((await ITEM_STOCK_LOCATIONS(buildGET("/api/store/item-stock-locations", "itemId=i1"))).status).toBe(403);
  });

  it("returns 400 when itemId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await ITEM_STOCK_LOCATIONS(buildGET("/api/store/item-stock-locations"));
    expect(res.status).toBe(400);
  });

  it("returns per-location balances scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnLocation.findMany
      .mockResolvedValueOnce([
        { id: "l1", code: "WH1", name: "Warehouse 1", type: "warehouse", projectId: "p1", itemQtyByItemId: {} },
      ])
      .mockResolvedValueOnce([
        { id: "l1", code: "WH1", name: "Warehouse 1", type: "warehouse", projectId: "p1" },
      ]);
    db.cnStockBalance.findMany.mockResolvedValue([
      { locationId: "l1", projectId: "p1", quantity: 7 },
    ]);
    const res = await ITEM_STOCK_LOCATIONS(buildGET("/api/store/item-stock-locations", "itemId=i1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemId).toBe("i1");
    expect(body.total).toBe(7);
    expect(body.locations[0].locationId).toBe("l1");
    // master-locations query is org-scoped
    expect(db.cnLocation.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
    expect(db.cnStockBalance.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});
