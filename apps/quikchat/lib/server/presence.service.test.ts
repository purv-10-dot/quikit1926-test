import { beforeEach, describe, expect, it } from "vitest";
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";
import { __getPublishedForTest, __resetPublishedForTest } from "@/lib/shared/publish";
import type { OrgContext } from "@/lib/shared";
import { getMyPresence, setMyPresence } from "./presence.service";

const ctx: OrgContext = { userId: "u1", orgId: "org-1" };

beforeEach(() => {
  resetMockDb();
  __resetPublishedForTest();
});

describe("getMyPresence", () => {
  it("defaults to available when the user has never set a status", async () => {
    mockDb.qcUserPresence.findUnique.mockResolvedValue(null as never);
    expect(await getMyPresence(ctx)).toEqual({
      status: "available",
      statusMessage: null,
      statusExpiresAt: null,
    });
  });

  it("returns the persisted status", async () => {
    mockDb.qcUserPresence.findUnique.mockResolvedValue({
      status: "busy",
      statusMessage: "heads down",
      statusExpiresAt: null,
    } as never);
    expect(await getMyPresence(ctx)).toEqual({
      status: "busy",
      statusMessage: "heads down",
      statusExpiresAt: null,
    });
  });

  it("read-time expiry: a lapsed timed status reads as available and is lazily cleared", async () => {
    mockDb.qcUserPresence.findUnique.mockResolvedValue({
      status: "busy",
      statusMessage: "heads down",
      statusExpiresAt: new Date(Date.now() - 60_000), // already past
    } as never);
    mockDb.qcUserPresence.update.mockResolvedValue({} as never);

    expect(await getMyPresence(ctx)).toEqual({
      status: "available",
      statusMessage: null,
      statusExpiresAt: null,
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
    } as never);
    expect(await getMyPresence(ctx)).toEqual({
      status: "busy",
      statusMessage: null,
      statusExpiresAt: future.toISOString(),
    });
  });
});

describe("setMyPresence", () => {
  it("upserts org-scoped and publishes a presence_status change to the user's channels", async () => {
    mockDb.qcUserPresence.upsert.mockResolvedValue({
      status: "dnd",
      statusMessage: null,
      statusExpiresAt: null,
    } as never);
    mockDb.qcChannelMember.findMany.mockResolvedValue([
      { channelId: "c1" },
      { channelId: "c2" },
    ] as never);

    const dto = await setMyPresence(ctx, { status: "dnd" });
    expect(dto).toEqual({ status: "dnd", statusMessage: null, statusExpiresAt: null });

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
    } as never);
    mockDb.qcChannelMember.findMany.mockResolvedValue([] as never);

    await setMyPresence(ctx, { status: "available" });
    expect(__getPublishedForTest()).toHaveLength(0);
  });
});
