import { withOrgAuth } from "@/lib/auth-shims";
import { MeetingJoinError, getOrStartMeetingCall } from "@/lib/server/calling/meeting-call";

export const dynamic = "force-dynamic";

/**
 * POST /api/meetings/[id]/join — resolve a scheduled meeting to its QuikChat
 * call, starting it if nobody has yet. Backs the stable `/meeting/{id}/join`
 * address that goes in calendar invites.
 *
 * POST rather than GET because it may create; it is nonetheless idempotent —
 * repeat calls return the same live call.
 *
 * Deliberately NOT gated on `moduleKey: "calls"`. The organizer scheduled this
 * meeting through the calendar module; failing an invited attendee's join link
 * on a module toggle would strand them on a link they were sent. Authorisation
 * is the meeting's own attendee list — see meeting-call.ts.
 */
export const POST = withOrgAuth(async (_req, ctx, params) => {
  try {
    const { callId, created } = await getOrStartMeetingCall(ctx, params.id!);
    return Response.json({ callId, created });
  } catch (e) {
    if (e instanceof MeetingJoinError) {
      // `code` is what the page switches on for its copy; `error` stays the
      // human string so any generic error surface still says something useful.
      return Response.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
});
