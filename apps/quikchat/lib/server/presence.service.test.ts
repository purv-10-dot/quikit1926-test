import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";
import { __getPublishedForTest, __resetPublishedForTest } from "@/lib/shared/publish";
import type { OrgContext } from "@/lib/shared";

// The Redis read is the ONLY network hop in getEffectiveLastSeen; mocking it lets
// every privacy short-circuit assert that it was never reached.
const readLastSeen = vi.fn(async (_orgId: string, _userId: string) => null as string | null);
vi.mock("./presence-redis", () => ({
  readLastSeen: (...a: [string, string]) => readLastSeen(...a),
  __resetPresenceRedisForTest: () => undefined,
}));

import { getEffectiveLastSeen, getMyPresence, setMyPresence } from "./presence.service";

const ctx: OrgContext = { userId: "u1", orgId: "org-1" };

beforeEach(() => {
  resetMockDb();
  __resetPublishedForTest();
  readLastSeen.mockReset();
  readLastSeen.mockResolvedValue(null);
});

describe("getMyPresence", () => {
  it("defaults to available when the user has never set a status", async () => {
    mockDb.qcUserPresence.findUnique.mockResolvedValue(null as never);
    expect(await getMyPresence(ctx)).toEqual({
      status: "available",
      statusMessage: null,
      statusExpiresAt: null,
      shareLastSeen: true,
    });
  });

  it("returns the persisted status", async () => {
    mockDb.qcUserPresence.findUnique.mockResolvedValue({
      status: "busy",
      statusMessage: "heads down",
      statusExpiresAt: null,
      shareLastSeen: true,
    } as never);
    expect(await getMyPresence(ctx)).toEqual({
      status: "busy",
      statusMessage: "heads down",
      statusExpiresAt: null,
      shareLastSeen: true,
    });
  });

  it("read-time expiry: a lapsed timed status reads as available and is lazily cleared", async () => {
    mockDb.qcUserPresence.findUnique.mockResolvedValue({
      status: "busy",
      statusMessage: "heads down",
      statusExpiresAt: new Date(Date.now() - 60_000), // already past
      shareLastSeen: true,
    } as never);
    mockDb.qcUserPresence.update.mockResolvedValue({} as never);

    expect(await getMyPresence(ctx)).toEqual({
      status: "available",
      statusMessage: null,
      statusExpiresAt: null,
      shareLastSeen: true,
    });
    // Best-effort lazy clear was issued (fire-and-forget).
    expect(mockDb.qcUserPresence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_userId: { orgId: "org-1", userId: "u1" } },
        data: { status: "available", statusMessage: null, statusExpiresAt: null },
      }),
    );
  });

  it("keeps a not-yet-expired timed status", async () => {
    const future = new Date(Date.now() + 60_000);
    mockDb.qcUserPresence.findUnique.mockResolvedValue({
      status: "busy",
      statusMessage: null,
      statusExpiresAt: future,
      shareLastSeen: true,
    } as never);
    expect(await getMyPresence(ctx)).toEqual({
      status: "busy",
      statusMessage: null,
      statusExpiresAt: future.toISOString(),
      shareLastSeen: true,
    });
  });

  it("status expiry does NOT reset the shareLastSeen privacy flag", async () => {
    mockDb.qcUserPresence.findUnique.mockResolvedValue({
      status: "busy",
      statusMessage: "heads down",
      statusExpiresAt: new Date(Date.now() - 60_000),
      shareLastSeen: false, // opted out — must survive the status revert
    } as never);
    mockDb.qcUserPresence.update.mockResolvedValue({} as never);

    const dto = await getMyPresence(ctx);
    expect(dto.status).toBe("available");
    expect(dto.shareLastSeen).toBe(false);
    // The lazy clear touches the status trio only, never the privacy flag.
    expect(mockDb.qcUserPresence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "available", statusMessage: null, statusExpiresAt: null },
      }),
    );
  });
});

describe("setMyPresence", () => {
  it("upserts org-scoped and publishes a presence_status change to the user's channels", async () => {
    mockDb.qcUserPresence.upsert.mockResolvedValue({
      status: "dnd",
      statusMessage: null,
      statusExpiresAt: null,
      shareLastSeen: true,
    } as never);
    mockDb.qcChannelMember.findMany.mockResolvedValue([
      { channelId: "c1" },
      { channelId: "c2" },
    ] as never);

    const dto = await setMyPresence(ctx, { status: "dnd" });
    expect(dto).toEqual({
      status: "dnd",
      statusMessage: null,
      statusExpiresAt: null,
      shareLastSeen: true,
    });

    // Org-scoped upsert on the composite unique key (tenant isolation).
    expect(mockDb.qcUserPresence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_userId: { orgId: "org-1", userId: "u1" } },
      }),
    );

    // Persist-then-publish: one presence_status event carrying the channel ids.
    const published = __getPublishedForTest();
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      orgId: "org-1",
      event: "presence_status",
      payload: { userId: "u1", status: "dnd", channelIds: ["c1", "c2"] },
    });
  });

  it("stores a future expiry and publishes it in the fanout payload", async () => {
    const future = new Date(Date.now() + 30 * 60_000);
    mockDb.qcUserPresence.upsert.mockResolvedValue({
      status: "busy",
      statusMessage: null,
      statusExpiresAt: future,
      shareLastSeen: true,
    } as never);
    mockDb.qcChannelMember.findMany.mockResolvedValue([{ channelId: "c1" }] as never);

    const dto = await setMyPresence(ctx, { status: "busy", expiresAt: future.toISOString() });
    expect(dto.statusExpiresAt).toBe(future.toISOString());
    // The stored value passed to Prisma is the future Date (clamped by normalizeExpiry).
    expect(mockDb.qcUserPresence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "busy", statusExpiresAt: future }),
      }),
    );
    expect(__getPublishedForTest()[0]).toMatchObject({
      payload: { userId: "u1", status: "busy", statusExpiresAt: future.toISOString() },
    });
  });

  it("clamps a past/invalid expiry to null (no expiry)", async () => {
    mockDb.qcUserPresence.upsert.mockResolvedValue({
      status: "busy",
      statusMessage: null,
      statusExpiresAt: null,
    } as never);
    mockDb.qcChannelMember.findMany.mockResolvedValue([{ channelId: "c1" }] as never);

    await setMyPresence(ctx, { status: "busy", expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(mockDb.qcUserPresence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ statusExpiresAt: null }) }),
    );
  });

  it("does not publish when the user shares no channels", async () => {
    mockDb.qcUserPresence.upsert.mockResolvedValue({
      status: "available",
      statusMessage: null,
      statusExpiresAt: null,
      shareLastSeen: true,
    } as never);
    mockDb.qcChannelMember.findMany.mockResolvedValue([] as never);

    await setMyPresence(ctx, { status: "available" });
    expect(__getPublishedForTest()).toHaveLength(0);
  });
});

describe("setMyPresence — privacy-only patch (no status)", () => {
  beforeEach(() => {
    mockDb.qcUserPresence.upsert.mockResolvedValue({
      status: "busy",
      statusMessage: "heads down",
      statusExpiresAt: null,
      shareLastSeen: false,
    } as never);
    mockDb.qcChannelMember.findMany.mockResolvedValue([{ channelId: "c1" }] as never);
  });

  it("writes only shareLastSeen — status, message and expiry are untouched", async () => {
    await setMyPresence(ctx, { shareLastSeen: false });
    const call = mockDb.qcUserPresence.upsert.mock.calls[0]![0] as {
      update: Record<string, unknown>;
    };
    expect(call.update).toEqual({ shareLastSeen: false });
    // Regression: the old signature always wrote statusMessage/statusExpiresAt,
    // which would have cleared "heads down" on a privacy toggle.
    expect(call.update).not.toHaveProperty("status");
    expect(call.update).not.toHaveProperty("statusMessage");
    expect(call.update).not.toHaveProperty("statusExpiresAt");
  });

  it("does not publish a presence_status fan-out (observers derive nothing from it)", async () => {
    await setMyPresence(ctx, { shareLastSeen: false });
    expect(__getPublishedForTest()).toHaveLength(0);
    // It should not even look up the channel ids to publish to.
    expect(mockDb.qcChannelMember.findMany).not.toHaveBeenCalled();
  });

  it("first-write creates the row with a default available status", async () => {
    await setMyPresence(ctx, { shareLastSeen: true });
    const call = mockDb.qcUserPresence.upsert.mock.calls[0]![0] as {
      create: Record<string, unknown>;
    };
    expect(call.create).toMatchObject({
      orgId: "org-1",
      userId: "u1",
      status: "available",
      shareLastSeen: true,
    });
  });

  it("still publishes when the same call also changes status", async () => {
    await setMyPresence(ctx, { status: "busy", shareLastSeen: true });
    expect(__getPublishedForTest()).toHaveLength(1);
  });
});

describe("getEffectiveLastSeen", () => {
  const SUBJECT = "u2";
  const SEEN = "2026-08-03T09:12:00.000Z";
  /** rows as the single findMany returns them */
  const rows = (
    viewer: Partial<{ status: string; statusExpiresAt: Date | null; shareLastSeen: boolean }>,
    subject: Partial<{ status: string; statusExpiresAt: Date | null; shareLastSeen: boolean }>,
  ) =>
    [
      { userId: "u1", status: "available", statusExpiresAt: null, shareLastSeen: true, ...viewer },
      {
        userId: SUBJECT,
        status: "available",
        statusExpiresAt: null,
        shareLastSeen: true,
        ...subject,
      },
    ] as never;

  it("returns the stored instant when both sides share", async () => {
    mockDb.qcUserPresence.findMany.mockResolvedValue(rows({}, {}));
    readLastSeen.mockResolvedValue(SEEN);
    expect(await getEffectiveLastSeen(ctx, SUBJECT)).toBe(SEEN);
    expect(readLastSeen).toHaveBeenCalledWith("org-1", SUBJECT);
  });

  it("treats a missing row as the column default (true) on both sides", async () => {
    mockDb.qcUserPresence.findMany.mockResolvedValue([] as never);
    readLastSeen.mockResolvedValue(SEEN);
    expect(await getEffectiveLastSeen(ctx, SUBJECT)).toBe(SEEN);
  });

  it("appear_offline hides it WITHOUT touching Redis", async () => {
    mockDb.qcUserPresence.findMany.mockResolvedValue(rows({}, { status: "appear_offline" }));
    expect(await getEffectiveLastSeen(ctx, SUBJECT)).toBeNull();
    expect(readLastSeen).not.toHaveBeenCalled();
  });

  it("a LAPSED timed appear_offline reads as available and no longer hides it", async () => {
    mockDb.qcUserPresence.findMany.mockResolvedValue(
      rows({}, { status: "appear_offline", statusExpiresAt: new Date(Date.now() - 60_000) }),
    );
    readLastSeen.mockResolvedValue(SEEN);
    // Without read-time expiry here, one stale row would hide last seen forever.
    expect(await getEffectiveLastSeen(ctx, SUBJECT)).toBe(SEEN);
  });

  it("a still-future timed appear_offline does hide it", async () => {
    mockDb.qcUserPresence.findMany.mockResolvedValue(
      rows({}, { status: "appear_offline", statusExpiresAt: new Date(Date.now() + 60_000) }),
    );
    expect(await getEffectiveLastSeen(ctx, SUBJECT)).toBeNull();
    expect(readLastSeen).not.toHaveBeenCalled();
  });

  it("mutual: the VIEWER opting out hides the subject's, without touching Redis", async () => {
    mockDb.qcUserPresence.findMany.mockResolvedValue(rows({ shareLastSeen: false }, {}));
    expect(await getEffectiveLastSeen(ctx, SUBJECT)).toBeNull();
    expect(readLastSeen).not.toHaveBeenCalled();
  });

  it("mutual: the SUBJECT opting out hides it, without touching Redis", async () => {
    mockDb.qcUserPresence.findMany.mockResolvedValue(rows({}, { shareLastSeen: false }));
    expect(await getEffectiveLastSeen(ctx, SUBJECT)).toBeNull();
    expect(readLastSeen).not.toHaveBeenCalled();
  });

  it("returns null when Redis has no value (never recorded) — same shape as hidden", async () => {
    mockDb.qcUserPresence.findMany.mockResolvedValue(rows({}, {}));
    readLastSeen.mockResolvedValue(null);
    expect(await getEffectiveLastSeen(ctx, SUBJECT)).toBeNull();
  });

  it("short-circuits on self with no query and no Redis call", async () => {
    expect(await getEffectiveLastSeen(ctx, "u1")).toBeNull();
    expect(mockDb.qcUserPresence.findMany).not.toHaveBeenCalled();
    expect(readLastSeen).not.toHaveBeenCalled();
  });

  it("reads both rows in ONE org-scoped query", async () => {
    mockDb.qcUserPresence.findMany.mockResolvedValue(rows({}, {}));
    await getEffectiveLastSeen(ctx, SUBJECT);
    expect(mockDb.qcUserPresence.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.qcUserPresence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org-1", userId: { in: ["u1", SUBJECT] } },
      }),
    );
  });
});
