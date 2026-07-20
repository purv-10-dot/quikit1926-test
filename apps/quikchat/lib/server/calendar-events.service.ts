/**
 * Personal calendar/events domain service (S17). Owner-scoped: every calendar
 * and event belongs to a single (orgId, userId) — no channel membership is
 * involved (unlike QcMeeting). Mirrors calendar.service.ts conventions: each fn
 * takes `ctx: OrgContext` first, throws `HttpError` for failures, validates ISO.
 *
 * `listEvents` overlays the caller's meetings (read-only) so the calendar view
 * shows scheduled meetings alongside personal events without a second fetch.
 * Serialize helpers are inline (no message-pipeline import → no cycle).
 */
import { HttpError } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import type { QcCalendar, QcCalendarEvent, QcMeeting } from "@quikit/database";
import type {
  CalendarDto,
  CalendarEventDto,
  CreateCalendarEventInput,
  OrgContext,
  UpdateCalendarEventInput,
  UpdateCalendarInput,
} from "@/lib/shared";

const DEFAULT_CALENDAR_COLOR = "#7c5cff";
const MEETING_OVERLAY_COLOR = "#0ea5a4";

const isBadIso = (s: string): boolean => !s || Number.isNaN(Date.parse(s));

// --- serialize helpers (inline) ---

function toCalendarDto(row: QcCalendar): CalendarDto {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isDefault: row.isDefault,
    visible: row.visible,
    sortOrder: row.sortOrder,
  };
}

function toCalendarEventDto(row: QcCalendarEvent, calendarColor?: string): CalendarEventDto {
  return {
    id: row.id,
    calendarId: row.calendarId,
    source: "event",
    title: row.title,
    description: row.description,
    location: row.location,
    start: row.start.toISOString(),
    end: row.end.toISOString(),
    allDay: row.allDay,
    color: row.color ?? calendarColor ?? DEFAULT_CALENDAR_COLOR,
    joinUrl: row.joinUrl,
    channelId: null,
    editable: true,
  };
}

function meetingToCalendarEventDto(m: QcMeeting): CalendarEventDto {
  return {
    id: m.id,
    calendarId: null,
    source: "meeting",
    title: m.title,
    description: m.description,
    location: null,
    start: m.start.toISOString(),
    end: m.end.toISOString(),
    allDay: false,
    color: MEETING_OVERLAY_COLOR,
    joinUrl: m.joinUrl,
    channelId: m.channelId,
    editable: false,
  };
}

/** The caller's default ("Calendar") — created lazily on first access. */
async function ensureDefaultCalendar(ctx: OrgContext): Promise<QcCalendar> {
  const existing = await prisma.qcCalendar.findFirst({
    where: { orgId: ctx.orgId, userId: ctx.userId, isDefault: true },
  });
  if (existing) return existing;
  return prisma.qcCalendar.create({
    data: {
      orgId: ctx.orgId,
      userId: ctx.userId,
      name: "Calendar",
      color: DEFAULT_CALENDAR_COLOR,
      isDefault: true,
      sortOrder: 0,
    },
  });
}

/** GET /api/calendar/calendars — the caller's "My calendars" list. */
export async function listCalendars(ctx: OrgContext): Promise<CalendarDto[]> {
  await ensureDefaultCalendar(ctx);
  const rows = await prisma.qcCalendar.findMany({
    where: { orgId: ctx.orgId, userId: ctx.userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toCalendarDto);
}

/** PATCH /api/calendar/calendars/[id] — rename / recolor / toggle visibility. */
export async function updateCalendar(
  ctx: OrgContext,
  calendarId: string,
  patch: UpdateCalendarInput,
): Promise<CalendarDto> {
  const row = await prisma.qcCalendar.findFirst({
    where: { id: calendarId, orgId: ctx.orgId, userId: ctx.userId },
  });
  if (!row) throw new HttpError(404, "Calendar not found");
  const updated = await prisma.qcCalendar.update({
    where: { id: row.id },
    data: {
      ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
  return toCalendarDto(updated);
}

/**
 * GET /api/calendar/events?from=ISO&to=ISO — the caller's personal events in the
 * window plus their meetings as read-only overlay rows, sorted by start. Returns
 * events from ALL the caller's calendars regardless of `visible` — the client
 * filters hidden calendars, so toggling one needs no refetch.
 */
export async function listEvents(
  ctx: OrgContext,
  from: string,
  to: string,
): Promise<CalendarEventDto[]> {
  if (isBadIso(from) || isBadIso(to)) {
    throw new HttpError(400, "from/to must be ISO timestamps");
  }
  const [events, calendars, meetings] = await Promise.all([
    prisma.qcCalendarEvent.findMany({
      where: {
        orgId: ctx.orgId,
        userId: ctx.userId,
        status: { not: "cancelled" },
        start: { gte: new Date(from), lte: new Date(to) },
      },
    }),
    prisma.qcCalendar.findMany({
      where: { orgId: ctx.orgId, userId: ctx.userId },
    }),
    prisma.qcMeeting.findMany({
      where: {
        orgId: ctx.orgId,
        status: { not: "cancelled" },
        start: { gte: new Date(from), lte: new Date(to) },
        OR: [{ organizerId: ctx.userId }, { attendees: { some: { userId: ctx.userId } } }],
      },
    }),
  ]);

  const colorByCalendar = new Map(calendars.map((c) => [c.id, c.color]));
  const eventDtos = events.map((e) => toCalendarEventDto(e, colorByCalendar.get(e.calendarId)));
  const meetingDtos = meetings.map(meetingToCalendarEventDto);

  return [...eventDtos, ...meetingDtos].sort((a, b) => a.start.localeCompare(b.start));
}

/** POST /api/calendar/events — create a personal event on a chosen/default calendar. */
export async function createEvent(
  ctx: OrgContext,
  input: CreateCalendarEventInput,
): Promise<CalendarEventDto> {
  const title = (input.title ?? "").trim();
  if (!title) throw new HttpError(400, "title is required");
  if (isBadIso(input.start) || isBadIso(input.end)) {
    throw new HttpError(400, "start/end must be ISO timestamps");
  }
  if (Date.parse(input.end) <= Date.parse(input.start)) {
    throw new HttpError(400, "end must be after start");
  }

  let calendar: QcCalendar;
  if (input.calendarId) {
    const owned = await prisma.qcCalendar.findFirst({
      where: { id: input.calendarId, orgId: ctx.orgId, userId: ctx.userId },
    });
    if (!owned) throw new HttpError(404, "Calendar not found");
    calendar = owned;
  } else {
    calendar = await ensureDefaultCalendar(ctx);
  }

  const created = await prisma.qcCalendarEvent.create({
    data: {
      orgId: ctx.orgId,
      userId: ctx.userId,
      calendarId: calendar.id,
      title,
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      start: new Date(input.start),
      end: new Date(input.end),
      allDay: input.allDay ?? false,
      color: input.color ?? null,
      joinUrl: input.joinUrl ?? null,
    },
  });
  return toCalendarEventDto(created, calendar.color);
}

/** PATCH /api/calendar/events/[id] — edit a personal event the caller owns. */
export async function updateEvent(
  ctx: OrgContext,
  eventId: string,
  patch: UpdateCalendarEventInput,
): Promise<CalendarEventDto> {
  const row = await prisma.qcCalendarEvent.findFirst({
    where: { id: eventId, orgId: ctx.orgId, userId: ctx.userId },
  });
  if (!row) throw new HttpError(404, "Event not found");

  if (patch.start !== undefined && isBadIso(patch.start)) {
    throw new HttpError(400, "start must be an ISO timestamp");
  }
  if (patch.end !== undefined && isBadIso(patch.end)) {
    throw new HttpError(400, "end must be an ISO timestamp");
  }
  if (patch.start !== undefined || patch.end !== undefined) {
    const start = patch.start ? new Date(patch.start) : row.start;
    const end = patch.end ? new Date(patch.end) : row.end;
    if (end.getTime() <= start.getTime()) throw new HttpError(400, "end must be after start");
  }

  if (patch.calendarId !== undefined) {
    const owned = await prisma.qcCalendar.findFirst({
      where: { id: patch.calendarId, orgId: ctx.orgId, userId: ctx.userId },
    });
    if (!owned) throw new HttpError(404, "Calendar not found");
  }

  const updated = await prisma.qcCalendarEvent.update({
    where: { id: row.id },
    data: {
      ...(patch.calendarId !== undefined ? { calendarId: patch.calendarId } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.location !== undefined ? { location: patch.location } : {}),
      ...(patch.start !== undefined ? { start: new Date(patch.start) } : {}),
      ...(patch.end !== undefined ? { end: new Date(patch.end) } : {}),
      ...(patch.allDay !== undefined ? { allDay: patch.allDay } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.joinUrl !== undefined ? { joinUrl: patch.joinUrl } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    },
  });

  const calendar = await prisma.qcCalendar.findFirst({ where: { id: updated.calendarId } });
  return toCalendarEventDto(updated, calendar?.color);
}

/** DELETE /api/calendar/events/[id] — hard-delete an event the caller owns. */
export async function deleteEvent(ctx: OrgContext, eventId: string): Promise<{ deleted: true }> {
  const row = await prisma.qcCalendarEvent.findFirst({
    where: { id: eventId, orgId: ctx.orgId, userId: ctx.userId },
  });
  if (!row) throw new HttpError(404, "Event not found");
  await prisma.qcCalendarEvent.delete({ where: { id: row.id } });
  return { deleted: true };
}
