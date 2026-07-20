import { db as prisma } from "@quikit/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as calling from "./calling.service";
import {
  runCallTimeoutSweep,
  RINGING_TIMEOUT_MS,
  ACTIVE_HEARTBEAT_TIMEOUT_MS,
  ACTIVE_HEARTBEAT_GRACE_MS,
} from "./timeout-sweep";

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

beforeAll(async () => {
  const org = await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } });
  orgAId = org.id;
  await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } });
  await prisma.qcCall.deleteMany({ where: { orgId: orgAId } });
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  bobId = (await prisma.user.findUniqueOrThrow({ where: { email: "bob@acme.test" } })).id;
  generalId = (
    await prisma.qcChannel.findFirstOrThrow({ where: { orgId: orgAId, name: "general" } })
  ).id;
});

afterAll(async () => {
  await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } }).catch(() => {});
  await prisma.qcCall.deleteMany({ where: { orgId: orgAId } }).catch(() => {});
  await prisma.qcMessage.deleteMany({ where: { orgId: orgAId, type: "Call" } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  if (orgAId) {
    await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } });
    await prisma.qcCall.deleteMany({ where: { orgId: orgAId } });
    await prisma.qcMessage.deleteMany({ where: { orgId: orgAId, type: "Call" } });
  }
});

describe("runCallTimeoutSweep", () => {
  it("marks stale ringing calls as missed and posts a summary", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    // Age the call so the sweep considers it stale.
    await prisma.qcCall.update({
      where: { id: call.id },
      data: { startedAt: new Date(Date.now() - RINGING_TIMEOUT_MS - 1_000) },
    });

    await runCallTimeoutSweep();

    const updated = await prisma.qcCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(updated.status).toBe("missed");

    const summary = await prisma.qcMessage.findFirst({
      where: { channelId: generalId, type: "Call" },
    });
    expect(summary).toBeTruthy();
  });

  it("does not touch fresh ringing calls", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
    });

    await runCallTimeoutSweep();

    const updated = await prisma.qcCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(updated.status).toBe("ringing");
  });

  it("ends active calls whose heartbeats have gone stale", async () => {
    const call = await calling.createCall(ctxA(), {
      channelId: generalId,
      type: "audio",
      targetUserIds: [bobId],
      initialStatus: "active",
    });

    const now = Date.now();
    // Age the call past the grace period and age the heartbeat past the timeout.
    await prisma.qcCall.update({
      where: { id: call.id },
      data: {
        answeredAt: new Date(now - ACTIVE_HEARTBEAT_GRACE_MS - 1_000),
      },
    });
    await prisma.qcCallParticipant.updateMany({
      where: { callId: call.id },
      data: { lastHeartbeatAt: new Date(now - ACTIVE_HEARTBEAT_TIMEOUT_MS - 1_000) },
    });

    await runCallTimeoutSweep();

    const updated = await prisma.qcCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(updated.status).toBe("ended");

    const summary = await prisma.qcMessage.findFirst({
      where: { channelId: generalId, type: "Call" },
    });
    expect(summary).toBeTruthy();
  });
});
