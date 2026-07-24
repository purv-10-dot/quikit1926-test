/**
 * API tests for POST /api/email/send.
 * Covers: 401 unauthenticated, org-isolation (record not in org → 404),
 * no-mailbox (409), and happy-path (sends + persists message/thread/activity).
 *
 * The provider network + token refresh are mocked at the mailbox/provider
 * service boundary so no real Gmail/Graph call is made.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, setSession } from "../../helpers/mockDb";

// Mock the email service layer the route depends on.
const sendMessage = vi.fn();
vi.mock("@/lib/services/email/mailbox", () => ({
  getActiveConnection: vi.fn(),
  withFreshToken: vi.fn(async (_conn: unknown, fn: (ctx: unknown) => unknown) =>
    fn({ accessToken: "tok", emailAddress: "rep@company.com" }),
  ),
  MailboxError: class MailboxError extends Error {
    statusCode: number;
    constructor(m: string, s = 400) {
      super(m);
      this.statusCode = s;
    }
  },
}));
vi.mock("@/lib/services/email/providers", () => ({
  getProvider: () => ({ sendMessage }),
}));
const { persistMessage, upsertMailboxEmail, linkMailboxEmailToCrm } = vi.hoisted(() => ({
  persistMessage: vi.fn(),
  upsertMailboxEmail: vi.fn(),
  linkMailboxEmailToCrm: vi.fn(),
}));
vi.mock("@/lib/services/email/persist", () => ({ persistMessage }));
vi.mock("@/lib/services/email/mailbox-store", () => ({ upsertMailboxEmail, linkMailboxEmailToCrm }));

import { POST } from "@/app/api/email/send/route";
import { getActiveConnection } from "@/lib/services/email/mailbox";

const db = mockDb();

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/email/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID = {
  relatedKind: "Lead",
  relatedObjectId: "lead1",
  to: ["customer@acme.com"],
  subject: "Quotation",
  bodyHtml: "<p>Hello</p>",
};

describe("POST /api/email/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession({ userId: "u1", orgId: "org1", role: "SalesUser" });
    sendMessage.mockResolvedValue({
      providerMessageId: "pm1",
      providerThreadId: "pt1",
      rfcMessageId: "<rfc1@mail>",
    });
    (getActiveConnection as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn1",
      orgId: "org1",
      userId: "u1",
      provider: "gmail",
      emailAddress: "rep@company.com",
    });
    persistMessage.mockResolvedValue({ messageId: "msg1", threadId: "thr1", activityId: "act1", created: true });
    upsertMailboxEmail.mockResolvedValue({ id: "mbx1", created: true });
  });

  it("401 when unauthenticated", async () => {
    setSession(null);
    const res = await POST(req(VALID));
    expect(res.status).toBe(401);
  });

  it("404 when the record is not in the caller's org (isolation)", async () => {
    db.crmLead.findFirst.mockResolvedValue(null); // assertActivityTargetExists → not found
    const res = await POST(req(VALID));
    expect(res.status).toBe(404);
  });

  it("409 when the user has no connected mailbox", async () => {
    db.crmLead.findFirst.mockResolvedValue({ id: "lead1" });
    const { MailboxError } = await import("@/lib/services/email/mailbox");
    (getActiveConnection as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new MailboxError("No connected mailbox.", 409),
    );
    const res = await POST(req(VALID));
    expect(res.status).toBe(409);
  });

  it("400 on invalid input (missing subject)", async () => {
    const res = await POST(req({ ...VALID, subject: "" }));
    expect(res.status).toBe(400);
  });

  it("201 happy path — sends and persists", async () => {
    db.crmLead.findFirst.mockResolvedValue({ id: "lead1" });
    const res = await POST(req(VALID));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.messageId).toBe("msg1");
    expect(sendMessage).toHaveBeenCalledOnce();
    // sent from the connected mailbox address, to the customer
    expect(sendMessage.mock.calls[0][1]).toMatchObject({
      fromAddress: "rep@company.com",
      to: ["customer@acme.com"],
      subject: "Quotation",
    });
    // Immediately mirrored into CrmMailboxEmail (folder=sent) so Mailbox shows
    // it instantly — same upsert the sync uses (dedupe on providerMessageId).
    expect(upsertMailboxEmail).toHaveBeenCalledOnce();
    expect(upsertMailboxEmail.mock.calls[0][1]).toMatchObject({
      providerMessageId: "pm1",
      folder: "sent",
      direction: "outbound",
      isRead: true,
    });
    // Cross-linked to the CRM message (parity with the sync path).
    expect(linkMailboxEmailToCrm).toHaveBeenCalledWith("mbx1", "msg1", "Lead", "lead1");
  });

  it("mirror write failure does NOT fail the send (sync backfills)", async () => {
    db.crmLead.findFirst.mockResolvedValue({ id: "lead1" });
    upsertMailboxEmail.mockRejectedValue(new Error("mirror down"));
    const res = await POST(req(VALID));
    expect(res.status).toBe(201); // send still succeeds
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it("201 standalone (relatedKind None) — sends via the ONE engine, sentinel record", async () => {
    // Log Activity → Email with Link-to-Record = None. No CRM record required.
    const res = await POST(
      req({
        relatedKind: "None",
        to: ["someone@external.com"],
        subject: "Standalone note",
        bodyHtml: "<p>hi</p>",
      }),
    );
    expect(res.status).toBe(201);
    expect(sendMessage).toHaveBeenCalledOnce(); // same mailbox send path
    // Persisted through the identical pipeline with the standalone sentinel.
    expect(persistMessage.mock.calls[0][0]).toMatchObject({
      relatedKind: "None",
      relatedObjectId: "standalone",
      direction: "outbound",
    });
    // No lead lookup needed for standalone (assertActivityTargetExists no-ops).
    expect(db.crmLead.findFirst).not.toHaveBeenCalled();
  });

  it("400 when a linked kind omits the record id", async () => {
    const res = await POST(
      req({ relatedKind: "Lead", to: ["x@y.com"], subject: "s", bodyHtml: "<p>b</p>" }),
    );
    expect(res.status).toBe(400);
  });
});
