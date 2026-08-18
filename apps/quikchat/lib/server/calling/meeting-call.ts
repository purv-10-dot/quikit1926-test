/**
 * Resolve a scheduled meeting to a QuikChat call — join the live one if there
 * is one, otherwise start it. This is what `/meeting/{id}/join` is backed by,
 * so a link pasted into a calendar invite still works days later, for any
 * attendee, clicked repeatedly, or clicked by two people at the same instant.
 *
 * ── WHY THIS IS A SEPARATE ENTRY POINT, and what stops it being a back door ──
 * Starting an ad-hoc group call requires `Call.Group:create` (enforced in
 * POST /api/calls/group). Requiring every attendee to hold that permission
 * independently means people cannot join meetings they were invited to, so this
 * path authorises differently: **being on this meeting's attendee list**. The
 * organizer already exercised `Call.Group:create` when they scheduled it.
 *
 * That is only safe because this function CANNOT be steered:
 *   - its only input is a `meetingId`; there is no `channelId`, no
 *     `targetUserIds`, and no `type` parameter,
 *   - every one of those is derived from the persisted meeting row,
 *   - authorisation is `QcMeetingAttendee` for THIS meeting — NOT channel
 *     membership, which would make it `Call.Group:create` with extra steps.
 * So the worst a caller can do is start the call for a meeting they were
 * already invited to. Adding a channelId/type parameter here would turn it into
 * an unauthenticated ad-hoc group-call endpoint — don't.
 *
 * ── THE CLAIM (race between two attendees clicking at 10:00:00) ─────────────
 * `QcCall.meetingId` is a plain index and `QcMeeting.callId` is nullable and
 * non-unique, so the schema cannot enforce one-call-per-meeting and a unique
 * constraint would be a migration. The invariant is held in this layer instead,
 * with `QcMeeting.callId` as a claim token:
 *
 *   create → claim (conditional updateMany) → on loss, delete ours and redirect
 *   to the winner's.
 *
 * Two attendees issuing the same conditional `updateMany` on one row serialize
 * under Postgres row locks, so exactly one gets `count === 1`.
 *
 * THE CLAIM IS ADVISORY, NEVER AUTHORITATIVE. "Is there a live call" is always
 * answered by querying `QcCall` by `meetingId` with a live status — never by
 * reading `QcMeeting.callId`. That matters because a stale claim pointing at an
 * ended call must not be able to wedge a meeting shut: the claim predicate
 * re-claims over the exact stale value observed at the start of this attempt
 * (`callId IS NULL OR callId = <observed>`), so a second occurrence, or a rejoin
 * after everyone hung up, reclaims cleanly. `endCall` also clears it (hygiene,
 * and the common path) — but correctness does not depend on that having run,
 * which is deliberate: the sweep and other terminal paths do not clear it.
 */
import { db as prisma } from "@quikit/database";
import { HttpError } from "@/lib/auth-shims";
import type { OrgContext } from "@/lib/shared";
import { createCall } from "./calling.service";

/** Machine-readable reason, so the UI can render its own copy per dead end. */
export type MeetingJoinCode = "not_found" | "cancelled" | "not_attendee" | "busy";

export class MeetingJoinError extends HttpError {
  constructor(
    status: number,
    public readonly code: MeetingJoinCode,
    message: string,
  ) {
    super(status, message);
    this.name = "MeetingJoinError";
  }
}

/** Statuses in which a call is joinable. Mirrors the token route's own check. */
const LIVE = ["ringing", "active"] as const;

function findLiveCall(orgId: string, meetingId: string) {
  return prisma.qcCall.findFirst({
    where: { orgId, meetingId, status: { in: [...LIVE] } },
    select: { id: true },
  });
}

export interface MeetingCallResult {
  callId: string;
  /** True when this caller's request is what started the call. */
  created: boolean;
}

export async function getOrStartMeetingCall(
  ctx: OrgContext,
  meetingId: string,
): Promise<MeetingCallResult> {
  const meeting = await prisma.qcMeeting.findFirst({
    where: { id: meetingId, orgId: ctx.orgId },
    include: { attendees: true },
  });
  if (!meeting) {
    throw new MeetingJoinError(404, "not_found", "That meeting no longer exists.");
  }
  if (meeting.status === "cancelled") {
    throw new MeetingJoinError(409, "cancelled", "This meeting was cancelled.");
  }
  // Attendee of THIS meeting — deliberately not channel membership.
  if (!meeting.attendees.some((a) => a.userId === ctx.userId)) {
    throw new MeetingJoinError(403, "not_attendee", "You are not an attendee of this meeting.");
  }

  // The authoritative answer. Anyone already on it (all attendees are made
  // participants at creation) short-circuits here and never reaches createCall,
  // whose one-call-per-user guard would otherwise 409 every attendee except
  // whoever clicked first.
  const live = await findLiveCall(ctx.orgId, meetingId);
  if (live) return { callId: live.id, created: false };

  // The stale value this attempt is allowed to reclaim over (see the header).
  const observedClaim = meeting.callId;
  const attendeeIds = meeting.attendees.map((a) => a.userId);

  let call;
  try {
    call = await createCall(ctx, {
      channelId: meeting.channelId,
      type: "video",
      // Attendees, not all channel members: a scheduled meeting's participants
      // are the people invited to it.
      targetUserIds: attendeeIds,
      meetingId,
      initialStatus: "active",
    });
  } catch (e) {
    // createCall throws 409 when the caller is already in a live call. Two
    // different situations produce that, and they need different copy:
    //   - they are on some OTHER call → genuinely busy,
    //   - they lost the race by microseconds and the winner's call already made
    //     them a participant → not busy at all, just join it.
    // Re-check before deciding; this is in fact the likeliest way the race
    // resolves, with the claim below as the second line of defence.
    if (e instanceof HttpError && e.status === 409) {
      const winner = await findLiveCall(ctx.orgId, meetingId);
      if (winner) return { callId: winner.id, created: false };
      throw new MeetingJoinError(
        409,
        "busy",
        "You're already on a call. Leave it to join this meeting.",
      );
    }
    throw e;
  }

  const claimed = await prisma.qcMeeting.updateMany({
    where: {
      id: meetingId,
      OR: [{ callId: null }, { callId: observedClaim }],
    },
    data: { callId: call.id },
  });

  if (claimed.count === 1) return { callId: call.id, created: true };

  // Lost the claim: someone else's call is the real one. Clean ours up on a
  // BEST-EFFORT basis — an orphaned QcCall is untidy, but it must never be the
  // reason a user is left looking at an error, so a failed delete is logged by
  // the caller's error path and otherwise ignored.
  try {
    await prisma.qcCall.delete({ where: { id: call.id } });
  } catch {
    // Intentionally swallowed — see above.
  }
  const winner = await findLiveCall(ctx.orgId, meetingId);
  // If the winner somehow isn't live (ended between claim and re-read), our own
  // call is still the best available answer.
  return { callId: winner?.id ?? call.id, created: !winner };
}
