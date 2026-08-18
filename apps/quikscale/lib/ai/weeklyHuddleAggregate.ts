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

export interface RosterMember {
  id: string;
  name: string;
}

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

/** One day of the reporting week: the huddle record + its transcript report. */
export interface HuddleDay {
  id: string;
  meetingDate: Date;
  callStatus: CallStatus;
  actualStartTime: string | null;
  actualEndTime: string | null;
  punctualityOverride: MeetingFlag;
  totalMembers: number;
  /** `ClientMember` ids recorded absent for this huddle. */
  absentMemberIds: string[];
  /**
   * Whether `absentMemberIds` is trustworthy for this day.
   *
   * A huddle logged in the Daily Huddle module carries an authoritative
   * absence list. A day known only from a Fathom transcript does not — if that
   * transcript has a report we infer presence from who spoke, but with no
   * report at all we know the huddle happened and nothing about who attended.
   * Such a day counts as CONDUCTED but is excluded from every attendance
   * figure, because an empty absence list would otherwise silently read as
   * "everyone was present".
   */
  attendanceKnown: boolean;
  adherence: DayAdherenceRow[];
  blockers: DayBlocker[];
  transcriptId: string | null;
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

export type AttendanceState = "PRESENT" | "ABSENT" | "NA";

export interface AttendanceColumn {
  date: string;
  weekday: string;
  held: boolean;
  huddleId: string | null;
  /** False when the huddle happened but we have no reliable attendance data. */
  attendanceKnown: boolean;
}

export interface AttendanceCell {
  date: string;
  state: AttendanceState;
}

export interface AttendanceRow {
  memberId: string;
  name: string;
  cells: AttendanceCell[];
  attendancePct: number;
  presentDays: number;
  expectedDays: number;
  onLeaveDays: number;
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
}): AttendanceMatrix {
  const { config, roster, days, weekStart, onLeave = {} } = input;

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
        attendanceKnown: huddle?.attendanceKnown ?? false,
      };
    });

  const leaveByMember = new Map<string, Set<string>>(
    Object.entries(onLeave).map(([id, ds]) => [id, new Set(ds.map(ymd))]),
  );

  const rows: AttendanceRow[] = roster.map((member) => {
    const leave = leaveByMember.get(member.id) ?? new Set<string>();
    let present = 0;
    let expected = 0;
    let onLeaveDays = 0;

    const cells: AttendanceCell[] = columns.map((col) => {
      // A day with no reliable attendance data reads NA rather than inventing
      // a full house from an empty absence list.
      if (!col.held || !col.attendanceKnown) return { date: col.date, state: "NA" as const };
      if (leave.has(col.date)) {
        onLeaveDays += 1;
        return { date: col.date, state: "NA" as const };
      }
      expected += 1;
      const huddle = byDate.get(col.date)!;
      const absent = huddle.absentMemberIds.includes(member.id);
      if (!absent) present += 1;
      return { date: col.date, state: absent ? ("ABSENT" as const) : ("PRESENT" as const) };
    });

    return {
      memberId: member.id,
      name: member.name,
      cells,
      presentDays: present,
      expectedDays: expected,
      onLeaveDays,
      attendancePct: expected ? round1((present / expected) * 100) : 0,
    };
  });

  // Tile value: average over held huddles of that huddle's attendance rate.
  const heldRates: number[] = [];
  for (const col of columns) {
    if (!col.held || !col.attendanceKnown) continue;
    const huddle = byDate.get(col.date)!;
    const expectedToday = roster.filter((m) => !(leaveByMember.get(m.id)?.has(col.date) ?? false));
    if (!expectedToday.length) continue;
    const presentToday = expectedToday.filter((m) => !huddle.absentMemberIds.includes(m.id)).length;
    heldRates.push((presentToday / expectedToday.length) * 100);
  }

  return { columns, rows, averageAttendancePct: round1(mean(heldRates) ?? 0) };
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
 */
export function buildAdherenceHeatMap(input: {
  roster: RosterMember[];
  days: HuddleDay[];
}): AdherenceHeatMap {
  const { roster, days } = input;

  const accums = new Map<string, Accum>();
  const unresolved = new Map<string, UnrecognizedSpeaker>();

  for (const day of days) {
    for (const row of day.adherence) {
      const res = resolveParticipant(row.participant, roster);

      if (!res.memberId) {
        const existing = unresolved.get(res.canonicalName);
        if (existing) existing.days += 1;
        else unresolved.set(res.canonicalName, { name: res.canonicalName, reason: res.reason, days: 1 });
        continue;
      }

      let acc = accums.get(res.memberId);
      if (!acc) {
        acc = {
          memberId: res.memberId,
          participant: res.canonicalName,
          role: row.role ?? null,
          achievement: [],
          focus: [],
          stuck: [],
          days: 0,
          noStuckDays: 0,
        };
        accums.set(res.memberId, acc);
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

  // Preserve roster order so the table is stable across regenerations.
  const rows: HeatMapRow[] = roster
    .map((m) => accums.get(m.id))
    .filter((a): a is Accum => Boolean(a))
    .map((acc) => {
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
    });

  const avgOf = (pick: (r: HeatMapRow) => number | null): number | null => {
    const vals = rows.map(pick).filter((n): n is number => n !== null);
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

  let startedOnTimePct: number | null = null;
  if (config.dailyStartTime && held.length) {
    const onTime = held.filter((d) =>
      isPunctual(config.dailyStartTime, d.actualStartTime, d.meetingDate, d.punctualityOverride),
    ).length;
    startedOnTimePct = round1((onTime / held.length) * 100);
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
