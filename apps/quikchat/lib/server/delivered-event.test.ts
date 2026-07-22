import { db as prisma } from "@quikit/database";
import { __getPublishedForTest, __resetPublishedForTest, type OrgContext } from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import { markDelivered } from "./channels.service";

let orgAId = "";
let aliceId = "";
let channelId = "";

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  const channel = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "group", visibility: "private", name: "delivered-event-test" },
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

const ctx = (): OrgContext => ({ userId: aliceId, orgId: orgAId });

describe("markDelivered (S14a)", () => {
  it("advances lastDeliveredAt and publishes a `delivered` event", async () => {
    __resetPublishedForTest();
    const at = "2026-05-08T12:00:00.000Z";
    await markDelivered(ctx(), channelId, at);
    const member = await prisma.qcChannelMember.findFirstOrThrow({
      where: { channelId, userId: aliceId },
    });
    expect(member.lastDeliveredAt?.toISOString()).toBe(at);
    const evt = __getPublishedForTest().find((e) => e.event === "delivered");
    expect(evt).toBeDefined();
    expect(evt!.payload).toMatchObject({ channelId, userId: aliceId, deliveredAt: at });
  });

  it("is monotonic — an older timestamp neither writes nor publishes", async () => {
    // current watermark is 12:00 from the previous test
    __resetPublishedForTest();
    const older = "2026-05-08T11:00:00.000Z";
    const res = await markDelivered(ctx(), channelId, older);
    expect(res.deliveredAt).toBe("2026-05-08T12:00:00.000Z"); // unchanged
    const member = await prisma.qcChannelMember.findFirstOrThrow({
      where: { channelId, userId: aliceId },
    });
    expect(member.lastDeliveredAt?.toISOString()).toBe("2026-05-08T12:00:00.000Z");
    expect(__getPublishedForTest().some((e) => e.event === "delivered")).toBe(false);
  });

  it("advances forward and re-publishes", async () => {
    __resetPublishedForTest();
    const newer = "2026-05-08T13:00:00.000Z";
    await markDelivered(ctx(), channelId, newer);
    const member = await prisma.qcChannelMember.findFirstOrThrow({
      where: { channelId, userId: aliceId },
    });
    expect(member.lastDeliveredAt?.toISOString()).toBe(newer);
    expect(__getPublishedForTest().some((e) => e.event === "delivered")).toBe(true);
  });
});
