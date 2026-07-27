/**
 * relinkStandaloneEmailsForRecord — retroactively attaches standalone mailbox
 * emails to a Lead created/updated with a matching address. Re-parents
 * thread + message + activity + mirror, guarded on relatedKind:"None" (safe +
 * idempotent). DB is mocked; the service logic runs for real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import {
  relinkStandaloneEmailsForRecord,
  backfillRelinkAllLeads,
} from "@/lib/services/email/relink";

const db = mockDb();

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: unknown) =>
    typeof fn === "function" ? (fn as (tx: typeof db) => unknown)(db) : [],
  );
});

describe("relinkStandaloneEmailsForRecord", () => {
  it("no-ops when the record has no email", async () => {
    const r = await relinkStandaloneEmailsForRecord({ orgId: "o1", kind: "Lead", recordId: "l1", emails: [null, ""] });
    expect(r).toEqual({ threadsRelinked: 0, messagesRelinked: 0, activitiesRelinked: 0, mirrorRowsLinked: 0 });
    expect(db.crmMailboxEmail.findMany).not.toHaveBeenCalled();
  });

  it("no-ops when no standalone email matches the address", async () => {
    db.crmMailboxEmail.findMany.mockResolvedValue([] as never);
    const r = await relinkStandaloneEmailsForRecord({ orgId: "o1", kind: "Lead", recordId: "l1", emails: ["abc@company.com"] });
    expect(r.threadsRelinked).toBe(0);
    expect(db.crmEmailThread.findMany).not.toHaveBeenCalled();
  });

  it("re-parents thread + message + activity + mirror to the Lead", async () => {
    // A standalone mirror row addressed to the lead's email.
    db.crmMailboxEmail.findMany.mockResolvedValue([
      { id: "mbx1", providerThreadId: "conv1" },
    ] as never);
    db.crmEmailThread.findMany.mockResolvedValue([{ id: "thr1" }] as never);
    db.crmEmailMessage.findMany.mockResolvedValue([{ id: "msg1", activityId: "act1" }] as never);
    db.crmEmailThread.updateMany.mockResolvedValue({ count: 1 } as never);
    db.crmEmailMessage.updateMany.mockResolvedValue({ count: 1 } as never);
    db.crmActivity.updateMany.mockResolvedValue({ count: 1 } as never);
    db.crmMailboxEmail.updateMany.mockResolvedValue({ count: 1 } as never);

    const r = await relinkStandaloneEmailsForRecord({
      orgId: "o1",
      kind: "Lead",
      recordId: "lead1",
      emails: ["ABC@Company.com"], // case-insensitive
    });

    expect(r).toEqual({ threadsRelinked: 1, messagesRelinked: 1, activitiesRelinked: 1, mirrorRowsLinked: 1 });

    // Candidate scan lowercases + matches from/to/cc, excludes already-matched rows.
    const scanWhere = db.crmMailboxEmail.findMany.mock.calls[0][0].where;
    expect(scanWhere.AND[0].OR).toEqual([
      { fromAddress: { in: ["abc@company.com"] } },
      { toAddresses: { hasSome: ["abc@company.com"] } },
      { ccAddresses: { hasSome: ["abc@company.com"] } },
    ]);

    // Thread re-parent guarded on relatedKind "None" → Lead.
    expect(db.crmEmailThread.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["thr1"] }, relatedKind: "None" }),
        data: { relatedKind: "Lead", relatedObjectId: "lead1" },
      }),
    );
    // Message re-parent.
    expect(db.crmEmailMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ threadId: { in: ["thr1"] }, relatedKind: "None" }),
        data: { relatedKind: "Lead", relatedObjectId: "lead1" },
      }),
    );
    // Timeline activity onto the Lead (leadId set).
    expect(db.crmActivity.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["act1"] }, relatedKind: "None" }),
        data: expect.objectContaining({ relatedKind: "Lead", relatedObjectId: "lead1", leadId: "lead1" }),
      }),
    );
    // Mirror cross-link.
    expect(db.crmMailboxEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "o1", id: { in: ["mbx1"] } },
        data: { matchedKind: "Lead", matchedObjectId: "lead1" },
      }),
    );
  });

  it("is idempotent: a 2nd run finds no unmatched candidates → links nothing", async () => {
    // After the first run the rows are matched; the scan (which excludes matched
    // rows) returns empty on rerun.
    db.crmMailboxEmail.findMany.mockResolvedValue([] as never);
    const r = await relinkStandaloneEmailsForRecord({ orgId: "o1", kind: "Lead", recordId: "lead1", emails: ["abc@company.com"] });
    expect(r.threadsRelinked).toBe(0);
    expect(r.mirrorRowsLinked).toBe(0);
  });

  it("does not re-parent a thread already linked to another record", async () => {
    // Candidate mirror row exists, but its thread is NOT standalone anymore
    // (belongs to another record) → thread scan returns empty → no re-parent.
    db.crmMailboxEmail.findMany.mockResolvedValue([{ id: "mbx1", providerThreadId: "conv1" }] as never);
    db.crmEmailThread.findMany.mockResolvedValue([] as never); // no standalone thread
    db.crmMailboxEmail.updateMany.mockResolvedValue({ count: 1 } as never);

    const r = await relinkStandaloneEmailsForRecord({ orgId: "o1", kind: "Lead", recordId: "lead1", emails: ["abc@company.com"] });
    expect(r.threadsRelinked).toBe(0);
    expect(r.messagesRelinked).toBe(0);
    expect(db.crmEmailThread.updateMany).not.toHaveBeenCalled();
  });
});

describe("backfillRelinkAllLeads", () => {
  beforeEach(() => {
    db.crmEmailThread.findMany.mockResolvedValue([{ id: "thr1" }] as never);
    db.crmEmailMessage.findMany.mockResolvedValue([{ id: "msg1", activityId: "act1" }] as never);
    db.crmEmailThread.updateMany.mockResolvedValue({ count: 1 } as never);
    db.crmEmailMessage.updateMany.mockResolvedValue({ count: 1 } as never);
    db.crmActivity.updateMany.mockResolvedValue({ count: 1 } as never);
    db.crmMailboxEmail.updateMany.mockResolvedValue({ count: 1 } as never);
  });

  it("apply: scans all leads and re-links matching standalone emails", async () => {
    // One batch of 2 leads, then empty (loop terminates).
    db.crmLead.findMany
      .mockResolvedValueOnce([
        { id: "lead1", orgId: "o1", email: "a@x.com", secondaryEmail: null },
        { id: "lead2", orgId: "o1", email: "b@x.com", secondaryEmail: null },
      ] as never)
      .mockResolvedValue([] as never);
    // lead1 has a standalone email; lead2 has none.
    db.crmMailboxEmail.findMany
      .mockResolvedValueOnce([{ id: "mbx1", providerThreadId: "conv1" }] as never)
      .mockResolvedValueOnce([] as never);

    const r = await backfillRelinkAllLeads({ apply: true, batchSize: 500 });
    expect(r.leadsScanned).toBe(2);
    expect(r.leadsWithLinks).toBe(1);
    expect(r.threadsRelinked).toBe(1);
  });

  it("dry-run: counts would-link rows, writes NOTHING", async () => {
    db.crmLead.findMany
      .mockResolvedValueOnce([{ id: "lead1", orgId: "o1", email: "a@x.com", secondaryEmail: null }] as never)
      .mockResolvedValue([] as never);
    db.crmMailboxEmail.count.mockResolvedValue(3 as never);

    const r = await backfillRelinkAllLeads({ apply: false });
    expect(r.leadsScanned).toBe(1);
    expect(r.leadsWithLinks).toBe(1);
    expect(r.mailboxRowsLinked).toBe(3); // would-link
    // No re-parent writes in dry-run.
    expect(db.crmEmailThread.updateMany).not.toHaveBeenCalled();
    expect(db.crmMailboxEmail.updateMany).not.toHaveBeenCalled();
  });

  it("counts errors without aborting the whole run", async () => {
    db.crmLead.findMany
      .mockResolvedValueOnce([
        { id: "lead1", orgId: "o1", email: "a@x.com", secondaryEmail: null },
        { id: "lead2", orgId: "o1", email: "b@x.com", secondaryEmail: null },
      ] as never)
      .mockResolvedValue([] as never);
    // lead1 scan throws; lead2 succeeds with no matches.
    db.crmMailboxEmail.findMany
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([] as never);

    const r = await backfillRelinkAllLeads({ apply: true });
    expect(r.leadsScanned).toBe(2);
    expect(r.errors).toBe(1);
  });
});
