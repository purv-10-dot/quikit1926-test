import { randomUUID } from "node:crypto";
import { db as prisma } from "@quikit/database";
import {
  __getPublishedForTest,
  __resetPublishedForTest,
  type Mention,
  type OrgContext,
} from "@/lib/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import * as notifications from "./notifications.service";
import {
  isInDndWindow,
  makePreview,
  matchKeyword,
  type DeliverableMessage,
} from "./notifications.service";

let orgAId = "";
let orgBId = "";
let carolId = "";
// Dedicated org-A users so settings/keywords stay isolated from other suites.
let senderId = "";
let alphaId = ""; // gets mentions
let betaId = ""; // gets keywords
let grpId = "";
let dmId = "";

const APP_ID = "quikchat";

async function makeUser(email: string, username: string, orgId: string): Promise<string> {
  const u = await prisma.user.upsert({
    where: { email },
    update: { firstName: username },
    create: { email, firstName: username, lastName: "" },
  });
  await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId, userId: u.id } },
    update: { status: "active" },
    create: { orgId, userId: u.id, role: "member", status: "active" },
  });
  await prisma.userAppAccess.upsert({
    where: { userId_orgId_appId: { userId: u.id, orgId, appId: APP_ID } },
    update: {},
    create: { userId: u.id, orgId, appId: APP_ID },
  });
  return u.id;
}

const testUserIds: string[] = [];

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  orgBId = (await prisma.org.findUniqueOrThrow({ where: { slug: "globex" } })).id;
  carolId = (await prisma.user.findUniqueOrThrow({ where: { email: "carol@globex.test" } })).id;

  senderId = await makeUser("notif-sender@acme.test", "notifsender", orgAId);
  alphaId = await makeUser("notif-alpha@acme.test", "notifalpha", orgAId);
  betaId = await makeUser("notif-beta@acme.test", "notifbeta", orgAId);
  testUserIds.push(senderId, alphaId, betaId);

  const grp = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "group", visibility: "private", name: "notif-grp" },
  });
  grpId = grp.id;
  await prisma.qcChannelMember.createMany({
    data: [
      { orgId: orgAId, channelId: grpId, userId: senderId, role: "admin" },
      { orgId: orgAId, channelId: grpId, userId: alphaId, role: "member" },
      { orgId: orgAId, channelId: grpId, userId: betaId, role: "member" },
    ],
  });

  const dm = await prisma.qcChannel.create({
    data: { orgId: orgAId, type: "dm", visibility: "private", name: null },
  });
  dmId = dm.id;
  await prisma.qcChannelMember.createMany({
    data: [
      { orgId: orgAId, channelId: dmId, userId: senderId, role: "member" },
      { orgId: orgAId, channelId: dmId, userId: alphaId, role: "member" },
    ],
  });
});

afterAll(async () => {
  for (const id of [grpId, dmId]) {
    await prisma.qcNotification.deleteMany({ where: { channelId: id } });
    await prisma.qcNotificationPreference.deleteMany({ where: { channelId: id } });
    await prisma.qcChannelMember.deleteMany({ where: { channelId: id } });
    await prisma.qcChannel.deleteMany({ where: { id } });
  }
  for (const uid of testUserIds) {
    await prisma.qcNotification.deleteMany({ where: { userId: uid } });
    await prisma.qcNotificationKeyword.deleteMany({ where: { userId: uid } });
    await prisma.qcNotificationPreference.deleteMany({ where: { userId: uid } });
    await prisma.qcUserNotificationSettings.deleteMany({ where: { userId: uid } });
    await prisma.userAppAccess.deleteMany({ where: { userId: uid } });
    await prisma.orgMember.deleteMany({ where: { userId: uid } });
    await prisma.user.deleteMany({ where: { id: uid } });
  }
  await prisma.$disconnect();
});

// Reset all notification state for the test users before each test.
beforeEach(async () => {
  for (const uid of testUserIds) {
    await prisma.qcNotification.deleteMany({ where: { userId: uid } });
    await prisma.qcNotificationKeyword.deleteMany({ where: { userId: uid } });
    await prisma.qcNotificationPreference.deleteMany({ where: { userId: uid } });
    await prisma.qcUserNotificationSettings.deleteMany({ where: { userId: uid } });
  }
});

const ctx = (userId: string): OrgContext => ({ userId, orgId: orgAId });
const msg = (content: string, type = "Text"): DeliverableMessage => ({
  id: randomUUID(),
  type,
  content,
});
const mention = (userId: string, offsetStart = 0, offsetEnd = 5): Mention => ({
  userId,
  displayName: "x",
  offsetStart,
  offsetEnd,
});

async function rowsFor(userId: string) {
  return prisma.qcNotification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

// ============================================================================
// Pure helpers
// ============================================================================

describe("matchKeyword (case-insensitive substring, S13 Bug 5)", () => {
  it("matches case-insensitively", () => {
    expect(matchKeyword("Anyone want PIZZA tonight?", ["pizza"])).toBe("pizza");
  });
  it("matches substrings: deploy → deploying / deployment", () => {
    expect(matchKeyword("deploying now @bob", ["deploy"])).toBe("deploy");
    expect(matchKeyword("the deployment finished", ["deploy"])).toBe("deploy");
  });
  it("matches around punctuation", () => {
    expect(matchKeyword("cat!", ["cat"])).toBe("cat");
  });
  it("returns null when the keyword is absent / content empty", () => {
    expect(matchKeyword("hello world", ["pizza"])).toBeNull();
    expect(matchKeyword("", ["cat"])).toBeNull();
  });
});

describe("isInDndWindow", () => {
  it("same-day window is the bounded interval [start,end)", () => {
    expect(isInDndWindow("09:00", "17:00", 12 * 60)).toBe(true);
    expect(isInDndWindow("09:00", "17:00", 8 * 60)).toBe(false);
    expect(isInDndWindow("09:00", "17:00", 17 * 60)).toBe(false);
  });
  it("overnight window wraps past midnight", () => {
    expect(isInDndWindow("22:00", "07:00", 23 * 60)).toBe(true); // 23:00
    expect(isInDndWindow("22:00", "07:00", 3 * 60)).toBe(true); // 03:00
    expect(isInDndWindow("22:00", "07:00", 12 * 60)).toBe(false); // 12:00
  });
  it("start===end and missing bounds are never in-window", () => {
    expect(isInDndWindow("09:00", "09:00", 9 * 60)).toBe(false);
    expect(isInDndWindow(null, "07:00", 100)).toBe(false);
  });
});

describe("makePreview", () => {
  it("trims and caps text at 240 chars", () => {
    expect(makePreview(msg("  hello  "))).toBe("hello");
    const long = "a".repeat(300);
    const preview = makePreview(msg(long));
    expect(preview.length).toBe(241); // 240 + ellipsis
    expect(preview.endsWith("…")).toBe(true);
  });
  it("uses caption/originalName/fallback for media", () => {
    expect(makePreview({ id: "1", type: "Media", content: "caption" })).toBe("caption");
    expect(
      makePreview({ id: "1", type: "Media", content: "", data: { originalName: "f.png" } }),
    ).toBe("f.png");
    expect(makePreview({ id: "1", type: "Media", content: "" })).toBe("sent an attachment");
  });
});

// ============================================================================
// Classification
// ============================================================================

describe("deliverForMessage classification", () => {
  it("DM → type 'dm' for the other party; sender excluded", async () => {
    await notifications.deliverForMessage(orgAId, dmId, senderId, msg("hi"), []);
    const alpha = await rowsFor(alphaId);
    expect(alpha).toHaveLength(1);
    expect(alpha[0]!.type).toBe("dm");
    expect(await rowsFor(senderId)).toHaveLength(0);
  });

  it("targeted mention → 'mention'; unmentioned member with no keyword → nothing", async () => {
    await notifications.deliverForMessage(orgAId, grpId, senderId, msg("hi @alpha"), [
      mention(alphaId),
    ]);
    const alpha = await rowsFor(alphaId);
    expect(alpha).toHaveLength(1);
    expect(alpha[0]!.type).toBe("mention");
    expect((alpha[0]!.meta as { reason: string }).reason).toBe("mention");
    expect(await rowsFor(betaId)).toHaveLength(0);
  });

  it("@everyone → 'everyone' for members not individually targeted", async () => {
    await notifications.deliverForMessage(
      orgAId,
      grpId,
      senderId,
      msg("hey @everyone and @alpha"),
      [mention("everyone"), mention(alphaId)],
    );
    const alpha = await rowsFor(alphaId);
    const beta = await rowsFor(betaId);
    expect((alpha[0]!.meta as { reason: string }).reason).toBe("mention"); // individually targeted
    expect((beta[0]!.meta as { reason: string }).reason).toBe("everyone");
    expect(beta[0]!.type).toBe("mention");
  });

  it("keyword hit → 'keyword' with meta.keyword; respects word boundaries", async () => {
    await notifications.addKeyword(ctx(betaId), "pizza");
    await notifications.deliverForMessage(orgAId, grpId, senderId, msg("who wants pizza?"), []);
    const beta = await rowsFor(betaId);
    expect(beta).toHaveLength(1);
    expect(beta[0]!.type).toBe("keyword");
    expect((beta[0]!.meta as { keyword: string }).keyword).toBe("pizza");

    await prisma.qcNotification.deleteMany({ where: { userId: betaId } });
    await notifications.deliverForMessage(orgAId, grpId, senderId, msg("nice categories"), []);
    expect(await rowsFor(betaId)).toHaveLength(0); // "cat"-like substring shouldn't fire "pizza" anyway
  });

  it("keyword 'deploy' matches 'deploying' (substring) and notifies (Bug 5)", async () => {
    await notifications.addKeyword(ctx(betaId), "deploy");
    await notifications.deliverForMessage(orgAId, grpId, senderId, msg("deploying now"), []);
    const beta = await rowsFor(betaId);
    expect(beta).toHaveLength(1);
    expect(beta[0]!.type).toBe("keyword");
    expect((beta[0]!.meta as { keyword: string }).keyword).toBe("deploy");
  });

  it("a mention to a non-viewing member records an unread row + emits the event (Bug 5)", async () => {
    __resetPublishedForTest();
    await notifications.deliverForMessage(orgAId, grpId, senderId, msg("deploying now @bob"), [
      mention(alphaId),
    ]);
    const alpha = await rowsFor(alphaId);
    expect(alpha).toHaveLength(1);
    expect(alpha[0]!.type).toBe("mention");
    expect(alpha[0]!.isRead).toBe(false); // still records + badges (no viewing-based suppression)
    const events = __getPublishedForTest().filter((e) => e.event === "notification");
    expect(events.some((e) => e.userId === alphaId)).toBe(true);
  });

  it("mention beats keyword (priority order)", async () => {
    await notifications.addKeyword(ctx(alphaId), "deploy");
    await notifications.deliverForMessage(orgAId, grpId, senderId, msg("deploy now @alpha"), [
      mention(alphaId, 11, 17),
    ]);
    const alpha = await rowsFor(alphaId);
    expect(alpha).toHaveLength(1);
    expect(alpha[0]!.type).toBe("mention");
  });
});

// ============================================================================
// Gating (shouldDeliver)
// ============================================================================

async function setSettings(userId: string, patch: Record<string, unknown>) {
  await prisma.qcUserNotificationSettings.upsert({
    where: { orgId_userId: { orgId: orgAId, userId } },
    create: { orgId: orgAId, userId, ...patch },
    update: patch,
  });
}

describe("shouldDeliver gating", () => {
  const noon = new Date(2026, 5, 18, 12, 0, 0); // local noon → inside a 00:00–23:59 DND window

  it("muted channel (level none): persists but pre-marked read, no alerts", async () => {
    await prisma.qcNotificationPreference.create({
      data: { orgId: orgAId, userId: alphaId, channelId: grpId, level: "none" },
    });
    const d = await notifications.shouldDeliver(orgAId, alphaId, grpId, "group", "mention", noon);
    expect(d).toEqual({ persistRow: true, desktop: false, sound: false, persistAsRead: true });
  });

  it("snooze: unread, no alerts", async () => {
    await setSettings(alphaId, { snoozedUntil: new Date(noon.getTime() + 3_600_000) });
    const d = await notifications.shouldDeliver(orgAId, alphaId, grpId, "group", "mention", noon);
    expect(d).toEqual({ persistRow: true, desktop: false, sound: false, persistAsRead: false });
  });

  it("DND suppresses non-priority but priority bypasses with priorityDuringDnd", async () => {
    await setSettings(alphaId, {
      dndEnabled: true,
      dndStart: "00:00",
      dndEnd: "23:59",
      priorityDuringDnd: true,
    });
    // reaction is non-priority and requires level 'all' (default) → suppressed desktop.
    const reaction = await notifications.shouldDeliver(
      orgAId,
      alphaId,
      grpId,
      "group",
      "reaction",
      noon,
    );
    expect(reaction).toEqual({
      persistRow: true,
      desktop: false,
      sound: false,
      persistAsRead: false,
    });
    // mention is priority → bypasses DND.
    const mentionD = await notifications.shouldDeliver(
      orgAId,
      alphaId,
      grpId,
      "group",
      "mention",
      noon,
    );
    expect(mentionD.desktop).toBe(true);
  });

  it("DND with priorityDuringDnd off suppresses even priority", async () => {
    await setSettings(alphaId, {
      dndEnabled: true,
      dndStart: "00:00",
      dndEnd: "23:59",
      priorityDuringDnd: false,
    });
    const d = await notifications.shouldDeliver(orgAId, alphaId, grpId, "group", "mention", noon);
    expect(d.desktop).toBe(false);
  });

  // desktop/sound are independent toggles: turning popups off must not mute the
  // chime. See notifications.gate.test.ts for the full matrix.
  it("desktopEnabled off: row persists unread, no desktop — but still sound", async () => {
    await setSettings(alphaId, { desktopEnabled: false });
    const d = await notifications.shouldDeliver(orgAId, alphaId, grpId, "group", "mention", noon);
    expect(d).toEqual({ persistRow: true, desktop: false, sound: true, persistAsRead: false });
  });

  it("soundEnabled off: row persists unread, desktop still fires", async () => {
    await setSettings(alphaId, { soundEnabled: false });
    const d = await notifications.shouldDeliver(orgAId, alphaId, grpId, "group", "mention", noon);
    expect(d).toEqual({ persistRow: true, desktop: true, sound: false, persistAsRead: false });
  });

  it("reaction only delivers at level 'all'", async () => {
    await prisma.qcNotificationPreference.create({
      data: { orgId: orgAId, userId: alphaId, channelId: grpId, level: "mentions" },
    });
    const d = await notifications.shouldDeliver(orgAId, alphaId, grpId, "group", "reaction", noon);
    expect(d.persistRow).toBe(false);
  });

  it("default (no settings/pref) → delivers with desktop + sound", async () => {
    const d = await notifications.shouldDeliver(orgAId, alphaId, grpId, "group", "mention", noon);
    expect(d).toEqual({ persistRow: true, desktop: true, sound: true, persistAsRead: false });
  });
});

// ============================================================================
// Realtime signal
// ============================================================================

describe("realtime notification publish", () => {
  it("publishes a per-user notification to the recipient with desktop:true; not to sender", async () => {
    __resetPublishedForTest();
    await notifications.deliverForMessage(orgAId, grpId, senderId, msg("ping @alpha"), [
      mention(alphaId),
    ]);
    const events = __getPublishedForTest().filter((e) => e.event === "notification");
    expect(events).toHaveLength(1);
    expect(events[0]!.orgId).toBe(orgAId);
    expect(events[0]!.userId).toBe(alphaId);
    const payload = events[0]!.payload as { desktop: boolean; sound: boolean; type: string };
    expect(payload).toMatchObject({ type: "mention", desktop: true, sound: true });
    // Sender never receives a notification event.
    expect(events.some((e) => e.userId === senderId)).toBe(false);
  });

  it("muted channel still emits the event but with desktop:false + sound:false", async () => {
    await prisma.qcNotificationPreference.create({
      data: { orgId: orgAId, userId: alphaId, channelId: grpId, level: "none" },
    });
    __resetPublishedForTest();
    await notifications.deliverForMessage(orgAId, grpId, senderId, msg("hi @alpha"), [
      mention(alphaId),
    ]);
    const events = __getPublishedForTest().filter((e) => e.event === "notification");
    expect(events).toHaveLength(1);
    expect((events[0]!.payload as { desktop: boolean; isRead: boolean }).desktop).toBe(false);
    expect((events[0]!.payload as { sound: boolean }).sound).toBe(false);
    expect((events[0]!.payload as { isRead: boolean }).isRead).toBe(true);
  });

  it("deliverForReaction notifies the message sender, skips self-reaction", async () => {
    // self-reaction → nothing
    __resetPublishedForTest();
    await notifications.deliverForReaction(orgAId, grpId, senderId, senderId, "👍", msg("x"));
    expect(__getPublishedForTest().filter((e) => e.event === "notification")).toHaveLength(0);

    // someone else reacts → sender notified
    __resetPublishedForTest();
    await notifications.deliverForReaction(orgAId, grpId, alphaId, senderId, "👍", msg("x"));
    const events = __getPublishedForTest().filter((e) => e.event === "notification");
    expect(events).toHaveLength(1);
    expect(events[0]!.userId).toBe(alphaId);
    expect((events[0]!.payload as { type: string }).type).toBe("reaction");
  });
});

// ============================================================================
// Feed: list / pagination / counts / mark-read / clear
// ============================================================================

async function seedNotif(userId: string, channelId: string | null, isRead = false) {
  return prisma.qcNotification.create({
    data: { orgId: orgAId, userId, type: "mention", channelId, preview: "p", isRead },
  });
}

describe("feed", () => {
  it("lists desc, paginates with a before cursor, and honours unreadOnly", async () => {
    const a = await seedNotif(alphaId, grpId);
    await new Promise((r) => setTimeout(r, 5));
    const b = await seedNotif(alphaId, grpId);
    await new Promise((r) => setTimeout(r, 5));
    const c = await seedNotif(alphaId, grpId, true);

    const page1 = await notifications.list(ctx(alphaId), { limit: 2 });
    expect(page1.map((n) => n.id)).toEqual([c.id, b.id]); // newest first

    const page2 = await notifications.list(ctx(alphaId), { limit: 2, before: b.id });
    expect(page2.map((n) => n.id)).toEqual([a.id]);

    const unread = await notifications.list(ctx(alphaId), { unreadOnly: true });
    expect(unread.every((n) => !n.isRead)).toBe(true);
    expect(unread.map((n) => n.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("unreadCount + unreadByChannel grouping", async () => {
    await seedNotif(alphaId, grpId);
    await seedNotif(alphaId, grpId);
    await seedNotif(alphaId, dmId);
    await seedNotif(alphaId, null); // no channel → excluded from byChannel
    expect(await notifications.unreadCount(ctx(alphaId))).toBe(4);
    const byChannel = await notifications.unreadByChannel(ctx(alphaId));
    expect(byChannel[grpId]).toBe(2);
    expect(byChannel[dmId]).toBe(1);
    expect(Object.keys(byChannel)).toHaveLength(2);
  });

  it("markRead(ids) returns affected and clears those rows", async () => {
    const a = await seedNotif(alphaId, grpId);
    const b = await seedNotif(alphaId, grpId);
    const affected = await notifications.markRead(ctx(alphaId), [a.id, b.id]);
    expect(affected).toBe(2);
    expect(await notifications.unreadCount(ctx(alphaId))).toBe(0);
  });

  it("markAllRead clears everything; markReadByChannel scopes to one channel", async () => {
    await seedNotif(alphaId, grpId);
    await seedNotif(alphaId, dmId);
    const { affected } = await notifications.markReadByChannel(ctx(alphaId), grpId);
    expect(affected).toBe(1);
    expect(await notifications.unreadCount(ctx(alphaId))).toBe(1); // dm row still unread

    const all = await notifications.markAllRead(ctx(alphaId));
    expect(all).toBe(1);
    expect(await notifications.unreadCount(ctx(alphaId))).toBe(0);
  });

  it("clearAll deletes the feed", async () => {
    await seedNotif(alphaId, grpId);
    await notifications.clearAll(ctx(alphaId));
    expect(await notifications.list(ctx(alphaId), {})).toHaveLength(0);
  });
});

// ============================================================================
// Settings / keywords / channel preference
// ============================================================================

describe("settings", () => {
  it("get-or-creates with sane defaults", async () => {
    const s = await notifications.getSettings(ctx(betaId));
    expect(s).toMatchObject({
      defaultChannelLevel: "all",
      dmsLevel: "all",
      desktopEnabled: true,
      emailEnabled: false,
      dndEnabled: false,
      priorityDuringDnd: true,
    });
  });

  it("patch updates only allow-listed fields", async () => {
    const updated = await notifications.updateSettings(ctx(betaId), {
      defaultChannelLevel: "mentions",
      desktopEnabled: false,
      // @ts-expect-error — unknown field must be ignored by the allow-list
      bogus: true,
    });
    expect(updated.defaultChannelLevel).toBe("mentions");
    expect(updated.desktopEnabled).toBe(false);
    expect("bogus" in updated).toBe(false);
  });
});

describe("keywords", () => {
  it("adds (trim+lowercase), dedupes, validates length", async () => {
    const k = await notifications.addKeyword(ctx(betaId), "  PIZZA  ");
    expect(k.keyword).toBe("pizza");
    const again = await notifications.addKeyword(ctx(betaId), "pizza");
    expect(again.id).toBe(k.id); // dedupe
    expect((await notifications.listKeywords(ctx(betaId))).length).toBe(1);

    await expect(notifications.addKeyword(ctx(betaId), "   ")).rejects.toMatchObject({
      status: 400,
    });
    await expect(notifications.addKeyword(ctx(betaId), "x".repeat(65))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("removes by id; 404 for unknown", async () => {
    const k = await notifications.addKeyword(ctx(betaId), "alerts");
    await notifications.removeKeyword(ctx(betaId), k.id);
    expect(await notifications.listKeywords(ctx(betaId))).toHaveLength(0);
    await expect(notifications.removeKeyword(ctx(betaId), randomUUID())).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("channel preference", () => {
  it("upserts level + mutedUntil and reads back", async () => {
    const until = new Date(Date.now() + 3_600_000);
    const set = await notifications.setChannelPreference(ctx(alphaId), grpId, {
      level: "mentions",
      mutedUntil: until,
    });
    expect(set.level).toBe("mentions");
    const got = await notifications.getChannelPreferenceDto(ctx(alphaId), grpId);
    expect(got.level).toBe("mentions");
    expect(got.mutedUntil).toBe(until.toISOString());

    // update path
    const updated = await notifications.setChannelPreference(ctx(alphaId), grpId, {
      level: "none",
    });
    expect(updated.level).toBe("none");
  });

  it("returns inherit (level:null) when no pref row exists", async () => {
    const got = await notifications.getChannelPreferenceDto(ctx(betaId), grpId);
    expect(got).toEqual({ channelId: grpId, level: null, mutedUntil: null });
  });

  it("rejects a non-member (membership assert)", async () => {
    await expect(
      notifications.setChannelPreference(ctx(betaId), dmId, { level: "none" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

// ============================================================================
// Tenant isolation
// ============================================================================

describe("tenant isolation", () => {
  it("a user never sees another org's notifications", async () => {
    // Carol (globex) gets a notification in org B.
    await prisma.qcNotification.create({
      data: { orgId: orgBId, userId: carolId, type: "mention", preview: "globex only" },
    });
    // Alpha (acme) feed + count exclude it.
    const feed = await notifications.list(ctx(alphaId), {});
    expect(feed.every((n) => n.preview !== "globex only")).toBe(true);
    // And carol's own acme-scoped view (wrong org) sees nothing of it either.
    const carolInAcme = await notifications.list({ userId: carolId, orgId: orgAId }, {});
    expect(carolInAcme).toHaveLength(0);
    await prisma.qcNotification.deleteMany({ where: { userId: carolId } });
  });

  it("rejects setting a channel preference on a cross-org channel", async () => {
    const globexChannel = await prisma.qcChannel.findFirstOrThrow({
      where: { orgId: orgBId, name: "announcements" },
    });
    await expect(
      notifications.setChannelPreference(ctx(alphaId), globexChannel.id, { level: "none" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
