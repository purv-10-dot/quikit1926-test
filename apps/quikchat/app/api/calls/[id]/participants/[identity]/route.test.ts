import { db as prisma } from "@quikit/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PATCH } from "./route";

vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockProvider = {
  createRoom: vi.fn(async (roomId: string) => ({ roomId, name: roomId, createdAt: new Date() })),
  generateToken: vi.fn(async () => "token"),
  listParticipants: vi.fn(async () => []),
  removeParticipant: vi.fn(async () => undefined),
  muteParticipant: vi.fn(async () => undefined),
  muteAllParticipants: vi.fn(async () => undefined),
  deleteRoom: vi.fn(async () => undefined),
};

vi.mock("@/lib/server/calling/sfu-provider", () => ({
  selectSFUMode: () => ({ mode: "live" }),
  getSFUProvider: () => mockProvider,
  __resetSFUForTest: vi.fn(),
}));

import { getRawSession } from "@/lib/session";

const mockSession = getRawSession as unknown as Mock;

let orgAId = "";
let aliceId = "";
let bobId = "";
let groupChannelId = "";
let activeCallId = "";

const patchAction = (callId: string, identity: string, action: string) =>
  new Request(`http://test.local/api/calls/${callId}/participants/${identity}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
    headers: { "content-type": "application/json" },
  });

beforeAll(async () => {
  const org = await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } });
  orgAId = org.id;

  await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } });
  await prisma.qcCall.deleteMany({ where: { orgId: orgAId } });

  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  bobId = (await prisma.user.findUniqueOrThrow({ where: { email: "bob@acme.test" } })).id;

  const groupChannel = await prisma.qcChannel.create({
    data: {
      orgId: orgAId,
      type: "group",
      name: "participant-route-tests",
      visibility: "private",
      members: {
        create: [
          { orgId: orgAId, userId: aliceId },
          { orgId: orgAId, userId: bobId },
        ],
      },
    },
  });
  groupChannelId = groupChannel.id;

  mockSession.mockResolvedValue({ userId: aliceId, orgId: orgAId });
});

afterAll(async () => {
  await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } }).catch(() => {});
  await prisma.qcCall.deleteMany({ where: { orgId: orgAId } }).catch(() => {});
  await prisma.qcChannelMember
    .deleteMany({ where: { channel: { orgId: orgAId, name: "participant-route-tests" } } })
    .catch(() => {});
  await prisma.qcChannel
    .deleteMany({ where: { orgId: orgAId, name: "participant-route-tests" } })
    .catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } });
  await prisma.qcCall.deleteMany({ where: { orgId: orgAId } });

  const call = await prisma.qcCall.create({
    data: {
      orgId: orgAId,
      channelId: groupChannelId,
      initiatorId: aliceId,
      type: "video",
      status: "active",
      answeredAt: new Date(),
      participants: {
        create: [
          { userId: aliceId, state: "connected", joinedAt: new Date(), lastHeartbeatAt: new Date() },
          { userId: bobId, state: "connected", joinedAt: new Date(), lastHeartbeatAt: new Date() },
        ],
      },
    },
  });
  activeCallId = call.id;

  mockSession.mockResolvedValue({ userId: aliceId, orgId: orgAId });
});

describe("PATCH /api/calls/:id/participants/:identity", () => {
  it("lets the host mute a participant's microphone", async () => {
    const res = await PATCH(patchAction(activeCallId, bobId, "mute"), {
      params: { id: activeCallId, identity: bobId },
    });

    expect(res.status).toBe(200);
    expect(mockProvider.muteParticipant).toHaveBeenCalledWith(
      `call-${activeCallId}`,
      bobId,
      true,
    );
  });

  it("lets the host unmute a participant", async () => {
    const res = await PATCH(patchAction(activeCallId, bobId, "unmute"), {
      params: { id: activeCallId, identity: bobId },
    });

    expect(res.status).toBe(200);
    expect(mockProvider.muteParticipant).toHaveBeenCalledWith(
      `call-${activeCallId}`,
      bobId,
      false,
    );
  });

  it("lets the host remove a participant", async () => {
    const res = await PATCH(patchAction(activeCallId, bobId, "remove"), {
      params: { id: activeCallId, identity: bobId },
    });

    expect(res.status).toBe(200);
    expect(mockProvider.removeParticipant).toHaveBeenCalledWith(`call-${activeCallId}`, bobId);
  });

  it("rejects a non-host trying to mute another participant", async () => {
    mockSession.mockResolvedValue({ userId: bobId, orgId: orgAId });
    const res = await PATCH(patchAction(activeCallId, aliceId, "mute"), {
      params: { id: activeCallId, identity: aliceId },
    });

    expect(res.status).toBe(403);
    expect(mockProvider.muteParticipant).not.toHaveBeenCalled();
  });

  it("rejects the host targeting themselves", async () => {
    const res = await PATCH(patchAction(activeCallId, aliceId, "mute"), {
      params: { id: activeCallId, identity: aliceId },
    });

    expect(res.status).toBe(400);
    expect(mockProvider.muteParticipant).not.toHaveBeenCalled();
  });

  it("rejects an invalid action", async () => {
    const res = await PATCH(patchAction(activeCallId, bobId, "kick"), {
      params: { id: activeCallId, identity: bobId },
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 for a call in a different org", async () => {
    const orgB = await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } });
    const carolId = (await prisma.user.findUniqueOrThrow({ where: { email: "carol@globex.test" } }))
      .id;
    mockSession.mockResolvedValue({ userId: carolId, orgId: orgB.id });

    const res = await PATCH(patchAction(activeCallId, bobId, "mute"), {
      params: { id: activeCallId, identity: bobId },
    });
    expect(res.status).toBe(404);
  });
});
