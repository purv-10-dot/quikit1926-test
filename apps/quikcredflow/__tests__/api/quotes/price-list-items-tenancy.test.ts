/**
 * Regression tests for the tenant-isolation fixes on price-list-items
 * (refactor/quotes-feature-hardening).
 *
 * Before the fix:
 *   - addPriceListItem trusted productId / priceListId blindly â€” a caller
 *     could attach any product (across tenants) by passing its ID.
 *   - updatePriceListItem cast { id, orgId } into a unique-where; Prisma
 *     silently ignored orgId because it's not part of any unique index,
 *     so cross-tenant updates by ID would have succeeded.
 *
 * Both are now blocked at the service layer via explicit findFirst checks
 * inside a transaction.
 */
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

describe("POST /api/price-lists/[id]/items â€” tenant scoping", () => {
  beforeEach(() => {
    setSession(null);
    db.$transaction.mockReset();
    db.qcfPriceList.findFirst.mockReset();
    db.qcfProduct.findFirst.mockReset();
    db.qcfPriceListItem.create.mockReset();
  });

  it("rejects with 404 when productId belongs to another tenant", async () => {
    adminSession();
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
    // Price list exists in tenant t1 âœ”
    db.qcfPriceList.findFirst.mockResolvedValue({ id: "pl1" } as never);
    // But the product isn't visible to tenant t1 â€” pretend it's in t2.
    db.qcfProduct.findFirst.mockResolvedValue(null);

    // getPriceList (called by route before service) also resolves the pl.
    db.qcfPriceList.findFirst.mockResolvedValueOnce({ id: "pl1", items: [] } as never);

    const { POST } = await import("@/app/api/price-lists/[id]/items/route");
    const req = new Request("http://test/api/price-lists/pl1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "p-other-tenant", unitPrice: 100 }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "pl1" }),
    });
    expect(res.status).toBe(404);
    expect(db.qcfPriceListItem.create).not.toHaveBeenCalled();
  });

  it("rejects with 404 when priceListId belongs to another tenant (via service check)", async () => {
    adminSession();
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
    // The route-level getPriceList check would actually catch this first,
    // but the service-level guard is the belt-and-braces.
    db.qcfPriceList.findFirst.mockResolvedValueOnce({ id: "pl1", items: [] } as never); // route preflight
    db.qcfPriceList.findFirst.mockResolvedValueOnce(null); // service guard
    db.qcfProduct.findFirst.mockResolvedValue({ id: "p1" } as never);

    const { POST } = await import("@/app/api/price-lists/[id]/items/route");
    const req = new Request("http://test/api/price-lists/pl1/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "p1", unitPrice: 100 }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "pl1" }),
    });
    expect(res.status).toBe(404);
    expect(db.qcfPriceListItem.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/price-lists/[id]/items/[itemId] â€” tenant scoping", () => {
  beforeEach(() => {
    setSession(null);
    db.$transaction.mockReset();
    db.qcfPriceListItem.findFirst.mockReset();
    db.qcfPriceListItem.update.mockReset();
  });

  it("returns 404 when the item belongs to another tenant", async () => {
    adminSession();
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
    // The ownership check fails: item exists somewhere, but not in t1.
    db.qcfPriceListItem.findFirst.mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/price-lists/[id]/items/[itemId]/route");
    const req = new Request("http://test/api/price-lists/pl1/items/cross-tenant-item", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitPrice: 1 }),
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "pl1", itemId: "cross-tenant-item" }),
    });
    expect(res.status).toBe(404);
    // The crucial assertion â€” no SQL UPDATE was issued.
    expect(db.qcfPriceListItem.update).not.toHaveBeenCalled();
  });
});
