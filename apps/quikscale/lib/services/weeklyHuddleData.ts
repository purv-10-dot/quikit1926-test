/**
 * Loads everything the Daily Huddle Weekly Report needs for one client-week,
 * and shapes it into the plain structures `weeklyHuddleAggregate` consumes.
 *
 * This is the only place that talks to Prisma for the weekly report — the
 * aggregation, AI and validation layers stay pure and unit-testable because
 * the DB access is quarantined here.
 *
 * The per-person adherence, notes and blockers come from each day's SAVED
 * transcript report. A day whose report has not been generated yet contributes
 * attendance and timing (which live on the huddle record) but no adherence —
 * `sources[].hasReport` tells the caller which days those are so it can offer
 * to generate them.
 */

import { db } from "@/lib/db";
import {
  buildRosterIndex,
  matchParticipant,
  resolvedMemberId,
  type RosterIndex,
} from "@/lib/ai/participantMatch";
import type {
  DayAdherenceRow,
  DayAttendance,
  DayBlocker,
  HuddleDay,
  RosterMember,
  UnresolvedParticipant,
  WeeklyClientConfig,
} from "@/lib/ai/weeklyHuddleAggregate";
import { MEETING_TZ } from "@/lib/services/meetingTranscriptMatch";
import type { ParticipantDayNote } from "@/lib/ai/weeklyHuddleReport";
import type { StoredMeetingReport } from "@/lib/ai/meetingReport";

/** Per-day availability, for the UI checklist and the generate step. */
export interface WeekSource {
  date: string;
  huddleId: string | null;
  callStatus: string | null;
  transcriptId: string | null;
  hasReport: boolean;
  /**
   * True when this day exists only as a Fathom transcript with no matching
   * row in the Daily Huddle module — common, because QuikFlow's matching is
   * asynchronous and a huddle is often never logged by hand.
   */
  transcriptOnly: boolean;
}

export interface WeekContext {
  client: WeeklyClientConfig;
  roster: RosterMember[];
  days: HuddleDay[];
  notes: ParticipantDayNote[];
  sources: WeekSource[];
  weekStart: Date;
  weekEnd: Date;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Sunday of the ISO week beginning at `weekStart` (Monday). */
export function weekEndFor(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setUTCDate(weekStart.getUTCDate() + 6);
  return end;
}

/** Normalise any date to the Monday 00:00 UTC of its ISO week. */
export function toWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

/** "Aug 10 – Aug 14, 2026" from the days a huddle was actually expected. */
export function weekLabel(weekStart: Date, weekEnd: Date): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(d);
  return `${fmt(weekStart)} – ${fmt(weekEnd)}, ${weekEnd.getUTCFullYear()}`;
}

/**
 * Load the client config, roster, huddles and saved daily reports for one week.
 *
 * @param overrideReports Reports generated on the fly for days that had none,
 *                        keyed by transcript id. Lets the generate route fill
 *                        gaps without having to persist them first.
 * @param includeDates    When given, only these dates (yyyy-mm-dd) are
 *                        aggregated — the user's checklist selection. Keyed by
 *                        date rather than huddle id so transcript-only days,
 *                        which have no huddle id, can be selected too.
 */
export async function loadWeekContext(
  orgId: string,
  clientId: string,
  weekStart: Date,
  opts: { overrideReports?: Map<string, StoredMeetingReport>; includeDates?: string[] } = {},
): Promise<WeekContext | null> {
  const weekEnd = weekEndFor(weekStart);
  const { overrideReports, includeDates } = opts;

  const client = await db.client.findFirst({
    where: { id: clientId, orgId, deletedAt: null },
    select: {
      name: true,
      dailyDays: true,
      weeklyDay: true,
      dailyStartTime: true,
      dailyEndTime: true,
      teamMembers: {
        select: {
          // Required/optional/external is a property of the LINK, not the
          // person: the same member can be required for one client and
          // optional for another.
          attendanceType: true,
          member: {
            select: {
              id: true,
              name: true,
              // Email is the only unambiguous way to match a meeting
              // participant to a roster member — see participantMatch.ts.
              email: true,
              role: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  });
  if (!client) return null;

  const roster: RosterMember[] = client.teamMembers
    .filter((tm) => tm.member && !tm.member.deletedAt)
    .map((tm) => ({
      id: tm.member.id,
      name: tm.member.name,
      email: tm.member.email,
      role: tm.member.role,
      attendanceType: tm.attendanceType,
    }));

  // Human-recorded name mappings ("Bobby" → "Harjinder (Bobby) Kohli"). Loaded
  // once for the whole week rather than per day.
  const aliasRows = roster.length
    ? await db.clientMemberAlias.findMany({
        where: { orgId, clientMemberId: { in: roster.map((m) => m.id) } },
        select: { clientMemberId: true, normalizedAlias: true },
      })
    : [];

  const rosterIndex = buildRosterIndex(roster, aliasRows);

  const [huddles, transcripts] = await Promise.all([
    db.clientDailyHuddle.findMany({
      where: {
        orgId,
        clientId,
        deletedAt: null,
        meetingDate: { gte: weekStart, lte: weekEnd },
      },
      orderBy: { meetingDate: "asc" },
      select: {
        id: true,
        meetingDate: true,
        callStatus: true,
        actualStartTime: true,
        actualEndTime: true,
        punctualityOverride: true,
        totalMembers: true,
        absentTeamMembers: { select: { clientMemberId: true } },
      },
    }),
    db.clientMeetingTranscript.findMany({
      where: {
        orgId,
        clientId,
        type: "DAILY",
        deletedAt: null,
        meetingDate: { gte: weekStart, lte: weekEnd },
      },
      orderBy: { meetingDate: "asc" },
      select: {
        id: true,
        meetingDate: true,
        dailyHuddleId: true,
        report: true,
        startedAt: true,
        endedAt: true,
        durationMinutes: true,
        // The meeting participant list — the only signal that proves a silent
        // attendee was present, and the only one carrying email.
        attendees: true,
      },
    }),
  ]);

  // A transcript is tied to a huddle by its explicit link where one exists,
  // and otherwise by date — matching happens asynchronously in QuikFlow, so a
  // transcript can legitimately arrive before it has been linked.
  const transcriptByHuddleId = new Map<string, (typeof transcripts)[number]>();
  const transcriptByDate = new Map<string, (typeof transcripts)[number]>();
  for (const t of transcripts) {
    if (t.dailyHuddleId) transcriptByHuddleId.set(t.dailyHuddleId, t);
    if (t.meetingDate) transcriptByDate.set(ymd(t.meetingDate), t);
  }

  const selected = includeDates?.length ? new Set(includeDates) : null;

  const days: HuddleDay[] = [];
  const notes: ParticipantDayNote[] = [];
  const sources: WeekSource[] = [];

  const reportFor = (t: { id: string; report: unknown } | null): StoredMeetingReport | null =>
    (t && overrideReports?.get(t.id)) ?? ((t?.report as StoredMeetingReport | null) ?? null);

  /** The recording's participant list — `[{ name, email }]`, or empty. */
  const attendeesOf = (
    t: { attendees?: unknown } | null,
  ): { name?: string | null; email?: string | null }[] =>
    Array.isArray(t?.attendees)
      ? (t.attendees as { name?: string | null; email?: string | null }[])
      : [];

  /** Pull the day's per-person ratings out of its saved report. */
  const adherenceOf = (report: StoredMeetingReport | null): DayAdherenceRow[] =>
    (report?.adherence ?? []).map((a) => ({
      participant: a.participant,
      role: a.role ?? null,
      achievement: a.achievement ?? null,
      focus: a.focus ?? null,
      stuck: a.stuck ?? null,
      achievementNote: a.achievementNote ?? null,
      focusNote: a.focusNote ?? null,
      stuckNote: a.stuckNote ?? null,
    }));

  const blockersOf = (report: StoredMeetingReport | null): DayBlocker[] =>
    (report?.blockers ?? []).map((b) => ({
      raisedBy: b.raisedBy,
      raisedFor: b.raisedFor ?? null,
      category: b.category,
      description: b.description,
      impact: b.impact ?? null,
      requiredAction: b.requiredAction ?? null,
      status: b.status ?? null,
    }));

  const collectNotes = (date: string, adherence: DayAdherenceRow[]) => {
    for (const a of adherence) {
      if (a.achievementNote || a.focusNote || a.stuckNote) {
        notes.push({
          date,
          participant: a.participant,
          achievementNote: a.achievementNote,
          focusNote: a.focusNote,
          stuckNote: a.stuckNote,
        });
      }
    }
  };

  /**
   * Turn a day's raw signals into attendance evidence.
   *
   * `participantListUsable` is the gate that decides whether absence may be
   * inferred at all, and it is deliberately strict. Inferring absence means
   * asserting "we would have seen this person had they been there" — only a
   * participant list that plausibly covers the meeting supports that. Anything
   * weaker leaves unproven members UNKNOWN, which is the entire fix for the
   * previous behaviour of treating every quiet attendee as absent.
   *
   * `humanLogged` short-circuits the gate: a huddle someone filled in by hand
   * carries an authoritative absence list, and it is authoritative even when
   * empty (that is what "nobody was absent" looks like).
   */
  const buildAttendance = (input: {
    humanLogged: boolean;
    markedAbsentIds: string[];
    attendees: { name?: string | null; email?: string | null }[];
    adherence: DayAdherenceRow[];
  }): DayAttendance => {
    const participantIds = new Set<string>();
    const spokeIds = new Set<string>();
    const unresolved: UnresolvedParticipant[] = [];
    let attendeesWithEmail = 0;
    let attendeesResolved = 0;

    const note = (
      name: string,
      email: string | null,
      match: ReturnType<typeof matchParticipant>,
    ) => {
      // An org/team label is a legitimate party, not a missing person — keeping
      // it out of the tray is what stops genuine roster gaps being buried.
      if (match.reason === "external") return;
      if (unresolved.some((u) => u.name === name)) return;
      unresolved.push({
        name,
        email,
        reason: match.reason,
        candidates: match.candidates,
        suggestedMemberId: match.pendingConfirm ? match.memberId : null,
      });
    };

    for (const a of input.attendees) {
      const name = (a.name ?? "").trim();
      const email = (a.email ?? "").trim() || null;
      if (!name && !email) continue;
      if (email) attendeesWithEmail += 1;

      const match = matchParticipant(name || email || "", rosterIndex, email);
      const id = resolvedMemberId(match);
      if (id) {
        participantIds.add(id);
        attendeesResolved += 1;
      } else {
        note(name || email || "(unnamed)", email, match);
      }
    }

    for (const row of input.adherence) {
      const match = matchParticipant(row.participant, rosterIndex);
      const id = resolvedMemberId(match);
      if (id) spokeIds.add(id);
      else note(row.participant, null, match);
    }

    const listCoverage = input.attendees.length ? attendeesResolved / input.attendees.length : 0;
    const participantListUsable =
      input.humanLogged ||
      (attendeesWithEmail > 0 && listCoverage >= 0.6 && participantIds.size >= 2);

    return {
      markedAbsentIds: input.markedAbsentIds,
      absenceListAuthoritative: input.humanLogged,
      participantIds: [...participantIds],
      spokeIds: [...spokeIds],
      participantListUsable,
      unresolved,
    };
  };

  /** "HH:mm" in the meeting timezone, for a transcript-derived day. */
  const hhmm = (d: Date | null): string | null =>
    d ? new Intl.DateTimeFormat("en-GB", { timeZone: MEETING_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d) : null;

  const huddleDates = new Set(huddles.map((h) => ymd(h.meetingDate)));

  // --- Days logged in the Daily Huddle module (authoritative attendance) ----
  for (const h of huddles) {
    const date = ymd(h.meetingDate);
    const transcript = transcriptByHuddleId.get(h.id) ?? transcriptByDate.get(date) ?? null;
    const report = reportFor(transcript);

    sources.push({
      date,
      huddleId: h.id,
      callStatus: h.callStatus,
      transcriptId: transcript?.id ?? null,
      hasReport: Boolean(report),
      transcriptOnly: false,
    });

    if (selected && !selected.has(date)) continue;

    const adherence = adherenceOf(report);
    collectNotes(date, adherence);

    days.push({
      id: h.id,
      meetingDate: h.meetingDate,
      callStatus: h.callStatus,
      actualStartTime: h.actualStartTime,
      actualEndTime: h.actualEndTime,
      punctualityOverride: h.punctualityOverride,
      totalMembers: h.totalMembers,
      attendance: buildAttendance({
        humanLogged: true,
        markedAbsentIds: h.absentTeamMembers.map((a) => a.clientMemberId),
        attendees: attendeesOf(transcript),
        adherence,
      }),
      adherence,
      blockers: blockersOf(report),
      transcriptId: transcript?.id ?? null,
    });
  }

  // --- Days known only from a transcript ------------------------------------
  // Most daily transcripts never get a huddle row (QuikFlow matches
  // asynchronously, and the module is often not filled in by hand). A
  // transcript is proof the huddle happened, so the week must include it —
  // ignoring these would drop the majority of real data on the floor.
  for (const t of transcripts) {
    if (!t.meetingDate) continue;
    const date = ymd(t.meetingDate);
    if (huddleDates.has(date)) continue;
    // Several recordings can land on one date; the first is the day's source.
    if (sources.some((s) => s.date === date)) continue;

    const report = reportFor(t);
    const adherence = adherenceOf(report);

    sources.push({
      date,
      huddleId: null,
      callStatus: "HELD",
      transcriptId: t.id,
      hasReport: Boolean(report),
      transcriptOnly: true,
    });

    if (selected && !selected.has(date)) continue;

    collectNotes(date, adherence);

    days.push({
      id: t.id,
      meetingDate: t.meetingDate,
      callStatus: "HELD",
      actualStartTime: hhmm(t.startedAt),
      actualEndTime: hhmm(t.endedAt),
      punctualityOverride: "NA",
      totalMembers: roster.length,
      // No human logged this day, so absence can only be inferred if the
      // recording's participant list is good enough — never from silence.
      // This is the fix for the previous behaviour, which marked every roster
      // member who did not speak as absent and reported ~30% attendance for
      // teams that fully attended.
      attendance: buildAttendance({
        humanLogged: false,
        markedAbsentIds: [],
        attendees: attendeesOf(t),
        adherence,
      }),
      adherence,
      blockers: blockersOf(report),
      transcriptId: t.id,
    });
  }

  days.sort((a, b) => a.meetingDate.getTime() - b.meetingDate.getTime());
  sources.sort((a, b) => a.date.localeCompare(b.date));

  return {
    client: {
      name: client.name,
      dailyDays: client.dailyDays ?? [],
      weeklyDay: client.weeklyDay,
      dailyStartTime: client.dailyStartTime,
      dailyEndTime: client.dailyEndTime,
    },
    roster,
    days,
    notes,
    sources,
    weekStart,
    weekEnd,
  };
}
