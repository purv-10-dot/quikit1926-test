/**
 * upsertMailboxEmail (P3 mirror writer): stores every email, dedupes on
 * providerMessageId, flag-only updates on re-sync, caps oversized bodies.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import { upsertMailboxEmail } from "@/lib/services/email/mailbox-store";

const db = mockDb();
const CONN = { id: "conn1", orgId: "org1", provider: "microsoft" } as never;

function msg(over: Record<string, unknown> = {}) {
  return {
    providerMessageId: "pm1",
    providerThreadId: "t1",
    direction: "inbound" as const,
    folder: "inbox" as const,
    fromAddress: "c@acme.com",
    fromName: "Customer",
    toAddresses: ["rep@company.com"],
    ccAddresses: [],
    bccAddresses: [],
    subject: "Hi",
    snippet: "hello there",
    bodyHtml: "<p>hello</p>",
    bodyText: "hello",
    timestamp: new Date("2026-05-01T10:00:00Z"),
    attachments: [],
    isRead: false,
    isStarred: false,
    labels: [],
    ...over,
  };
}

beforeEach(() => {
  db.crmMailboxEmail.findUnique.mockReset();
  db.crmMailboxEmail.create.mockReset();
  db.crmMailboxEmail.update.mockReset();
  db.crmMailboxEmail.create.mockResolvedValue({ id: "row1" } as never);
  db.crmMailboxEmail.update.mockResolvedValue({} as never);
});

describe("upsertMailboxEmail", () => {
  it("creates a new mirror row when the message is new (store everything)", async () => {
    db.crmMailboxEmail.findUnique.mockResolvedValue(null);
    const r = await upsertMailboxEmail(CONN, msg() as never);
    expect(r).toMatchObject({ id: "row1", created: true });
    expect(db.crmMailboxEmail.create).toHaveBeenCalledOnce();
    const data = db.crmMailboxEmail.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ provider: "microsoft", folder: "inbox", providerMessageId: "pm1" });
    expect(data.preview).toBe("hello there");
  });

  it("skips (no write) when the row exists and nothing changed — dedupe", async () => {
    db.crmMailboxEmail.findUnique.mockResolvedValue({
      id: "row1", isRead: false, isStarred: false, folder: "inbox", labels: [],
    });
    const r = await upsertMailboxEmail(CONN, msg() as never);
    expect(r).toMatchObject({ id: "row1", created: false });
    expect(db.crmMailboxEmail.create).not.toHaveBeenCalled();
    expect(db.crmMailboxEmail.update).not.toHaveBeenCalled();
  });

  it("flag-only update when isRead flips (do not update unless changed)", async () => {
    db.crmMailboxEmail.findUnique.mockResolvedValue({
      id: "row1", isRead: false, isStarred: false, folder: "inbox", labels: [],
    });
    await upsertMailboxEmail(CONN, msg({ isRead: true }) as never);
    expect(db.crmMailboxEmail.update).toHaveBeenCalledOnce();
    expect(db.crmMailboxEmail.update.mock.calls[0][0].data).toMatchObject({ isRead: true });
    expect(db.crmMailboxEmail.create).not.toHaveBeenCalled();
  });

  it("caps an oversized body", async () => {
    db.crmMailboxEmail.findUnique.mockResolvedValue(null);
    const huge = "x".repeat(300 * 1024);
    await upsertMailboxEmail(CONN, msg({ bodyHtml: huge }) as never);
    const stored = db.crmMailboxEmail.create.mock.calls[0][0].data.bodyHtml as string;
    expect(stored.length).toBe(256 * 1024);
  });

  it("normalizes gmail provider label to 'google'", async () => {
    db.crmMailboxEmail.findUnique.mockResolvedValue(null);
    await upsertMailboxEmail({ id: "c2", orgId: "o", provider: "gmail" } as never, msg() as never);
    expect(db.crmMailboxEmail.create.mock.calls[0][0].data.provider).toBe("google");
  });
});
