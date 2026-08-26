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
import { presenceThresholdSeconds } from "@/lib/meetings/occurrenceAttendance";
import type { TeamsAttendanceEvidence } from "@/lib/meetings/occurrenceAttendance";

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
  /**
   * memberId → dates of APPROVED leave within this week.
   *
   * Feeds rung 0 of the attendance ladder, which renders NA and drops the day
   * from that member's denominator entirely. The requirement doc is explicit
   * that approved leave is not an attendance-discipline issue; without this a
   * member on leave scores exactly like one who simply did not turn up.
   *
   * `buildAttendanceMatrix` has accepted this map since the attendance rewrite,
   * but nothing ever populated it — the feature was plumbed and unfed.
   */
  onLeave: Record<string, Date[]>;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Minutes between two "HH:mm" planned times. Null when either is missing. */
function minutesBetween(start: string | null, end: string | null): number | null {
  const mins = (hhmm: string | null) => {
    const m = hhmm?.match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = mins(start);
  const b = mins(end);
  return a !== null && b !== null && b > a ? b - a : null;
}

/** One participant as a stored Teams attendance report describes them. */
interface StoredTeamsRecord {
  name: string;
  email: string | null;
  seconds: number;
}

/**
 * Read `ClientMeetingAttendance.records`.
 *
 * Defensive on purpose: this is JSON written by a Graph response, so a shape
 * change upstream must degrade to "no Teams evidence" (the day then falls back
 * to the transcript rungs) rather than throw inside report generation.
 */
function parseTeamsAttendance(
  raw: unknown,
): { records: StoredTeamsRecord[]; invited: { email: string; type: string }[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { records?: unknown; invited?: unknown };
  if (!Array.isArray(obj.records)) return null;

  const records: StoredTeamsRecord[] = [];
  for (const r of obj.records) {
    if (!r || typeof r !== "object") continue;
    const rec = r as { displayName?: unknown; email?: unknown; totalAttendanceInSeconds?: unknown };
    const seconds =
      typeof rec.totalAttendanceInSeconds === "number" && rec.totalAttendanceInSeconds > 0
        ? rec.totalAttendanceInSeconds
        : 0;
    records.push({
      name: typeof rec.displayName === "string" ? rec.displayName : "",
      email: typeof rec.email === "string" && rec.email ? rec.email : null,
      seconds,
    });
  }

  const invited: { email: string; type: string }[] = [];
  if (Array.isArray(obj.invited)) {
    for (const i of obj.invited) {
      if (!i || typeof i !== "object") continue;
      const inv = i as { email?: unknown; type?: unknown };
      if (typeof inv.email === "string" && inv.email) {
        invited.push({ email: inv.email, type: inv.type === "optional" ? "optional" : "required" });
      }
    }
  }

  return { records, invited };
}

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

  const [huddles, transcripts, teamsAttendance] = await Promise.all([
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
        plannedStartOverride: true,
        plannedEndOverride: true,
        totalMembers: true,
        // `absenceReason` is what separates approved leave from a no-show. The
        // requirement doc is explicit that leave is not an attendance-discipline
        // issue, and until now every absence looked identical.
        absentTeamMembers: { select: { clientMemberId: true, absenceReason: true } },
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
        // Whether that list was ticked by a human (authoritative both ways) or
        // derived from a recorder (proves presence only). See the column doc.
        attendeesSource: true,
      },
    }),
    // Synced Teams attendance reports for this week. The only source with join
    // durations, and the only one that can prove absence.
    db.clientMeetingAttendance.findMany({
      where: { orgId, clientId, kind: "daily", meetingDate: { gte: weekStart, lte: weekEnd } },
      select: { meetingDate: true, records: true },
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

  // --- Teams attendance, resolved to roster members once per day -----------
  //
  // Every Graph record carries an email and `ClientMember.email` exists, so
  // this join is exact — no name fuzziness enters the one signal the report
  // relies on to call somebody absent.
  const plannedDurationMinutes = minutesBetween(client.dailyStartTime, client.dailyEndTime);
  const teamsByDate = new Map<string, TeamsAttendanceEvidence>();
  for (const row of teamsAttendance) {
    const parsed = parseTeamsAttendance(row.records);
    if (!parsed) continue;

    const secondsByMemberId: Record<string, number> = {};
    for (const rec of parsed.records) {
      const match = matchParticipant(rec.name || rec.email || "", rosterIndex, rec.email);
      const id = resolvedMemberId(match);
      // Several records per person is normal — Teams emits one per device or
      // rejoin — so seconds accumulate rather than overwrite.
      if (id) secondsByMemberId[id] = (secondsByMemberId[id] ?? 0) + rec.seconds;
    }

    const invitedIds = (want: "required" | "optional") =>
      parsed.invited
        .filter((i) => i.type === want)
        .map((i) => resolvedMemberId(matchParticipant(i.email, rosterIndex, i.email)))
        .filter((id): id is string => Boolean(id));

    teamsByDate.set(ymd(row.meetingDate), {
      reportPresent: true,
      secondsByMemberId,
      thresholdSeconds: presenceThresholdSeconds(plannedDurationMinutes),
      requiredInvitedIds: invitedIds("required"),
      optionalInvitedIds: invitedIds("optional"),
    });
  }

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
    /**
     * True when a human ticked WHO ATTENDED (the upload modal), which makes the
     * list authoritative in both directions — its complement is exactly who was
     * absent. Only a human-supplied list earns this: a recorder-derived list
     * still has to clear the coverage gate below, because a participant list
     * Fathom happened to capture is not a statement that anyone was missing.
     */
    attendeesAuthoritative?: boolean;
    adherence: DayAdherenceRow[];
    teams?: TeamsAttendanceEvidence;
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
    // A human-ticked list needs no coverage gate: it IS the statement of who
    // was there, so its complement is exactly who was not. Guarded on a
    // non-empty resolved list so an upload whose ticks all failed to resolve
    // cannot silently mark the entire roster absent.
    const humanAttendeeList = Boolean(input.attendeesAuthoritative && participantIds.size > 0);
    const participantListUsable =
      input.humanLogged ||
      humanAttendeeList ||
      (attendeesWithEmail > 0 && listCoverage >= 0.6 && participantIds.size >= 2);

    return {
      markedAbsentIds: input.markedAbsentIds,
      // Deliberately NOT set for a human ATTENDEE list. The two lists are
      // inverses: `absenceListAuthoritative` means "markedAbsentIds names
      // everyone who was away, so everybody else was present" (ladder rung 0c),
      // whereas an attendee list names everyone who was THERE. Setting it here
      // would make rung 0c mark the whole roster present, absentees included.
      // The attendee list works through `participantListUsable` instead: rung 2
      // proves the people on it present, rung 4 reads the rest as absent.
      absenceListAuthoritative: input.humanLogged,
      participantIds: [...participantIds],
      spokeIds: [...spokeIds],
      participantListUsable,
      unresolved,
      teams: input.teams,
    };
  };

  /** "HH:mm" in the meeting timezone, for a transcript-derived day. */
  const hhmm = (d: Date | null): string | null =>
    d ? new Intl.DateTimeFormat("en-GB", { timeZone: MEETING_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d) : null;

  const huddleDates = new Set(huddles.map((h) => ymd(h.meetingDate)));

  /**
   * memberId → dates of approved leave.
   *
   * Only a human tick with `absenceReason = PLANNED_LEAVE` counts. Leave is
   * never inferred from silence: an unexplained absence stays an absence, and
   * guessing that someone was on leave would quietly inflate the team's
   * attendance figure.
   */
  const onLeave: Record<string, Date[]> = {};
  const recordLeave = (
    meetingDate: Date,
    absences: { clientMemberId: string; absenceReason: string | null }[],
  ) => {
    for (const a of absences) {
      if (a.absenceReason !== "PLANNED_LEAVE") continue;
      onLeave[a.clientMemberId] = [...(onLeave[a.clientMemberId] ?? []), meetingDate];
    }
  };

  // --- Days logged in the Daily Huddle module (authoritative attendance) ----
  for (const h of huddles) {
    const date = ymd(h.meetingDate);
    recordLeave(h.meetingDate, h.absentTeamMembers);
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
      plannedStartOverride: h.plannedStartOverride,
      plannedEndOverride: h.plannedEndOverride,
      totalMembers: h.totalMembers,
      attendance: buildAttendance({
        humanLogged: true,
        // Members on approved leave are NOT marked absent: they were never
        // expected, so they leave the denominator entirely rather than counting
        // against the team. Rung 0 of the attendance ladder renders them NA.
        markedAbsentIds: h.absentTeamMembers
          .filter((a) => a.absenceReason !== "PLANNED_LEAVE")
          .map((a) => a.clientMemberId),
        attendees: attendeesOf(transcript),
        attendeesAuthoritative: transcript?.attendeesSource === "manual",
        adherence,
        teams: teamsByDate.get(date),
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
      //
      // A MANUAL upload is the exception: nobody logged the huddle, but a human
      // still ticked who attended, and that list is as good as one. Without it
      // an uploaded transcript can only ever prove "who spoke", so no absentee
      // is ever named — the whole reason this branch existed but under-reported.
      attendance: buildAttendance({
        humanLogged: false,
        markedAbsentIds: [],
        attendees: attendeesOf(t),
        attendeesAuthoritative: t.attendeesSource === "manual",
        adherence,
        teams: teamsByDate.get(date),
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
    onLeave,
  };
}
