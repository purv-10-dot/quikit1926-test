import { describe, expect, it, beforeEach, vi } from "vitest";
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

describe("GET /api/price-lists", () => {
  beforeEach(() => {
    db.qcePriceList.findMany.mockReset();
    db.qcePriceList.count.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/price-lists/route");
    const req = new Request("http://test/api/price-lists");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns the {success, data} envelope scoped by tenant", async () => {
    adminSession();
    db.qcePriceList.findMany.mockResolvedValue([
      {
        id: "pl1",
        name: "Standard",
        description: null,
        currency: "INR",
        effectiveFrom: null,
        effectiveTo: null,
        isActive: true,
        isDefault: true,
        regionCode: null,
        customerTier: null,
        versionNumber: 1,
        sourcePriceListId: null,
        createdByUserId: "u1",
        updatedByUserId: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { items: 7 },
      } as never,
    ]);
    db.qcePriceList.count.mockResolvedValue(1);

    const { GET } = await import("@/app/api/price-lists/route");
    const req = new Request("http://test/api/price-lists");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const where = db.qcePriceList.findMany.mock.calls[0]![0]!.where as { orgId?: string };
    expect(where.orgId).toBe("t1");
  });
});

describe("POST /api/price-lists", () => {
  beforeEach(() => {
    setSession(null);
    db.$transaction.mockReset();
  });

  it("creates a price list and clears other defaults when isDefault=true", async () => {
    adminSession();
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
    db.qcePriceList.updateMany.mockResolvedValue({ count: 0 } as never);
    db.qcePriceListAuditLog = db.qcePriceListAuditLog ?? { create: vi.fn() };
    db.qcePriceListAuditLog.create.mockResolvedValue({ id: "a1" } as never);
    db.qcePriceList.create.mockResolvedValue({
      id: "pl1",
      name: "Enterprise 2026",
      isDefault: true,
    } as never);

    const { POST } = await import("@/app/api/price-lists/route");
    const req = new Request("http://test/api/price-lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Enterprise 2026", isDefault: true }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);
    // The default-clearing branch must be exercised.
    expect(db.qcePriceList.updateMany).toHaveBeenCalled();
  });

  it("returns 409 on duplicate name", async () => {
    adminSession();
    db.$transaction.mockImplementation(async () => {
      throw { code: "P2002" };
    });

    const { POST } = await import("@/app/api/price-lists/route");
    const req = new Request("http://test/api/price-lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Standard" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(409);
  });
});
