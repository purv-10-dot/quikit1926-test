/**
 * The attendance evidence ladder, for ONE meeting occurrence.
 *
 * This is the ladder doc 15 §16 specifies, lifted out of
 * `weeklyHuddleAggregate.ts` so the Weekly Meeting report can use it too.
 * `buildAttendanceMatrix` now calls into here for every cell, so there is one
 * ladder rather than a daily one and a weekly one that drift apart — the whole
 * failure mode doc 15 §16 was written to stop.
 *
 * WHY THE ORDER IS THE DESIGN
 * ---------------------------
 * The only rung that can produce ABSENT from an inference is the LAST one, and
 * it is gated on the occurrence's evidence being complete enough that we would
 * have seen the person had they been there. Everywhere else, not knowing
 * produces `UNKNOWN` — which is excluded from denominators, so the report says
 * "we don't know" instead of quietly scoring someone absent.
 *
 * Silence is not evidence. There is a "spoke ⇒ present" rung and deliberately
 * no "did not speak ⇒ absent" rung: in a three-hour weekly meeting most people
 * are silent for most of it.
 */

import type {
  AttendanceEvidence,
  AttendanceState,
  ClientAttendanceType,
} from "@/lib/ai/weeklyHuddleAggregate";

/** What is known about who was in the room for one occurrence. */
export interface OccurrenceEvidence {
  /** False when the meeting did not take place. Every cell is then NA. */
  held: boolean;
  /** `ClientMember` ids a human explicitly marked absent. Beats every inference. */
  markedAbsentIds: string[];
  /**
   * True when a human logged this occurrence, which makes `markedAbsentIds`
   * authoritative in BOTH directions: anyone not on it was present, and an
   * empty list means a full house.
   */
  absenceListAuthoritative: boolean;
  /** Members present per the meeting's participant list. */
  participantIds: string[];
  /** Members who spoke in the transcript. */
  spokeIds: string[];
  /** Whether the participant list is complete enough to infer absence from. */
  participantListUsable: boolean;
  /** Member ids on approved leave for this date. */
  onLeaveIds?: string[];
}

/** A member as far as the ladder is concerned. */
export interface AttendanceSubject {
  id: string;
  attendanceType?: ClientAttendanceType | null;
}

export interface AttendanceVerdict {
  state: AttendanceState;
  evidence: AttendanceEvidence;
}

/**
 * Can this occurrence's evidence support an absence verdict at all?
 *
 * A human having logged it settles the question (their list is authoritative
 * even when empty); otherwise the participant list must be usable. When neither
 * holds, every unproven member stays UNKNOWN rather than becoming absent.
 */
export function attendanceKnown(evidence: {
  absenceListAuthoritative: boolean;
  participantListUsable: boolean;
}): boolean {
  return evidence.absenceListAuthoritative || evidence.participantListUsable;
}

/**
 * The ladder itself. One member, one occurrence, one verdict.
 *
 * Extracted verbatim from `buildAttendanceMatrix`'s `cellFor`, rung for rung.
 * The daily-huddle report's existing tests pin the behaviour, so a change here
 * that alters a verdict fails them.
 */
export function attendanceVerdict(
  member: AttendanceSubject,
  occurrence: OccurrenceEvidence,
): AttendanceVerdict {
  const at = (
    state: AttendanceState,
    evidence: AttendanceEvidence,
  ): AttendanceVerdict => ({ state, evidence });

  if (!occurrence.held) return at("NA", "NA_NOT_HELD");

  // 0. Planned leave outranks everything, including a human's absence tick:
  //    someone on approved leave was never expected, so recording them
  //    "absent" must not count against their attendance.
  if (occurrence.onLeaveIds?.includes(member.id)) return at("NA", "NA_LEAVE");

  // 0b. A human ticking absent outranks every inference below.
  if (occurrence.markedAbsentIds.includes(member.id)) return at("ABSENT", "HUMAN_MARKED");

  // 0c. A human logged this meeting, so the absence list settles it both ways:
  //     not on it means present.
  if (occurrence.absenceListAuthoritative) return at("PRESENT", "HUMAN_MARKED");

  // 1. In the participant list — proves presence even for someone silent.
  if (occurrence.participantIds.includes(member.id)) {
    return at("PRESENT", "PRESENT_PARTICIPANT_LIST");
  }

  // 2. Spoke — proves presence. (Silence proves nothing, which is why there is
  //    no matching "did not speak ⇒ absent" rung.)
  if (occurrence.spokeIds.includes(member.id)) return at("PRESENT", "PRESENT_SPOKE");

  // 3. Absence may only be inferred where we would have seen them.
  if (attendanceKnown(occurrence)) return at("ABSENT", "INFERRED_ABSENT");

  return at("UNKNOWN", "NO_DATA");
}

/**
 * PRESENT counts fully, PARTIAL half, ABSENT zero.
 *
 * NA and UNKNOWN return null and are excluded from both numerator and
 * denominator — a member on leave and a member we have no evidence about must
 * not drag a percentage down.
 */
export function attendanceWeight(state: AttendanceState): number | null {
  return state === "PRESENT" ? 1 : state === "PARTIAL" ? 0.5 : state === "ABSENT" ? 0 : null;
}

/** OPTIONAL and EXTERNAL attendees are shown but never scored, in either direction. */
export function isScoredAttendee(member: AttendanceSubject): boolean {
  const type = member.attendanceType ?? "REQUIRED";
  return type === "REQUIRED";
}

// ---------------------------------------------------------------------------
// Single-occurrence roll-up — what the Weekly Meeting report needs
// ---------------------------------------------------------------------------

export interface OccurrenceAttendanceRow {
  memberId: string;
  name: string;
  role: string | null;
  attendanceType: ClientAttendanceType;
  state: AttendanceState;
  evidence: AttendanceEvidence;
  /** True when this row counts toward the meeting's attendance percentage. */
  scored: boolean;
}

export interface OccurrenceAttendanceResult {
  rows: OccurrenceAttendanceRow[];
  present: number;
  absent: number;
  onLeave: number;
  unknown: number;
  /** Members counted in the denominator: PRESENT + PARTIAL + ABSENT, REQUIRED only. */
  expected: number;
  /**
   * Null when nobody was assessable — the report renders "—" rather than 0%,
   * because "no evidence" and "nobody came" are different findings.
   */
  attendancePct: number | null;
}

/**
 * Attendance for one meeting: the reference report's "16 present / 3 absent /
 * 19 expected, 84%" line.
 *
 * Every roster member keeps a row, including optional and external attendees —
 * someone who turned up should be visible. Classification decides whether a row
 * is SCORED, not whether it is shown.
 */
export function buildOccurrenceAttendance(input: {
  roster: Array<{
    id: string;
    name: string;
    role?: string | null;
    attendanceType?: ClientAttendanceType | null;
  }>;
  occurrence: OccurrenceEvidence;
}): OccurrenceAttendanceResult {
  const rows: OccurrenceAttendanceRow[] = input.roster.map((member) => {
    const verdict = attendanceVerdict(member, input.occurrence);
    return {
      memberId: member.id,
      name: member.name,
      role: member.role ?? null,
      attendanceType: member.attendanceType ?? "REQUIRED",
      state: verdict.state,
      evidence: verdict.evidence,
      scored: isScoredAttendee(member),
    };
  });

  let scoredTotal = 0;
  let expected = 0;
  let present = 0;
  let absent = 0;
  let onLeave = 0;
  let unknown = 0;

  for (const row of rows) {
    if (row.evidence === "NA_LEAVE") onLeave += 1;
    else if (row.state === "UNKNOWN") unknown += 1;

    if (row.state === "PRESENT" || row.state === "PARTIAL") present += 1;
    else if (row.state === "ABSENT") absent += 1;

    const weight = attendanceWeight(row.state);
    if (weight === null || !row.scored) continue;
    expected += 1;
    scoredTotal += weight;
  }

  return {
    rows,
    present,
    absent,
    onLeave,
    unknown,
    expected,
    attendancePct: expected ? Math.round((scoredTotal / expected) * 1000) / 10 : null,
  };
}
