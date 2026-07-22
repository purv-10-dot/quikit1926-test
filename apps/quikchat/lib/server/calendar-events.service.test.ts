import { db as prisma } from "@quikit/database";
import { type OrgContext } from "@/lib/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/auth/src/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../../../packages/auth/src/nextauth", () => ({ authOptions: {} }));

import * as calendarEvents from "./calendar-events.service";
import * as channels from "./channels.service";

let orgAId = "";
let aliceId = "";
let erinId = "";
let groupId = "";
const createdChannelIds = new Set<string>();

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;

  const erin = await prisma.user.upsert({
    where: { email: "erin-cal@acme.test" },
    update: { firstName: "erincal" },
    create: { email: "erin-cal@acme.test", firstName: "erincal", lastName: "" },
  });
  erinId = erin.id;
  await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId: orgAId, userId: erinId } },
    update: { status: "active" },
    create: { orgId: orgAId, userId: erinId, role: "member", status: "active" },
  });
  await prisma.userAppAccess.upsert({
    where: { userId_orgId_appId: { userId: erinId, orgId: orgAId, appId: "quikchat" } },
    update: {},
    create: { userId: erinId, orgId: orgAId, appId: "quikchat" },
  });

  const group = await channels.create(
    { userId: aliceId, orgId: orgAId },
    { type: "group", visibility: "private", name: "cal-events-tests", memberIds: [erinId] },
  );
  groupId = group.channelId;
  createdChannelIds.add(groupId);
});

afterAll(async () => {
  // Personal calendar rows created by the test users.
  await prisma.qcCalendarEvent.deleteMany({ where: { userId: { in: [aliceId, erinId] } } });
  await prisma.qcCalendar.deleteMany({ where: { userId: { in: [aliceId, erinId] } } });
  for (const id of createdChannelIds) {
    await prisma.qcMeeting.deleteMany({ where: { channelId: id } });
    await prisma.qcMessage.deleteMany({ where: { channelId: id } });
    await prisma.qcChannelMember.deleteMany({ where: { channelId: id } });
    await prisma.qcChannel.deleteMany({ where: { id } });
  }
  await prisma.qcChannelMember.deleteMany({ where: { userId: erinId } });
  await prisma.userAppAccess.deleteMany({ where: { userId: erinId } });
  await prisma.orgMember.deleteMany({ where: { userId: erinId } });
  await prisma.user.deleteMany({ where: { id: erinId } });
  await prisma.$disconnect();
});

const ctxAlice = (): OrgContext => ({ userId: aliceId, orgId: orgAId });
const ctxErin = (): OrgContext => ({ userId: erinId, orgId: orgAId });

const win = { from: "2026-08-10T00:00:00.000Z", to: "2026-08-10T23:59:59.999Z" };
const slot = { start: "2026-08-10T10:00:00.000Z", end: "2026-08-10T10:30:00.000Z" };
const outOfWindow = { start: "2026-08-15T10:00:00.000Z", end: "2026-08-15T10:30:00.000Z" };

async function aliceDefaultCalendarId(): Promise<string> {
  const cals = await calendarEvents.listCalendars(ctxAlice());
  return cals.find((c) => c.isDefault)!.id;
}

describe("listCalendars", () => {
  it("auto-creates the default calendar for a fresh user, org+user scoped", async () => {
    const aliceCals = await calendarEvents.listCalendars(ctxAlice());
    const def = aliceCals.find((c) => c.isDefault);
    expect(def).toBeDefined();
    expect(def!.name).toBe("Calendar");
    expect(def!.color).toBe("#7c5cff");

    const erinCals = await calendarEvents.listCalendars(ctxErin());
    const erinDef = erinCals.find((c) => c.isDefault);
    expect(erinDef).toBeDefined();
    // Erin's list is her own — never contains Alice's calendar.
    expect(erinCals.map((c) => c.id)).not.toContain(def!.id);
    expect(erinDef!.id).not.toBe(def!.id);
  });
});

describe("updateCalendar", () => {
  it("toggles visible for the owner", async () => {
    const id = await aliceDefaultCalendarId();
    const updated = await calendarEvents.updateCalendar(ctxAlice(), id, { visible: false });
    expect(updated.visible).toBe(false);
    // restore so later tests see a normal default
    await calendarEvents.updateCalendar(ctxAlice(), id, { visible: true });
  });

  it("404s for a non-owner", async () => {
    const id = await aliceDefaultCalendarId();
    await expect(
      calendarEvents.updateCalendar(ctxErin(), id, { visible: false }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("createEvent", () => {
  it("persists with orgId+userId, uses the default calendar and resolves color", async () => {
    const defId = await aliceDefaultCalendarId();
    const dto = await calendarEvents.createEvent(ctxAlice(), {
      title: "Focus block",
      start: slot.start,
      end: slot.end,
    });
    expect(dto.source).toBe("event");
    expect(dto.editable).toBe(true);
    expect(dto.calendarId).toBe(defId);
    expect(dto.color).toBe("#7c5cff"); // inherits the default calendar's color

    const row = await prisma.qcCalendarEvent.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row.orgId).toBe(orgAId);
    expect(row.userId).toBe(aliceId);
    expect(row.calendarId).toBe(defId);
  });

  it("rejects empty title, bad ISO, and end <= start", async () => {
    await expect(
      calendarEvents.createEvent(ctxAlice(), { title: "   ", start: slot.start, end: slot.end }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      calendarEvents.createEvent(ctxAlice(), { title: "Bad ISO", start: "nope", end: "also-no" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      calendarEvents.createEvent(ctxAlice(), {
        title: "Backwards",
        start: slot.end,
        end: slot.start,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("listEvents", () => {
  it("returns the caller's in-window events, excluding out-of-window and other users'", async () => {
    const mine = await calendarEvents.createEvent(ctxAlice(), {
      title: "Mine in window",
      start: slot.start,
      end: slot.end,
    });
    const mineOut = await calendarEvents.createEvent(ctxAlice(), {
      title: "Mine out of window",
      start: outOfWindow.start,
      end: outOfWindow.end,
    });
    const erins = await calendarEvents.createEvent(ctxErin(), {
      title: "Erin's in window",
      start: slot.start,
      end: slot.end,
    });

    const list = await calendarEvents.listEvents(ctxAlice(), win.from, win.to);
    const ids = list.map((e) => e.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(mineOut.id); // out of window
    expect(ids).not.toContain(erins.id); // another user's event
  });

  it("overlays the caller's meetings as source:'meeting', editable:false rows", async () => {
    const meeting = await prisma.qcMeeting.create({
      data: {
        orgId: orgAId,
        channelId: groupId,
        organizerId: aliceId,
        title: "Overlay meeting",
        start: new Date("2026-08-10T14:00:00.000Z"),
        end: new Date("2026-08-10T14:30:00.000Z"),
        status: "scheduled",
        attendees: { create: [{ userId: aliceId, email: "alice@acme.test", rsvp: "accepted" }] },
      },
    });
    const list = await calendarEvents.listEvents(ctxAlice(), win.from, win.to);
    const overlay = list.find((e) => e.id === meeting.id);
    expect(overlay).toBeDefined();
    expect(overlay!.source).toBe("meeting");
    expect(overlay!.editable).toBe(false);
    expect(overlay!.calendarId).toBeNull();
    expect(overlay!.channelId).toBe(groupId);
  });

  it("rejects a non-ISO window", async () => {
    await expect(calendarEvents.listEvents(ctxAlice(), "x", "y")).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("updateEvent", () => {
  it("applies a patch for the owner", async () => {
    const created = await calendarEvents.createEvent(ctxAlice(), {
      title: "Before",
      start: slot.start,
      end: slot.end,
    });
    const updated = await calendarEvents.updateEvent(ctxAlice(), created.id, { title: "After" });
    expect(updated.title).toBe("After");
  });

  it("404s for a non-owner", async () => {
    const created = await calendarEvents.createEvent(ctxAlice(), {
      title: "Owned by Alice",
      start: slot.start,
      end: slot.end,
    });
    await expect(
      calendarEvents.updateEvent(ctxErin(), created.id, { title: "hijack" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteEvent", () => {
  it("removes an event the caller owns", async () => {
    const created = await calendarEvents.createEvent(ctxAlice(), {
      title: "To delete",
      start: slot.start,
      end: slot.end,
    });
    const res = await calendarEvents.deleteEvent(ctxAlice(), created.id);
    expect(res).toEqual({ deleted: true });
    const gone = await prisma.qcCalendarEvent.findUnique({ where: { id: created.id } });
    expect(gone).toBeNull();
  });

  it("404s for a non-owner", async () => {
    const created = await calendarEvents.createEvent(ctxAlice(), {
      title: "Alice's again",
      start: slot.start,
      end: slot.end,
    });
    await expect(calendarEvents.deleteEvent(ctxErin(), created.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});
