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

import { getRawSession } from "@/lib/session";

const mockSession = getRawSession as unknown as Mock;

let orgAId = "";
let aliceId = "";
let bobId = "";
let groupChannelId = "";

const postJson = (body: unknown) =>
  new Request("http://test.local/api/calls/group", {
    method: "POST",
    body: JSON.stringify(body),
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
      name: "group-call-tests",
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
  // Delete members before the channel because the relation lacks onDelete cascade.
  await prisma.qcChannelMember
    .deleteMany({ where: { channel: { orgId: orgAId, name: "group-call-tests" } } })
    .catch(() => {});
  await prisma.qcChannel
    .deleteMany({ where: { orgId: orgAId, name: "group-call-tests" } })
    .catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  if (orgAId) {
    await prisma.qcCallParticipant.deleteMany({ where: { call: { orgId: orgAId } } });
    await prisma.qcCall.deleteMany({ where: { orgId: orgAId } });
  }
  vi.clearAllMocks();
});

describe("POST /api/calls/group", () => {
  it("creates an active group call and returns a room id (no tokens)", async () => {
    const res = await POST(postJson({ channelId: groupChannelId, type: "video" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      call: { id: string; status: string; participants: { userId: string; state: string }[] };
      roomId: string;
    };

    expect(body.call.status).toBe("active");
    expect(body.call.participants).toHaveLength(2);
    expect(body.call.participants.every((p) => p.state === "connected")).toBe(true);
    // Room id is per-call, not per-channel — a second call in the same channel
    // must not reuse the first call's room.
    expect(body.roomId).toBe(`call-${body.call.id}`);
    // No participant tokens in this response — each participant mints its own
    // via POST /api/calls/:id/token (CALL-3 hardening).
    expect(body).not.toHaveProperty("sfu");
  });

  it("returns 400 when channelId is missing", async () => {
    const res = await POST(postJson({ type: "video" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when type is invalid", async () => {
    const res = await POST(postJson({ channelId: groupChannelId, type: "fax" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-members", async () => {
    const orgB = await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } });
    const carolId = (await prisma.user.findUniqueOrThrow({ where: { email: "carol@globex.test" } }))
      .id;
    mockSession.mockResolvedValueOnce({ userId: carolId, orgId: orgB.id });

    const res = await POST(postJson({ channelId: groupChannelId, type: "video" }));
    expect(res.status).toBe(403);
  });
});
