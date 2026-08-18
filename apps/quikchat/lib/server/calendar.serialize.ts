/**
 * Meeting projection serializer (S15a). Builds the `MeetingDto` that gets
 * injected into a `Meeting` message's `data.meeting` so the in-chat card renders
 * (and live-updates via message_update on RSVP) with no extra client fetch.
 *
 * Kept separate from calendar.service.ts so messages.service can import it
 * without a cycle (calendar.service imports messages.service.send).
 */
import { db as prisma } from "@quikit/database";
import type { AttendeeRsvp, MeetingDto, MeetingStatus } from "@/lib/shared";
import { inclusiveEndFor } from "@/lib/all-day";
import { loadPublicUsers } from "./helpers";

/** Load + serialize a meeting by id, scoped to the org. Returns null if gone. */
export async function loadMeetingDto(orgId: string, meetingId: string): Promise<MeetingDto | null> {
  const meeting = await prisma.qcMeeting.findFirst({
    where: { id: meetingId, orgId },
    include: { attendees: true },
  });
  if (!meeting) return null;
  const users = await loadPublicUsers(meeting.attendees.map((a) => a.userId));
  return {
    id: meeting.id,
    channelId: meeting.channelId,
    organizerId: meeting.organizerId,
    title: meeting.title,
    description: meeting.description,
    location: meeting.location,
    allDay: meeting.allDay,
    start: meeting.start.toISOString(),
    // THE conversion point, applied exactly once. Storage and both providers
    // use an EXCLUSIVE all-day end (one day on the 14th = 14th → 15th 00:00Z);
    // MeetingDto.end is INCLUSIVE so no renderer has to know that. Doing this
    // anywhere else as well would shift the event twice — see lib/all-day.ts.
    end: meeting.allDay
      ? inclusiveEndFor(meeting.end.toISOString())
      : meeting.end.toISOString(),
    joinUrl: meeting.joinUrl,
    status: meeting.status as MeetingStatus,
    attendees: meeting.attendees.map((a) => ({
      user: users.get(a.userId) ?? {
        id: a.userId,
        displayName: a.email,
        avatarUrl: null,
      },
      email: a.email,
      rsvp: a.rsvp as AttendeeRsvp,
      optional: a.optional,
    })),
  };
}
