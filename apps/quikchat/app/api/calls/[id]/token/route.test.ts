import { db as prisma } from "@quikit/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { POST } from "./route";

// Keep NextAuth out
vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockProvider = {
  createRoom: vi.fn(async (roomId: string) => ({ roomId, name: roomId, createdAt: new Date() })),
  generateToken: vi.fn(
    async (roomId: string, userId: string, name: string, opts?: { isHost?: boolean }) =>
      `token:${roomId}:${userId}:${name}:${opts?.isHost ? "host" : "member"}`,
  ),
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

const postToken = (callId: string) =>
  new Request(`http://test.local/api/calls/${callId}/token`, { method: "POST" });

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
      name: "token-route-tests",
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
    .deleteMany({ where: { channel: { orgId: orgAId, name: "token-route-tests" } } })
    .catch(() => {});
  await prisma.qcChannel
    .deleteMany({ where: { orgId: orgAId, name: "token-route-tests" } })
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

describe("POST /api/calls/:id/token", () => {
  it("mints a token for the caller with the roomAdmin grant for the initiator", async () => {
    const res = await POST(postToken(activeCallId), {
      params: { id: activeCallId },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      roomId: string;
      token: string;
      livekitUrl: string | null;
      isGroup: boolean;
      isHost: boolean;
    };
    expect(body.roomId).toBe(`call-${activeCallId}`);
    expect(body.token).toContain(`:${aliceId}:`);
    expect(body.token).toContain(":host");
    // This fixture call has exactly 2 participants (alice + bob) — a 1:1 call.
    expect(body.isGroup).toBe(false);
    expect(body.isHost).toBe(true);
    expect(mockProvider.generateToken).toHaveBeenCalledWith(
      `call-${activeCallId}`,
      aliceId,
      expect.any(String),
      { isHost: true },
    );
  });

  it("mints a member (non-host) token for a non-initiator participant", async () => {
    mockSession.mockResolvedValue({ userId: bobId, orgId: orgAId });
    const res = await POST(postToken(activeCallId), { params: { id: activeCallId } });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; isHost: boolean };
    expect(body.token).toContain(":member");
    expect(body.isHost).toBe(false);
  });

  it("never returns another participant's token — each caller only gets their own", async () => {
    const aliceRes = await POST(postToken(activeCallId), { params: { id: activeCallId } });
    const aliceBody = (await aliceRes.json()) as { token: string };

    mockSession.mockResolvedValue({ userId: bobId, orgId: orgAId });
    const bobRes = await POST(postToken(activeCallId), { params: { id: activeCallId } });
    const bobBody = (await bobRes.json()) as { token: string };

    expect(aliceBody.token).not.toBe(bobBody.token);
    expect(aliceBody.token).toContain(aliceId);
    expect(bobBody.token).toContain(bobId);
  });

  it("returns 403 for a non-participant", async () => {
    const org = await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } });
    const carol = await prisma.user.findFirst({
      where: { memberships: { some: { orgId: org.id } }, id: { notIn: [aliceId, bobId] } },
    });
    if (!carol) return; // no third seeded user in this org — skip rather than fail on fixture drift
    mockSession.mockResolvedValue({ userId: carol.id, orgId: orgAId });

    const res = await POST(postToken(activeCallId), { params: { id: activeCallId } });
    expect(res.status).toBe(403);
  });

  it("returns 404 for a call in a different org", async () => {
    const orgB = await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } });
    const carolId = (await prisma.user.findUniqueOrThrow({ where: { email: "carol@globex.test" } }))
      .id;
    mockSession.mockResolvedValue({ userId: carolId, orgId: orgB.id });

    const res = await POST(postToken(activeCallId), { params: { id: activeCallId } });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the call has already ended", async () => {
    await prisma.qcCall.update({ where: { id: activeCallId }, data: { status: "ended" } });

    const res = await POST(postToken(activeCallId), { params: { id: activeCallId } });
    expect(res.status).toBe(409);
  });
});
