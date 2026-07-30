/**
 * Regression: cross-provider email leakage in the Mailbox module.
 *
 * A CrmMailboxConnection is keyed (orgId, userId) — ONE row per user — so
 * reconnecting to a different mailbox reuses the same connection id. The
 * mirrored CrmMailboxEmail rows hang off that id, so without a purge the newly
 * connected mailbox inherits the previous provider's emails (connect Microsoft
 * after Gmail → Google mail still shows on /mailbox/inbox).
 *
 * These tests pin the fix: saveConnection() purges the mirror when the mailbox
 * changes (different provider or address) and NOT when the same mailbox
 * re-auths; disconnect() always purges. Cursors are reset on both paths.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";

// Token crypto + provider network are irrelevant here — stub them.
vi.mock("@/lib/crypto/token-cipher", () => ({
  encryptToken: (s: string) => `enc(${s})`,
  decryptToken: (s: string) => s.replace(/^enc\(|\)$/g, ""),
}));
vi.mock("@/lib/services/email/providers", () => ({
  getProvider: () => ({ revoke: vi.fn(async () => undefined) }),
}));

import { saveConnection, disconnect } from "@/lib/services/email/mailbox";

const db = mockDb();

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction runs its callback against the same mock db (acts as `tx`).
  db.$transaction.mockImplementation(async (cb: unknown) =>
    typeof cb === "function" ? (cb as (tx: typeof db) => unknown)(db) : undefined,
  );
  db.crmMailboxConnection.upsert.mockResolvedValue({ id: "conn1" } as never);
  db.crmMailboxEmail.deleteMany.mockResolvedValue({ count: 0 } as never);
});

const args = {
  orgId: "org1",
  userId: "u1",
  emailAddress: "rep@company.com",
  accessToken: "at",
  refreshToken: "rt",
};

describe("saveConnection — mailbox switch purges the mirror", () => {
  it("PURGES mirrored emails when switching provider (gmail → microsoft)", async () => {
    db.crmMailboxConnection.findUnique.mockResolvedValue({
      id: "conn1",
      provider: "gmail",
      emailAddress: "rep@company.com",
    } as never);

    await saveConnection({ ...args, provider: "microsoft" });

    expect(db.crmMailboxEmail.deleteMany).toHaveBeenCalledWith({
      where: { orgId: "org1", mailboxConnectionId: "conn1" },
    });
  });

  it("PURGES when the same provider connects a different address", async () => {
    db.crmMailboxConnection.findUnique.mockResolvedValue({
      id: "conn1",
      provider: "microsoft",
      emailAddress: "old@company.com",
    } as never);

    await saveConnection({ ...args, provider: "microsoft", emailAddress: "new@company.com" });

    expect(db.crmMailboxEmail.deleteMany).toHaveBeenCalled();
  });

  it("does NOT purge when re-authing the SAME mailbox", async () => {
    db.crmMailboxConnection.findUnique.mockResolvedValue({
      id: "conn1",
      provider: "microsoft",
      emailAddress: "rep@company.com",
    } as never);

    await saveConnection({ ...args, provider: "microsoft" });

    expect(db.crmMailboxEmail.deleteMany).not.toHaveBeenCalled();
  });

  it("does NOT purge on a first-time connect (no existing row)", async () => {
    db.crmMailboxConnection.findUnique.mockResolvedValue(null);

    await saveConnection({ ...args, provider: "microsoft" });

    expect(db.crmMailboxEmail.deleteMany).not.toHaveBeenCalled();
  });

  it("resets ALL delta cursors on reconnect", async () => {
    db.crmMailboxConnection.findUnique.mockResolvedValue(null);
    await saveConnection({ ...args, provider: "microsoft" });

    const update = db.crmMailboxConnection.upsert.mock.calls[0][0].update as Record<string, unknown>;
    expect(update).toMatchObject({
      historyId: null,
      deltaLink: null,
      deltaInbox: null,
      deltaSent: null,
      deltaDrafts: null,
    });
  });
});

describe("disconnect — purges the mirror", () => {
  it("deletes the mirrored emails and marks the connection disconnected", async () => {
    db.crmMailboxConnection.findUnique.mockResolvedValue({
      id: "conn1",
      provider: "microsoft",
      refreshTokenEnc: "enc(rt)",
    } as never);
    db.crmMailboxConnection.update.mockResolvedValue({ id: "conn1" } as never);

    await disconnect("org1", "u1");

    expect(db.crmMailboxEmail.deleteMany).toHaveBeenCalledWith({
      where: { orgId: "org1", mailboxConnectionId: "conn1" },
    });
    const data = db.crmMailboxConnection.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.status).toBe("disconnected");
  });

  it("is a no-op when the user has no connection", async () => {
    db.crmMailboxConnection.findUnique.mockResolvedValue(null);
    await disconnect("org1", "u1");
    expect(db.crmMailboxEmail.deleteMany).not.toHaveBeenCalled();
  });
});
