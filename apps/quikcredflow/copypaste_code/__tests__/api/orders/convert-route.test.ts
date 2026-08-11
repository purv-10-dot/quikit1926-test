/**
 * Tests for POST /api/quotes/[id]/convert-to-order (audit finding W-2:
 * Quote Won was a dead end â€” now lands as an Order with snapshotted
 * totals and idempotent re-conversion).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function adminSession() {
  setSession({
    userId: "u1",
    tenantId: "t1",
    role: "Administrator",
    email: "a@b.co",
    name: "Alice",
  });
}

describe("POST /api/quotes/[id]/convert-to-order", () => {
  beforeEach(() => {
    setSession(null);
    db.$transaction.mockReset();
    db.crmOrder.findFirst.mockReset();
    db.crmQuote.findFirst.mockReset();
    db.crmSequence.upsert.mockReset();
    db.crmOrder.create.mockReset();
    db.crmOrderLine.create.mockReset();
    db.crmActivity.create.mockReset();

    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/quotes/[id]/convert-to-order/route");
    const req = new Request("http://test/api/quotes/q1/convert-to-order", { method: "POST" });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the quote is in another tenant", async () => {
    adminSession();
    db.crmOrder.findFirst.mockResolvedValue(null); // no existing order
    db.crmQuote.findFirst.mockResolvedValue(null); // quote not in tenant

    const { POST } = await import("@/app/api/quotes/[id]/convert-to-order/route");
    const req = new Request("http://test/api/quotes/q-foreign/convert-to-order", { method: "POST" });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q-foreign" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the quote isn't in Won status", async () => {
    adminSession();
    db.crmOrder.findFirst.mockResolvedValue(null);
    db.crmQuote.findFirst.mockResolvedValue({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Active",
      lines: [],
    } as never);

    const { POST } = await import("@/app/api/quotes/[id]/convert-to-order/route");
    const req = new Request("http://test/api/quotes/q1/convert-to-order", { method: "POST" });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/won/iu);
    expect(db.crmOrder.create).not.toHaveBeenCalled();
  });

  it("idempotent: returns existing order (200) instead of duplicating", async () => {
    adminSession();
    // Order already exists for this quote.
    db.crmOrder.findFirst.mockResolvedValue({
      id: "ord-existing",
      orderNumber: "ORD-2026-0001",
    } as never);

    const { POST } = await import("@/app/api/quotes/[id]/convert-to-order/route");
    const req = new Request("http://test/api/quotes/q1/convert-to-order", { method: "POST" });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.alreadyExisted).toBe(true);
    expect(body.data.id).toBe("ord-existing");
    // No new order should have been minted.
    expect(db.crmOrder.create).not.toHaveBeenCalled();
  });

  it("happy path: 201, snapshots totals, mints ORD-YYYY-NNNN, emits twin activity rows", async () => {
    adminSession();
    db.crmOrder.findFirst.mockResolvedValue(null);
    db.crmQuote.findFirst.mockResolvedValue({
      id: "q1",
      quoteNumber: "QT-2026-0007",
      status: "Won",
      accountId: "a1",
      contactId: null,
      opportunityId: "opp1",
      currency: "INR",
      subtotal: "10000.00",
      totalLineDiscount: "500.00",
      overallDiscountAmount: "200.00",
      taxableAmount: "9300.00",
      cgstAmount: "0",
      sgstAmount: "0",
      igstAmount: "1674.00",
      freightAmount: "100.00",
      grandTotal: "11074.00",
      grandTotalInWords: "Eleven Thousand Seventy Four Rupees Only",
      termsText: "50% advance",
      ownerId: "u1",
      ownerName: "Alice",
      lines: [
        {
          lineNumber: 1,
          productId: "p1",
          productName: "Dell Laptop",
          sku: "DELL-001",
          hsnCode: "8471",
          description: null,
          quantity: "1",
          unit: "Each",
          unitPrice: "10000",
          discountPct: "5",
          discountAmount: "500",
          taxableAmount: "9500",
          gstRate: "18",
          cgstAmount: "0",
          sgstAmount: "0",
          igstAmount: "1710",
          lineTotal: "11210",
          sortOrder: 0,
        },
      ],
    } as never);
    db.crmSequence.upsert.mockResolvedValue({ counter: 1 } as never);
    db.crmOrder.create.mockResolvedValue({ id: "ord-new" } as never);
    db.crmOrderLine.create.mockResolvedValue({} as never);
    db.crmActivity.create.mockResolvedValue({} as never);

    const { POST } = await import("@/app/api/quotes/[id]/convert-to-order/route");
    const req = new Request("http://test/api/quotes/q1/convert-to-order", { method: "POST" });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.alreadyExisted).toBe(false);
    expect(body.data.id).toBe("ord-new");
    expect(body.data.orderNumber).toMatch(/^ORD-\d{4}-0001$/u);

    // Totals snapshotted on the order â€” must NOT recompute.
    const orderCreateCall = db.crmOrder.create.mock.calls[0]![0]! as {
      data: { grandTotal: unknown; totalDiscount: unknown; status: string };
    };
    expect(orderCreateCall.data.grandTotal).toBe("11074.00");
    // totalDiscount = line (500) + overall (200) = 700.00
    expect(orderCreateCall.data.totalDiscount).toBe("700.00");
    expect(orderCreateCall.data.status).toBe("Open");

    // Line snapshot was created.
    expect(db.crmOrderLine.create).toHaveBeenCalledOnce();

    // Twin activity rows â€” one on the order, one on the quote.
    const activityTypes = db.crmActivity.create.mock.calls.map(
      (c) => (c[0] as { data?: { type?: string } })?.data?.type,
    );
    expect(activityTypes).toContain("OrderCreatedFromQuote");
    expect(activityTypes).toContain("QuoteConvertedToOrder");
  });
});
