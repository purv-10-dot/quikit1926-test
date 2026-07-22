import { db as prisma } from "@quikit/database";
import type { OrgContext } from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import { acceptInvite } from "./channels.service";

let orgAId = "";
let aliceId = "";
let bobId = "";
let channelId = "";
const code = "bug6-accept-code";

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  bobId = (await prisma.user.findUniqueOrThrow({ where: { email: "bob@acme.test" } })).id;
  const channel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "group", visibility: "private", name: "invite-bug6" },
  });
  channelId = channel.id;
  await prisma.qcChannelMember.create({
    data: { orgId: orgAId, channelId, userId: aliceId, role: "admin" },
  });
  await prisma.qcInvite.create({ data: { orgId: orgAId, channelId, code, createdById: aliceId } });
});

afterAll(async () => {
  await prisma.qcMessage.deleteMany({ where: { channelId } });
  await prisma.qcInvite.deleteMany({ where: { channelId } });
  await prisma.qcChannelMember.deleteMany({ where: { channelId } });
  await prisma.qcChannel.deleteMany({ where: { id: channelId } });
  await prisma.$disconnect();
});

describe("acceptInvite binds to the session user (Bug 6)", () => {
  it("adds the ctx user (whoever is logged in), not a hardcoded user", async () => {
    const ctxBob: OrgContext = { userId: bobId, orgId: orgAId };
    await acceptInvite(ctxBob, code);
    const member = await prisma.qcChannelMember.findUnique({
      where: { orgId_channelId_userId: { orgId: orgAId, channelId, userId: bobId } },
    });
    expect(member).not.toBeNull();
    expect(member!.userId).toBe(bobId);
    // Only the inviter (alice) + the accepter (bob) are members — nobody else.
    const members = await prisma.qcChannelMember.findMany({ where: { channelId } });
    expect(members.map((m) => m.userId).sort()).toEqual([aliceId, bobId].sort());
  });
});
