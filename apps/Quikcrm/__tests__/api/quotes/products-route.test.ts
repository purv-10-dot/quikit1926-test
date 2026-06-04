import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function adminSession() {
  setSession({
    userId: "u1",
    orgId: "t1",
    role: "Administrator",
    email: "a@b.co",
    name: "Alice",
  });
}

describe("GET /api/products", () => {
  beforeEach(() => {
    db.crmProduct.findMany.mockReset();
    db.crmProduct.count.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/products/route");
    const req = new Request("http://test/api/products");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns the {success, data} envelope", async () => {
    adminSession();
    db.crmProduct.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Dell Laptop",
        sku: "DELL-001",
        category: "Electronics",
        hsnCode: "8471",
        unitGroup: "Each",
        defaultUnit: "Each",
        listPrice: "50000.00",
        currency: "INR",
        gstRate: "18.00",
        productType: "Product",
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
    ]);
    db.crmProduct.count.mockResolvedValue(1);

    const { GET } = await import("@/app/api/products/route");
    const req = new Request("http://test/api/products");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].listPrice).toBe(50000);
    expect(body.data.items[0].gstRate).toBe(18);
  });

  it("scopes the where clause by orgId", async () => {
    adminSession();
    db.crmProduct.findMany.mockResolvedValue([]);
    db.crmProduct.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/products/route");
    const req = new Request("http://test/api/products");
    await GET(req as unknown as import("next/server").NextRequest);

    const where = db.crmProduct.findMany.mock.calls[0]![0]!.where as { orgId?: string };
    expect(where.orgId).toBe("t1");
  });
});

describe("POST /api/products", () => {
  beforeEach(() => {
    db.crmProduct.create.mockReset();
    setSession(null);
  });

  it("rejects bodies that fail validation", async () => {
    adminSession();
    const { POST } = await import("@/app/api/products/route");
    const req = new Request("http://test/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("creates a product with happy-path payload", async () => {
    adminSession();
    db.crmProduct.create.mockResolvedValue({
      id: "p1",
      orgId: "t1",
      name: "Dell Laptop",
      sku: "DELL-001",
      listPrice: "50000.00",
      gstRate: "18.00",
      standardCost: null,
      productType: "Product",
      isActive: true,
    } as never);

    const { POST } = await import("@/app/api/products/route");
    const req = new Request("http://test/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Dell Laptop",
        sku: "DELL-001",
        listPrice: 50000,
        gstRate: 18,
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.listPrice).toBe(50000);
  });

  it("returns 409 on duplicate SKU", async () => {
    adminSession();
    db.crmProduct.create.mockRejectedValue({ code: "P2002" } as never);

    const { POST } = await import("@/app/api/products/route");
    const req = new Request("http://test/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Dell Laptop",
        sku: "DELL-001",
        listPrice: 50000,
        gstRate: 18,
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.fieldErrors.sku).toBeTruthy();
  });
});
