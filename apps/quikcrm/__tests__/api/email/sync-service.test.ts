/**
 * Tests for the sync state machine (syncMailbox): initial→backfilling→live.
 *  - live: incremental fetch, match, dedupe, notify on new inbound.
 *  - backfilling: paginated history import, NO notifications, transition to live.
 * Provider/persist/matcher/notifications are mocked at module boundaries.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";

const {
  fetchNewMessages,
  backfillMessages,
  persistMessage,
  matchRecordByAnyAddress,
  createNotification,
  upsertMailboxEmail,
  linkMailboxEmailToCrm,
} = vi.hoisted(() => ({
  fetchNewMessages: vi.fn(),
  backfillMessages: vi.fn(),
  persistMessage: vi.fn(),
  matchRecordByAnyAddress: vi.fn(),
  createNotification: vi.fn(),
  upsertMailboxEmail: vi.fn(),
  linkMailboxEmailToCrm: vi.fn(),
}));

vi.mock("@/lib/services/email/providers", () => ({
  getProvider: () => ({ fetchNewMessages, backfillMessages }),
}));
vi.mock("@/lib/services/email/mailbox", () => ({
  withFreshToken: vi.fn(async (_conn: unknown, fn: (ctx: unknown) => unknown) =>
    fn({ accessToken: "tok", emailAddress: "rep@company.com" }),
  ),
}));
vi.mock("@/lib/services/email/persist", () => ({ persistMessage }));
vi.mock("@/lib/services/email/mailbox-store", () => ({ upsertMailboxEmail, linkMailboxEmailToCrm }));
vi.mock("@/lib/services/email/record-emails", () => ({ matchRecordByAnyAddress }));
vi.mock("@/lib/notifications/service", () => ({ createNotification }));

import { syncMailbox } from "@/lib/services/email/sync";

const db = mockDb();

const LIVE_CONN: Record<string, unknown> = {
  id: "conn1",
  orgId: "org1",
  userId: "u1",
  provider: "gmail",
  emailAddress: "rep@company.com",
  syncState: "live",
  historyId: "100",
  deltaInbox: null,
  deltaSent: null,
  deltaDrafts: null,
  deltaLink: null,
  backfillSince: new Date("2026-04-01"),
  backfillCursor: null,
  status: "active",
};

function msg(id: string, from: string, direction: "inbound" | "outbound" = "inbound") {
  return {
    providerMessageId: id,
    providerThreadId: "t1",
    direction,
    fromAddress: from,
    toAddresses: ["rep@company.com"],
    ccAddresses: [],
    subject: "Re: Quotation",
    snippet: "thanks",
    timestamp: new Date(),
    attachments: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.crmMailboxConnection.update.mockResolvedValue({} as never);
  // Mirror writer succeeds by default (every email is stored — P3).
  upsertMailboxEmail.mockResolvedValue({ id: "mbx1", created: true });
});

describe("syncMailbox — live", () => {
  it("matches an inbound reply, persists, notifies, advances cursor", async () => {
    fetchNewMessages.mockResolvedValue({ messages: [msg("m1", "customer@acme.com")], historyId: "101" });
    matchRecordByAnyAddress.mockResolvedValue({ kind: "Lead", id: "lead1" });
    persistMessage.mockResolvedValue({ messageId: "x", threadId: "y", activityId: "z", created: true });

    const r = await syncMailbox(LIVE_CONN as never);

    expect(r.phase).toBe("live");
    expect(r.matched).toBe(1);
    expect(r.created).toBe(1);
    expect(createNotification).toHaveBeenCalledOnce();
    expect(db.crmMailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ historyId: "101" }) }),
    );
  });

  it("mirrors unknown-address INBOUND mail but does NOT persist/notify", async () => {
    fetchNewMessages.mockResolvedValue({ messages: [msg("m1", "stranger@nowhere.com")], historyId: "101" });
    matchRecordByAnyAddress.mockResolvedValue(null);
    const r = await syncMailbox(LIVE_CONN as never);
    // Stored in the mailbox mirror even though it matched no CRM record.
    expect(upsertMailboxEmail).toHaveBeenCalledOnce();
    expect(r.mirrored).toBe(1);
    // But NOT attached to any CRM record and no notification.
    expect(r.skipped).toBe(1);
    expect(persistMessage).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("mirrors AND CRM-links a matched email", async () => {
    fetchNewMessages.mockResolvedValue({ messages: [msg("m1", "customer@acme.com")], historyId: "101" });
    matchRecordByAnyAddress.mockResolvedValue({ kind: "Lead", id: "lead1" });
    persistMessage.mockResolvedValue({ messageId: "cm1", threadId: "y", activityId: "z", created: true });
    await syncMailbox(LIVE_CONN as never);
    expect(upsertMailboxEmail).toHaveBeenCalledOnce();
    // Cross-link mirror → CRM message.
    expect(linkMailboxEmailToCrm).toHaveBeenCalledWith("mbx1", "cm1", "Lead", "lead1");
  });

  // Regression: mail SENT from Outlook/Gmail to a non-CRM address used to be
  // mirror-only — no Activity was ever created. It must now persist as a
  // standalone activity so outbound work always shows up in Activities.
  it("persists unmatched OUTBOUND mail as a standalone activity", async () => {
    fetchNewMessages.mockResolvedValue({
      messages: [msg("m1", "rep@company.com", "outbound")],
      historyId: "101",
    });
    matchRecordByAnyAddress.mockResolvedValue(null);
    persistMessage.mockResolvedValue({ messageId: "cm1", threadId: "y", activityId: "z", created: true });

    const r = await syncMailbox(LIVE_CONN as never);

    expect(r.standalone).toBe(1);
    expect(r.skipped).toBe(0);
    expect(persistMessage).toHaveBeenCalledWith(
      expect.objectContaining({ relatedKind: "None", relatedObjectId: "standalone", direction: "outbound" }),
    );
    // No CRM record to cross-link the mirror row to.
    expect(linkMailboxEmailToCrm).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("links unmatched-but-outbound dedupe replays without creating twice", async () => {
    fetchNewMessages.mockResolvedValue({
      messages: [msg("m1", "rep@company.com", "outbound")],
      historyId: "101",
    });
    matchRecordByAnyAddress.mockResolvedValue(null);
    persistMessage.mockResolvedValue({ messageId: "cm1", threadId: "y", activityId: "z", created: false });

    const r = await syncMailbox(LIVE_CONN as never);

    expect(r.standalone).toBe(1);
    expect(r.created).toBe(0);
  });

  it("attaches matched OUTBOUND mail to the record, not standalone", async () => {
    fetchNewMessages.mockResolvedValue({
      messages: [msg("m1", "rep@company.com", "outbound")],
      historyId: "101",
    });
    matchRecordByAnyAddress.mockResolvedValue({ kind: "Contact", id: "c1", opportunityId: "opp1" });
    persistMessage.mockResolvedValue({ messageId: "cm1", threadId: "y", activityId: "z", created: true });

    const r = await syncMailbox(LIVE_CONN as never);

    expect(r.matched).toBe(1);
    expect(r.standalone).toBe(0);
    expect(persistMessage).toHaveBeenCalledWith(
      expect.objectContaining({ relatedKind: "Contact", relatedObjectId: "c1", opportunityId: "opp1" }),
    );
    expect(linkMailboxEmailToCrm).toHaveBeenCalledWith("mbx1", "cm1", "Contact", "c1");
  });

  it("does not notify on dedupe hit (created=false)", async () => {
    fetchNewMessages.mockResolvedValue({ messages: [msg("m1", "customer@acme.com")], historyId: "101" });
    matchRecordByAnyAddress.mockResolvedValue({ kind: "Lead", id: "lead1" });
    persistMessage.mockResolvedValue({ messageId: "x", threadId: "y", activityId: "z", created: false });
    const r = await syncMailbox(LIVE_CONN as never);
    expect(r.created).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe("syncMailbox — initial → backfilling", () => {
  it("initial state seeds the backfill window and starts backfilling", async () => {
    const conn = { ...LIVE_CONN, syncState: "initial", backfillSince: null } as never;
    // Page 1 (more to come) then page 2 (done) — realistic pagination within one tick.
    backfillMessages
      .mockResolvedValueOnce({
        messages: [msg("h1", "customer@acme.com", "outbound")],
        nextCursor: "PAGE2",
        done: false,
      })
      .mockResolvedValueOnce({ messages: [], done: true, historyId: "H" });
    matchRecordByAnyAddress.mockResolvedValue({ kind: "Lead", id: "lead1" });
    persistMessage.mockResolvedValue({ messageId: "x", threadId: "y", activityId: "z", created: true });

    const r = await syncMailbox(conn);

    // Transitioned to backfilling (first update sets syncState=backfilling).
    expect(db.crmMailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ syncState: "backfilling" }) }),
    );
    expect(backfillMessages).toHaveBeenCalled();
    // Historical import → NO notification even for inbound-looking mail.
    expect(createNotification).not.toHaveBeenCalled();
    expect(r.created).toBe(1);
  });

  it("finishing the backfill transitions to live and seeds cursors", async () => {
    const conn = { ...LIVE_CONN, syncState: "backfilling", backfillCursor: "PAGE2" } as never;
    backfillMessages.mockResolvedValue({
      messages: [],
      done: true,
      historyId: "SEED_HISTORY",
    });

    const r = await syncMailbox(conn);

    expect(r.backfillDone).toBe(true);
    expect(r.phase).toBe("live");
    expect(db.crmMailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ syncState: "live", historyId: "SEED_HISTORY", backfillCursor: null }),
      }),
    );
    // Live incremental fetch is NOT called on the same tick the backfill finishes.
    expect(fetchNewMessages).not.toHaveBeenCalled();
  });

  it("does not notify during backfill for inbound messages", async () => {
    const conn = { ...LIVE_CONN, syncState: "backfilling", backfillCursor: null } as never;
    backfillMessages.mockResolvedValue({
      messages: [msg("h1", "customer@acme.com", "inbound")],
      done: true,
      historyId: "H",
    });
    matchRecordByAnyAddress.mockResolvedValue({ kind: "Lead", id: "lead1" });
    persistMessage.mockResolvedValue({ messageId: "x", threadId: "y", activityId: "z", created: true });

    await syncMailbox(conn);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("captures provider errors without throwing", async () => {
    const conn = { ...LIVE_CONN, syncState: "live" } as never;
    fetchNewMessages.mockRejectedValue(new Error("429 rate limited"));
    const r = await syncMailbox(conn);
    expect(r.error).toContain("429");
  });
});
