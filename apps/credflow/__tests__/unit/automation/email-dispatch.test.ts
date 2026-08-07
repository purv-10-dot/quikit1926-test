/**
 * [P3.B1] Email dispatch — consume a queued QcfOutboundMessageLog row → send →
 * transition queued→sent / queued→failed. SPEC §5.1 · SURVEY #7.
 *
 * SAFETY: `sendTransactionalEmail` is fully MOCKED here — no network call, no
 * provider, no real address is ever touched (Constraint 1.1).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";

vi.mock("@/lib/services/email/send", () => ({
  sendTransactionalEmail: vi.fn(),
  EmailError: class extends Error {},
}));

import { sendTransactionalEmail } from "@/lib/services/email/send";
import { dispatchOutboundMessage } from "@/lib/services/automation/email-dispatch";

const db = mockDb();
const send = vi.mocked(sendTransactionalEmail);

function queuedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    tenantId: "t1",
    channel: "email",
    to: "captured@example.test",
    subject: "Hi",
    body: "Body",
    status: "queued",
    metadata: null,
    sentAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  send.mockReset();
  db.qcfOutboundMessageLog.findFirst.mockReset();
  db.qcfOutboundMessageLog.update.mockReset();
  db.qcfOutboundMessageLog.update.mockResolvedValue({} as never);
});

describe("dispatchOutboundMessage · B1", () => {
  it("dispatches a queued email and transitions the row queued→sent", async () => {
    db.qcfOutboundMessageLog.findFirst.mockResolvedValue(queuedRow() as never);
    const sentAt = new Date("2026-07-23T10:00:00Z");
    send.mockResolvedValue({ driver: "console", messageId: "mid-42", sentAt } as never);

    const res = await dispatchOutboundMessage("t1", "log-1");

    expect(res).toMatchObject({ outcome: "sent", driver: "console", messageId: "mid-42" });
    expect(send).toHaveBeenCalledWith({ to: ["captured@example.test"], subject: "Hi", text: "Body" });
    expect(db.qcfOutboundMessageLog.update).toHaveBeenCalledWith({
      where: { id: "log-1" },
      data: expect.objectContaining({
        status: "sent",
        sentAt,
        metadata: expect.objectContaining({ driver: "console", messageId: "mid-42" }),
      }),
    });
  });

  it("records a send FAILURE on the row and does NOT throw (run continues)", async () => {
    db.qcfOutboundMessageLog.findFirst.mockResolvedValue(queuedRow() as never);
    send.mockRejectedValue(new Error("smtp exploded"));

    const res = await dispatchOutboundMessage("t1", "log-1");

    expect(res).toMatchObject({ outcome: "failed", reason: "smtp exploded" });
    expect(db.qcfOutboundMessageLog.update).toHaveBeenCalledWith({
      where: { id: "log-1" },
      data: expect.objectContaining({
        status: "failed",
        metadata: expect.objectContaining({ error: "smtp exploded" }),
      }),
    });
  });

  it("skips a row that is not queued — never double-sends", async () => {
    db.qcfOutboundMessageLog.findFirst.mockResolvedValue(queuedRow({ status: "sent" }) as never);
    const res = await dispatchOutboundMessage("t1", "log-1");
    expect(res.outcome).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
    expect(db.qcfOutboundMessageLog.update).not.toHaveBeenCalled();
  });

  it("skips (does not send) when the row is missing for the tenant", async () => {
    db.qcfOutboundMessageLog.findFirst.mockResolvedValue(null as never);
    const res = await dispatchOutboundMessage("t1", "missing");
    expect(res.outcome).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("is tenant-scoped — loads the row with a tenantId filter", async () => {
    db.qcfOutboundMessageLog.findFirst.mockResolvedValue(queuedRow() as never);
    send.mockResolvedValue({ driver: "console", messageId: "m", sentAt: new Date() } as never);
    await dispatchOutboundMessage("t1", "log-1");
    expect(db.qcfOutboundMessageLog.findFirst).toHaveBeenCalledWith({
      where: { id: "log-1", tenantId: "t1" },
    });
  });
});
