import { db as prisma, Prisma } from "@quikit/database";
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getRawSession } from "@/lib/session";
import { GET } from "./route";

const mockSession = getRawSession as unknown as Mock;

let orgAId = "";
let aliceId = "";
let aiChannelId = ""; // alice is a member
let nonMemberChannelId = ""; // same org, alice NOT a member
let otherChannelId = ""; // same org, holds a marked doc that must not leak

const createdChannelIds: string[] = [];

const get = (id: string) => new Request(`http://test.local/api/channels/${id}/kb-docs`);

// A Media doc's storageKey (= objectPath = sourceFileId), scoped per channel.
const keyFor = (channelId: string, name: string) => `quikchat/${orgAId}/${channelId}/uuid-${name}`;

// Mirror messages.service.send()'s create field set (senderId + reactions:{} +
// type/content/data) — the fixtures are direct inserts, not hand-minimized.
async function seedMessage(
  channelId: string,
  type: "Media" | "Text",
  data: Record<string, unknown>,
) {
  await prisma.qcMessage.create({
    data: {
      orgId: orgAId,
      channelId,
      senderId: aliceId,
      type,
      content: "",
      data: data as Prisma.InputJsonValue,
      reactions: {},
    },
  });
}

// Marked keys in alice's channel — exactly these two must come back.
let keyA = "";
let keyB = "";
// A marked Media doc in another channel of the same org — must NOT leak.
let keyOther = "";

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;

  const aiChannel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "ai", visibility: "private", name: null },
  });
  aiChannelId = aiChannel.id;
  createdChannelIds.push(aiChannelId);
  await prisma.qcChannelMember.create({
    data: { orgId: orgAId, channelId: aiChannelId, userId: aliceId, role: "admin" },
  });

  const nonMemberChannel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "ai", visibility: "private", name: null },
  });
  nonMemberChannelId = nonMemberChannel.id;
  createdChannelIds.push(nonMemberChannelId);
  // Intentionally NO QcChannelMember row for alice on this channel.

  const otherChannel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "ai", visibility: "private", name: null },
  });
  otherChannelId = otherChannel.id;
  createdChannelIds.push(otherChannelId);

  keyA = keyFor(aiChannelId, "a.pdf");
  keyB = keyFor(aiChannelId, "b.pdf");
  keyOther = keyFor(otherChannelId, "other.pdf");

  // Alice's channel: two marked Media (returned), one un-marked Media (excluded),
  // one MARKED non-Media (excluded — proves the type:"Media" filter).
  await seedMessage(aiChannelId, "Media", { objectPath: keyA, kbIngested: true });
  await seedMessage(aiChannelId, "Media", { objectPath: keyB, kbIngested: true });
  await seedMessage(aiChannelId, "Media", { objectPath: keyFor(aiChannelId, "c.pdf") });
  await seedMessage(aiChannelId, "Text", {
    objectPath: keyFor(aiChannelId, "d.pdf"),
    kbIngested: true,
  });

  // Another channel in the same org with a marked doc — the isolation guard.
  await seedMessage(otherChannelId, "Media", { objectPath: keyOther, kbIngested: true });

  mockSession.mockResolvedValue({ userId: aliceId, orgId: orgAId });
});

afterAll(async () => {
  await prisma.qcMessage.deleteMany({ where: { channelId: { in: createdChannelIds } } });
  await prisma.qcChannelMember.deleteMany({ where: { channelId: { in: createdChannelIds } } });
  await prisma.qcChannel.deleteMany({ where: { id: { in: createdChannelIds } } });
  await prisma.$disconnect();
});

describe("GET /api/channels/[id]/kb-docs", () => {
  it("401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(get(aiChannelId), { params: { id: aiChannelId } });
    expect(res.status).toBe(401);
  });

  it("403 when the caller is not a member of the channel", async () => {
    const res = await GET(get(nonMemberChannelId), { params: { id: nonMemberChannelId } });
    expect(res.status).toBe(403);
  });

  it("returns exactly the channel's marked Media sourceFileIds (excludes un-marked + non-Media)", async () => {
    const res = await GET(get(aiChannelId), { params: { id: aiChannelId } });
    expect(res.status).toBe(200);
    const { sourceFileIds } = (await res.json()) as { sourceFileIds: string[] };
    // Order-insensitive: the two marked Media docs, and nothing else.
    expect(sourceFileIds).toHaveLength(2);
    expect(sourceFileIds).toEqual(expect.arrayContaining([keyA, keyB]));
    expect(sourceFileIds).not.toContain(keyFor(aiChannelId, "c.pdf")); // un-marked
    expect(sourceFileIds).not.toContain(keyFor(aiChannelId, "d.pdf")); // non-Media
  });

  it("does not leak a marked doc from another channel in the same org (isolation)", async () => {
    const res = await GET(get(aiChannelId), { params: { id: aiChannelId } });
    expect(res.status).toBe(200);
    const { sourceFileIds } = (await res.json()) as { sourceFileIds: string[] };
    expect(sourceFileIds).not.toContain(keyOther);
  });
});
