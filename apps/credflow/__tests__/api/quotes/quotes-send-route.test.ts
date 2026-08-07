import { describe, expect, it, beforeEach, vi } from "vitest";
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

describe("POST /api/quotes/[id]/send", () => {
  beforeEach(() => {
    setSession(null);
    db.$transaction.mockReset();
    db.qcfQuote.findFirst.mockReset();
    db.qcfQuote.update.mockReset();
    db.qcfActivity.create.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/quotes/[id]/send/route");
    const req = new Request("http://test/api/quotes/q1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: ["x@example.com"], subject: "s", body: "b" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the quote is in another tenant", async () => {
    adminSession();
    // getQuote uses findFirst({ id, tenantId }) â€” null when foreign.
    db.qcfQuote.findFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/quotes/[id]/send/route");
    const req = new Request("http://test/api/quotes/q-foreign/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: ["x@example.com"], subject: "s", body: "b" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q-foreign" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when payload fails validation", async () => {
    adminSession();
    db.qcfQuote.findFirst.mockResolvedValue({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Draft",
      sentAt: null,
      lines: [],
    } as never);

    const { POST } = await import("@/app/api/quotes/[id]/send/route");
    const req = new Request("http://test/api/quotes/q1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: ["not-an-email"], subject: "", body: "" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when trying to send a Won/Lost/Revised quote", async () => {
    adminSession();
    // The route issues THREE crmQuote.findFirst calls in sequence:
    //   1. getQuote (route preflight)
    //   2. evaluateQuoteApproval — fetches with include:{lines:true}
    //   3. markQuoteSent's transaction — throws because status !== Draft|Active
    // A persistent mockResolvedValue returns the same Won row for all three;
    // lines:[] + zeroed totals make the approval check resolve required:false
    // so the flow reaches markQuoteSent, which raises the 409.
    db.qcfQuote.findFirst.mockResolvedValue({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Won",
      sentAt: new Date(),
      grandTotal: 0,
      overallDiscountAmount: 0,
      lines: [],
    } as never);
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });

    // Silence the console driver's info log noise during this assertion.
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { POST } = await import("@/app/api/quotes/[id]/send/route");
    const req = new Request("http://test/api/quotes/q1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: ["customer@example.com"],
        subject: "Quote",
        body: "Hi",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(409);
    infoSpy.mockRestore();
  });

  it("happy path: 200, console driver, updates sentAt, writes QuoteSent activity", async () => {
    adminSession();
    // Three findFirst calls (getQuote → evaluateQuoteApproval → markQuoteSent's
    // transaction); a persistent Draft row with lines:[] + zeroed totals lets
    // the approval check pass (required:false) and markQuoteSent proceed.
    db.qcfQuote.findFirst.mockResolvedValue({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Draft",
      sentAt: null,
      grandTotal: 0,
      overallDiscountAmount: 0,
      lines: [],
    } as never);
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
    db.qcfQuote.update.mockResolvedValue({} as never);
    db.qcfActivity.create.mockResolvedValue({} as never);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { POST } = await import("@/app/api/quotes/[id]/send/route");
    const req = new Request("http://test/api/quotes/q1/send", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3009" },
      body: JSON.stringify({
        to: ["customer@example.com"],
        subject: "Quotation QT-2026-0001",
        body: "Hi â€” please find the quote attached.",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.driver).toBe("console");
    expect(body.data.messageId).toMatch(/^console-/u);

    // The route issues several crmQuote.update calls in one send (portal-token
    // hash, snapshot lock, sentAt, engagement status). Locate the one that sets
    // sentAt by content rather than assuming it is call index 0.
    const sentAtUpdate = db.qcfQuote.update.mock.calls.find(
      (c) => (c[0] as { data?: { sentAt?: unknown } } | undefined)?.data?.sentAt instanceof Date,
    );
    expect(sentAtUpdate, "expected a crmQuote.update that sets sentAt").toBeDefined();

    // QuoteSent activity must be written with the email message id as
    // externalId (lets us later trace bounces back to the activity). The route
    // writes multiple activities per send, so find the QuoteSent one by type.
    const quoteSentActivity = db.qcfActivity.create.mock.calls.find(
      (c) => (c[0] as { data?: { type?: string } } | undefined)?.data?.type === "QuoteSent",
    );
    expect(quoteSentActivity, "expected a QuoteSent activity to be written").toBeDefined();
    const activityData = (
      quoteSentActivity![0] as { data: { externalId: string; sourceSystem: string } }
    ).data;
    expect(activityData.externalId).toMatch(/^console-/u);
    expect(activityData.sourceSystem).toBe("quikcrm.email");

    infoSpy.mockRestore();
  });
});
