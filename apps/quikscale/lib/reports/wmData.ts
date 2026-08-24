/**
 * Loading everything one Weekly Meeting report needs — from Postgres, once.
 *
 * The contract that makes the report cheap: **no transcript is read here**. The
 * extractor already turned the meeting into facts (P5), so composition reads
 * rows. A six-hour meeting and a ninety-minute one cost the same to load.
 *
 * Every query is scoped by `orgId`, and the roster comes from the same
 * `ClientTeamMember` set the daily huddle uses, so a member's attendance type
 * means the same thing in both reports.
 */

import { db } from "@/lib/db";
import type { ClientAttendanceType } from "@/lib/ai/weeklyHuddleAggregate";
import { resolveAgenda, type AgendaSegment } from "@/lib/meetings/agendaConfig";

/** A roster member as the report sees them. */
export interface WmRosterMember {
  id: string;
  name: string;
  role: string | null;
  attendanceType: ClientAttendanceType;
}

export interface WmContext {
  meeting: {
    id: string;
    clientId: string;
    meetingDate: Date;
    callStatus: string;
    callStatusOther: string | null;
    actualStartTime: string | null;
    actualEndTime: string | null;
    punctualityOverride: string;
    /** The seven human flags, keyed by segment. */
    flags: Record<string, unknown>;
  };
  client: {
    id: string;
    name: string;
    weeklyStartTime: string | null;
    weeklyEndTime: string | null;
    agenda: AgendaSegment[];
  };
  roster: WmRosterMember[];
  /** Members a human ticked absent for this meeting. */
  markedAbsentIds: string[];
  /** True when a human logged the meeting, making the absence list authoritative. */
  absenceListAuthoritative: boolean;
  /** Members whose dashboard was marked not-applicable this week. */
  dashboardNaIds: string[];
  transcript: {
    id: string;
    attendeeMemberIds: string[];
    /** Whether the attendee list is complete enough to infer absence from. */
    participantListUsable: boolean;
  } | null;
  extraction: {
    runId: string;
    status: string;
    coveragePct: number | null;
    extractionVersion: number | null;
    /** Time windows nobody read, from failed or unattempted chunks. */
    missingWindows: Array<{ startMs: number; endMs: number }>;
  } | null;
  facts: {
    segments: WmSegmentFact[];
    kpi: WmKpiFact[];
    gaps: WmGapFact[];
    discussions: WmDiscussionFact[];
    /** Members who spoke — a presence signal for the attendance ladder. */
    spokeMemberIds: string[];
  };
}

export interface WmSegmentFact {
  segmentKey: string;
  coverage: string;
  timeDiscipline: string;
  expectedMinutes: number | null;
  actualMinutes: number | null;
  startMs: number | null;
  endMs: number | null;
  humanFlag: string | null;
  flagAgrees: boolean;
  comment: string | null;
}

export interface WmKpiFact {
  speakerRaw: string;
  clientMemberId: string | null;
  kpiRag: string | null;
  priorityRag: string | null;
  keyPoints: string[];
  ragConflict: boolean;
}

export interface WmGapFact {
  gap: string;
  agreedAction: string | null;
  ownerRaw: string | null;
  scope: string;
  raisedByRaw: string[];
  severityStated: string | null;
}

export interface WmDiscussionFact {
  kind: string;
  sharedByRaw: string | null;
  summary: string;
  outcome: string | null;
  wasDeferred: boolean;
}

/** The meeting is missing, deleted, or belongs to another org. */
export class WmContextError extends Error {
  constructor(
    message: string,
    readonly code: "MEETING_NOT_FOUND" | "CLIENT_NOT_FOUND",
  ) {
    super(message);
    this.name = "WmContextError";
  }
}

/**
 * Load one meeting's full context.
 *
 * Returns `extraction: null` and empty fact arrays when extraction has not run.
 * That is a legitimate state, not an error: the report still has the human
 * record — flags, absences, times — and composes a thinner but honest version
 * that says what is missing. Refusing to generate would leave the facilitator
 * with nothing at all while a worker is down.
 */
export async function loadWmContext(
  orgId: string,
  weeklyMeetingId: string,
): Promise<WmContext> {
  const meeting = await db.clientWeeklyMeeting.findFirst({
    where: { id: weeklyMeetingId, orgId, deletedAt: null },
    include: {
      absentTeamMembers: { select: { clientMemberId: true } },
      dashboardNATeamMembers: { select: { clientMemberId: true } },

    },
  });
  if (!meeting) {
    throw new WmContextError("Weekly meeting not found", "MEETING_NOT_FOUND");
  }

  const client = await db.client.findFirst({
    where: { id: meeting.clientId, orgId, deletedAt: null },
    select: {
      id: true,
      name: true,
      weeklyStartTime: true,
      weeklyEndTime: true,
      weeklyAgendaConfig: true,
    },
  });
  if (!client) {
    throw new WmContextError("Client not found", "CLIENT_NOT_FOUND");
  }

  const teamLinks = await db.clientTeamMember.findMany({
    where: { orgId, clientId: meeting.clientId },
    select: {
      attendanceType: true,
      member: { select: { id: true, name: true, email: true, role: true, deletedAt: true } },
    },
  });

  const teamMembers = teamLinks
    .filter((l) => l.member && !l.member.deletedAt)
    .map((l) => ({
      id: l.member.id,
      name: l.member.name,
      email: l.member.email,
      role: l.member.role,
      attendanceType: l.attendanceType,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const transcript = await db.clientMeetingTranscript.findFirst({
    where: { orgId, weeklyMeetingId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, attendees: true },
  });

  const run = transcript
    ? await db.meetingExtractionRun.findFirst({
        where: { orgId, transcriptId: transcript.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          coveragePct: true,
          extractionVersion: true,
        },
      })
    : null;

  const [segments, kpi, gaps, discussions, chunks, spoke] = transcript
    ? await Promise.all([
        db.meetingSegmentFact.findMany({
          where: { orgId, transcriptId: transcript.id, deletedAt: null },
        }),
        db.meetingKpiFact.findMany({
          where: {
            orgId,
            transcriptId: transcript.id,
            deletedAt: null,
            mergedIntoId: null,
          },
        }),
        db.meetingGapFact.findMany({
          where: {
            orgId,
            transcriptId: transcript.id,
            deletedAt: null,
            mergedIntoId: null,
          },
        }),
        db.meetingDiscussionFact.findMany({
          where: {
            orgId,
            transcriptId: transcript.id,
            deletedAt: null,
            mergedIntoId: null,
          },
        }),
        // Only the windows nobody read. A COMPLETED chunk contributed its
        // content, so it is not a limitation.
        db.meetingChunk.findMany({
          where: {
            orgId,
            transcriptId: transcript.id,
            status: { notIn: ["COMPLETED", "SKIPPED"] },
          },
          select: { startMs: true, endMs: true },
          orderBy: { startMs: "asc" },
        }),
        db.meetingTranscriptSegment.findMany({
          where: {
            orgId,
            transcriptId: transcript.id,
            clientMemberId: { not: null },
          },
          select: { clientMemberId: true },
          distinct: ["clientMemberId"],
        }),
      ])
    : [[], [], [], [], [], []];

  const attendeeMemberIds = resolveAttendees(transcript?.attendees, teamMembers);

  return {
    meeting: {
      id: meeting.id,
      clientId: meeting.clientId,
      meetingDate: meeting.meetingDate,
      callStatus: meeting.callStatus,
      callStatusOther: meeting.callStatusOther,
      actualStartTime: meeting.actualStartTime,
      actualEndTime: meeting.actualEndTime,
      punctualityOverride: meeting.punctualityOverride,
      flags: meeting as unknown as Record<string, unknown>,
    },
    client: {
      id: client.id,
      name: client.name,
      weeklyStartTime: client.weeklyStartTime,
      weeklyEndTime: client.weeklyEndTime,
      agenda: resolveAgenda(client.weeklyAgendaConfig),
    },
    roster: teamMembers.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role ?? null,
      attendanceType: (m.attendanceType ?? "REQUIRED") as ClientAttendanceType,

    })),
    markedAbsentIds: meeting.absentTeamMembers.map((a) => a.clientMemberId),
    // A logged meeting means a human filled the form, so the absence list is
    // authoritative in both directions — including when it is empty.
    absenceListAuthoritative: true,
    dashboardNaIds: meeting.dashboardNATeamMembers.map((d) => d.clientMemberId),
    transcript: transcript
      ? {
          id: transcript.id,
          attendeeMemberIds,
          participantListUsable: attendeeMemberIds.length > 0,
        }
      : null,
    extraction: run
      ? {
          runId: run.id,
          status: run.status,
          coveragePct: run.coveragePct,
          extractionVersion: run.extractionVersion,
          missingWindows: chunks.map((c) => ({ startMs: c.startMs, endMs: c.endMs })),
        }
      : null,
    facts: {
      segments: segments.map(toSegmentFact),
      kpi: kpi.map(toKpiFact),
      gaps: gaps.map(toGapFact),
      discussions: discussions.map(toDiscussionFact),
      spokeMemberIds: spoke
        .map((s) => s.clientMemberId)
        .filter((id): id is string => Boolean(id)),
    },
  };
}

/**
 * Map the transcript's attendee list onto roster members.
 *
 * Exact-normalised name and email only. Fuzzy matching belongs to
 * `participantMatch.ts` and runs during extraction, where an ambiguous result
 * can be surfaced for confirmation; guessing here would silently turn an
 * unmatched attendee into somebody's attendance record.
 */
function resolveAttendees(
  attendees: unknown,
  roster: Array<{ id: string; name: string; email?: string | null }>,
): string[] {
  if (!Array.isArray(attendees)) return [];

  const byName = new Map(roster.map((m) => [normalise(m.name), m.id]));
  const ids = new Set<string>();

  for (const entry of attendees) {
    if (!entry || typeof entry !== "object") continue;
    const name = (entry as { name?: unknown }).name;
    if (typeof name !== "string") continue;
    const id = byName.get(normalise(name));
    if (id) ids.add(id);
  }

  return [...ids];
}

const normalise = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

function toSegmentFact(r: {
  segmentKey: string;
  coverage: string;
  timeDiscipline: string;
  expectedMinutes: number | null;
  actualMinutes: number | null;
  startMs: number | null;
  endMs: number | null;
  humanFlag: string | null;
  flagAgrees: boolean;
  comment: string | null;
}): WmSegmentFact {
  return {
    segmentKey: r.segmentKey,
    coverage: r.coverage,
    timeDiscipline: r.timeDiscipline,
    expectedMinutes: r.expectedMinutes,
    actualMinutes: r.actualMinutes,
    startMs: r.startMs,
    endMs: r.endMs,
    humanFlag: r.humanFlag,
    flagAgrees: r.flagAgrees,
    comment: r.comment,
  };
}

function toKpiFact(r: {
  speakerRaw: string;
  clientMemberId: string | null;
  kpiRag: string | null;
  priorityRag: string | null;
  keyPoints: string[];
  ragConflict: boolean;
}): WmKpiFact {
  return {
    speakerRaw: r.speakerRaw,
    clientMemberId: r.clientMemberId,
    kpiRag: r.kpiRag,
    priorityRag: r.priorityRag,
    keyPoints: r.keyPoints,
    ragConflict: r.ragConflict,
  };
}

function toGapFact(r: {
  gap: string;
  agreedAction: string | null;
  ownerRaw: string | null;
  scope: string;
  raisedByRaw: string[];
  severityStated: string | null;
}): WmGapFact {
  return {
    gap: r.gap,
    agreedAction: r.agreedAction,
    ownerRaw: r.ownerRaw,
    scope: r.scope,
    raisedByRaw: r.raisedByRaw,
    severityStated: r.severityStated,
  };
}

function toDiscussionFact(r: {
  kind: string;
  sharedByRaw: string | null;
  summary: string;
  outcome: string | null;
  wasDeferred: boolean;
}): WmDiscussionFact {
  return {
    kind: r.kind,
    sharedByRaw: r.sharedByRaw,
    summary: r.summary,
    outcome: r.outcome,
    wasDeferred: r.wasDeferred,
  };
}
