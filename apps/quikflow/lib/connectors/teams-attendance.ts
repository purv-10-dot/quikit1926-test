/**
 * Microsoft Teams attendance reports — who joined a meeting, and for how long.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every other attendance signal QuikScale has can only ever prove PRESENCE. A
 * participant list says someone was invited or seen; a transcript says someone
 * spoke. Neither can say anybody was missing, because silence is not evidence —
 * which is why a report built on them can never name an absentee.
 *
 * Graph's attendance report is different in two ways that matter:
 *   - it is COMPLETE, so a required invitee absent from it was genuinely not
 *     there (doc 15 §4.5 tier 1c — provable absence, not inferred); and
 *   - it carries DURATION, so ninety seconds of a twenty-minute huddle can be
 *     scored as the half-presence it is rather than as attendance (tier 1b).
 *
 * SCOPE — deliberately attendance only
 * ------------------------------------
 * A previous, larger Teams capture implementation was reverted on 2026-08-21
 * (doc 16 §14) because it PATCHed live meetings on every calendar run and asked
 * for consent scopes nothing used. This module reads and never writes: no
 * `recordAutomatically`, no lobby settings, no transcript endpoints. It adds
 * exactly two read scopes to the existing Teams connection.
 *
 * AUTH — delegated first (doc 16 §12, D31/D32)
 * --------------------------------------------
 * The connected mailbox IS the meeting organiser — it is the one `/me/events`
 * writes to, and `WfConnection.label` records it. So its own delegated token can
 * read its own meetings, which makes this multi-tenant with no per-tenant
 * configuration and, crucially, avoids the Teams **application access policy**
 * that app-only permissions require (`Grant-CsApplicationAccessPolicy`, an ops
 * task that has blocked every previous attempt).
 *
 * A connection that predates the capture scopes cannot gain them by refreshing,
 * so it reports `reconnect-required` rather than failing obscurely later.
 */

import { db } from "@/lib/db";
import { GRAPH } from "./microsoft-identity";
import { getFreshAccessToken, CALENDAR_PROVIDER_IDS } from "./index";

/**
 * The two read scopes this module needs beyond the calendar connection's own.
 *
 * Re-exported from the connector that actually asks for them on the consent
 * screen, never re-declared: a second copy drifts, and a scope listed here but
 * not requested there would make `missingCaptureScopes()` reject every
 * connection forever, with reconnecting powerless to fix it.
 */
export { CAPTURE_SCOPES } from "./teams";
import { CAPTURE_SCOPES } from "./teams";

export type AttendanceFailure =
  /** The connection exists but was consented before the capture scopes. */
  | "reconnect-required"
  /** No connected Teams calendar for this org at all. */
  | "not-connected"
  /** Graph 403 that names the Teams application access policy — an ops task. */
  | "access-policy"
  /** No meeting matched the join URL, or no report for that date yet. */
  | "not-found"
  /** The meeting has not produced its report yet (they lag the meeting end). */
  | "not-ready"
  | "graph-error";

export class TeamsAttendanceError extends Error {
  constructor(
    readonly reason: AttendanceFailure,
    message: string,
  ) {
    super(message);
    this.name = "TeamsAttendanceError";
  }
}

/** Where and as whom to call Graph. One shape for delegated and app-only. */
export interface CaptureContext {
  accessToken: string;
  /** "/me" delegated; "/users/{upn}" app-only. Every path is built from this. */
  userPath: string;
  organizer: string;
  mode: "delegated";
}

/** Scopes the connection is missing, if any. Empty ⇒ good to go. */
export function missingCaptureScopes(scopes: string[]): string[] {
  const have = new Set(scopes.map((s) => s.toLowerCase()));
  return CAPTURE_SCOPES.filter((s) => !have.has(s.toLowerCase()));
}

/**
 * Resolve how to read this org's meetings.
 *
 * Delegated only, for now. The `CaptureContext` shape exists so an app-only
 * fallback is a change to this function rather than to every caller — but
 * adding one means taking on the access-policy prerequisite, so it stays out
 * until a real tenant proves the delegated path insufficient.
 */
export async function resolveCaptureContext(
  orgId: string,
  opts: { connectionId?: string } = {},
): Promise<CaptureContext> {
  const conn = await db.wfConnection.findFirst({
    where: {
      orgId,
      status: "connected",
      ...(opts.connectionId ? { id: opts.connectionId } : { provider: { in: CALENDAR_PROVIDER_IDS } }),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orgId: true,
      provider: true,
      label: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      scopes: true,
      settings: true,
    },
  });

  if (!conn) {
    throw new TeamsAttendanceError("not-connected", "No connected Teams calendar for this org.");
  }

  const missing = missingCaptureScopes(conn.scopes ?? []);
  if (missing.length) {
    // Never fall through to another auth mode here. Switching a customer onto a
    // path that needs an access policy they have never heard of turns a
    // one-click reconnect into an opaque 403.
    throw new TeamsAttendanceError(
      "reconnect-required",
      `Reconnect Teams to grant ${missing.join(", ")}.`,
    );
  }

  return {
    accessToken: await getFreshAccessToken(conn),
    userPath: "/me",
    organizer: conn.label,
    mode: "delegated",
  };
}

async function graphGet<T>(ctx: CaptureContext, path: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: string };
  };

  if (res.ok) return json;

  const message = json.error?.message ?? `HTTP ${res.status}`;
  if (res.status === 404) throw new TeamsAttendanceError("not-found", message);
  // The access-policy 403 is called out separately because it is the expected
  // first-run failure on an app-only tenant and it is an ops task, not a bug —
  // conflating it with a generic 403 sends people hunting through code.
  if (res.status === 403 && /application access policy|ApplicationAccessPolicy/i.test(message)) {
    throw new TeamsAttendanceError("access-policy", message);
  }
  throw new TeamsAttendanceError("graph-error", message);
}

/** Resolve a Teams meeting from the join URL we already store per client+kind. */
export async function findOnlineMeetingByJoinUrl(
  ctx: CaptureContext,
  joinWebUrl: string,
): Promise<string | null> {
  // Graph's OData string literal escapes a single quote by doubling it.
  const filter = encodeURIComponent(`joinWebUrl eq '${joinWebUrl.replace(/'/g, "''")}'`);
  const json = await graphGet<{ value?: { id?: string }[] }>(
    ctx,
    `${ctx.userPath}/onlineMeetings?$filter=${filter}`,
  );
  return json.value?.[0]?.id ?? null;
}

export interface AttendanceReportSummary {
  id: string;
  meetingStartDateTime: string | null;
  meetingEndDateTime: string | null;
  totalParticipantCount: number | null;
}

export async function listAttendanceReports(
  ctx: CaptureContext,
  meetingId: string,
): Promise<AttendanceReportSummary[]> {
  const json = await graphGet<{
    value?: {
      id?: string;
      meetingStartDateTime?: string;
      meetingEndDateTime?: string;
      totalParticipantCount?: number;
    }[];
  }>(ctx, `${ctx.userPath}/onlineMeetings/${meetingId}/attendanceReports`);

  return (json.value ?? [])
    .filter((r): r is { id: string } & typeof r => Boolean(r.id))
    .map((r) => ({
      id: r.id,
      meetingStartDateTime: r.meetingStartDateTime ?? null,
      meetingEndDateTime: r.meetingEndDateTime ?? null,
      totalParticipantCount: r.totalParticipantCount ?? null,
    }));
}

/**
 * The report for ONE occurrence, by date.
 *
 * This exists because a recurring huddle stacks EVERY occurrence's report under
 * the same `onlineMeeting` id. "The latest report" would attach today's
 * attendance to last week's huddle — and since a report is a complete list of
 * joiners, that does not merely skew a number, it marks a whole team absent for
 * a meeting they attended.
 *
 * `date` is `YYYY-MM-DD` in the meeting's own timezone; comparison is on the
 * UTC calendar date of `meetingStartDateTime`, which is how the rest of the
 * meeting pipeline keys a day.
 */
export function reportForDate(
  reports: AttendanceReportSummary[],
  date: string,
): AttendanceReportSummary | null {
  const sameDay = reports.filter((r) => r.meetingStartDateTime?.slice(0, 10) === date);
  if (!sameDay.length) return null;
  // More than one on a date means the meeting was restarted. The last one to
  // start is the session that ran; earlier ones are usually a few seconds long.
  return sameDay.sort((a, b) =>
    (a.meetingStartDateTime ?? "").localeCompare(b.meetingStartDateTime ?? ""),
  )[sameDay.length - 1];
}

export interface AttendanceInterval {
  joinDateTime: string | null;
  leaveDateTime: string | null;
  durationInSeconds: number;
}

export interface AttendanceRecord {
  displayName: string;
  email: string | null;
  role: string | null;
  totalAttendanceInSeconds: number;
  intervals: AttendanceInterval[];
}

export async function getAttendanceRecords(
  ctx: CaptureContext,
  meetingId: string,
  reportId: string,
): Promise<AttendanceRecord[]> {
  const json = await graphGet<{
    value?: {
      identity?: { displayName?: string };
      emailAddress?: string;
      role?: string;
      totalAttendanceInSeconds?: number;
      attendanceIntervals?: {
        joinDateTime?: string;
        leaveDateTime?: string;
        durationInSeconds?: number;
      }[];
    }[];
  }>(ctx, `${ctx.userPath}/onlineMeetings/${meetingId}/attendanceReports/${reportId}/attendanceRecords`);

  return (json.value ?? []).map((r) => ({
    displayName: r.identity?.displayName ?? "",
    email: r.emailAddress ?? null,
    role: r.role ?? null,
    totalAttendanceInSeconds: r.totalAttendanceInSeconds ?? 0,
    intervals: (r.attendanceIntervals ?? []).map((i) => ({
      joinDateTime: i.joinDateTime ?? null,
      leaveDateTime: i.leaveDateTime ?? null,
      durationInSeconds: i.durationInSeconds ?? 0,
    })),
  }));
}

export interface InvitedAttendee {
  email: string;
  type: "required" | "optional";
}

/**
 * Who was invited, and how.
 *
 * The attendance report says who came; only the INVITE says who was expected.
 * Both are needed: without the invite a missing record is ambiguous (absent, or
 * never asked?), which is exactly the ambiguity that leaves cells UNKNOWN.
 */
export async function getEventAttendees(
  ctx: CaptureContext,
  eventId: string,
): Promise<InvitedAttendee[]> {
  const json = await graphGet<{
    attendees?: { emailAddress?: { address?: string }; type?: string }[];
  }>(ctx, `${ctx.userPath}/events/${eventId}?$select=attendees`);

  return (json.attendees ?? [])
    .map((a) => ({
      email: a.emailAddress?.address ?? "",
      // Graph also has "resource" for rooms; anything not explicitly optional
      // is treated as required, which is the conservative reading.
      type: (a.type === "optional" ? "optional" : "required") as "required" | "optional",
    }))
    .filter((a) => a.email);
}

export interface OccurrenceAttendance {
  meetingStart: string | null;
  meetingEnd: string | null;
  records: AttendanceRecord[];
  invited: InvitedAttendee[];
}

/**
 * Everything QuikScale needs about one occurrence, resolved from the calendar
 * link we already persist.
 *
 * Throws `TeamsAttendanceError` with a `reason` the caller can act on; callers
 * are expected to degrade (no Teams evidence ⇒ the report falls back to
 * transcript rungs) rather than fail the whole report.
 */
export async function fetchOccurrenceAttendance(
  orgId: string,
  args: { refType: string; refId: string; kind: string; date: string },
): Promise<OccurrenceAttendance> {
  const link = await db.wfCalendarLink.findFirst({
    where: { orgId, refType: args.refType, refId: args.refId, kind: args.kind },
    select: { joinUrl: true, externalEventId: true, connectionId: true },
  });
  if (!link?.joinUrl) {
    throw new TeamsAttendanceError("not-found", "No Teams meeting is linked to this client.");
  }

  const ctx = await resolveCaptureContext(orgId, { connectionId: link.connectionId ?? undefined });

  const meetingId = await findOnlineMeetingByJoinUrl(ctx, link.joinUrl);
  if (!meetingId) {
    throw new TeamsAttendanceError("not-found", "The linked Teams meeting no longer exists.");
  }

  const report = reportForDate(await listAttendanceReports(ctx, meetingId), args.date);
  if (!report) {
    // Reports are generated after the meeting ends, not during, so "nothing
    // yet" is a normal state worth distinguishing from "nothing ever".
    throw new TeamsAttendanceError("not-ready", "No attendance report for that date yet.");
  }

  const [records, invited] = await Promise.all([
    getAttendanceRecords(ctx, meetingId, report.id),
    // A missing/renamed event must not lose the attendance we did get — the
    // invite only refines the verdict from "unknown" to "absent".
    link.externalEventId
      ? getEventAttendees(ctx, link.externalEventId).catch(() => [] as InvitedAttendee[])
      : Promise.resolve([] as InvitedAttendee[]),
  ]);

  return {
    meetingStart: report.meetingStartDateTime,
    meetingEnd: report.meetingEndDateTime,
    records,
    invited,
  };
}
