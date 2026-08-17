/**
 * Calendar/meetings domain service (S15a). Orchestrates the CalendarProvider
 * seam + the QcMeeting projection + the message pipeline. All calendar I/O goes
 * through `getCalendarProvider()` (stub now; Google in 15b) — no provider
 * specifics leak here.
 */
import { assertMembership, HttpError } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import { ASSISTANT_BOT_USER_ID, logger } from "@/lib/shared";
import type {
  CalendarConnectionDto,
  CreateMeetingInput,
  FreeBusyDto,
  MeetingDto,
  OrgContext,
  RsvpStatus,
} from "@/lib/shared";
import {
  allDayDatePart,
  allDayStartIso,
  exclusiveEndFor,
  isMidnightUtc,
} from "@/lib/all-day";
import { getActiveProviderId, getCalendarProvider } from "./calendar";
import { loadMeetingDto } from "./calendar.serialize";
import { getConnection as getMicrosoftConnection } from "./calendar/microsoft";
import * as messages from "./messages.service";

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : "unknown error");

/** Active provider + the caller's per-user connection state (for settings UI). */
export async function getConnectionStatus(ctx: OrgContext): Promise<CalendarConnectionDto> {
  const provider = getActiveProviderId();
  if (provider === "microsoft") {
    const conn = await getMicrosoftConnection(ctx.userId);
    return {
      provider,
      requiresUserConnect: true,
      connected: !!conn,
      email: conn?.email ?? null,
    };
  }
  return { provider, requiresUserConnect: false, connected: false, email: null };
}

/** Resolve userId → email, asserting every id is an active member of `orgId`. */
async function resolveOrgEmails(orgId: string, userIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds));
  if (!ids.length) return new Map();
  const members = await prisma.orgMember.findMany({
    where: { orgId, userId: { in: ids }, status: "active" },
  });
  const memberIds = new Set(members.map((m) => m.userId));
  for (const id of ids) {
    if (!memberIds.has(id)) throw new HttpError(403, "User is not in this org");
  }
  const users = await prisma.user.findMany({ where: { id: { in: ids } } });
  const byId = new Map(users.map((u) => [u.id, u.email]));
  for (const id of ids) {
    if (!byId.has(id)) throw new HttpError(404, "User not found");
  }
  return byId;
}

/** GET /api/calendar/free-busy — busy blocks per (in-org) user over a window. */
export async function getFreeBusy(
  ctx: OrgContext,
  userIds: string[],
  from: string,
  to: string,
): Promise<FreeBusyDto> {
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    throw new HttpError(400, "from/to must be ISO timestamps");
  }
  // Caller is always allowed to see their own; resolve+assert the rest. The
  // assistant bot (S15c) is never a free-busy subject — it has no calendar and
  // isn't an OrgMember, so a leaked bot id must not 403 the whole request.
  const targets = Array.from(new Set([ctx.userId, ...userIds])).filter(
    (id) => id !== ASSISTANT_BOT_USER_ID,
  );
  const emails = await resolveOrgEmails(ctx.orgId, targets);
  const provider = await getCalendarProvider();
  const byEmail = await provider.getFreeBusy({
    orgId: ctx.orgId,
    actingUserId: ctx.userId,
    userEmails: targets.map((id) => emails.get(id)!),
    from,
    to,
  });
  // Re-key by userId (the client speaks userIds, not emails). A `"unknown"`
  // result (provider can't see the calendar) is reported separately so the grid
  // renders it distinctly instead of as "free".
  const busy: FreeBusyDto["busy"] = {};
  const unknown: string[] = [];
  for (const id of targets) {
    const r = byEmail[emails.get(id)!];
    if (r === "unknown" || r === undefined) unknown.push(id);
    else busy[id] = r;
  }
  return { from, to, busy, unknown };
}

/**
 * GET /api/calendar/meetings — the caller's meetings (as organizer or attendee)
 * in [from,to], org-scoped, excluding cancelled, soonest first. Powers the
 * planner/agenda view (S16).
 */
export async function listMeetings(
  ctx: OrgContext,
  from: string,
  to: string,
): Promise<MeetingDto[]> {
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    throw new HttpError(400, "from/to must be ISO timestamps");
  }
  const rows = await prisma.qcMeeting.findMany({
    where: {
      orgId: ctx.orgId,
      status: { not: "cancelled" },
      start: { gte: new Date(from), lte: new Date(to) },
      OR: [{ organizerId: ctx.userId }, { attendees: { some: { userId: ctx.userId } } }],
    },
    orderBy: { start: "asc" },
  });
  const dtos = await Promise.all(rows.map((r) => loadMeetingDto(ctx.orgId, r.id)));
  return dtos.filter((d): d is MeetingDto => d !== null);
}

/** POST /api/channels/[id]/meetings — schedule + announce a meeting. */
export async function createMeeting(
  ctx: OrgContext,
  channelId: string,
  input: CreateMeetingInput,
): Promise<{ meeting: MeetingDto; message: Awaited<ReturnType<typeof messages.send>> }> {
  await assertMembership(ctx.orgId, channelId, ctx.userId);
  const title = (input.title ?? "").trim();
  if (!title) throw new HttpError(400, "title is required");
  if (
    !input.start ||
    !input.end ||
    Number.isNaN(Date.parse(input.start)) ||
    Number.isNaN(Date.parse(input.end))
  ) {
    throw new HttpError(400, "start/end must be ISO timestamps");
  }
  if (Date.parse(input.end) <= Date.parse(input.start)) {
    throw new HttpError(400, "end must be after start");
  }

  // ── All-day: convert ONCE, here, from the DTO's inclusive form to the
  // exclusive midnight-UTC instants storage and both providers expect.
  // `lib/all-day.ts` owns both directions; nothing below may re-apply ±1 day.
  const allDay = !!input.allDay;
  let startIso = input.start;
  let endIso = input.end;
  if (allDay) {
    startIso = allDayStartIso(allDayDatePart(input.start));
    endIso = exclusiveEndFor(allDayDatePart(input.end));
    // Belt and braces: Graph rejects isAllDay unless both are exactly midnight.
    // Assert rather than trust the client, so a malformed body fails as a 400
    // here instead of a 502 from the provider.
    if (!isMidnightUtc(startIso) || !isMidnightUtc(endIso)) {
      throw new HttpError(400, "all-day meetings must start and end at midnight UTC");
    }
  }

  // Organizer is always an attendee (auto-accepted); resolve everyone's email.
  // The assistant bot (S15c) can't be an attendee — drop a leaked bot id so it
  // doesn't 403 the request via the OrgMember assertion.
  const attendeeIds = Array.from(new Set([ctx.userId, ...(input.attendeeUserIds ?? [])])).filter(
    (id) => id !== ASSISTANT_BOT_USER_ID,
  );
  const emails = await resolveOrgEmails(ctx.orgId, attendeeIds);
  // The organizer is never optional, whatever the client sends.
  const optionalIds = new Set(
    (input.optionalAttendeeUserIds ?? []).filter((id) => id !== ctx.userId),
  );

  // Provider failures (bad token, unreachable API) become a legible 502 the UI
  // can show — never an unhandled 500 (S16).
  const provider = await getCalendarProvider();
  let result;
  try {
    result = await provider.createMeeting({
      orgId: ctx.orgId,
      organizerId: ctx.userId,
      title,
      description: input.description,
      location: input.location?.trim() || undefined,
      allDay,
      start: startIso,
      end: endIso,
      attendees: attendeeIds.map((id) => ({
        email: emails.get(id)!,
        optional: optionalIds.has(id),
      })),
      conferencing: !!input.conferencing,
    });
  } catch (e) {
    throw new HttpError(502, `Calendar provider couldn't create the meeting: ${errMsg(e)}`);
  }

  const meeting = await prisma.qcMeeting.create({
    data: {
      orgId: ctx.orgId,
      channelId,
      organizerId: ctx.userId,
      title,
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      allDay,
      start: new Date(startIso),
      end: new Date(endIso),
      joinUrl: result.joinUrl,
      externalEventId: result.externalEventId,
      status: "scheduled",
      attendees: {
        create: attendeeIds.map((id) => ({
          userId: id,
          email: emails.get(id)!,
          // Organizer accepts implicitly; everyone else starts at needs_action.
          rsvp: id === ctx.userId ? "accepted" : "needs_action",
          optional: optionalIds.has(id),
        })),
      },
    },
  });

  // Announce via the normal message pipeline so it fans out + notifies (S10).
  const message = await messages.send(ctx, channelId, {
    content: title,
    type: "Meeting",
    data: { meetingId: meeting.id },
    clientMessageId: input.clientMessageId,
  });

  await prisma.qcMeeting.update({
    where: { id: meeting.id },
    data: { createdMessageId: message.id },
  });

  const dto = await loadMeetingDto(ctx.orgId, meeting.id);
  return { meeting: dto!, message };
}

/** PATCH /api/meetings/[id]/rsvp — set the CALLER's RSVP + live-refresh the card. */
export async function setRsvp(
  ctx: OrgContext,
  meetingId: string,
  status: RsvpStatus,
): Promise<MeetingDto> {
  if (!["accepted", "declined", "tentative"].includes(status)) {
    throw new HttpError(400, "invalid rsvp status");
  }
  const meeting = await prisma.qcMeeting.findFirst({
    where: { id: meetingId, orgId: ctx.orgId },
  });
  if (!meeting) throw new HttpError(404, "Meeting not found");
  // A caller can only RSVP for THEMSELVES (the unique (meetingId,userId) row).
  const attendee = await prisma.qcMeetingAttendee.findUnique({
    where: { meetingId_userId: { meetingId, userId: ctx.userId } },
  });
  if (!attendee) throw new HttpError(403, "You are not an attendee of this meeting");

  await prisma.qcMeetingAttendee.update({
    where: { id: attendee.id },
    data: { rsvp: status },
  });
  if (meeting.externalEventId) {
    try {
      const provider = await getCalendarProvider();
      await provider.setRsvp({
        orgId: ctx.orgId,
        actingUserId: ctx.userId,
        externalEventId: meeting.externalEventId,
        userEmail: attendee.email,
        status,
      });
    } catch (e) {
      // The local RSVP (the chat-facing source of truth) is already saved; a
      // provider hiccup must not 500 or revert it. Log and continue (S16).
      logger.warn({ meetingId, error: errMsg(e) }, "calendar provider RSVP sync failed");
    }
  }

  // Live-refresh the card for everyone by re-publishing its message.
  if (meeting.createdMessageId) {
    await messages.republishMessage(ctx, meeting.createdMessageId);
  }
  const dto = await loadMeetingDto(ctx.orgId, meetingId);
  return dto!;
}
