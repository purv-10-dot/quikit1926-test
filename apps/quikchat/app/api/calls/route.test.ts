import { db as prisma } from "@quikit/database";
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import { POST } from "./route";

// Keep NextAuth out
vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getRawSession } from "@/lib/session";

const mockSession = getRawSession as unknown as Mock;

let orgAId = "";
let aliceId = "";
let bobId = "";

const _ctx = () => ({ orgId: orgAId, userId: aliceId });

const postJson = (body: unknown) =>
  new Request("http://test.local/api/calls", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeAll(async () => {
  const org = await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } });
  orgAId = org.id;

  // Clean up any leftover calls from previous test runs
  await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } });
  await prisma.qcCall.deleteMany({ where: { orgId: orgAId } });

  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  bobId = (await prisma.user.findUniqueOrThrow({ where: { email: "bob@acme.test" } })).id;

  mockSession.mockResolvedValue({ userId: aliceId, orgId: orgAId });
});

afterAll(async () => {
  await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } }).catch(() => {});
  await prisma.qcCall.deleteMany({ where: { orgId: orgAId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("POST /api/calls", () => {
  it("creates a ringing call with participants (201)", async () => {
    const res = await POST(postJson({ type: "video", targetUserIds: [bobId] }));

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      status: string;
      type: string;
      participants: { userId: string }[];
    };
    expect(body.status).toBe("ringing");
    expect(body.type).toBe("video");
    expect(body.participants).toHaveLength(2);
    expect(body.participants.map((p) => p.userId)).toContain(aliceId);
    expect(body.participants.map((p) => p.userId)).toContain(bobId);
  });

  it("returns 400 when type is missing", async () => {
    const res = await POST(postJson({ targetUserIds: [bobId] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetUserIds is empty", async () => {
    const res = await POST(postJson({ type: "video", targetUserIds: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when type is invalid", async () => {
    const res = await POST(postJson({ type: "fax", targetUserIds: [bobId] }));
    expect(res.status).toBe(400);
  });

  it("enforces one-active-call-per-user (409)", async () => {
    // Create first call
    await POST(postJson({ type: "audio", targetUserIds: [bobId] }));

    // Try to create second call — should fail
    const res = await POST(postJson({ type: "audio", targetUserIds: [bobId] }));
    expect(res.status).toBe(409);
  });

  it("supports channelId and meetingId in input", async () => {
    // Clean up any existing calls first
    await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } });
    await prisma.qcCall.deleteMany({ where: { orgId: orgAId } });

    const channel = await prisma.qcChannel.findFirstOrThrow({
      where: { orgId: orgAId },
    });

    const res = await POST(
      postJson({
        type: "video",
        targetUserIds: [bobId],
        channelId: channel.id,
        meetingId: "meeting-123",
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { channelId: string; meetingId: string };
    expect(body.channelId).toBe(channel.id);
    expect(body.meetingId).toBe("meeting-123");
  });
});
