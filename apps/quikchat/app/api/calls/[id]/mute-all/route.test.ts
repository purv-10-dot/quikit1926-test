import { db as prisma } from "@quikit/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { POST } from "./route";

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

const postMuteAll = (callId: string) =>
  new Request(`http://test.local/api/calls/${callId}/mute-all`, { method: "POST" });

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
      name: "mute-all-route-tests",
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
    .deleteMany({ where: { channel: { orgId: orgAId, name: "mute-all-route-tests" } } })
    .catch(() => {});
  await prisma.qcChannel
    .deleteMany({ where: { orgId: orgAId, name: "mute-all-route-tests" } })
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

describe("POST /api/calls/:id/mute-all", () => {
  it("lets the host mute everyone else", async () => {
    const res = await POST(postMuteAll(activeCallId), { params: { id: activeCallId } });

    expect(res.status).toBe(200);
    expect(mockProvider.muteAllParticipants).toHaveBeenCalledWith(
      `call-${activeCallId}`,
      aliceId,
    );
  });

  it("rejects a non-host", async () => {
    mockSession.mockResolvedValue({ userId: bobId, orgId: orgAId });
    const res = await POST(postMuteAll(activeCallId), { params: { id: activeCallId } });

    expect(res.status).toBe(403);
    expect(mockProvider.muteAllParticipants).not.toHaveBeenCalled();
  });

  it("returns 404 for a call in a different org", async () => {
    const orgB = await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } });
    const carolId = (await prisma.user.findUniqueOrThrow({ where: { email: "carol@globex.test" } }))
      .id;
    mockSession.mockResolvedValue({ userId: carolId, orgId: orgB.id });

    const res = await POST(postMuteAll(activeCallId), { params: { id: activeCallId } });
    expect(res.status).toBe(404);
  });
});
