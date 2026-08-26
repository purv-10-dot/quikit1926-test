// @vitest-environment node
/**
 * `messages.send` only accepts types a client is allowed to author.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * `POST /api/channels/[id]/messages` hands its `readJson` body straight to
 * `send()` as a `SendMessageInput`, and `type` was never validated at runtime —
 * `dto.type ?? "Text"` took whatever arrived. That was harmless while every
 * card-shaped message rendered from a SERVER-hydrated projection: a forged
 * `Meeting` renders empty because `data.meeting` is injected at serialize time
 * from a row the forger cannot fabricate.
 *
 * The persisted approval card broke that accident. It renders from a `data`
 * SNAPSHOT — it has to, because the runtime's ledger is requester-scoped and
 * expires after 24h — so an accepted client-sent one would render a fully
 * convincing "Priya approved — QUIKSC-290 created" in any channel the sender
 * belongs to. Its buttons would 404, since the runtime scopes decisions on its
 * own token, so nothing would be WRITTEN anywhere. The outcome line is the lie,
 * and that is enough.
 *
 * These tests are the allow-list's only enforcement. Deleting them leaves a
 * one-line change (`?? "Text"`) able to reopen a spoofing surface silently.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";

vi.mock("@/lib/authz", () => ({
  assertMembership: vi.fn(async () => undefined),
}));
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  publishFanout: vi.fn(async () => undefined),
}));

import { HttpError } from "@/lib/errors";
import { send } from "./messages.service";

const ctx = { orgId: "org-1", userId: "u-1" };
const CHANNEL = "c-1";

beforeEach(() => {
  resetMockDb();
  mockDb.qcMessage.findFirst.mockResolvedValue(null as never);
});

describe("messages.send — client-sendable type allow-list", () => {
  it("REFUSES ApprovalRequest, the type whose card renders from a snapshot", async () => {
    await expect(
      send(ctx, CHANNEL, {
        content: "Priya approved — QUIKSC-290 created",
        type: "ApprovalRequest" as never,
        data: { requestId: "r-1", requesterId: "u-1", status: "executed" },
      }),
    ).rejects.toBeInstanceOf(HttpError);
    // And nothing was written on the way to refusing.
    expect(mockDb.qcMessage.create).not.toHaveBeenCalled();
  });

  it("REFUSES Delete — a tombstone is written by the delete path, never sent", async () => {
    await expect(
      send(ctx, CHANNEL, { content: "", type: "Delete" as never }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(mockDb.qcMessage.create).not.toHaveBeenCalled();
  });

  it("refuses a type that is not in MessageType at all", async () => {
    await expect(
      send(ctx, CHANNEL, { content: "hi", type: "Nonsense" as never }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("answers 400, not 500 — a bad body is the caller's error", async () => {
    await expect(
      send(ctx, CHANNEL, { content: "hi", type: "ApprovalRequest" as never }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each(["Text", "Media", "SystemActivity", "Meeting", "Call"] as const)(
    "still accepts %s",
    async (type) => {
      mockDb.qcMessage.create.mockResolvedValue({
        id: "m-1",
        orgId: ctx.orgId,
        channelId: CHANNEL,
        senderId: ctx.userId,
        actorType: "human",
        agentRunId: null,
        type,
        content: "hi",
        data: null,
        parentMessageId: null,
        isPinned: false,
        clientMessageId: null,
        reactions: {},
        createdAt: new Date("2026-08-20T12:00:00.000Z"),
        updatedAt: new Date("2026-08-20T12:00:00.000Z"),
        editedAt: null,
        deletedAt: null,
      } as never);
      mockDb.qcMessage.findMany.mockResolvedValue([] as never);
      mockDb.qcChannel.findFirst.mockResolvedValue(null as never);

      await expect(send(ctx, CHANNEL, { content: "hi", type })).resolves.toBeTruthy();
    },
  );

  it("defaults a missing type to Text rather than refusing", async () => {
    mockDb.qcMessage.create.mockResolvedValue({
      id: "m-2",
      orgId: ctx.orgId,
      channelId: CHANNEL,
      senderId: ctx.userId,
      actorType: "human",
      agentRunId: null,
      type: "Text",
      content: "hi",
      data: null,
      parentMessageId: null,
      isPinned: false,
      clientMessageId: null,
      reactions: {},
      createdAt: new Date("2026-08-20T12:00:00.000Z"),
      updatedAt: new Date("2026-08-20T12:00:00.000Z"),
      editedAt: null,
      deletedAt: null,
    } as never);
    mockDb.qcMessage.findMany.mockResolvedValue([] as never);
    mockDb.qcChannel.findFirst.mockResolvedValue(null as never);

    const sent = await send(ctx, CHANNEL, { content: "hi" });
    expect(sent.type).toBe("Text");
  });
});
