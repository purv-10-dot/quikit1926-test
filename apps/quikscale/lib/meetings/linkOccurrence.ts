/**
 * Linking a transcript to the meeting occurrence it belongs to.
 *
 * WHY THIS IS A SHARED HELPER
 * ---------------------------
 * A `ClientMeetingTranscript` is only raw text until it points at the
 * occurrence row it came from — `ClientDailyHuddle` for a huddle,
 * `ClientWeeklyMeeting` for a weekly meeting. Everything downstream keys off
 * that link:
 *
 *   · `lib/reports/wmData.ts` loads a Weekly Meeting Report *from the meeting*,
 *     and finds its transcript through `weeklyMeetingId`. No link, no report.
 *   · The Daily Huddle rollup selects transcripts the same way.
 *   · QuikFlow's `meeting.transcript.attached` trigger fires on the linked id.
 *
 * The Fathom ingest path (`/api/internal/actions/save-transcript`) has always
 * resolved this. The manual upload path did not, so every hand-uploaded
 * transcript was orphaned: it rendered fine in the viewer and could produce the
 * lightweight per-transcript report, but the Weekly Meeting Report tab could
 * never see it. Both paths now call this one function.
 *
 * NOT FOUND IS NORMAL, NOT AN ERROR. Occurrences are created by the client's
 * meeting schedule; a transcript can legitimately arrive for a date nobody
 * scheduled. The caller stores nulls and the transcript stays usable — it just
 * cannot feed an occurrence report until the meeting exists and it is relinked.
 */

import { db } from "@/lib/db";

export type MeetingCadence = "DAILY" | "WEEKLY";

export interface MeetingOccurrenceLink {
  dailyHuddleId: string | null;
  weeklyMeetingId: string | null;
}

export const NO_OCCURRENCE: MeetingOccurrenceLink = {
  dailyHuddleId: null,
  weeklyMeetingId: null,
};

/**
 * The UTC day `meetingDate` falls in.
 *
 * Occurrence rows store `meetingDate` at UTC midnight, but a transcript's date
 * can arrive with a time component (Fathom passes the recording start). Matching
 * on the day range rather than on equality is what makes both callers agree.
 */
function utcDayRange(meetingDate: Date): { gte: Date; lt: Date } {
  const gte = new Date(meetingDate);
  gte.setUTCHours(0, 0, 0, 0);
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

/**
 * Find the occurrence row for this client + cadence + date, if one exists.
 *
 * Always org-scoped, and soft-deleted occurrences are never linked — a deleted
 * meeting must not silently reappear as the parent of a new transcript.
 */
export async function findMeetingOccurrence(
  orgId: string,
  clientId: string,
  type: MeetingCadence,
  meetingDate: Date,
): Promise<MeetingOccurrenceLink> {
  const meetingDay = utcDayRange(meetingDate);

  if (type === "DAILY") {
    const row = await db.clientDailyHuddle.findFirst({
      where: { orgId, clientId, deletedAt: null, meetingDate: meetingDay },
      select: { id: true },
    });
    return { dailyHuddleId: row?.id ?? null, weeklyMeetingId: null };
  }

  const row = await db.clientWeeklyMeeting.findFirst({
    where: { orgId, clientId, deletedAt: null, meetingDate: meetingDay },
    select: { id: true },
  });
  return { dailyHuddleId: null, weeklyMeetingId: row?.id ?? null };
}
