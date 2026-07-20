import { db as prisma } from "@quikit/database";
import { __getPublishedForTest, __resetPublishedForTest, type OrgContext } from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import { markRead } from "./channels.service";

let orgAId = "";
let aliceId = "";
let channelId = "";

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  const channel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "group", visibility: "private", name: "read-event-test" },
  });
  channelId = channel.id;
  await prisma.qcChannelMember.create({
    data: { orgId: orgAId, channelId, userId: aliceId, role: "admin" },
  });
});

afterAll(async () => {
  await prisma.qcChannelMember.deleteMany({ where: { channelId } });
  await prisma.qcChannel.deleteMany({ where: { id: channelId } });
  await prisma.$disconnect();
});

describe("markRead publishes a read event", () => {
  it("fires `read` with { channelId, userId, readAt }", async () => {
    const ctx: OrgContext = { userId: aliceId, orgId: orgAId };
    __resetPublishedForTest();
    await markRead(ctx, channelId);
    const read = __getPublishedForTest().find((e) => e.event === "read");
    expect(read).toBeDefined();
    expect(read!.orgId).toBe(orgAId);
    expect(read!.channelId).toBe(channelId);
    const payload = read!.payload as { channelId: string; userId: string; readAt: string };
    expect(payload).toMatchObject({ channelId, userId: aliceId });
    expect(typeof payload.readAt).toBe("string");
  });
});
