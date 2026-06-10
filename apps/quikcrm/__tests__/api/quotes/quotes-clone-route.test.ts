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

describe("POST /api/quotes/[id]/clone", () => {
  beforeEach(() => {
    setSession(null);
    db.$transaction.mockReset();
    db.crmQuote.findFirst.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/quotes/[id]/clone/route");
    const req = new Request("http://test/api/quotes/q1/clone", { method: "POST" });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the source quote is in another tenant", async () => {
    adminSession();
    // Service wraps the work in a $transaction whose callback uses tx.crmQuote.
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
    // findFirst returns null because the where { id, orgId } filter
    // doesn't match in the requesting tenant.
    db.crmQuote.findFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/quotes/[id]/clone/route");
    const req = new Request("http://test/api/quotes/q-other-tenant/clone", { method: "POST" });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q-other-tenant" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("clones a quote, mints a fresh QT-YYYY-NNNN number, returns 201", async () => {
    adminSession();
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
    db.crmQuote.findFirst.mockResolvedValue({
      id: "q-src",
      orgId: "t1",
      quoteNumber: "QT-2026-0007",
      versionNumber: 3,
      status: "Won",
      accountId: "a1",
      contactId: null,
      opportunityId: null,
      priceListId: null,
      currency: "INR",
      effectiveTo: null,
      pricingMode: "Exclusive",
      companyState: "Karnataka",
      billingState: "Maharashtra",
      overallDiscountAmount: "0",
      freightAmount: "0",
      termsText: null,
      ownerId: "u1",
      ownerName: "Alice",
      lines: [],
    } as never);
    db.crmSequence.upsert.mockResolvedValue({ counter: 11 } as never);
    db.crmQuote.create.mockResolvedValue({ id: "q-new" } as never);
    db.crmActivity.create.mockResolvedValue({} as never);

    const { POST } = await import("@/app/api/quotes/[id]/clone/route");
    const req = new Request("http://test/api/quotes/q-src/clone", { method: "POST" });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q-src" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("q-new");
    // Fresh number, not a -V suffix (that's revise territory).
    expect(body.data.quoteNumber).toMatch(/^QT-\d{4}-0011$/);
    // The clone activity must be logged.
    expect(db.crmActivity.create).toHaveBeenCalled();
  });
});
