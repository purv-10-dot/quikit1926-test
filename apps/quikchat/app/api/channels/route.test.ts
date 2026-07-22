import { db as prisma } from "@quikit/database";
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";

// Drive the session directly; keep NextAuth out of the test.
vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getRawSession } from "@/lib/session";
import { GET as listChannels } from "./route";
import { GET as getChannel } from "./[id]/route";
import { GET as listMessages, POST as postMessage } from "./[id]/messages/route";

const mockSession = getRawSession as unknown as Mock;

let aliceId = "";
let orgAId = "";
let globexChannelId = "";
let globexMessageId = "";

const get = (path = "http://test.local/api/channels") => new Request(path);
const postJson = (body: unknown) =>
  new Request("http://test.local/api/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeAll(async () => {
  const orgA = await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } });
  orgAId = orgA.id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;

  const orgB = await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } });
  const globexChannel = await prisma.qcChannel.findFirstOrThrow({
    where: { orgId: orgB.id, name: "announcements" },
  });
  globexChannelId = globexChannel.id;
  const globexMsg = await prisma.qcMessage.findFirstOrThrow({
    where: { channelId: globexChannelId },
  });
  globexMessageId = globexMsg.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/channels (auth boundary)", () => {
  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await listChannels(get());
    expect(res.status).toBe(401);
  });

  it("200 with the typed { priority, recent } shape for an org member", async () => {
    mockSession.mockResolvedValue({ userId: aliceId, orgId: orgAId });
    const res = await listChannels(get());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { priority: unknown[]; recent: unknown[] };
    expect(Array.isArray(body.priority)).toBe(true);
    expect(Array.isArray(body.recent)).toBe(true);
  });
});

describe("tenant isolation — acme session vs globex data", () => {
  beforeAll(() => {
    mockSession.mockResolvedValue({ userId: aliceId, orgId: orgAId });
  });

  it("cannot read a globex channel by id (404)", async () => {
    const res = await getChannel(get(), { params: { id: globexChannelId } });
    expect(res.status).toBe(404);
  });

  it("cannot list a globex channel's messages (403)", async () => {
    const res = await listMessages(get(), { params: { id: globexChannelId } });
    expect(res.status).toBe(403);
  });

  it("cannot post a message into a globex channel (403)", async () => {
    const res = await postMessage(postJson({ content: "intruder" }), {
      params: { id: globexChannelId },
    });
    expect(res.status).toBe(403);
    // Nothing was written into the globex channel.
    const count = await prisma.qcMessage.count({
      where: { channelId: globexChannelId, content: "intruder" },
    });
    expect(count).toBe(0);
  });

  it("globex message remains unreadable / untouched", async () => {
    const row = await prisma.qcMessage.findUniqueOrThrow({ where: { id: globexMessageId } });
    expect(row.content).toBe("Globex only.");
  });
});
