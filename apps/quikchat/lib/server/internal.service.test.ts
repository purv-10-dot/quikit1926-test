import { db as prisma } from "@quikit/database";
import type { OrgActor } from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import { activitySummary, channelSummary, threadSummary } from "./internal.service";

let orgAId = "";
let orgBId = "";
let aliceId = "";
let bobId = "";
let channelId = "";
let globexChannelId = "";
let rootId = "";

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  orgBId = (await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  bobId = (await prisma.user.findUniqueOrThrow({ where: { email: "bob@acme.test" } })).id;
  globexChannelId = (
    await prisma.qcChannel.findFirstOrThrow({ where: { orgId: orgBId, name: "announcements" } })
  ).id;

  // acme channel with ONLY alice as member (bob is a same-org non-member).
  const channel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "group", visibility: "private", name: "internal-test" },
  });
  channelId = channel.id;
  await prisma.qcChannelMember.create({
    data: { orgId: orgAId, channelId, userId: aliceId, role: "admin" },
  });
  const root = await prisma.qcMessage.create({
    data: { orgId: orgAId, channelId, senderId: aliceId, content: "root message" },
  });
  rootId = root.id;
  await prisma.qcMessage.create({
    data: { orgId: orgAId, channelId, senderId: aliceId, content: "x".repeat(400) },
  });
  await prisma.qcMessage.create({
    data: {
      orgId: orgAId,
      channelId,
      senderId: aliceId,
      parentMessageId: rootId,
      content: "a reply",
    },
  });
});

afterAll(async () => {
  await prisma.qcMessage.deleteMany({ where: { channelId } });
  await prisma.qcChannelMember.deleteMany({ where: { channelId } });
  await prisma.qcChannel.deleteMany({ where: { id: channelId } });
  await prisma.$disconnect();
});

const human = (userId: string): OrgActor => ({ orgId: orgAId, actorType: "human", userId });
const agent = (over: Partial<OrgActor> = {}): OrgActor => ({
  orgId: orgAId,
  actorType: "ai_agent",
  agentId: "agent-1",
  agentRunId: "run-1",
  ...over,
});

describe("channelSummary", () => {
  it("returns the compact shape for a human member, with unreadForActor", async () => {
    const s = await channelSummary(human(aliceId), channelId);
    expect(s.channelId).toBe(channelId);
    expect(s.orgId).toBe(orgAId);
    expect(s.members.some((m) => m.id === aliceId)).toBe(true);
    expect(s.recentMessages.length).toBeGreaterThan(0);
    expect(s.recentMessages.length).toBeLessThanOrEqual(30);
    expect(typeof s.unreadForActor).toBe("number");
    // long message text is truncated
    const long = s.recentMessages.find((m) => m.text.endsWith("…"));
    expect(long?.text.length).toBeLessThanOrEqual(281);
  });

  it("rejects a same-org non-member human (403)", async () => {
    await expect(channelSummary(human(bobId), channelId)).rejects.toMatchObject({ status: 403 });
  });

  it("serves an agent in the same org and omits unreadForActor", async () => {
    const s = await channelSummary(agent(), channelId);
    expect(s.channelId).toBe(channelId);
    expect(s.unreadForActor).toBeUndefined();
  });

  it("tenant isolation: an org-A agent gets 404 on an org-B channel", async () => {
    await expect(channelSummary(agent(), globexChannelId)).rejects.toMatchObject({ status: 404 });
  });

  it("enforces channelScope when present (403 out of scope)", async () => {
    await expect(
      channelSummary(agent({ channelScope: ["some-other-channel"] }), channelId),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("threadSummary", () => {
  it("returns the root + its replies, compact", async () => {
    const t = await threadSummary(human(aliceId), rootId);
    expect(t.rootMessageId).toBe(rootId);
    expect(t.root.text).toBe("root message");
    expect(t.replies).toHaveLength(1);
    expect(t.replies[0]!.text).toBe("a reply");
  });
});

describe("activitySummary", () => {
  it("human gets channels with unreadCount", async () => {
    const a = await activitySummary(human(aliceId));
    const item = a.channels.find((c) => c.channelId === channelId);
    expect(item).toBeDefined();
    expect(typeof item!.unreadCount).toBe("number");
  });
  it("agent gets channels without unreadCount", async () => {
    const a = await activitySummary(agent());
    const item = a.channels.find((c) => c.channelId === channelId);
    expect(item).toBeDefined();
    expect(item!.unreadCount).toBeUndefined();
  });
});
