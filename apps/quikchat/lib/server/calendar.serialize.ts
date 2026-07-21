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
    start: meeting.start.toISOString(),
    end: meeting.end.toISOString(),
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
    })),
  };
}
