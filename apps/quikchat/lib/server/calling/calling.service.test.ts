import { db as prisma } from "@quikit/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as calling from "./calling.service";

// Keep NextAuth out
vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

let orgAId = "";
let aliceId = "";
let bobId = "";
let generalId = "";

const ctxA = () => ({ orgId: orgAId, userId: aliceId });
const ctxB = () => ({ orgId: orgAId, userId: bobId });

beforeAll(async () => {
  const org = await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } });
  orgAId = org.id;

  // Clean up any leftover calls / call summaries from previous test runs
  await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } });
  await prisma.qcCall.deleteMany({ where: { orgId: orgAId } });
  await prisma.qcMessage.deleteMany({ where: { orgId: orgAId, type: "Call" } });
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  bobId = (await prisma.user.findUniqueOrThrow({ where: { email: "bob@acme.test" } })).id;
  generalId = (
    await prisma.qcChannel.findFirstOrThrow({ where: { orgId: orgAId, name: "general" } })
  ).id;
});

afterAll(async () => {
  // Clean up calls created during tests
  await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } }).catch(() => {});
  await prisma.qcCall.deleteMany({ where: { orgId: orgAId } }).catch(() => {});
  await prisma.qcMessage.deleteMany({ where: { orgId: orgAId, type: "Call" } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up any calls / call summaries from previous test to enforce one-active-call-per-user
  if (orgAId) {
    await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } });
    await prisma.qcCall.deleteMany({ where: { orgId: orgAId } });
    await prisma.qcMessage.deleteMany({ where: { orgId: orgAId, type: "Call" } });
  }
});

describe("createCall", () => {
  it("creates a ringing call with participants", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "video",
      targetUserIds: [bobId],
    });

    expect(call.status).toBe("ringing");
    expect(call.type).toBe("video");
    expect(call.initiatorId).toBe(aliceId);
    expect(call.channelId).toBe(generalId);
    expect(call.participants).toHaveLength(2);
    expect(call.participants.map((p) => p.userId)).toContain(aliceId);
    expect(call.participants.map((p) => p.userId)).toContain(bobId);
  });

  it("rejects if user already has an active call", async () => {
    // Create first call
    await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    // Try to create second call — should fail
    await expect(
      calling.createCall(ctxA(), {
        channelId: generalId,
        type: "audio",
        targetUserIds: [bobId],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("cleans up test calls", async () => {
    // End any active calls from this test
    const activeCalls = await prisma.qcCall.findMany({
      where: { orgId: orgAId, status: { in: ["ringing", "active"] } },
    });
    for (const c of activeCalls) {
      await calling.endCall(ctxA(), c.id);
    }
  });
});

describe("acceptCall", () => {
  it("transitions ringing → active", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    const accepted = await calling.acceptCall(ctxB(), call.id);
    expect(accepted.status).toBe("active");
    expect(accepted.participants.find((p) => p.userId === bobId)?.state).toBe("connected");
  });

  it("records answeredAt when the call becomes active", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    expect(call.answeredAt).toBeNull();
    const accepted = await calling.acceptCall(ctxB(), call.id);
    expect(accepted.answeredAt).toBeTruthy();
  });

  it("rejects if user is not a participant", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    // Create a third user context (carol from orgB)
    const orgB = await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } });
    const carolId = (await prisma.user.findUniqueOrThrow({ where: { email: "carol@globex.test" } }))
      .id;
    const ctxCarol = { orgId: orgB.id, userId: carolId };

    await expect(calling.acceptCall(ctxCarol, call.id)).rejects.toMatchObject({ status: 404 });

    // Cleanup
    await calling.endCall(ctxA(), call.id);
  });

  it("rejects invalid transitions", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    // End the call first
    await calling.endCall(ctxA(), call.id);

    // Try to accept an ended call
    await expect(calling.acceptCall(ctxB(), call.id)).rejects.toMatchObject({ status: 400 });
  });
});

describe("rejectCall", () => {
  it("transitions ringing → rejected", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    const rejected = await calling.rejectCall(ctxB(), call.id);
    expect(rejected.status).toBe("rejected");
    expect(rejected.endedAt).toBeTruthy();
  });
});

describe("endCall", () => {
  it("transitions active → ended with duration", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "video",
      targetUserIds: [bobId],
    });

    await calling.acceptCall(ctxB(), call.id);

    const ended = await calling.endCall(ctxA(), call.id);
    expect(ended.status).toBe("ended");
    expect(ended.endedAt).toBeTruthy();
    expect(typeof ended.duration).toBe("number");
  });

  it("computes duration from answeredAt, ignoring ring time", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "video",
      targetUserIds: [bobId],
    });

    // Artificially age the call so startedAt is well before answeredAt.
    await prisma.qcCall.update({
      where: { id: call.id },
      data: { startedAt: new Date(Date.now() - 60_000) },
    });

    await calling.acceptCall(ctxB(), call.id);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const ended = await calling.endCall(ctxA(), call.id);

    // Duration should be tiny (just the active time), not ~60s including ring time.
    expect(ended.duration).toBeLessThan(5);
  });

  it("returns the existing call when ending an already-ended call (idempotent)", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    const first = await calling.endCall(ctxA(), call.id);
    expect(first.status).toBe("ended");

    // Second end — should be idempotent, not throw 400
    const second = await calling.endCall(ctxA(), call.id);
    expect(second.status).toBe("ended");
    expect(second.id).toBe(first.id);
  });
});

describe("getCall", () => {
  it("returns call details", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    const fetched = await calling.getCall(ctxA(), call.id);
    expect(fetched.id).toBe(call.id);
    expect(fetched.status).toBe("ringing");

    // Cleanup
    await calling.endCall(ctxA(), call.id);
  });

  it("rejects cross-org access", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    const orgB = await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } });
    const carolId = (await prisma.user.findUniqueOrThrow({ where: { email: "carol@globex.test" } }))
      .id;
    const ctxCarol = { orgId: orgB.id, userId: carolId };

    await expect(calling.getCall(ctxCarol, call.id)).rejects.toMatchObject({ status: 404 });

    // Cleanup
    await calling.endCall(ctxA(), call.id);
  });
});

describe("recordHeartbeat", () => {
  it("updates the participant's lastHeartbeatAt for an active call", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });
    await calling.acceptCall(ctxA(), call.id);

    await calling.recordHeartbeat(ctxA(), call.id);

    const participant = await prisma.qcCallParticipant.findUniqueOrThrow({
      where: { callId_userId: { callId: call.id, userId: aliceId } },
    });
    expect(participant.lastHeartbeatAt).toBeTruthy();
  });

  it("is a no-op for non-active calls (does not throw, does not set heartbeat)", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    // The client sends its first heartbeat on window mount, before the callee
    // accepts — so a heartbeat on a ringing call must be a harmless no-op, not a 400.
    const result = await calling.recordHeartbeat(ctxA(), call.id);
    expect(result.status).toBe("ringing");

    const participant = await prisma.qcCallParticipant.findUniqueOrThrow({
      where: { callId_userId: { callId: call.id, userId: aliceId } },
    });
    expect(participant.lastHeartbeatAt).toBeNull();
  });
});

describe("createCall group initialStatus", () => {
  it("creates an active call when initialStatus is active", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "video",
      targetUserIds: [bobId],
      initialStatus: "active",
    });

    expect(call.status).toBe("active");
    expect(call.answeredAt).toBeTruthy();
    expect(call.participants.every((p) => p.state === "connected")).toBe(true);
  });
});

describe("endCall idempotency", () => {
  it("returns existing ended call instead of throwing 400", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    // First end — transitions ringing → ended
    const first = await calling.endCall(ctxA(), call.id);
    expect(first.status).toBe("ended");

    // Second end — should be idempotent, not throw 400
    const second = await calling.endCall(ctxA(), call.id);
    expect(second.status).toBe("ended");
    expect(second.id).toBe(first.id);
  });

  it("endCall idempotent from either participant", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });
    await calling.acceptCall(ctxB(), call.id);

    // Alice ends
    await calling.endCall(ctxA(), call.id);

    // Bob also tries to end — should be idempotent
    const result = await calling.endCall(ctxB(), call.id);
    expect(result.status).toBe("ended");
  });
});

describe("rejectCall idempotency", () => {
  it("returns existing rejected call instead of throwing 400", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    await calling.rejectCall(ctxB(), call.id);
    // Second reject — should be idempotent
    const second = await calling.rejectCall(ctxB(), call.id);
    expect(second.status).toBe("rejected");
  });
});

describe("postCallSummary", () => {
  it("posts exactly one summary even when called twice", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });
    await calling.endCall(ctxA(), call.id);

    // First summary
    await calling.postCallSummary(ctxA(), call.id);
    // Second call should be idempotent (no duplicate message)
    await calling.postCallSummary(ctxA(), call.id);

    const summaries = await prisma.qcMessage.findMany({
      where: { channelId: generalId, type: "Call" },
    });
    expect(summaries).toHaveLength(1);
  });
});
