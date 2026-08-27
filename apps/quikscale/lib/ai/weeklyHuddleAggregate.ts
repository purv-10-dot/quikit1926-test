/**
 * Deterministic aggregation for the Daily Huddle Weekly Report (§4.1–§4.5A).
 *
 * This module is the accuracy floor of the whole feature. Everything here is a
 * pure function over data the system already holds — `ClientDailyHuddle` rows
 * plus each day's saved transcript report — and the AI never sees a chance to
 * recompute any of it. The AI layer downstream receives these finished tables
 * and is asked only for prose.
 *
 * Two conventions are load-bearing and come straight from the requirement doc:
 *
 *  1. **Adherence scoring** is Yes = 100, Partial = 50, No = 0, averaged over
 *     the huddles a person *attended* — never over the whole week, so an
 *     absence can't be misread as a bad update.
 *  2. **Team average is the mean of the individual averages**, not a pooled
 *     mean over every observation. The doc's own §4.4 example row (78.3 / 100
 *     / 80 from members scoring 95/80/60, 100/100/100, 100/40/100) only
 *     reconciles under that reading.
 *
 * Rounding matches the reference format exactly: dimension percentages to one
 * decimal (the doc prints 78.3%), the per-person Avg Score to a whole number
 * (the doc prints 98% / 73% / 87%).
 */

import { isPunctual } from "@/lib/services/clientMeetingsMath";
import { attendanceKnown, attendanceVerdict } from "@/lib/meetings/occurrenceAttendance";
import type { TeamsAttendanceEvidence } from "@/lib/meetings/occurrenceAttendance";
import { looksLikeOrganisation } from "@/lib/ai/participantMatch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeetingFlag = "YES" | "NO" | "NA";

export type CallStatus =
  | "HELD"
  | "NOT_HELD"
  | "CALL_CANCELLED_BY_CLIENT"
  | "HOLIDAY_FOR_CLIENT"
  | "HOLIDAY_FOR_SUCCESS_ALCHEMIST"
  | "OTHER";

export type AdherenceRating = "YES" | "PARTIAL" | "NO";

export type BlockerStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

/**
 * How this member's attendance is measured **for this client**.
 *
 * Only REQUIRED enters the attendance percentage — numerator and denominator
 * both. OPTIONAL and EXTERNAL still get a row and still show whether they
 * turned up; they simply are not scored, so they can neither drag the team
 * average down by being absent nor inflate it by attending.
 */
export type ClientAttendanceType = "REQUIRED" | "OPTIONAL" | "EXTERNAL";

export interface RosterMember {
  id: string;
  name: string;
  email?: string | null;
  /** Job title for the Adherence Snapshot. */
  role?: string | null;
  /** Client-scoped classification. Absent ⇒ REQUIRED, matching the DB default. */
  attendanceType?: ClientAttendanceType;
}

/** Everything except REQUIRED is displayed but not scored. */
export const isScoredMember = (m: { attendanceType?: ClientAttendanceType }): boolean =>
  (m.attendanceType ?? "REQUIRED") === "REQUIRED";

/** Client-level meeting configuration — answers §4.1's metadata questions. */
export interface WeeklyClientConfig {
  name: string;
  /** Weekday names a huddle runs on. Empty ⇒ Mon–Fri. */
  dailyDays: string[];
  /** Weekday of the Weekly Meeting — the day a huddle does NOT happen. */
  weeklyDay: string | null;
  dailyStartTime: string | null;
  dailyEndTime: string | null;
}

/** One participant's ratings on one day, from that day's saved report. */
export interface DayAdherenceRow {
  participant: string;
  role?: string | null;
  achievement?: AdherenceRating | null;
  focus?: AdherenceRating | null;
  stuck?: AdherenceRating | null;
  achievementNote?: string | null;
  focusNote?: string | null;
  stuckNote?: string | null;
}

export interface DayBlocker {
  raisedBy: string;
  raisedFor?: string | null;
  category: string;
  description: string;
  impact?: string | null;
  requiredAction?: string | null;
  status?: BlockerStatus | null;
}

/**
 * The evidence we hold about who attended one huddle.
 *
 * Deliberately *evidence*, not a verdict. The previous model stored
 * `absentMemberIds` computed as "everyone who didn't speak", which silently
 * turned every quiet attendee into an absence and produced attendance figures
 * in the 30% range for teams that fully attended. Presence and absence are now
 * derived in `buildAttendanceMatrix` from what each signal can actually prove:
 *
 *   - a human ticking "absent" proves absence;
 *   - a meeting participant list proves presence, including for people who
 *     never said a word;
 *   - speaking proves presence but silence proves nothing;
 *   - and where no signal covers someone, the honest answer is UNKNOWN.
 */
export interface DayAttendance {
  /** `ClientMember` ids a human explicitly marked absent. Beats every inference. */
  markedAbsentIds: string[];
  /**
   * True when a human logged this huddle, which makes `markedAbsentIds`
   * authoritative in BOTH directions: anyone not on it was present, and an
   * empty list means a full house. Without this the same empty list is
   * indistinguishable from "we have no idea", which is precisely the ambiguity
   * that produced the old wrong numbers.
   */
  absenceListAuthoritative: boolean;
  /** Members present per the meeting's participant list (the strongest presence signal). */
  participantIds: string[];
  /** Members who spoke in the transcript. */
  spokeIds: string[];
  /**
   * Whether the participant list is complete enough to infer absence from.
   *
   * Only a list that plausibly covers the whole meeting can turn "not in it"
   * into "was absent". Set by `participantListQuality` in the data layer.
   */
  participantListUsable: boolean;
  /** Names from this day we could not resolve, for the unmatched-participants tray. */
  unresolved: UnresolvedParticipant[];
  /**
   * Join-duration evidence from the Teams attendance report for this date, when
   * one has been synced. Absent for Fathom-only and manually uploaded days.
   */
  teams?: TeamsAttendanceEvidence;
}

/** A name seen in a recording that did not resolve to a roster member. */
export interface UnresolvedParticipant {
  name: string;
  email: string | null;
  reason: ResolutionReason | "fuzzy" | "email" | "alias" | "parenthetical" | "external";
  /** Roster names it tied between, when ambiguous. */
  candidates?: string[];
  /** A fuzzy suggestion awaiting human confirmation. */
  suggestedMemberId?: string | null;
}

/** One day of the reporting week: the huddle record + its transcript report. */
export interface HuddleDay {
  id: string;
  meetingDate: Date;
  callStatus: CallStatus;
  actualStartTime: string | null;
  actualEndTime: string | null;
  punctualityOverride: MeetingFlag;
  /**
   * This day's planned start/end, when it differed from the client's standing
   * schedule. Null means the standing schedule applied.
   *
   * Punctuality is measured against these when present. Without them a huddle
   * deliberately moved from 09:30 to 10:30 scores as 60 minutes late, which
   * penalises a team for communicating a change — the client asked about
   * exactly this case in the requirement doc.
   */
  plannedStartOverride?: string | null;
  plannedEndOverride?: string | null;
  totalMembers: number;
  /** What we actually know about who was in the room. See `DayAttendance`. */
  attendance: DayAttendance;
  adherence: DayAdherenceRow[];
  blockers: DayBlocker[];
  transcriptId: string | null;
  /**
   * Where this day's transcript came from: `"manual"` for a human `.docx`
   * upload, `"fathom"` (or null, on legacy rows) for a recorder.
   *
   * Only `"manual"` opens the unmapped-speaker path. A human chose the file and
   * the meeting, so every speaker in it is real and hiding the ones missing
   * from the roster reports a four-person meeting as a one-person meeting. A
   * recorder-derived name carries no such warrant: the roster stays the
   * authoritative statement of who is on the team, and an unattributable label
   * must not silently become a participant.
   */
  transcriptSource?: string | null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const DEFAULT_DAILY_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** One decimal place — the precision the reference format prints. */
const round1 = (n: number) => Math.round(n * 10) / 10;

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Comparison key for a human name: lowercased, de-accented, punctuation
 * stripped, whitespace collapsed. "Renée O'Brien" and "Renee OBrien" collide
 * on purpose — transcripts spell names inconsistently.
 */
export function normalizeName(raw: string): string {
  return raw
    // NFD splits an accented letter into base + combining mark, so the
    // ASCII-only filter below drops the mark and keeps the base letter.
    // Without it, "é" would be removed whole and "Renée" → "rene".
    .normalize("NFD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** "09:30" → 570. Null for missing or out-of-range input. */
export function parseHhmmToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** The doc's Yes/Partial/No scale. `null` means "not assessed", not "zero". */
export function scoreRating(r: AdherenceRating | null | undefined): number | null {
  if (r === "YES") return 100;
  if (r === "PARTIAL") return 50;
  if (r === "NO") return 0;
  return null;
}

// ---------------------------------------------------------------------------
// Participant resolution
// ---------------------------------------------------------------------------

export type ResolutionReason = "exact" | "partial" | "ambiguous" | "unknown";

export interface NameResolution {
  /** Roster member id, or null when the speaker could not be pinned down. */
  memberId: string | null;
  /** Roster spelling when resolved; the trimmed raw name otherwise. */
  canonicalName: string;
  reason: ResolutionReason;
  /** Roster names that tied, for `ambiguous`. */
  candidates?: string[];
}

/**
 * Map a free-text transcript speaker onto the client roster.
 *
 * A full normalized match wins. Otherwise a speaker whose name tokens are a
 * subset of exactly one roster member's tokens (so "Ashwin" → "Ashwin
 * Singone") resolves to that member. A tie across two members is reported as
 * `ambiguous` and deliberately left unresolved — guessing here is what
 * produces a report attributing one person's blocker to another.
 */
export function resolveParticipant(raw: string, roster: RosterMember[]): NameResolution {
  const trimmed = raw.trim();
  const key = normalizeName(trimmed);
  if (!key) return { memberId: null, canonicalName: trimmed, reason: "unknown" };

  const exact = roster.find((m) => normalizeName(m.name) === key);
  if (exact) return { memberId: exact.id, canonicalName: exact.name, reason: "exact" };

  const speakerTokens = key.split(" ");
  const partial = roster.filter((m) => {
    const memberTokens = normalizeName(m.name).split(" ");
    // The first token must line up either way — "Kumar" alone should never
    // claim "Amit Kumar". Beyond that, match in BOTH directions: a transcript
    // may abbreviate a roster name ("Ashwin" → "Ashwin Singone") or expand it
    // ("Himanshu Pandey" → roster's "Himanshu"). Real rosters are frequently
    // first-name-only while Fathom reports full names, so a one-directional
    // subset check drops most speakers on the floor.
    if (speakerTokens[0] !== memberTokens[0]) return false;
    return (
      speakerTokens.every((t) => memberTokens.includes(t)) ||
      memberTokens.every((t) => speakerTokens.includes(t))
    );
  });

  if (partial.length === 1) {
    return { memberId: partial[0].id, canonicalName: partial[0].name, reason: "partial" };
  }
  if (partial.length > 1) {
    return {
      memberId: null,
      canonicalName: trimmed,
      reason: "ambiguous",
      candidates: partial.map((m) => m.name),
    };
  }
  return { memberId: null, canonicalName: trimmed, reason: "unknown" };
}

// ---------------------------------------------------------------------------
// Unmapped speakers from uploaded transcripts
// ---------------------------------------------------------------------------

/** A transcript speaker who is not on the roster but must still be reported. */
export interface UnmappedSpeaker {
  /** Synthetic, stable, and never a `ClientMember` id. */
  key: string;
  /** First-seen spelling — the one a human will recognise. */
  name: string;
  /** `ymd` dates this speaker was heard on. */
  dates: Set<string>;
}

/** `true` when this day's transcript was uploaded by a human, not a recorder. */
export function isUploadedTranscript(day: HuddleDay): boolean {
  return day.transcriptSource === "manual";
}

/**
 * Every speaker in the week's UPLOADED transcripts who did not resolve onto the
 * roster, de-duplicated case-insensitively and in first-seen order.
 *
 * Both §3 (attendance) and §4 (heat map) read this one function, so the two
 * tables can never disagree about who was in the room — deriving them
 * separately is how a report ends up listing someone in one table and not the
 * other.
 *
 * Organisation labels ("Hexaware AWS Team", "Client (Shivam project)") are
 * excluded: a blocker raised for a team is a legitimate party, not a person,
 * and turning one into an attendance row invents a participant.
 */
export function collectUnmappedSpeakers(
  days: HuddleDay[],
  roster: RosterMember[],
): UnmappedSpeaker[] {
  const found = new Map<string, UnmappedSpeaker>();

  for (const day of days) {
    if (!isUploadedTranscript(day)) continue;
    const date = ymd(day.meetingDate);

    for (const row of day.adherence) {
      const res = resolveParticipant(row.participant, roster);
      if (res.memberId) continue;
      const norm = normalizeName(res.canonicalName);
      if (!norm) continue;
      if (looksLikeOrganisation(res.canonicalName)) continue;

      const key = `unmapped:${norm}`;
      const existing = found.get(key);
      // First spelling wins, so "Ajay Baheti" and "Ajay baheti" are one person
      // under the name a reader saw first rather than two half-attended rows.
      if (existing) existing.dates.add(date);
      else found.set(key, { key, name: res.canonicalName, dates: new Set([date]) });
    }
  }

  return [...found.values()];
}

// ---------------------------------------------------------------------------
// §4.1 — planned huddle days
// ---------------------------------------------------------------------------

/**
 * The dates in the Mon-start week at `weekStart` on which a huddle was
 * expected: the client's configured daily days (Mon–Fri when unset), minus the
 * Weekly Meeting day.
 */
export function plannedHuddleDates(config: WeeklyClientConfig, weekStart: Date): Date[] {
  const days = (config.dailyDays.length ? config.dailyDays : DEFAULT_DAILY_DAYS)
    .map((d) => WEEKDAY_INDEX[d.trim().toLowerCase()])
    .filter((i): i is number => i !== undefined);

  const excluded = config.weeklyDay ? WEEKDAY_INDEX[config.weeklyDay.trim().toLowerCase()] : undefined;
  const wanted = new Set(days.filter((i) => i !== excluded));

  const out: Date[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + offset);
    if (wanted.has(d.getUTCDay())) out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// §4.3 — attendance matrix
// ---------------------------------------------------------------------------

/**
 * What one member's attendance on one day amounts to.
 *
 * `UNKNOWN` is the important addition. Previously any gap in the evidence
 * collapsed to ABSENT, which is how a fully-attended week reported 30%. A cell
 * we cannot determine now renders "—" and is excluded from the denominator:
 * honest beats complete.
 *
 * `PARTIAL` is produced only from join-duration data (a Teams attendance
 * report). It counts as half a presence — joining ninety seconds of a
 * twenty-minute huddle is not attendance, but it is not absence either.
 */
export type AttendanceState = "PRESENT" | "PARTIAL" | "ABSENT" | "NA" | "UNKNOWN";

/** Which rung of the ladder decided a cell — shown in the UI as provenance. */
export type AttendanceEvidence =
  | "HUMAN_MARKED"
  | "NA_LEAVE"
  | "NA_NOT_HELD"
  /** Teams attendance report: joined for at least the presence threshold. */
  | "TEAMS_REPORT"
  /** Teams attendance report: joined, but under the threshold — half a presence. */
  | "TEAMS_REPORT_SHORT"
  /** Required invitee missing from a complete Teams report — provable absence. */
  | "TEAMS_REPORT_ABSENT"
  /** Optional invitee who did not join. Shown, never scored. */
  | "OPTIONAL_NOT_JOINED"
  | "PRESENT_PARTICIPANT_LIST"
  | "PRESENT_SPOKE"
  | "INFERRED_ABSENT"
  | "NO_DATA";

export interface AttendanceColumn {
  date: string;
  weekday: string;
  held: boolean;
  huddleId: string | null;
  /**
   * Whether this day's evidence can support an absence verdict at all.
   *
   * True when a human logged the huddle (their absence list is authoritative
   * even when empty) or the participant list is usable. False leaves every
   * unproven member UNKNOWN rather than absent.
   */
  attendanceKnown: boolean;
}

export interface AttendanceCell {
  date: string;
  state: AttendanceState;
  /** Why this cell reads the way it does. */
  evidence: AttendanceEvidence;
}

export interface AttendanceRow {
  memberId: string;
  name: string;
  role: string | null;
  /** REQUIRED | OPTIONAL | EXTERNAL for this client. */
  attendanceType: ClientAttendanceType;
  cells: AttendanceCell[];
  /**
   * Null for OPTIONAL and EXTERNAL members — they are shown but not scored, so
   * a number here would imply a judgement the report is not making — and null
   * for a REQUIRED member with no assessable day (`expectedDays === 0`), whose
   * cells all read "—". Renders "—".
   */
  attendancePct: number | null;
  presentDays: number;
  /** Days counted in the denominator: PRESENT + PARTIAL + ABSENT. Always 0 when unscored. */
  expectedDays: number;
  onLeaveDays: number;
  /** Days with no usable evidence — excluded from the percentage. */
  unknownDays: number;
  /**
   * True for a speaker heard in an uploaded transcript who is not on the client
   * roster. Shown so the meeting is reported at its real size, never scored,
   * and never a `ClientMember` — `memberId` is a synthetic `unmapped:` key that
   * exists only inside this report.
   */
  unmapped: boolean;
}

export interface AttendanceMatrix {
  columns: AttendanceColumn[];
  rows: AttendanceRow[];
  /** Mean of each held huddle's present/expected rate — the §4.2 tile. */
  averageAttendancePct: number;
}

export function buildAttendanceMatrix(input: {
  config: WeeklyClientConfig;
  roster: RosterMember[];
  days: HuddleDay[];
  weekStart: Date;
  /** Planned leave per member id — those cells render NA, not ABSENT. */
  onLeave?: Record<string, Date[]>;
  /**
   * Add a shown-but-unscored row for every speaker in an UPLOADED transcript
   * who is not on the roster. Off by default, so every existing caller and
   * every Fathom-sourced day behaves exactly as before.
   */
  includeUnmappedSpeakers?: boolean;
}): AttendanceMatrix {
  const {
    config,
    roster,
    days,
    weekStart,
    onLeave = {},
    includeUnmappedSpeakers = false,
  } = input;

  const byDate = new Map(days.map((d) => [ymd(d.meetingDate), d]));
  // Columns are the days a huddle was expected, plus any unexpected extra day
  // that actually happened (an ad-hoc huddle should not vanish from the grid).
  const dates = new Set(plannedHuddleDates(config, weekStart).map(ymd));
  for (const d of days) dates.add(ymd(d.meetingDate));

  const columns: AttendanceColumn[] = [...dates]
    .sort()
    .map((date) => {
      const huddle = byDate.get(date);
      return {
        date,
        weekday: WEEKDAY_SHORT[new Date(`${date}T00:00:00.000Z`).getUTCDay()],
        held: huddle?.callStatus === "HELD",
        huddleId: huddle?.id ?? null,
        // Absence may only be inferred where the evidence would have shown
        // the person had they attended: a human logged the huddle (their
        // absence list is authoritative even when empty), the participant
        // list is complete enough to trust, or Teams gave us a complete list
        // of who joined.
        attendanceKnown: huddle
          ? attendanceKnown({
              absenceListAuthoritative: huddle.attendance.absenceListAuthoritative,
              participantListUsable: huddle.attendance.participantListUsable,
              teams: huddle.attendance.teams,
            })
          : false,
      };
    });

  const leaveByMember = new Map<string, Set<string>>(
    Object.entries(onLeave).map(([id, ds]) => [id, new Set(ds.map(ymd))]),
  );

  /**
   * The precedence ladder for one member on one day.
   *
   * Order is the whole design: the only rung that can produce ABSENT from an
   * inference is the last one, and it is gated on the day's evidence being
   * complete enough to have seen the person had they been there.
   */
  const cellFor = (member: RosterMember, col: AttendanceColumn): AttendanceCell => {
    const day = byDate.get(col.date);

    // A day that was held but has no record at all is UNKNOWN, not ABSENT. The
    // ladder cannot make that call: it is handed evidence, and no row at all is
    // the absence of evidence rather than evidence of absence.
    if (col.held && !day) return { date: col.date, state: "UNKNOWN", evidence: "NO_DATA" };

    const verdict = attendanceVerdict(member, {
      held: col.held,
      markedAbsentIds: day?.attendance.markedAbsentIds ?? [],
      absenceListAuthoritative: day?.attendance.absenceListAuthoritative ?? false,
      participantIds: day?.attendance.participantIds ?? [],
      spokeIds: day?.attendance.spokeIds ?? [],
      participantListUsable: day?.attendance.participantListUsable ?? false,
      onLeaveIds: leaveByMember.get(member.id)?.has(col.date) ? [member.id] : [],
      teams: day?.attendance.teams,
    });

    return { date: col.date, state: verdict.state, evidence: verdict.evidence };
  };

  /** PRESENT counts fully, PARTIAL half, ABSENT zero; NA/UNKNOWN don't count. */
  const weightOf = (state: AttendanceState): number | null =>
    state === "PRESENT" ? 1 : state === "PARTIAL" ? 0.5 : state === "ABSENT" ? 0 : null;

  // Every member keeps a row — an optional attendee who turned up should still
  // be visible. Classification changes whether the row is SCORED, not whether
  // it is shown.
  const rows: AttendanceRow[] = roster.map((member) => {
    const cells = columns.map((col) => cellFor(member, col));
    const scoredMember = isScoredMember(member);

    let scored = 0;
    let expected = 0;
    let onLeaveDays = 0;
    let unknownDays = 0;
    let present = 0;

    for (const cell of cells) {
      const weight = weightOf(cell.state);
      if (weight === null) {
        if (cell.evidence === "NA_LEAVE") onLeaveDays += 1;
        else if (cell.state === "UNKNOWN") unknownDays += 1;
        continue;
      }
      if (cell.state === "PRESENT") present += 1;
      // Optional/external days are never counted, in either direction.
      if (!scoredMember) continue;
      expected += 1;
      scored += weight;
    }

    return {
      memberId: member.id,
      name: member.name,
      role: member.role ?? null,
      attendanceType: member.attendanceType ?? "REQUIRED",
      cells,
      presentDays: present,
      expectedDays: expected,
      onLeaveDays,
      unknownDays,
      // Null, not 0, when nothing was assessable. A row whose every cell reads
      // "—" must not total "0%": "we have no evidence" and "never showed up"
      // are different findings, and printing the second for the first is how a
      // fully-attended week libels someone. `expectedDays: 0` already excludes
      // the row from the exec summary's <50% list, which reads this as null.
      attendancePct: !scoredMember || !expected ? null : round1((scored / expected) * 100),
      unmapped: false,
    };
  });

  // Speakers from an uploaded transcript who are not on the roster. Appended
  // AFTER the roster rows and never mixed into them, so the block above is
  // untouched by this feature.
  //
  // Their cells are built here rather than through `attendanceVerdict`: that
  // ladder takes a roster member and reasons about marked-absence, leave and
  // Teams records, none of which exist for someone who was never invited. All
  // an uploaded `.docx` can prove about them is that they spoke on a given day
  // — so a day they were heard on is PRESENT, and every other held day is
  // UNKNOWN rather than ABSENT. Silence here is not evidence of absence; it is
  // the absence of evidence.
  if (includeUnmappedSpeakers) {
    for (const speaker of collectUnmappedSpeakers(days, roster)) {
      const cells: AttendanceCell[] = columns.map((col) => {
        if (!col.held) return { date: col.date, state: "NA", evidence: "NA_NOT_HELD" };
        if (speaker.dates.has(col.date)) {
          return { date: col.date, state: "PRESENT", evidence: "PRESENT_SPOKE" };
        }
        return { date: col.date, state: "UNKNOWN", evidence: "NO_DATA" };
      });

      rows.push({
        memberId: speaker.key,
        name: speaker.name,
        role: null,
        // EXTERNAL is the existing "shown but not scored" classification. Reusing
        // it means `expectedDays` stays 0 and the team tile below — which already
        // counts REQUIRED rows only — cannot move by so much as a decimal.
        attendanceType: "EXTERNAL",
        cells,
        presentDays: cells.filter((c) => c.state === "PRESENT").length,
        expectedDays: 0,
        onLeaveDays: 0,
        unknownDays: cells.filter((c) => c.state === "UNKNOWN").length,
        attendancePct: null,
        unmapped: true,
      });
    }
  }

  // Tile value: the mean of each day's own attendance rate, so a day with only
  // two assessable members doesn't outweigh a day with ten. Days where nobody
  // was assessable contribute nothing rather than a zero.
  const dayRates: number[] = [];
  const scoredRows = rows.filter((r) => r.attendanceType === "REQUIRED");
  for (const [i, col] of columns.entries()) {
    if (!col.held) continue;
    let scored = 0;
    let counted = 0;
    // Required members only — an optional attendee must not move the team tile.
    for (const row of scoredRows) {
      const weight = weightOf(row.cells[i].state);
      if (weight === null) continue;
      counted += 1;
      scored += weight;
    }
    if (counted) dayRates.push((scored / counted) * 100);
  }

  return { columns, rows, averageAttendancePct: round1(mean(dayRates) ?? 0) };
}

// ---------------------------------------------------------------------------
// §4.4 — adherence heat map
// ---------------------------------------------------------------------------

export interface HeatMapRow {
  memberId: string | null;
  participant: string;
  role: string | null;
  achievementPct: number | null;
  focusPct: number | null;
  stuckPct: number | null;
  /** Mean of the three dimensions, whole number — matches the doc's column. */
  avgScorePct: number | null;
  daysAssessed: number;
  /** "No Stuck"-style explicit non-blockers, kept for §4.6 correlation. */
  noStuckDays: number;
}

export interface UnrecognizedSpeaker {
  name: string;
  reason: ResolutionReason;
  days: number;
}

export interface AdherenceHeatMap {
  rows: HeatMapRow[];
  teamAverage: {
    achievementPct: number | null;
    focusPct: number | null;
    stuckPct: number | null;
  };
  unrecognized: UnrecognizedSpeaker[];
}

interface Accum {
  memberId: string | null;
  participant: string;
  role: string | null;
  achievement: number[];
  focus: number[];
  stuck: number[];
  days: number;
  noStuckDays: number;
}

/**
 * Fold every day's per-person ratings into one row per roster member.
 *
 * Speakers are resolved against the roster first, so "Ashwin" on Tuesday and
 * "Ashwin Singone" on Monday collapse into a single row. Anyone who cannot be
 * resolved is reported in `unrecognized` rather than becoming a phantom row —
 * a name we can't attribute is a data-quality signal, not a participant.
 *
 * `includeUnmappedSpeakers` inverts that last judgement for UPLOADED
 * transcripts only. There a human chose the file, so an unresolved speaker is a
 * real person the roster is missing rather than a name of doubtful provenance:
 * they get a row with their real scores, and they are NOT listed as
 * `unrecognized`, because nothing about them was excluded.
 */
export function buildAdherenceHeatMap(input: {
  roster: RosterMember[];
  days: HuddleDay[];
  /** Off by default — every existing caller keeps today's roster-only rows. */
  includeUnmappedSpeakers?: boolean;
}): AdherenceHeatMap {
  const { roster, days, includeUnmappedSpeakers = false } = input;
  const unmappedKeys = includeUnmappedSpeakers
    ? new Map(collectUnmappedSpeakers(days, roster).map((s) => [s.key, s.name]))
    : new Map<string, string>();

  const accums = new Map<string, Accum>();
  const unresolved = new Map<string, UnrecognizedSpeaker>();

  for (const day of days) {
    for (const row of day.adherence) {
      const res = resolveParticipant(row.participant, roster);

      // The accumulator key: a real member id, or — on the uploaded path only —
      // a synthetic `unmapped:` key for a speaker the roster is missing.
      const unmappedKey = `unmapped:${normalizeName(res.canonicalName)}`;
      const accKey = res.memberId ?? (unmappedKeys.has(unmappedKey) ? unmappedKey : null);

      if (!accKey) {
        // Keyed on the NORMALISED name, not the raw string: without this
        // "Ajay Baheti" and "Ajay baheti" become two entries with the week's
        // days split between them, which reads as two people who each showed
        // up half the time. The first-seen spelling is what gets displayed.
        const norm = normalizeName(res.canonicalName);
        const existing = unresolved.get(norm);
        if (existing) existing.days += 1;
        else unresolved.set(norm, { name: res.canonicalName, reason: res.reason, days: 1 });
        continue;
      }

      let acc = accums.get(accKey);
      if (!acc) {
        acc = {
          memberId: res.memberId,
          participant: res.memberId ? res.canonicalName : (unmappedKeys.get(accKey) ?? res.canonicalName),
          role: row.role ?? null,
          achievement: [],
          focus: [],
          stuck: [],
          days: 0,
          noStuckDays: 0,
        };
        accums.set(accKey, acc);
      }

      acc.days += 1;
      acc.role ??= row.role ?? null;

      const a = scoreRating(row.achievement);
      const f = scoreRating(row.focus);
      const s = scoreRating(row.stuck);
      if (a !== null) acc.achievement.push(a);
      if (f !== null) acc.focus.push(f);
      if (s !== null) acc.stuck.push(s);

      // An explicit "No Stuck" scores YES on the stuck dimension (the protocol
      // was followed) — §4.6 needs the frequency separately to spot a team
      // that never surfaces a blocker.
      if (row.stuck === "YES" && /no stuck|no blocker/i.test(row.stuckNote ?? "")) {
        acc.noStuckDays += 1;
      }
    }
  }

  const toRow = (acc: Accum): HeatMapRow => {
    const achievementPct = mean(acc.achievement);
    const focusPct = mean(acc.focus);
    const stuckPct = mean(acc.stuck);
    const dims = [achievementPct, focusPct, stuckPct].filter((n): n is number => n !== null);
    return {
      memberId: acc.memberId,
      participant: acc.participant,
      role: acc.role,
      achievementPct: achievementPct === null ? null : round1(achievementPct),
      focusPct: focusPct === null ? null : round1(focusPct),
      stuckPct: stuckPct === null ? null : round1(stuckPct),
      avgScorePct: dims.length ? Math.round(dims.reduce((x, y) => x + y, 0) / dims.length) : null,
      daysAssessed: acc.days,
      noStuckDays: acc.noStuckDays,
    };
  };

  // Preserve roster order so the table is stable across regenerations.
  const rosterRows: HeatMapRow[] = roster
    .map((m) => accums.get(m.id))
    .filter((a): a is Accum => Boolean(a))
    .map(toRow);

  // Unmapped speakers follow the roster, in first-seen order — also stable.
  const unmappedRows: HeatMapRow[] = [...unmappedKeys.keys()]
    .map((key) => accums.get(key))
    .filter((a): a is Accum => Boolean(a))
    .map(toRow);

  const rows = [...rosterRows, ...unmappedRows];

  // Team Average is the mean over ROSTER rows only. Letting an unmapped speaker
  // move it would silently redefine what the number means the moment a roster
  // gap appears, and make this week incomparable with last week's.
  const avgOf = (pick: (r: HeatMapRow) => number | null): number | null => {
    const vals = rosterRows.map(pick).filter((n): n is number => n !== null);
    const m = mean(vals);
    return m === null ? null : round1(m);
  };

  return {
    rows,
    teamAverage: {
      achievementPct: avgOf((r) => r.achievementPct),
      focusPct: avgOf((r) => r.focusPct),
      stuckPct: avgOf((r) => r.stuckPct),
    },
    unrecognized: [...unresolved.values()],
  };
}

// ---------------------------------------------------------------------------
// §4.2 — executive summary tiles
// ---------------------------------------------------------------------------

export interface ExecutiveMetrics {
  huddlesPlanned: number;
  huddlesConducted: number;
  averageAttendancePct: number;
  /** Null when the client has no planned start time configured. */
  startedOnTimePct: number | null;
  /** Null when no huddle recorded both a start and an end time. */
  averageDurationMinutes: number | null;
}

export function computeExecutiveMetrics(input: {
  config: WeeklyClientConfig;
  days: HuddleDay[];
  weekStart: Date;
  /** Comes from `buildAttendanceMatrix` so both views cannot disagree. */
  averageAttendancePct: number;
}): ExecutiveMetrics {
  const { config, days, weekStart, averageAttendancePct } = input;

  const held = days.filter((d) => d.callStatus === "HELD");

  const durations = held
    .map((d) => {
      const start = parseHhmmToMinutes(d.actualStartTime);
      const end = parseHhmmToMinutes(d.actualEndTime);
      return start !== null && end !== null && end >= start ? end - start : null;
    })
    .filter((n): n is number => n !== null);

  // Punctuality is measured against THIS DAY's planned start, falling back to
  // the client's standing schedule. The client asked in the requirement doc how
  // a meeting whose time was deliberately moved should be scored; measuring a
  // rescheduled 10:30 huddle against a standing 09:30 would mark it an hour
  // late and penalise the team for communicating the change.
  //
  // A day is only scored when SOME planned start is known — a day with neither
  // an override nor a standing time is excluded rather than assumed punctual.
  const punctualityScorable = held.filter(
    (d) => (d.plannedStartOverride ?? config.dailyStartTime) !== null,
  );

  let startedOnTimePct: number | null = null;
  if (punctualityScorable.length) {
    const onTime = punctualityScorable.filter((d) =>
      isPunctual(
        d.plannedStartOverride ?? config.dailyStartTime,
        d.actualStartTime,
        d.meetingDate,
        d.punctualityOverride,
      ),
    ).length;
    startedOnTimePct = round1((onTime / punctualityScorable.length) * 100);
  }

  const avgDuration = mean(durations);

  return {
    huddlesPlanned: plannedHuddleDates(config, weekStart).length,
    huddlesConducted: held.length,
    averageAttendancePct,
    startedOnTimePct,
    averageDurationMinutes: avgDuration === null ? null : Math.round(avgDuration),
  };
}

// ---------------------------------------------------------------------------
// §4.5A — all stucks raised during the week
// ---------------------------------------------------------------------------

/**
 * A blocker as it appears in §4.5A. `collectWeekBlockers` normalises every
 * optional field to an explicit `null`, so this type states that guarantee
 * rather than repeating `DayBlocker`'s optionality — downstream renderers and
 * the stored-report schema can rely on the fields being present.
 */
export interface WeekBlocker extends Omit<DayBlocker, "raisedFor" | "impact" | "requiredAction" | "status"> {
  /** Source day, so every row in §4.5A is traceable to one huddle. */
  date: string;
  huddleId: string;
  raisedFor: string | null;
  impact: string | null;
  requiredAction: string | null;
  /** Null unless the transcript stated it — never inferred. */
  status: BlockerStatus | null;
}

/** Every blocker raised across the week, oldest first. */
export function collectWeekBlockers(days: HuddleDay[]): WeekBlocker[] {
  return [...days]
    .sort((a, b) => a.meetingDate.getTime() - b.meetingDate.getTime())
    .flatMap((day) =>
      day.blockers.map((b) => ({
        ...b,
        raisedFor: b.raisedFor ?? null,
        impact: b.impact ?? null,
        requiredAction: b.requiredAction ?? null,
        status: b.status ?? null,
        date: ymd(day.meetingDate),
        huddleId: day.id,
      })),
    );
}
