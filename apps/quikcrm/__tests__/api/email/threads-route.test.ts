/**
 * P2 regression guard for GET /api/email/threads (item 6: Account/Opportunity
 * email roll-up). Exercises the real route + real resolveThreadScope against
 * the mock DB: a Lead queries only itself; an Account queries itself PLUS its
 * linked contacts/leads, so their threads surface on the Account Emails tab.
 * Also covers 401 + activities:view gating + inbound-body sanitization.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, setSession } from "../../helpers/mockDb";

import { GET } from "@/app/api/email/threads/route";

const db = mockDb();

beforeEach(() => {
  vi.clearAllMocks();
  setSession({ userId: "u1", orgId: "org1", role: "SalesUser" });
  db.crmEmailThread.findMany.mockResolvedValue([] as never);
});

function req(kind: string, id: string) {
  return new NextRequest(
    `http://localhost/api/email/threads?relatedKind=${kind}&relatedObjectId=${id}`,
  );
}

describe("GET /api/email/threads", () => {
  it("401 when unauthenticated", async () => {
    setSession(null);
    const res = await GET(req("Lead", "lead1"));
    expect(res.status).toBe(401);
  });

  it("400 on an invalid relatedKind", async () => {
    const res = await GET(req("Banana", "x"));
    expect(res.status).toBe(400);
  });

  it("Lead scope queries only the lead itself", async () => {
    await GET(req("Lead", "lead1"));
    const where = db.crmEmailThread.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe("org1");
    expect(where.OR).toEqual([{ relatedKind: "Lead", relatedObjectId: "lead1" }]);
    // No account roll-up queries for a Lead.
    expect(db.crmContact.findMany).not.toHaveBeenCalled();
  });

  it("item 6: Account scope rolls up its linked contacts + leads", async () => {
    db.crmContact.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }] as never);
    db.crmLead.findMany.mockResolvedValue([{ id: "l9" }] as never);

    await GET(req("Account", "acc1"));

    const where = db.crmEmailThread.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { relatedKind: "Account", relatedObjectId: "acc1" },
        { relatedKind: "Contact", relatedObjectId: "c1" },
        { relatedKind: "Contact", relatedObjectId: "c2" },
        { relatedKind: "Lead", relatedObjectId: "l9" },
      ]),
    );
  });

  it("sanitizes inbound message HTML before returning", async () => {
    db.crmEmailThread.findMany.mockResolvedValue([
      {
        id: "t1",
        subject: "Hi",
        lastMessageAt: new Date(),
        messageCount: 1,
        messages: [
          {
            id: "m1",
            direction: "inbound",
            fromAddress: "c@acme.com",
            toAddresses: [],
            ccAddresses: [],
            subject: "Hi",
            snippet: "x",
            bodyHtml: '<p>ok</p><script>alert(1)</script>',
            bodyText: "ok",
            sentAt: null,
            receivedAt: new Date(),
            createdAt: new Date(),
            attachments: [],
          },
        ],
      },
    ] as never);

    const res = await GET(req("Lead", "lead1"));
    const json = await res.json();
    const body = json.data.threads[0].messages[0].bodyHtml as string;
    expect(body).not.toContain("<script");
    expect(body).toContain("<p>ok</p>");
  });
});
