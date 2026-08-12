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

describe("GET /api/quotes", () => {
  beforeEach(() => {
    db.qceQuote.findMany.mockReset();
    db.qceQuote.count.mockReset();
    db.qceAccount.findMany.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/quotes/route");
    const req = new Request("http://test/api/quotes");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns paginated list scoped by tenantId", async () => {
    adminSession();
    db.qceQuote.findMany.mockResolvedValue([
      {
        id: "q1",
        quoteNumber: "QT-2026-0001",
        versionNumber: 1,
        accountId: "a1",
        opportunityId: null,
        contactId: null,
        status: "Draft",
        currency: "INR",
        effectiveFrom: new Date(),
        effectiveTo: null,
        subtotal: "1000.00",
        grandTotal: "1180.00",
        ownerId: "u1",
        ownerName: "Alice",
        sentAt: null,
        wonAt: null,
        lostAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      } as never,
    ]);
    db.qceQuote.count.mockResolvedValue(1);
    // The list service now batch-resolves account names. Empty array is
    // a valid response shape â€” the row's accountName will be null.
    db.qceAccount.findMany.mockResolvedValue([
      { id: "a1", name: "Acme Corp" } as never,
    ]);

    const { GET } = await import("@/app/api/quotes/route");
    const req = new Request("http://test/api/quotes?page=1&pageSize=10");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].grandTotal).toBe(1180);

    const where = db.qceQuote.findMany.mock.calls[0]![0]!.where as { orgId?: string };
    expect(where.orgId).toBe("t1");
  });
});

describe("POST /api/quotes", () => {
  beforeEach(() => {
    setSession(null);
    db.$transaction.mockReset();
  });

  it("rejects invalid payload", async () => {
    adminSession();
    const { POST } = await import("@/app/api/quotes/route");
    const req = new Request("http://test/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("creates a quote and returns 201 with the auto-generated number", async () => {
    adminSession();
    // The service uses prisma.$transaction(async (tx) => ...). Stub it to run
    // the callback with the mocked client directly.
    db.$transaction.mockImplementation(async (cb: unknown) => {
      // The mocked db doubles as the tx client.
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
    // createQuote now validates that accountId belongs to the requesting
    // tenant before minting a quote number (refactor/quotes-feature-hardening).
    // Mock the FK check first; without this the service returns 404.
    db.qceAccount.findFirst.mockResolvedValue({ id: "a1" } as never);
    db.qceSequence.upsert.mockResolvedValue({ counter: 1 } as never);
    db.qceQuote.create.mockResolvedValue({ id: "q1" } as never);
    db.qceActivity.create.mockResolvedValue({} as never);

    const { POST } = await import("@/app/api/quotes/route");
    const req = new Request("http://test/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "a1" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("q1");
    expect(body.data.quoteNumber).toMatch(/^QT-\d{4}-0001$/);
  });

  it("returns 404 when accountId does not exist in the requesting tenant", async () => {
    adminSession();
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
    // FK validation: simulate the account being in a different tenant.
    db.qceAccount.findFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/quotes/route");
    const req = new Request("http://test/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "a-foreign" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    // No quote should have been minted.
    expect(db.qceQuote.create).not.toHaveBeenCalled();
  });
});
