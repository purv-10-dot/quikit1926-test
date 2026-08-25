// POST /api/channels/[id]/ai-reset — the "New chat" write.
//
// Mock-backed, not DB-backed: every DB-backed route test in this app is excluded
// from Vitest (see vitest.config.ts — the fixture rows no seed script creates),
// so a DB-backed suite here would never actually run. Prisma, the realtime
// fanout and the auth wrapper are mocked; `resetAiChatContext` itself is the
// real implementation, so the row it writes is the row under test.
//
// The 401 case is not here for the same reason as the sibling last-seen suite:
// `withOrgAuth` is stubbed out, so there is no session to withhold. Its own
// 401 path is covered where the wrapper lives.
//
// The pairing that matters most is the last test: the marker this route writes
// must be exactly the marker `buildHistory` cuts the pushed history at. Writer
// and reader agreeing is the whole feature, and it is asserted by running the
// real predicate over the real persisted row rather than by restating the
// literal in two places. The truncation semantics themselves (newest marker
// wins, prompt de-dup still applies) live in assistant.service.test.ts.
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb, resetMockDb } from "../../../../../__tests__/helpers/mockDb";
import type { MessageDto } from "@/lib/shared";

const ORG = "org-1";
const ME = "u1";
const AI_CHANNEL = "c-ai";

vi.mock("@/lib/auth-shims", async () => {
  const { HttpError: HE } = await import("@/lib/errors");
  return {
    HttpError: HE,
    withOrgAuth:
      (
        handler: (
          req: NextRequest,
          ctx: { orgId: string; userId: string },
          params: Record<string, string>,
        ) => Promise<Response>,
      ) =>
      async (req: NextRequest, arg?: { params?: Record<string, string> }) => {
        try {
          return await handler(
            req,
            { orgId: ORG, userId: ME },
            arg?.params ?? {},
          );
        } catch (e: unknown) {
          const status = e instanceof HE ? e.status : 500;
          return Response.json(
            { success: false, error: (e as Error).message },
            { status },
          );
        }
      },
  };
});

const userCan = vi.fn(async () => true);
vi.mock("@/lib/authz/permissions", () => ({
  userCan: (...a: unknown[]) => userCan(...(a as [])),
}));

type FanoutEvent = {
  orgId: string;
  channelId: string;
  event: string;
  payload: MessageDto;
};
const publishFanout = vi.fn(async (_evt: FanoutEvent) => undefined);
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  publishFanout: (evt: FanoutEvent) => publishFanout(evt),
}));

import {
  AI_CONTEXT_RESET_KIND,
  AI_CONTEXT_RESET_TEXT,
  buildHistory,
  isContextResetMarker,
} from "@/lib/server/assistant.service";
import { POST } from "./route";

const call = (id = AI_CHANNEL) =>
  POST(
    new Request(`http://test.local/api/channels/${id}/ai-reset`, {
      method: "POST",
    }) as NextRequest,
    { params: { id } },
  );

/** The row Prisma would hand back for a freshly created marker. */
const createdRow = (over: Record<string, unknown> = {}) => ({
  id: "m-marker",
  orgId: ORG,
  channelId: AI_CHANNEL,
  senderId: ME,
  actorType: "human",
  agentRunId: null,
  type: "SystemActivity",
  content: AI_CONTEXT_RESET_TEXT,
  data: { kind: AI_CONTEXT_RESET_KIND },
  parentMessageId: null,
  isPinned: false,
  clientMessageId: null,
  reactions: {},
  createdAt: new Date("2026-08-20T10:00:00.000Z"),
  updatedAt: new Date("2026-08-20T10:00:00.000Z"),
  editedAt: null,
  deletedAt: null,
  ...over,
});

function asMember() {
  mockDb.qcChannelMember.findUnique.mockResolvedValue({
    id: "mem-1",
    orgId: ORG,
    channelId: AI_CHANNEL,
    userId: ME,
    role: "admin",
  } as never);
}

function asChannel(type: string) {
  mockDb.qcChannel.findFirst.mockResolvedValue({
    id: AI_CHANNEL,
    orgId: ORG,
    type,
    visibility: "private",
    name: null,
  } as never);
}

beforeEach(() => {
  resetMockDb();
  userCan.mockReset();
  userCan.mockResolvedValue(true);
  publishFanout.mockReset();
  publishFanout.mockResolvedValue(undefined);
});

describe("POST /api/channels/[id]/ai-reset", () => {
  it("403 without the assistant capability — a Guest cannot reset a context either", async () => {
    userCan.mockResolvedValue(false);
    const res = await call();
    expect(res.status).toBe(403);
    expect(mockDb.qcMessage.create).not.toHaveBeenCalled();
  });

  it("403 for a non-member, before it reveals what kind of channel this is", async () => {
    mockDb.qcChannelMember.findUnique.mockResolvedValue(null as never);
    const res = await call();
    expect(res.status).toBe(403);
    // The type lookup must not even happen: answering "not an AI chat" to someone
    // with no access is itself a disclosure.
    expect(mockDb.qcChannel.findFirst).not.toHaveBeenCalled();
    expect(mockDb.qcMessage.create).not.toHaveBeenCalled();
  });

  it("400 on a normal channel, and writes nothing", async () => {
    asMember();
    asChannel("group");
    const res = await call();
    expect(res.status).toBe(400);
    expect(mockDb.qcMessage.create).not.toHaveBeenCalled();
    expect(publishFanout).not.toHaveBeenCalled();
  });

  it("writes one SystemActivity marker, deletes nothing, and fans it out", async () => {
    asMember();
    asChannel("ai");
    mockDb.qcMessage.create.mockResolvedValue(createdRow() as never);

    const res = await call();
    expect(res.status).toBe(200);

    const written = mockDb.qcMessage.create.mock.calls[0]![0]!.data as Record<
      string,
      unknown
    >;
    expect(written.type).toBe("SystemActivity");
    expect(written.content).toBe(AI_CONTEXT_RESET_TEXT);
    expect(written.data).toEqual({ kind: AI_CONTEXT_RESET_KIND });

    // "Nothing is deleted" is a promise the confirm copy makes to the user, so
    // it is pinned here rather than left to review.
    expect(mockDb.qcMessage.deleteMany).not.toHaveBeenCalled();
    expect(mockDb.qcMessage.delete).not.toHaveBeenCalled();
    expect(mockDb.qcChannelMember.deleteMany).not.toHaveBeenCalled();
    expect(mockDb.qcChannel.deleteMany).not.toHaveBeenCalled();

    // Fanned out as `system`, which the client routes through the same onMessage
    // handler as any message — so every member renders the ordinary centred
    // divider rather than a blank row.
    expect(publishFanout).toHaveBeenCalledTimes(1);
    const evt = publishFanout.mock.calls[0]![0];
    expect(evt.event).toBe("system");
    expect(evt.payload.type).toBe("SystemActivity");
  });

  it("returns a marker the history builder actually cuts on", async () => {
    asMember();
    asChannel("ai");
    mockDb.qcMessage.create.mockResolvedValue(createdRow() as never);

    const marker = (await (await call()).json()) as MessageDto;

    // Writer and reader agree — asserted by running the real predicate over the
    // real response, not by repeating the literal on both sides.
    expect(isContextResetMarker(marker)).toBe(true);

    // And end to end through buildHistory: newest-first, everything at or before
    // the marker stops being pushed to the runtime.
    const older: MessageDto = {
      ...marker,
      id: "m-old",
      type: "Text",
      content: "poisoned turn",
      data: null,
    };
    const newer: MessageDto = {
      ...marker,
      id: "m-new",
      type: "Text",
      content: "after the reset",
      data: null,
    };
    expect(buildHistory([newer, marker, older]).map((h) => h.text)).toEqual([
      "after the reset",
    ]);
  });
});
