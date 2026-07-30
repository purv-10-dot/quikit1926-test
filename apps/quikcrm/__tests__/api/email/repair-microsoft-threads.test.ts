/**
 * One-time Microsoft thread-repair service. Covers:
 *  - Gmail connections are never scanned (requirement 6).
 *  - A wrong-thread outbound row is repaired to the mirror's real conversationId.
 *  - Idempotent: an already-correct row is a no-op (safe re-run, requirement 7).
 *  - Ambiguous / no-match rows are SKIPPED (never guessed).
 *  - Report counts (scanned/repaired/skipped) are accurate (requirement 8).
 *  - Dry-run (apply:false) writes nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import { repairMicrosoftThreads } from "@/lib/services/email/repair-microsoft-threads";

const db = mockDb();

const CONN = { id: "conn1", orgId: "org1" };

function crmRow(over: Record<string, unknown> = {}) {
  return {
    id: "cm1",
    subject: "Quotation",
    toAddresses: ["customer@acme.com"],
    sentAt: new Date("2026-05-01T10:00:00Z"),
    createdAt: new Date("2026-05-01T10:00:00Z"),
    threadId: "wrongThreadRow",
    relatedKind: "Lead",
    relatedObjectId: "lead1",
    thread: { id: "wrongThreadRow", providerThreadId: "WRONG_CONV" },
    ...over,
  };
}
function mirrorCand(over: Record<string, unknown> = {}) {
  return {
    providerThreadId: "CORRECT_CONV",
    toAddresses: ["customer@acme.com"],
    sentAt: new Date("2026-05-01T10:01:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.crmMailboxConnection.findMany.mockResolvedValue([CONN] as never);
  db.crmEmailThread.findMany.mockResolvedValue([] as never);
  db.$transaction.mockImplementation(async (fn: unknown) =>
    typeof fn === "function" ? (fn as (tx: typeof db) => unknown)(db) : [],
  );
  db.crmEmailThread.upsert.mockResolvedValue({ id: "correctThreadRow" } as never);
  db.crmEmailMessage.update.mockResolvedValue({} as never);
  db.crmEmailThread.update.mockResolvedValue({} as never);
});

describe("repairMicrosoftThreads", () => {
  it("requirement 6: only scans Microsoft connections", async () => {
    db.crmEmailMessage.findMany.mockResolvedValue([] as never);
    await repairMicrosoftThreads({ apply: true });
    expect(db.crmMailboxConnection.findMany.mock.calls[0][0].where).toMatchObject({
      provider: "microsoft",
    });
  });

  it("repairs a wrong-thread outbound row to the mirror's real conversationId", async () => {
    db.crmEmailMessage.findMany.mockResolvedValue([crmRow()] as never);
    db.crmMailboxEmail.findMany.mockResolvedValue([mirrorCand()] as never);
    db.crmEmailThread.findMany.mockResolvedValue([{ id: "correctThreadRow" }] as never);
    db.crmEmailMessage.aggregate.mockResolvedValue({ _count: { _all: 2 }, _max: { sentAt: new Date(), receivedAt: null, createdAt: new Date() } } as never);

    const r = await repairMicrosoftThreads({ apply: true });

    expect(r.rowsScanned).toBe(1);
    expect(r.rowsRepaired).toBe(1);
    expect(r.rowsSkipped).toBe(0);
    // Re-parented onto the correct-conversation thread.
    expect(db.crmEmailThread.upsert.mock.calls[0][0].where.orgId_mailboxConnectionId_providerThreadId.providerThreadId).toBe("CORRECT_CONV");
    expect(db.crmEmailMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cm1" }, data: { threadId: "correctThreadRow" } }),
    );
    // messageCount recomputed.
    expect(db.crmEmailThread.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ messageCount: 2 }) }),
    );
  });

  it("requirement 7: idempotent — an already-correct row is a no-op", async () => {
    db.crmEmailMessage.findMany.mockResolvedValue([
      crmRow({ thread: { id: "t", providerThreadId: "CORRECT_CONV" } }),
    ] as never);
    db.crmMailboxEmail.findMany.mockResolvedValue([mirrorCand()] as never);

    const r = await repairMicrosoftThreads({ apply: true });
    expect(r.rowsRepaired).toBe(0);
    expect(r.details[0].outcome).toBe("already-correct");
    expect(db.crmEmailMessage.update).not.toHaveBeenCalled();
  });

  it("skips when no mirror candidate matches (never guesses)", async () => {
    db.crmEmailMessage.findMany.mockResolvedValue([crmRow()] as never);
    db.crmMailboxEmail.findMany.mockResolvedValue([] as never);
    const r = await repairMicrosoftThreads({ apply: true });
    expect(r.rowsSkipped).toBe(1);
    expect(r.details[0].outcome).toBe("skipped-no-match");
  });

  it("skips when the match is ambiguous (>1 distinct thread)", async () => {
    db.crmEmailMessage.findMany.mockResolvedValue([crmRow()] as never);
    db.crmMailboxEmail.findMany.mockResolvedValue([
      mirrorCand({ providerThreadId: "CONV_A" }),
      mirrorCand({ providerThreadId: "CONV_B" }),
    ] as never);
    const r = await repairMicrosoftThreads({ apply: true });
    expect(r.rowsSkipped).toBe(1);
    expect(r.details[0].outcome).toBe("skipped-ambiguous");
  });

  it("dry-run (apply:false) writes nothing but still reports the repair", async () => {
    db.crmEmailMessage.findMany.mockResolvedValue([crmRow()] as never);
    db.crmMailboxEmail.findMany.mockResolvedValue([mirrorCand()] as never);
    const r = await repairMicrosoftThreads({ apply: false });
    expect(r.rowsRepaired).toBe(1);
    expect(db.crmEmailMessage.update).not.toHaveBeenCalled();
    expect(db.crmEmailThread.upsert).not.toHaveBeenCalled();
  });
});
