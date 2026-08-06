import { db as prisma } from "@quikit/database";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockReceive = vi.fn();

vi.mock("livekit-server-sdk", () => ({
  WebhookReceiver: vi.fn().mockImplementation(() => ({ receive: mockReceive })),
}));

import { POST } from "./route";

let orgAId = "";
let aliceId = "";
let bobId = "";
let groupChannelId = "";
let activeCallId = "";

const ORIGINAL_ENV = { ...process.env };

const postWebhook = (body = "{}", authHeader = "sig") =>
  new Request("http://test.local/api/livekit/webhook", {
    method: "POST",
    body,
    headers: authHeader ? { Authorization: authHeader } : {},
  });

beforeAll(async () => {
  const org = await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } });
  orgAId = org.id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  bobId = (await prisma.user.findUniqueOrThrow({ where: { email: "bob@acme.test" } })).id;

  await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } });
  await prisma.qcCall.deleteMany({ where: { orgId: orgAId } });

  const groupChannel = await prisma.qcChannel.create({
    data: {
      orgId: orgAId,
      type: "group",
      name: "webhook-route-tests",
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
});

afterAll(async () => {
  await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } }).catch(() => {});
  await prisma.qcCall.deleteMany({ where: { orgId: orgAId } }).catch(() => {});
  await prisma.qcChannelMember
    .deleteMany({ where: { channel: { orgId: orgAId, name: "webhook-route-tests" } } })
    .catch(() => {});
  await prisma.qcChannel
    .deleteMany({ where: { orgId: orgAId, name: "webhook-route-tests" } })
    .catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.LIVEKIT_API_KEY = "test-key";
  process.env.LIVEKIT_API_SECRET = "test-secret";

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
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("POST /api/livekit/webhook", () => {
  it("returns 503 when LiveKit env vars are unset", async () => {
    delete process.env.LIVEKIT_API_KEY;
    const res = await POST(postWebhook());
    expect(res.status).toBe(503);
    expect(mockReceive).not.toHaveBeenCalled();
  });

  it("returns 401 when signature verification fails", async () => {
    mockReceive.mockRejectedValueOnce(new Error("invalid signature"));
    const res = await POST(postWebhook());
    expect(res.status).toBe(401);
  });

  it("ends the call on room_finished and is idempotent when called twice", async () => {
    mockReceive.mockResolvedValue({
      event: "room_finished",
      room: { name: `call-${activeCallId}` },
    });

    const res1 = await POST(postWebhook());
    expect(res1.status).toBe(200);

    let call = await prisma.qcCall.findUniqueOrThrow({ where: { id: activeCallId } });
    expect(call.status).toBe("ended");

    // A second room_finished (e.g. our own explicit deleteRoom ALSO finishes
    // the room) must not throw — calling.endCall already no-ops on "ended".
    const res2 = await POST(postWebhook());
    expect(res2.status).toBe(200);

    call = await prisma.qcCall.findUniqueOrThrow({ where: { id: activeCallId } });
    expect(call.status).toBe("ended");
  });

  it("does not throw when the room finishes for a call already rejected/missed/timed_out", async () => {
    // A 1:1 caller joins their room immediately on invite, before the callee
    // ever answers — so a rejected/timed-out call's room can still finish
    // AFTER the call already reached a terminal (non-"ended") status.
    // calling.endCall's state machine only allows "ended" from active/ringing,
    // so calling it here would throw — the webhook must skip it instead.
    await prisma.qcCall.update({ where: { id: activeCallId }, data: { status: "rejected" } });
    mockReceive.mockResolvedValueOnce({
      event: "room_finished",
      room: { name: `call-${activeCallId}` },
    });

    const res = await POST(postWebhook());
    expect(res.status).toBe(200);

    const call = await prisma.qcCall.findUniqueOrThrow({ where: { id: activeCallId } });
    expect(call.status).toBe("rejected");
  });

  it("marks one participant disconnected on participant_left without ending the call", async () => {
    mockReceive.mockResolvedValueOnce({
      event: "participant_left",
      room: { name: `call-${activeCallId}` },
      participant: { identity: bobId },
    });

    const res = await POST(postWebhook());
    expect(res.status).toBe(200);

    const call = await prisma.qcCall.findUniqueOrThrow({
      where: { id: activeCallId },
      include: { participants: true },
    });
    expect(call.status).toBe("active");
    const bob = call.participants.find((p) => p.userId === bobId);
    expect(bob?.state).toBe("disconnected");
    const alice = call.participants.find((p) => p.userId === aliceId);
    expect(alice?.state).toBe("connected");
  });

  it("no-ops gracefully for a room name that doesn't resolve to a call", async () => {
    mockReceive.mockResolvedValueOnce({
      event: "room_finished",
      room: { name: "some-unrelated-room" },
    });

    const res = await POST(postWebhook());
    expect(res.status).toBe(200);
  });

  it("no-ops gracefully for an unknown event type", async () => {
    mockReceive.mockResolvedValueOnce({ event: "egress_started" });
    const res = await POST(postWebhook());
    expect(res.status).toBe(200);
  });
});
