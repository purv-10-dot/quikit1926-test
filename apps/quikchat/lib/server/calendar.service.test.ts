import { db as prisma } from "@quikit/database";
import {
  ASSISTANT_BOT_USER_ID,
  __getPublishedForTest,
  __resetPublishedForTest,
  type OrgContext,
} from "@/lib/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import * as calendar from "./calendar.service";
import { __resetCalendarForTest } from "./calendar";
import * as channels from "./channels.service";

let orgAId = "";
let aliceId = "";
let daveId = "";
let carolId = "";
let groupId = "";
const createdChannelIds = new Set<string>();

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
  carolId = (await prisma.user.findUniqueOrThrow({ where: { email: "carol@globex.test" } })).id;

  const dave = await prisma.user.upsert({
    where: { email: "dave-cal@acme.test" },
    update: { firstName: "davecal" },
    create: { email: "dave-cal@acme.test", firstName: "davecal", lastName: "" },
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

  const group = await channels.create(
    { userId: aliceId, orgId: orgAId },
    { type: "group", visibility: "private", name: "cal-tests", memberIds: [daveId] },
  );
  groupId = group.channelId;
  createdChannelIds.add(groupId);
});

afterAll(async () => {
  for (const id of createdChannelIds) {
    await prisma.qcMeeting.deleteMany({ where: { channelId: id } });
    await prisma.qcMessage.deleteMany({ where: { channelId: id } });
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
const ctxCarol = (): OrgContext => ({ userId: carolId, orgId: orgAId });

const dayWindow = { from: "2026-06-20T00:00:00.000Z", to: "2026-06-20T23:59:59.999Z" };
const slot = { start: "2026-06-20T10:00:00.000Z", end: "2026-06-20T10:30:00.000Z" };

describe("getFreeBusy", () => {
  it("returns busy blocks keyed by userId, including the caller", async () => {
    const fb = await calendar.getFreeBusy(ctxAlice(), [daveId], dayWindow.from, dayWindow.to);
    expect(Object.keys(fb.busy).sort()).toEqual([aliceId, daveId].sort());
    expect(Array.isArray(fb.busy[daveId])).toBe(true);
  });

  it("rejects a target who is not in the caller's org (cross-tenant)", async () => {
    await expect(
      calendar.getFreeBusy(ctxAlice(), [carolId], dayWindow.from, dayWindow.to),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a non-ISO window", async () => {
    await expect(calendar.getFreeBusy(ctxAlice(), [], "nope", "also-nope")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("drops the assistant bot from targets instead of 403ing (S15c)", async () => {
    // Regression: the bot id leaked into userIds 403'd the whole request because
    // the bot isn't an OrgMember.
    const fb = await calendar.getFreeBusy(
      ctxAlice(),
      [daveId, ASSISTANT_BOT_USER_ID],
      dayWindow.from,
      dayWindow.to,
    );
    expect(Object.keys(fb.busy)).not.toContain(ASSISTANT_BOT_USER_ID);
    expect(fb.unknown).not.toContain(ASSISTANT_BOT_USER_ID);
    expect(Object.keys(fb.busy).sort()).toEqual([aliceId, daveId].sort());
  });
});

describe("createMeeting", () => {
  it("persists the meeting + attendees and posts a Meeting message", async () => {
    __resetPublishedForTest();
    const { meeting, message } = await calendar.createMeeting(ctxAlice(), groupId, {
      title: "Planning",
      description: "roadmap",
      start: slot.start,
      end: slot.end,
      attendeeUserIds: [daveId],
      conferencing: true,
    });

    expect(message.type).toBe("Meeting");
    expect((message.data as { meetingId?: string }).meetingId).toBe(meeting.id);
    expect(meeting.joinUrl).toMatch(/^https:\/\/meet\.stub\//);

    const row = await prisma.qcMeeting.findUniqueOrThrow({
      where: { id: meeting.id },
      include: { attendees: true },
    });
    expect(row.orgId).toBe(orgAId);
    expect(row.createdMessageId).toBe(message.id);
    expect(row.attendees.map((a) => a.userId).sort()).toEqual([aliceId, daveId].sort());
    // Organizer auto-accepts; invitee starts needs_action.
    expect(row.attendees.find((a) => a.userId === aliceId)!.rsvp).toBe("accepted");
    expect(row.attendees.find((a) => a.userId === daveId)!.rsvp).toBe("needs_action");

    // The Meeting message fanned out like any message.
    expect(
      __getPublishedForTest().some((e) => e.event === "message" && e.channelId === groupId),
    ).toBe(true);
  });

  it("is idempotent on clientMessageId (no double-post)", async () => {
    const cmid = "cal-cmid-1";
    const a = await calendar.createMeeting(ctxAlice(), groupId, {
      title: "Once",
      start: slot.start,
      end: slot.end,
      attendeeUserIds: [],
      conferencing: false,
      clientMessageId: cmid,
    });
    const b = await calendar.createMeeting(ctxAlice(), groupId, {
      title: "Once",
      start: slot.start,
      end: slot.end,
      attendeeUserIds: [],
      conferencing: false,
      clientMessageId: cmid,
    });
    expect(b.message.id).toBe(a.message.id);
    const count = await prisma.qcMessage.count({
      where: { channelId: groupId, clientMessageId: cmid },
    });
    expect(count).toBe(1);
  });

  it("drops the assistant bot from attendees instead of 403ing (S15c)", async () => {
    const { meeting } = await calendar.createMeeting(ctxAlice(), groupId, {
      title: "No bots",
      start: slot.start,
      end: slot.end,
      attendeeUserIds: [daveId, ASSISTANT_BOT_USER_ID],
      conferencing: false,
    });
    const row = await prisma.qcMeeting.findUniqueOrThrow({
      where: { id: meeting.id },
      include: { attendees: true },
    });
    expect(row.attendees.map((a) => a.userId)).not.toContain(ASSISTANT_BOT_USER_ID);
    expect(row.attendees.map((a) => a.userId).sort()).toEqual([aliceId, daveId].sort());
  });

  it("rejects when the caller is not a channel member", async () => {
    await expect(
      calendar.createMeeting(ctxCarol(), groupId, {
        title: "Nope",
        start: slot.start,
        end: slot.end,
        attendeeUserIds: [],
        conferencing: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects an empty title and a non-positive duration", async () => {
    await expect(
      calendar.createMeeting(ctxAlice(), groupId, {
        title: "   ",
        start: slot.start,
        end: slot.end,
        attendeeUserIds: [],
        conferencing: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      calendar.createMeeting(ctxAlice(), groupId, {
        title: "Backwards",
        start: slot.end,
        end: slot.start,
        attendeeUserIds: [],
        conferencing: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("setRsvp", () => {
  it("updates the caller's row and re-publishes the card (message_update)", async () => {
    const { meeting } = await calendar.createMeeting(ctxAlice(), groupId, {
      title: "Standup",
      start: slot.start,
      end: slot.end,
      attendeeUserIds: [daveId],
      conferencing: true,
    });
    __resetPublishedForTest();
    const updated = await calendar.setRsvp(ctxDave(), meeting.id, "accepted");
    expect(updated.attendees.find((a) => a.user.id === daveId)!.rsvp).toBe("accepted");

    const row = await prisma.qcMeetingAttendee.findFirstOrThrow({
      where: { meetingId: meeting.id, userId: daveId },
    });
    expect(row.rsvp).toBe("accepted");
    expect(__getPublishedForTest().some((e) => e.event === "message_update")).toBe(true);
  });

  it("403s when the caller is not an attendee (can't RSVP for others)", async () => {
    const { meeting } = await calendar.createMeeting(ctxAlice(), groupId, {
      title: "Alice only",
      start: slot.start,
      end: slot.end,
      attendeeUserIds: [],
      conferencing: false,
    });
    await expect(calendar.setRsvp(ctxDave(), meeting.id, "declined")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects an invalid status", async () => {
    await expect(
      // @ts-expect-error testing runtime guard
      calendar.setRsvp(ctxAlice(), "any", "maybe"),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("listMeetings (S16 planner)", () => {
  const from = "2026-06-19T00:00:00.000Z";
  const to = "2026-06-21T00:00:00.000Z";

  it("returns the caller's meetings in range (organizer or attendee), org-scoped", async () => {
    const mineMtg = await calendar.createMeeting(ctxAlice(), groupId, {
      title: "Mine",
      start: slot.start,
      end: slot.end,
      attendeeUserIds: [daveId],
      conferencing: false,
    });
    // A meeting Alice is neither organizer nor attendee of (Dave-only).
    const other = await prisma.qcMeeting.create({
      data: {
        orgId: orgAId,
        channelId: groupId,
        organizerId: daveId,
        title: "Dave's",
        start: new Date(slot.start),
        end: new Date(slot.end),
        status: "scheduled",
        attendees: { create: [{ userId: daveId, email: "d@acme.test", rsvp: "accepted" }] },
      },
    });

    const mine = await calendar.listMeetings(ctxAlice(), from, to);
    const ids = mine.map((m) => m.id);
    expect(ids).toContain(mineMtg.meeting.id);
    expect(ids).not.toContain(other.id); // not hers
    // Dave sees the Dave-only meeting.
    const daves = await calendar.listMeetings(ctxDave(), from, to);
    expect(daves.map((m) => m.id)).toContain(other.id);
  });

  it("excludes cancelled meetings", async () => {
    const c = await calendar.createMeeting(ctxAlice(), groupId, {
      title: "Scrapped",
      start: slot.start,
      end: slot.end,
      attendeeUserIds: [],
      conferencing: false,
    });
    await prisma.qcMeeting.update({ where: { id: c.meeting.id }, data: { status: "cancelled" } });
    const list = await calendar.listMeetings(ctxAlice(), from, to);
    expect(list.map((m) => m.id)).not.toContain(c.meeting.id);
  });

  it("rejects a non-ISO window", async () => {
    await expect(calendar.listMeetings(ctxAlice(), "x", "y")).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("createMeeting provider failure (S16)", () => {
  const GOOGLE_ENV = {
    CALENDAR_MODE: "google",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    GMAIL_REFRESH_TOKEN: "rt",
  };

  afterEach(() => {
    __resetCalendarForTest();
    for (const k of Object.keys(GOOGLE_ENV)) delete process.env[k];
    vi.restoreAllMocks();
  });

  it("converts a provider API failure into a legible 502, not an unhandled 500", async () => {
    Object.assign(process.env, GOOGLE_ENV);
    __resetCalendarForTest();
    // verify() (calendarList) succeeds → provider stays active; events.insert 400.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        const method = (init?.method ?? "GET").toUpperCase();
        if (u.includes("oauth2.googleapis.com/token"))
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "at", expires_in: 3600 }),
          } as Response;
        if (u.includes("/calendarList"))
          return { ok: true, status: 200, json: async () => ({ items: [] }) } as Response;
        if (u.includes("/events") && method === "POST")
          return { ok: false, status: 400, json: async () => ({}) } as Response;
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      }),
    );
    await expect(
      calendar.createMeeting(ctxAlice(), groupId, {
        title: "Will fail at provider",
        start: slot.start,
        end: slot.end,
        attendeeUserIds: [daveId],
        conferencing: true,
      }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
