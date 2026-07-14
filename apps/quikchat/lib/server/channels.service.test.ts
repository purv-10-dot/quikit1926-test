import { db as prisma } from "@quikit/database";
import { ASSISTANT_BOT_USER_ID, type OrgContext } from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Keep NextAuth out of the test (assertMembership / orgAuth stay real).
vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import * as channels from "./channels.service";
import { ensureAssistantBot } from "./assistant.service";

let orgAId = "";
let orgBId = "";
let aliceId = "";
let daveId = "";
const createdChannelIds = new Set<string>();

function track<T extends { channelId: string }>(item: T): T {
  createdChannelIds.add(item.channelId);
  return item;
}

beforeAll(async () => {
  const orgA = await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } });
  const orgB = await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } });
  const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } });
  orgAId = orgA.id;
  orgBId = orgB.id;
  aliceId = alice.id;

  // A throwaway user in org A so DM/forward fixtures don't touch seed data.
  const dave = await prisma.user.upsert({
    where: { email: "dave@acme.test" },
    update: { firstName: "dave" },
    create: { email: "dave@acme.test", firstName: "dave", lastName: "" },
  });
  daveId = dave.id;
  await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId: orgAId, userId: daveId } },
    update: { status: "active" },
    create: { orgId: orgAId, userId: daveId, role: "member", status: "active" },
  });
  await prisma.userAppAccess.upsert({
    where: { userId_orgId_appId: { userId: daveId, orgId: orgAId, appId: "quikchat" } },
    update: {},
    create: { userId: daveId, orgId: orgAId, appId: "quikchat" },
  });
});

afterAll(async () => {
  for (const id of createdChannelIds) {
    await prisma.qcMessage.deleteMany({ where: { channelId: id } });
    await prisma.qcInvite.deleteMany({ where: { channelId: id } });
    await prisma.qcChannelMember.deleteMany({ where: { channelId: id } });
    await prisma.qcChannel.deleteMany({ where: { id } });
  }
  // Remove the throwaway user's footprint.
  await prisma.qcChannelMember.deleteMany({ where: { userId: daveId } });
  await prisma.userAppAccess.deleteMany({ where: { userId: daveId } });
  await prisma.orgMember.deleteMany({ where: { userId: daveId } });
  await prisma.user.deleteMany({ where: { id: daveId } });
  await prisma.$disconnect();
});

const ctxAlice = (): OrgContext => ({ userId: aliceId, orgId: orgAId });
const ctxDave = (): OrgContext => ({ userId: daveId, orgId: orgAId });
const ctxCarol = async (): Promise<OrgContext> => {
  const carol = await prisma.user.findUniqueOrThrow({ where: { email: "carol@globex.test" } });
  return { userId: carol.id, orgId: orgBId };
};

describe("channels.create", () => {
  it("DM is idempotent — same two users return the same channel", async () => {
    const dm1 = track(await channels.create(ctxAlice(), { type: "dm", memberIds: [daveId] }));
    const dm2 = track(await channels.create(ctxAlice(), { type: "dm", memberIds: [daveId] }));
    expect(dm1.channelId).toBe(dm2.channelId);
    expect(dm1.type).toBe("dm");
  });

  it("public group requires a name", async () => {
    await expect(
      channels.create(ctxAlice(), { type: "group", visibility: "public" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("DM cannot be public", async () => {
    await expect(
      channels.create(ctxAlice(), { type: "dm", visibility: "public", memberIds: [daveId] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("DM name resolves to the other human, not the assistant bot", async () => {
    const dm = track(await channels.create(ctxAlice(), { type: "dm", memberIds: [daveId] }));
    // Simulate `/ai` in the DM: ensureAssistantBot adds the bot as a real member,
    // making this a 3-member channel. The name must still resolve to the human.
    await ensureAssistantBot(orgAId, dm.channelId);

    const item = await channels.findById(ctxAlice(), dm.channelId);
    expect(item.members.map((m) => m.id)).toContain(ASSISTANT_BOT_USER_ID);
    expect(item.name).toBe("dave");
  });
});

describe("discover + join", () => {
  it("lists public groups in-org with isMember and lets a non-member join", async () => {
    const group = track(
      await channels.create(ctxAlice(), {
        type: "group",
        visibility: "public",
        name: "watercooler",
      }),
    );
    const found = await channels.discover(ctxDave(), "watercooler");
    const row = found.find((c) => c.channelId === group.channelId);
    expect(row).toBeDefined();
    expect(row!.isMember).toBe(false);

    await channels.join(ctxDave(), group.channelId);
    const detail = await channels.findById(ctxDave(), group.channelId);
    expect(detail.members.some((m) => m.id === daveId)).toBe(true);
    // join posts a SystemActivity message
    const sys = await prisma.qcMessage.findFirst({
      where: { channelId: group.channelId, type: "SystemActivity" },
    });
    expect(sys).not.toBeNull();
  });
});

describe("member rules", () => {
  it("blocks demoting the last admin", async () => {
    const group = track(
      await channels.create(ctxAlice(), {
        type: "group",
        visibility: "private",
        name: "solo-admin",
        memberIds: [daveId],
      }),
    );
    await expect(
      channels.updateMemberRole(ctxAlice(), group.channelId, aliceId, "member"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("last member leaving deletes the channel and its messages", async () => {
    const group = track(
      await channels.create(ctxAlice(), {
        type: "group",
        visibility: "private",
        name: "ghost-town",
      }),
    );
    await prisma.qcMessage.create({
      data: {
        orgId: orgAId,
        channelId: group.channelId,
        senderId: aliceId,
        content: "anyone here?",
      },
    });
    const res = await channels.leave(ctxAlice(), group.channelId);
    expect(res.deleted).toBe(true);
    expect(await prisma.qcChannel.count({ where: { id: group.channelId } })).toBe(0);
    expect(await prisma.qcMessage.count({ where: { channelId: group.channelId } })).toBe(0);
  });
});

describe("unread + memberReadAt", () => {
  it("computes unread against lastReadAt and excludes self from memberReadAt", async () => {
    const group = track(
      await channels.create(ctxAlice(), {
        type: "group",
        visibility: "private",
        name: "unread-test",
        memberIds: [daveId],
      }),
    );
    // Alice sends two messages; Dave has read none yet.
    await prisma.qcMessage.create({
      data: { orgId: orgAId, channelId: group.channelId, senderId: aliceId, content: "one" },
    });
    await prisma.qcMessage.create({
      data: { orgId: orgAId, channelId: group.channelId, senderId: aliceId, content: "two" },
    });

    const daveList = await channels.listForUser(ctxDave());
    const daveItem = [...daveList.priority, ...daveList.recent].find(
      (c) => c.channelId === group.channelId,
    );
    expect(daveItem!.unreadCount).toBe(2);
    // memberReadAt excludes Dave (self), includes Alice.
    expect(daveItem!.memberReadAt[daveId]).toBeUndefined();
    expect(aliceId in daveItem!.memberReadAt).toBe(true);

    await channels.markRead(ctxDave(), group.channelId);
    const after = await channels.listForUser(ctxDave());
    const afterItem = [...after.priority, ...after.recent].find(
      (c) => c.channelId === group.channelId,
    );
    expect(afterItem!.unreadCount).toBe(0);
  });
});

describe("invites", () => {
  it("accept adds a member and burns a use only once (re-accept is a no-op)", async () => {
    const group = track(
      await channels.create(ctxAlice(), {
        type: "group",
        visibility: "public",
        name: "invite-club",
      }),
    );
    const invite = await channels.createInvite(ctxAlice(), group.channelId, { maxUses: 5 });

    await channels.acceptInvite(ctxDave(), invite.code);
    let row = await prisma.qcInvite.findUniqueOrThrow({ where: { code: invite.code } });
    expect(row.useCount).toBe(1);

    // Re-accept by an existing member must not burn another use.
    await channels.acceptInvite(ctxDave(), invite.code);
    row = await prisma.qcInvite.findUniqueOrThrow({ where: { code: invite.code } });
    expect(row.useCount).toBe(1);
  });

  it("rejects revoked / expired / maxed invites", async () => {
    const group = track(
      await channels.create(ctxAlice(), {
        type: "group",
        visibility: "public",
        name: "bad-invites",
      }),
    );

    const revoked = await channels.createInvite(ctxAlice(), group.channelId, {});
    await channels.revokeInvite(ctxAlice(), group.channelId, revoked.id);
    await expect(channels.acceptInvite(ctxDave(), revoked.code)).rejects.toMatchObject({
      status: 410,
    });

    const expired = await channels.createInvite(ctxAlice(), group.channelId, {});
    await prisma.qcInvite.update({
      where: { code: expired.code },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(channels.acceptInvite(ctxDave(), expired.code)).rejects.toMatchObject({
      status: 410,
    });

    const maxed = await channels.createInvite(ctxAlice(), group.channelId, { maxUses: 1 });
    await prisma.qcInvite.update({ where: { code: maxed.code }, data: { useCount: 1 } });
    await expect(channels.acceptInvite(ctxDave(), maxed.code)).rejects.toMatchObject({
      status: 410,
    });
  });

  it("cross-org accept is blocked (404, no existence leak)", async () => {
    const group = track(
      await channels.create(ctxAlice(), {
        type: "group",
        visibility: "public",
        name: "acme-only-invite",
      }),
    );
    const invite = await channels.createInvite(ctxAlice(), group.channelId, {});
    const carol = await ctxCarol();
    await expect(channels.acceptInvite(carol, invite.code)).rejects.toMatchObject({ status: 404 });
  });
});
