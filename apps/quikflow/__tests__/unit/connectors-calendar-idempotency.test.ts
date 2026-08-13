import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetMockDb, mockDb } from "../helpers/mockDb";

/**
 * createCalendarEventForOrg's `link` branch — the idempotency guard behind
 * the "Client Master → Teams meetings" duplicate-event bug. Two independent
 * QuikScale callers (the auto-fired clientMaster.created workflow AND the
 * direct "Create Teams meetings" button) can target the exact same
 * (orgId, refType, refId, kind); a same-key second call must PATCH the
 * existing event, never call provider.createEvent again.
 *
 * Also covers the two-phase "claim before Graph call" fix: a PENDING claim
 * blocks a concurrent second attempt while fresh, but is reclaimable once
 * stale (crash recovery) instead of wedging the record forever.
 */
vi.mock("../../lib/connectors/crypto", () => ({
  encryptSecret: (s: string) => s,
  decryptSecret: (s: string) => s,
}));

const createEvent = vi.fn();
const updateEvent = vi.fn();
vi.mock("../../lib/connectors/teams", () => ({
  TEAMS: {
    id: "teams",
    label: "Microsoft Teams",
    scopes: [],
    createEvent: (...a: unknown[]) => createEvent(...a),
    updateEvent: (...a: unknown[]) => updateEvent(...a),
  },
}));

import { createCalendarEventForOrg } from "@/lib/connectors";

const CONN = {
  id: "conn_1",
  orgId: "org_A",
  provider: "teams",
  label: "me@org.com",
  accessToken: "tok",
  refreshToken: "refresh",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
};

const LINK = { refType: "clientMaster", refId: "client_1", kind: "daily" };

const baseEvent = {
  subject: "Daily Huddle — Acme",
  start: "2026-08-10T10:00:00",
  end: "2026-08-10T10:30:00",
  timeZone: "UTC",
  attendees: ["a@acme.com"],
};

function linkRow(overrides: Partial<{ id: string; externalEventId: string; updatedAt: Date }> = {}) {
  return {
    id: "link_1",
    orgId: "org_A",
    provider: "teams",
    connectionId: "conn_1",
    refType: LINK.refType,
    refId: LINK.refId,
    kind: LINK.kind,
    externalEventId: "evt_real_1",
    webLink: null,
    joinUrl: null,
    createdBy: "system",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  resetMockDb();
  createEvent.mockReset();
  updateEvent.mockReset();
  createEvent.mockResolvedValue({ id: "evt_new_1", webLink: null, joinUrl: null });
  updateEvent.mockResolvedValue({ id: "evt_real_1", webLink: null, joinUrl: null });
  mockDb.wfConnection.findFirst.mockResolvedValue(CONN as never);
  // $transaction has no real Postgres behind it here — run the callback
  // straight against mockDb so tx.* calls land on the same mock surface.
  mockDb.$transaction.mockImplementation(((cb: (tx: typeof mockDb) => unknown) => cb(mockDb)) as never);
  delete process.env.FATHOM_NOTETAKER_EMAIL;
});

afterEach(() => {
  delete process.env.FATHOM_NOTETAKER_EMAIL;
});

describe("createCalendarEventForOrg — link idempotency", () => {
  it("no existing link: claims PENDING, creates the event once, then resolves the claim", async () => {
    mockDb.wfCalendarLink.findUnique.mockResolvedValue(null);
    mockDb.wfCalendarLink.upsert.mockResolvedValue(linkRow({ externalEventId: "__pending__" }) as never);
    mockDb.wfCalendarLink.update.mockResolvedValue({} as never);

    const result = await createCalendarEventForOrg("org_A", baseEvent, { link: LINK });

    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(updateEvent).not.toHaveBeenCalled();
    expect(mockDb.wfCalendarLink.upsert.mock.calls[0][0].create.externalEventId).toBe("__pending__");
    expect(mockDb.wfCalendarLink.update).toHaveBeenCalledWith({
      where: { id: "link_1" },
      data: { externalEventId: "evt_new_1", webLink: null, joinUrl: null },
    });
    expect(result?.updated).toBe(false);
    expect(result?.id).toBe("evt_new_1");
  });

  it("a real existing link: PATCHes via updateEvent, never calls createEvent again", async () => {
    mockDb.wfCalendarLink.findUnique.mockResolvedValue(linkRow() as never);
    mockDb.wfCalendarLink.update.mockResolvedValue({} as never);

    const result = await createCalendarEventForOrg("org_A", baseEvent, { link: LINK });

    expect(createEvent).not.toHaveBeenCalled();
    expect(updateEvent).toHaveBeenCalledTimes(1);
    expect(updateEvent.mock.calls[0][1]).toBe("evt_real_1");
    expect(result?.updated).toBe(true);
  });

  it("a fresh in-flight PENDING claim: bails without creating a second event", async () => {
    mockDb.wfCalendarLink.findUnique.mockResolvedValue(
      linkRow({ externalEventId: "__pending__", updatedAt: new Date() }) as never,
    );

    await expect(createCalendarEventForOrg("org_A", baseEvent, { link: LINK })).rejects.toThrow(/already in progress/i);

    expect(createEvent).not.toHaveBeenCalled();
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("a stale PENDING claim (crashed before finishing): reclaims and creates the event", async () => {
    const staleUpdatedAt = new Date(Date.now() - 3 * 60_000); // older than CLAIM_STALE_MS (2 min)
    mockDb.wfCalendarLink.findUnique.mockResolvedValue(
      linkRow({ externalEventId: "__pending__", updatedAt: staleUpdatedAt }) as never,
    );
    mockDb.wfCalendarLink.upsert.mockResolvedValue(linkRow({ externalEventId: "__pending__" }) as never);
    mockDb.wfCalendarLink.update.mockResolvedValue({} as never);

    const result = await createCalendarEventForOrg("org_A", baseEvent, { link: LINK });

    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(updateEvent).not.toHaveBeenCalled();
    expect(result?.updated).toBe(false);
  });
});
