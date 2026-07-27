/**
 * Mailbox API: list (folder/search/filter/paginate + own-mailbox isolation +
 * 401), detail (mark read + thread), unread-count. DB is mocked; the query
 * service runs for real against the mock so where-clauses are exercised.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, setSession } from "../../helpers/mockDb";

// Resolve the caller's connection to a fixed id + provider (own-mailbox scoping).
const { callerConnectionId, callerConnection } = vi.hoisted(() => ({
  callerConnectionId: vi.fn(),
  callerConnection: vi.fn(),
}));
vi.mock("@/lib/services/email/mailbox", () => ({
  getConnection: vi.fn(),
}));
// Only stub connection resolution; keep the real list/detail query logic.
vi.mock("@/lib/services/email/mailbox-query", async (orig) => {
  const actual = await orig<typeof import("@/lib/services/email/mailbox-query")>();
  return { ...actual, callerConnectionId, callerConnection };
});

import { GET as listGET } from "@/app/api/mailbox/emails/route";
import { GET as detailGET } from "@/app/api/mailbox/emails/[id]/route";
import { GET as unreadGET } from "@/app/api/mailbox/unread-count/route";

const db = mockDb();

beforeEach(() => {
  vi.clearAllMocks();
  setSession({ userId: "u1", orgId: "org1", role: "SalesUser" });
  callerConnectionId.mockResolvedValue("conn1");
  callerConnection.mockResolvedValue({ id: "conn1", provider: "microsoft" });
});

function listReq(qs: string) {
  return new NextRequest(`http://localhost/api/mailbox/emails?${qs}`);
}

describe("GET /api/mailbox/emails", () => {
  it("401 when unauthenticated", async () => {
    setSession(null);
    const res = await listGET(listReq("folder=inbox"));
    expect(res.status).toBe(401);
  });

  it("returns connected:false + empty when no mailbox connected", async () => {
    callerConnection.mockResolvedValue(null);
    const res = await listGET(listReq("folder=inbox"));
    const json = await res.json();
    expect(json.data.connected).toBe(false);
    expect(json.data.items).toEqual([]);
    expect(db.crmMailboxEmail.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to org + caller connection + folder, and paginates", async () => {
    db.crmMailboxEmail.findMany.mockResolvedValue([{ id: "e1" }] as never);
    db.crmMailboxEmail.count.mockResolvedValue(30 as never);

    const res = await listGET(listReq("folder=sent&page=2&pageSize=10"));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.total).toBe(30);
    expect(json.data.totalPages).toBe(3);

    const args = db.crmMailboxEmail.findMany.mock.calls[0][0];
    // Scoped to org + caller connection + provider (no cross-provider leakage) + folder.
    expect(args.where).toMatchObject({
      orgId: "org1",
      mailboxConnectionId: "conn1",
      provider: "microsoft",
      folder: "sent",
    });
    expect(args.skip).toBe(10); // (page2-1)*10
    expect(args.take).toBe(10);
  });

  it("pins the query to the connected provider so the other provider cannot leak", async () => {
    db.crmMailboxEmail.findMany.mockResolvedValue([] as never);
    db.crmMailboxEmail.count.mockResolvedValue(0 as never);
    callerConnection.mockResolvedValue({ id: "conn1", provider: "google" });

    await listGET(listReq("folder=all"));
    const where = db.crmMailboxEmail.findMany.mock.calls[0][0].where;
    expect(where.provider).toBe("google");
    expect(where.mailboxConnectionId).toBe("conn1");
  });

  it("applies search + filters (unread, has-attachment)", async () => {
    db.crmMailboxEmail.findMany.mockResolvedValue([] as never);
    db.crmMailboxEmail.count.mockResolvedValue(0 as never);
    await listGET(listReq("folder=all&q=quotation&isRead=false&hasAttachment=true"));
    const where = db.crmMailboxEmail.findMany.mock.calls[0][0].where;
    expect(where.isRead).toBe(false);
    expect(where.hasAttachments).toBe(true);
    expect(where.folder).toBeUndefined(); // "all" → no folder filter
    expect(where.OR).toBeTruthy(); // search built
  });
});

describe("GET /api/mailbox/emails/[id]", () => {
  it("returns detail + thread and marks read", async () => {
    db.crmMailboxEmail.findFirst.mockResolvedValue({
      id: "e1", direction: "inbound", isRead: false, providerThreadId: "t1", bodyHtml: "<p>hi</p>",
    } as never);
    db.crmMailboxEmail.findMany.mockResolvedValue([
      { id: "e1", direction: "inbound", bodyHtml: "<p>hi</p>" },
    ] as never);
    db.crmMailboxEmail.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await detailGET(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: "e1" }),
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.email.id).toBe("e1");
    expect(Array.isArray(json.data.thread)).toBe(true);
  });

  it("404 when the email is not in the caller's mailbox (isolation)", async () => {
    db.crmMailboxEmail.findFirst.mockResolvedValue(null);
    const res = await detailGET(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: "other-users-email" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/mailbox/unread-count", () => {
  it("returns the unread inbox count", async () => {
    db.crmMailboxEmail.count.mockResolvedValue(4 as never);
    const res = await unreadGET();
    const json = await res.json();
    expect(json.data.count).toBe(4);
    expect(db.crmMailboxEmail.count.mock.calls[0][0].where).toMatchObject({
      orgId: "org1",
      mailboxConnectionId: "conn1",
      folder: "inbox",
      isRead: false,
    });
  });
});
