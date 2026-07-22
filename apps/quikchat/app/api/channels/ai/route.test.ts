import { db as prisma } from "@quikit/database";
import { ASSISTANT_BOT_USER_ID } from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";

// Drive the session directly; keep NextAuth out of the test.
vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getRawSession } from "@/lib/session";
import { POST as openAiChat } from "./route";

const mockSession = getRawSession as unknown as Mock;

let aliceId = "";
let orgAId = "";
const createdChannelIds = new Set<string>();

const post = () =>
  new Request("http://test.local/api/channels/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });

beforeAll(async () => {
  const orgA = await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } });
  orgAId = orgA.id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
});

afterAll(async () => {
  for (const id of createdChannelIds) {
    await prisma.qcMessage.deleteMany({ where: { channelId: id } });
    await prisma.qcChannelMember.deleteMany({ where: { channelId: id } });
    await prisma.qcChannel.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

describe("POST /api/channels/ai", () => {
  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await openAiChat(post());
    expect(res.status).toBe(401);
  });

  it("opens a private AI-chat singleton (caller + bot) and is idempotent", async () => {
    mockSession.mockResolvedValue({ userId: aliceId, orgId: orgAId });

    const res1 = await openAiChat(post());
    expect(res1.status).toBe(200);
    const a = (await res1.json()) as {
      channelId: string;
      type: string;
      visibility: string;
      name: string | null;
      members: { id: string }[];
    };
    createdChannelIds.add(a.channelId);
    expect(a.type).toBe("ai");
    expect(a.visibility).toBe("private");
    expect(a.name).toBe("AI Chat");
    expect(a.members.map((m) => m.id)).toEqual(
      expect.arrayContaining([aliceId, ASSISTANT_BOT_USER_ID]),
    );

    // Second open reuses the same conversation (no duplicate).
    const res2 = await openAiChat(post());
    const b = (await res2.json()) as { channelId: string };
    createdChannelIds.add(b.channelId);
    expect(b.channelId).toBe(a.channelId);
  });
});
