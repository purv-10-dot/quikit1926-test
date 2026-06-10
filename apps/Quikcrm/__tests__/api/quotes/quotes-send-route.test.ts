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

describe("POST /api/quotes/[id]/send", () => {
  beforeEach(() => {
    setSession(null);
    db.$transaction.mockReset();
    db.crmQuote.findFirst.mockReset();
    db.crmQuote.update.mockReset();
    db.crmActivity.create.mockReset();
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
    // getQuote uses findFirst({ id, orgId }) â€” null when foreign.
    db.crmQuote.findFirst.mockResolvedValue(null);

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
    db.crmQuote.findFirst.mockResolvedValue({
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
    // getQuote â†’ returns Won quote.
    db.crmQuote.findFirst.mockResolvedValueOnce({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Won",
      sentAt: new Date(),
      lines: [],
    } as never);
    // markQuoteSent's $transaction â†’ service-internal findFirst returns the
    // same row; service throws because status !== Draft|Active.
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
    db.crmQuote.findFirst.mockResolvedValueOnce({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Won",
      sentAt: new Date(),
    } as never);

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
    // First findFirst â€” getQuote (route preflight)
    db.crmQuote.findFirst.mockResolvedValueOnce({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Draft",
      sentAt: null,
      lines: [],
    } as never);
    db.$transaction.mockImplementation(async (cb: unknown) => {
      return (cb as (tx: typeof db) => Promise<unknown>)(db);
    });
    // Second findFirst â€” inside markQuoteSent's transaction
    db.crmQuote.findFirst.mockResolvedValueOnce({
      id: "q1",
      quoteNumber: "QT-2026-0001",
      status: "Draft",
      sentAt: null,
    } as never);
    db.crmQuote.update.mockResolvedValue({} as never);
    db.crmActivity.create.mockResolvedValue({} as never);
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

    // sentAt must be set
    const updateArgs = db.crmQuote.update.mock.calls[0]![0]! as { data: { sentAt: unknown } };
    expect(updateArgs.data.sentAt).toBeInstanceOf(Date);

    // QuoteSent activity must be written with the email message id as
    // externalId (lets us later trace bounces back to the activity).
    expect(db.crmActivity.create).toHaveBeenCalledOnce();
    const activityArgs = db.crmActivity.create.mock.calls[0]![0]! as {
      data: { type: string; externalId: string; sourceSystem: string };
    };
    expect(activityArgs.data.type).toBe("QuoteSent");
    expect(activityArgs.data.externalId).toMatch(/^console-/u);
    expect(activityArgs.data.sourceSystem).toBe("quikcrm.email");

    infoSpy.mockRestore();
  });
});
