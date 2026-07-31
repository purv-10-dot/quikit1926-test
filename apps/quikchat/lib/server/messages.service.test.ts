import { db as prisma } from "@quikit/database";
import { __getPublishedForTest, __resetPublishedForTest, type OrgContext } from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import * as channels from "./channels.service";
import * as messages from "./messages.service";

let orgAId = "";
let aliceId = "";
let daveId = "";
let carolId = "";
let groupId = "";
let otherChannelId = "";
let daveOnlyChannelId = "";
const createdChannelIds = new Set<string>();

beforeAll(async () => {
  const orgA = await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } });
  orgAId = orgA.id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  carolId = (await prisma.user.findUniqueOrThrow({ where: { email: "carol@globex.test" } })).id;

  const dave = await prisma.user.upsert({
    where: { email: "dave2@acme.test" },
    update: { firstName: "dave2" },
    create: { email: "dave2@acme.test", firstName: "dave2", lastName: "" },
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

  const ctx: OrgContext = { userId: aliceId, orgId: orgAId };
  const group = await channels.create(ctx, {
    type: "group",
    visibility: "private",
    name: "msg-tests",
    memberIds: [daveId],
  });
  groupId = group.channelId;
  const other = await channels.create(ctx, {
    type: "group",
    visibility: "private",
    name: "msg-tests-other",
  });
  otherChannelId = other.channelId;
  // Channel alice is NOT a member of (only Dave).
  const daveOnly = await channels.create(
    { userId: daveId, orgId: orgAId },
    {
      type: "group",
      visibility: "private",
      name: "dave-only",
    },
  );
  daveOnlyChannelId = daveOnly.channelId;

  [groupId, otherChannelId, daveOnlyChannelId].forEach((id) => createdChannelIds.add(id));
});

afterAll(async () => {
  for (const id of createdChannelIds) {
    await prisma.qcMessage.deleteMany({ where: { channelId: id } });
    await prisma.qcInvite.deleteMany({ where: { channelId: id } });
    await prisma.qcChannelMember.deleteMany({ where: { channelId: id } });
    await prisma.qcChannel.deleteMany({ where: { id } });
  }
  await prisma.qcChannelMember.deleteMany({ where: { userId: daveId } });
  await prisma.userAppAccess.deleteMany({ where: { userId: daveId } });
  await prisma.orgMember.deleteMany({ where: { userId: daveId } });
  await prisma.user.deleteMany({ where: { id: daveId } });
  await prisma.$disconnect();
});

const ctxAlice = (): OrgContext => ({ userId: aliceId, orgId: orgAId });
const ctxDave = (): OrgContext => ({ userId: daveId, orgId: orgAId });

describe("validateMentions", () => {
  it("keeps valid member mentions, dedupes, and drops bad refs", async () => {
    const content = "hi @dave2 and @dave2 again"; // @dave2 at 3..9
    const result = await messages.validateMentions(ctxAlice(), groupId, content, [
      { userId: daveId, offsetStart: 3, offsetEnd: 9 }, // "@dave2" → kept
      { userId: daveId, offsetStart: 14, offsetEnd: 20 }, // duplicate userId → dropped
      { userId: carolId, offsetStart: 3, offsetEnd: 9 }, // non-member → dropped
      { userId: aliceId, offsetStart: 0, offsetEnd: 999 }, // out-of-bounds → dropped
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ userId: daveId, displayName: "dave2" });
  });

  it("honours @everyone only when the slice is literally @everyone", async () => {
    const ok = await messages.validateMentions(ctxAlice(), groupId, "yo @everyone", [
      { userId: "everyone", offsetStart: 3, offsetEnd: 12 },
    ]);
    expect(ok).toHaveLength(1);
    expect(ok[0]!.displayName).toBe("everyone");

    const notReally = await messages.validateMentions(ctxAlice(), groupId, "yo @everyon", [
      { userId: "everyone", offsetStart: 3, offsetEnd: 11 },
    ]);
    expect(notReally).toHaveLength(0);
  });
});

describe("send", () => {
  it("publishes exactly one 'message' fanout for the channel", async () => {
    __resetPublishedForTest();
    const msg = await messages.send(ctxAlice(), groupId, { content: "hello world" });
    const published = __getPublishedForTest();
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ orgId: orgAId, channelId: groupId, event: "message" });
    expect(msg.content).toBe("hello world");
  });

  it("rejects a parent message from a different channel (404)", async () => {
    const parent = await messages.send(ctxAlice(), otherChannelId, { content: "parent elsewhere" });
    await expect(
      messages.send(ctxAlice(), groupId, { content: "reply", parentMessageId: parent.id }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("toggleReaction", () => {
  it("adds, removes, and deletes the emoji key when the last user unreacts", async () => {
    const msg = await messages.send(ctxAlice(), groupId, { content: "react to me" });

    const r1 = await messages.toggleReaction(ctxAlice(), msg.id, "👍");
    expect(r1.added).toBe(true);
    expect(r1.message.reactions.find((x) => x.emoji === "👍")?.count).toBe(1);

    const r2 = await messages.toggleReaction(ctxAlice(), msg.id, "👍");
    expect(r2.added).toBe(false);
    expect(r2.message.reactions.find((x) => x.emoji === "👍")).toBeUndefined();

    const row = await prisma.qcMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(row.reactions).toEqual({});
  });
});

describe("edit + delete", () => {
  it("only the sender can edit, and editedAt is set", async () => {
    const msg = await messages.send(ctxAlice(), groupId, { content: "original" });
    await expect(messages.editMessage(ctxDave(), msg.id, "hacked")).rejects.toMatchObject({
      status: 403,
    });
    const edited = await messages.editMessage(ctxAlice(), msg.id, "updated");
    expect(edited.content).toBe("updated");
    expect(edited.editedAt).not.toBeNull();
  });

  // QC_007 — edits are only allowed inside EDIT_WINDOW_MS of posting.
  it("rejects an edit once the edit window has passed", async () => {
    const msg = await messages.send(ctxAlice(), groupId, { content: "old news" });
    await prisma.qcMessage.update({
      where: { id: msg.id },
      data: { createdAt: new Date(Date.now() - messages.EDIT_WINDOW_MS - 60_000) },
    });
    await expect(messages.editMessage(ctxAlice(), msg.id, "too late")).rejects.toMatchObject({
      status: 403,
    });
    const row = await prisma.qcMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(row.content).toBe("old news");
    expect(row.editedAt).toBeNull();
  });

  it("allows an edit just inside the edit window", async () => {
    const msg = await messages.send(ctxAlice(), groupId, { content: "still fresh" });
    await prisma.qcMessage.update({
      where: { id: msg.id },
      data: { createdAt: new Date(Date.now() - (messages.EDIT_WINDOW_MS - 60_000)) },
    });
    const edited = await messages.editMessage(ctxAlice(), msg.id, "updated in time");
    expect(edited.content).toBe("updated in time");
  });

  // The window is edit-only — a stale message is still deletable.
  it("does not apply the edit window to delete", async () => {
    const msg = await messages.send(ctxAlice(), groupId, { content: "delete me later" });
    await prisma.qcMessage.update({
      where: { id: msg.id },
      data: { createdAt: new Date(Date.now() - messages.EDIT_WINDOW_MS - 60_000) },
    });
    const del = await messages.deleteForEveryone(ctxAlice(), msg.id);
    expect(del.type).toBe("Delete");
  });

  it("deleteForEveryone tombstones the message", async () => {
    const msg = await messages.send(ctxAlice(), groupId, { content: "delete me" });
    const del = await messages.deleteForEveryone(ctxAlice(), msg.id);
    expect(del.type).toBe("Delete");
    expect(del.content).toBe("");
    expect(del.reactions).toEqual([]);
    expect(del.data).toBeNull();
  });
});

describe("forward", () => {
  it("delivers only to channels the caller belongs to and stamps forwardedFrom", async () => {
    const src = await messages.send(ctxAlice(), groupId, { content: "forward this" });
    // alice is a member of otherChannelId but NOT daveOnlyChannelId.
    const res = await messages.forward(ctxAlice(), src.id, [otherChannelId, daveOnlyChannelId]);
    expect(res.delivered).toEqual([otherChannelId]);

    const copy = await prisma.qcMessage.findFirstOrThrow({
      where: { channelId: otherChannelId, content: "forward this" },
    });
    expect((copy.data as Record<string, unknown>).forwardedFrom).toMatchObject({
      channelId: groupId,
    });
  });

  it("forwardedFrom captures the ORIGINAL author + source channel (Bug 7)", async () => {
    // Dave authors in the group; Alice forwards it into another channel.
    const src = await messages.send(ctxDave(), groupId, { content: "daves words" });
    await messages.forward(ctxAlice(), src.id, [otherChannelId]);
    const copy = await prisma.qcMessage.findFirstOrThrow({
      where: { channelId: otherChannelId, content: "daves words" },
    });
    const fwd = (copy.data as Record<string, unknown>).forwardedFrom as {
      senderId: string;
      senderName: string;
      sourceChannelName: string | null;
    };
    expect(fwd.senderId).toBe(daveId); // the original author, not the forwarder (alice)
    expect(fwd.senderName).toBe("dave2");
    expect(fwd.sourceChannelName).toBe("msg-tests");
  });
});

describe("pinned", () => {
  it("setPinned then listPinned returns the pinned message", async () => {
    const msg = await messages.send(ctxAlice(), groupId, { content: "pin me" });
    await messages.setPinned(ctxAlice(), msg.id, true);
    const pinned = await messages.listPinned(ctxAlice(), groupId);
    expect(pinned.some((m) => m.id === msg.id && m.isPinned)).toBe(true);
  });
});
