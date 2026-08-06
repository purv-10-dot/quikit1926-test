/**
 * P1/P2 regression guard for persistMessage — the shared CRM write path that
 * the P3 mailbox mirror did NOT change. Exercises the REAL thread upsert + REAL
 * logActivity (timeline) + message create + dedupe against the mock DB (only
 * $transaction is driven to run its callback with the db mock).
 *
 * Covers verification items:
 *   3. Email threading (thread upsert keyed on providerThreadId)
 *   4. Reply attaches to the existing thread (upsert update-branch increments)
 *   5. Lead/Contact timeline receives an email activity (logActivity, type=email)
 *   9. No duplicate emails (dedupe on existing providerMessageId → created:false)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import { persistMessage } from "@/lib/services/email/persist";

const db = mockDb();

const BASE = {
  orgId: "org1",
  mailboxConnectionId: "conn1",
  userId: "u1",
  provider: "microsoft",
  providerMessageId: "pm1",
  providerThreadId: "thread-A",
  direction: "outbound" as const,
  fromAddress: "rep@company.com",
  toAddresses: ["customer@acme.com"],
  ccAddresses: [],
  subject: "Quotation",
  timestamp: new Date("2026-05-01T10:00:00Z"),
  relatedKind: "Lead",
  relatedObjectId: "lead1",
};

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction runs its callback with the db mock as tx.
  db.$transaction.mockImplementation(async (fn: unknown) =>
    typeof fn === "function" ? (fn as (tx: typeof db) => unknown)(db) : [],
  );
  // logActivity resolves the owner from User then upserts/creates CrmActivity.
  db.user.findUnique.mockResolvedValue({ id: "u1", firstName: "Rep", lastName: "", email: "rep@company.com" } as never);
  db.crmActivity.upsert.mockResolvedValue({ id: "act1" } as never);
  db.crmActivity.create.mockResolvedValue({ id: "act1" } as never);
  db.crmEmailThread.upsert.mockResolvedValue({ id: "thr1" } as never);
  db.crmEmailMessage.create.mockResolvedValue({ id: "msg1" } as never);
});

describe("persistMessage (P1/P2 CRM path)", () => {
  it("item 5: creates an email-type timeline Activity on the linked Lead", async () => {
    db.crmEmailMessage.findUnique.mockResolvedValue(null); // not a dupe
    const r = await persistMessage(BASE);

    expect(r.created).toBe(true);
    // logActivity ran with type "email", the record link, and the dedupe key.
    // (logActivity uses upsert when externalId+sourceSystem are set.)
    expect(db.crmActivity.upsert).toHaveBeenCalledOnce();
    const upsertArg = db.crmActivity.upsert.mock.calls[0][0];
    expect(upsertArg.create).toMatchObject({
      type: "email",
      relatedKind: "Lead",
      relatedObjectId: "lead1",
      sourceSystem: "microsoft",
      externalId: "pm1",
    });
    expect(String(upsertArg.create.subject)).toContain("Email Sent");
  });

  it("item 3: upserts the thread keyed on providerThreadId", async () => {
    db.crmEmailMessage.findUnique.mockResolvedValue(null);
    await persistMessage(BASE);
    const where = db.crmEmailThread.upsert.mock.calls[0][0].where;
    expect(where.orgId_mailboxConnectionId_providerThreadId).toMatchObject({
      orgId: "org1",
      mailboxConnectionId: "conn1",
      providerThreadId: "thread-A",
    });
  });

  it("item 4: a reply on the same thread hits the upsert UPDATE branch (message count increment)", async () => {
    db.crmEmailMessage.findUnique.mockResolvedValue(null);
    // Reply: same providerThreadId, new providerMessageId, inbound.
    await persistMessage({
      ...BASE,
      providerMessageId: "pm2",
      direction: "inbound",
      fromAddress: "customer@acme.com",
      toAddresses: ["rep@company.com"],
      subject: "Re: Quotation",
    });
    const upsertArg = db.crmEmailThread.upsert.mock.calls[0][0];
    // The update branch increments messageCount — proving replies attach to the
    // existing thread rather than creating a new one.
    expect(upsertArg.update.messageCount).toMatchObject({ increment: 1 });
    expect(upsertArg.where.orgId_mailboxConnectionId_providerThreadId.providerThreadId).toBe("thread-A");
  });

  it("item 9: an already-stored providerMessageId is a no-op (dedupe, no dup activity)", async () => {
    db.crmEmailMessage.findUnique.mockResolvedValue({ id: "existing", threadId: "thr1", activityId: "act1" } as never);
    const r = await persistMessage(BASE);
    expect(r).toMatchObject({ messageId: "existing", created: false });
    // No new thread / activity / message writes on a dedupe hit.
    expect(db.crmEmailThread.upsert).not.toHaveBeenCalled();
    expect(db.crmActivity.upsert).not.toHaveBeenCalled();
    expect(db.crmEmailMessage.create).not.toHaveBeenCalled();
  });
});
