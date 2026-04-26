/**
 * Client Meetings dashboard math — port of meetingrythm.md §7.2–7.5 + §7.8.
 *
 * Intentionally pure: every function takes inputs + returns numbers. No DB
 * access. Route handlers load rows via Prisma, then call these helpers.
 *
 * Key concepts:
 *   - `ClientMeetingStatus.HELD` maps to spec's "Held" string.
 *   - `ClientMeetingFlag.YES | NA` counts as "passed" for format/quality math
 *     (spec's `totalYESCount` aggregates `YES` and `NA` alike — NA means "not
 *     applicable", which by convention doesn't penalise adherence).
 *   - Punctuality has a 60-second grace window (spec §7.3).
 *   - Duration-followed has a 60-second grace window (spec §7.4).
 */

export interface DailyHuddleForMath {
  meetingDate: Date;
  callStatus: "HELD" | "NOT_HELD" | "CALL_CANCELLED_BY_CLIENT" | "HOLIDAY_FOR_CLIENT" | "HOLIDAY_FOR_SUCCESS_ALCHEMIST";
  actualStartTime: string | null; // HH:mm
  actualEndTime: string | null;
  format1Status: "YES" | "NO" | "NA";
  format2Status: "YES" | "NO" | "NA";
  stuckCallStatus: "YES" | "NO" | "NA";
  punctualityOverride: "YES" | "NO" | "NA";
  totalMembers: number;
  absentCount: number;
}

export interface WeeklyMeetingForMath {
  meetingDate: Date;
  callStatus: "HELD" | "NOT_HELD" | "CALL_CANCELLED_BY_CLIENT" | "HOLIDAY_FOR_CLIENT" | "HOLIDAY_FOR_SUCCESS_ALCHEMIST";
  actualStartTime: string | null;
  actualEndTime: string | null;
  goodNewsSharing: "YES" | "NO" | "NA";
  kpDashboard: "YES" | "NO" | "NA";
  www: "YES" | "NO" | "NA";
  feedback: "YES" | "NO" | "NA";
  collectiveIntelligence: "YES" | "NO" | "NA";
  gaps: "YES" | "NO" | "NA";
  opspReview: "YES" | "NO" | "NA";
  punctualityOverride: "YES" | "NO" | "NA";
  totalMembers: number;
  absentCount: number;
  // Per-member scores — used for avgAuality (dashboard quality) in Weekly mode.
  memberScores: Array<{
    userId: string;
    kpiWeeklyQTD: number; kpiCoding: number; priorityNotes: number;
    priorityStartEndDate: number; priorityColor: number;
  }>;
}

export interface MonthlyStatRow {
  monthName: string; year: number; monthNumber: number; // 0-indexed JS month
  totalCalls: number;
  heldCalls: number;
  avgHeld: number;
  avgPunctual: number;
  avgDurationFollowed: number;
  avgFormat: number;
  avgAttendance: number;
  avgStuckCalls: number;
  avgAuality: number;
  avgKP: number;
  avgWWW: number;
  avgEF: number;
  avgCI: number;
  Total: number;
  isUpdate: boolean;
}

/* ─── Time helpers ──────────────────────────────────────────────────────────── */

/** Combine a YYYY-MM-DD date with HH:mm into a Date in UTC. */
function toTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(n => parseInt(n, 10));
  const d = new Date(date);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

/**
 * §7.3 Punctuality:
 * - If override is YES or NA, counts as punctual (spec's override behaviour).
 * - Otherwise: actualStart <= plannedStart + 60s grace.
 */
export function isPunctual(
  planned: string | null,
  actual: string | null,
  date: Date,
  override: "YES" | "NO" | "NA",
): boolean {
  if (override === "YES" || override === "NA") return true;
  if (!planned || !actual) return false;
  const plannedT = toTime(date, planned);
  const actualT = toTime(date, actual);
  return actualT.getTime() <= plannedT.getTime() + 60_000;
}

/**
 * §7.4 Duration followed:
 *   actualDur <= plannedDur + 60s grace.
 */
export function isDurationFollowed(
  plannedStart: string | null, plannedEnd: string | null,
  actualStart: string | null, actualEnd: string | null,
  date: Date,
): boolean {
  if (!plannedStart || !plannedEnd || !actualStart || !actualEnd) return false;
  const plannedDur = toTime(date, plannedEnd).getTime() - toTime(date, plannedStart).getTime();
  const actualDur  = toTime(date, actualEnd).getTime()   - toTime(date, actualStart).getTime();
  return actualDur <= plannedDur + 60_000;
}

/* ─── Monthly aggregation ───────────────────────────────────────────────────── */

/**
 * Build a list of the last N months (inclusive of the current month).
 * Returned oldest-first so dashboard renders chronologically left-to-right.
 */
export function previousMonths(base: Date, n: number): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  for (let i = n - 1; i >= 0; i--) {
    const cursor = new Date(d);
    cursor.setUTCMonth(cursor.getUTCMonth() - i);
    out.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() });
  }
  return out;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function pctYesNA(flags: Array<"YES" | "NO" | "NA">, denom: number): number {
  if (denom <= 0) return 0;
  const passed = flags.filter(f => f === "YES" || f === "NA").length;
  return (passed / denom) * 100;
}

function smartRound(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

/** §7.2 — Daily mode monthly stats. */
export function calculateDailyMonthlyStats(
  huddles: DailyHuddleForMath[],
  months: Array<{ year: number; month: number }>,
  plannedStart: string | null,
  plannedEnd: string | null,
): MonthlyStatRow[] {
  return months.map(({ year, month }) => {
    const rows = huddles.filter(h =>
      h.meetingDate.getUTCFullYear() === year && h.meetingDate.getUTCMonth() === month
    );
    const totalCalls = rows.length;
    const heldAndCancelled = rows.filter(r => r.callStatus === "HELD" || r.callStatus === "CALL_CANCELLED_BY_CLIENT");
    const held = rows.filter(r => r.callStatus === "HELD");

    const punctual = held.filter(r => isPunctual(plannedStart, r.actualStartTime, r.meetingDate, r.punctualityOverride)).length;
    const durationOk = held.filter(r => isDurationFollowed(plannedStart, plannedEnd, r.actualStartTime, r.actualEndTime, r.meetingDate)).length;

    // avgFormat: 3 format radios × heldCalls denominator
    const formatFlags = held.flatMap(r => [r.format1Status, r.format2Status, r.stuckCallStatus]);
    const avgFormat = pctYesNA(formatFlags, held.length * 3);

    // stuck-called-out specifically (separate metric in daily mode)
    const avgStuckCalls = pctYesNA(held.map(r => r.stuckCallStatus), held.length);

    const attendancePercents = held.map(r => r.totalMembers > 0 ? ((r.totalMembers - r.absentCount) / r.totalMembers) * 100 : 0);
    const avgAttendance = attendancePercents.length ? attendancePercents.reduce((a, b) => a + b, 0) / attendancePercents.length : 0;

    const avgHeld     = heldAndCancelled.length ? (held.length / heldAndCancelled.length) * 100 : 0;
    const avgPunctual = held.length ? (punctual   / held.length) * 100 : 0;
    const avgDur      = held.length ? (durationOk / held.length) * 100 : 0;

    const total = avg([avgHeld, avgPunctual, avgDur, avgFormat, avgAttendance, avgStuckCalls]);

    return {
      monthName: MONTH_NAMES[month], year, monthNumber: month,
      totalCalls, heldCalls: held.length,
      avgHeld: smartRound(avgHeld),
      avgPunctual: smartRound(avgPunctual),
      avgDurationFollowed: smartRound(avgDur),
      avgFormat: smartRound(avgFormat),
      avgAttendance: smartRound(avgAttendance),
      avgStuckCalls: smartRound(avgStuckCalls),
      avgAuality: 0, avgKP: 0, avgWWW: 0, avgEF: 0, avgCI: 0,
      Total: smartRound(total),
      isUpdate: held.length > 0,
    };
  });
}

/** §7.2 — Weekly mode monthly stats (adds avgKP/WWW/EF/CI/Auality). */
export function calculateWeeklyMonthlyStats(
  meetings: WeeklyMeetingForMath[],
  months: Array<{ year: number; month: number }>,
  plannedStart: string | null,
  plannedEnd: string | null,
): MonthlyStatRow[] {
  return months.map(({ year, month }) => {
    const rows = meetings.filter(m =>
      m.meetingDate.getUTCFullYear() === year && m.meetingDate.getUTCMonth() === month
    );
    const totalCalls = rows.length;
    const heldAndCancelled = rows.filter(r => r.callStatus === "HELD" || r.callStatus === "CALL_CANCELLED_BY_CLIENT");
    const held = rows.filter(r => r.callStatus === "HELD");

    const punctual = held.filter(r => isPunctual(plannedStart, r.actualStartTime, r.meetingDate, r.punctualityOverride)).length;
    const durationOk = held.filter(r => isDurationFollowed(plannedStart, plannedEnd, r.actualStartTime, r.actualEndTime, r.meetingDate)).length;

    // avgFormat: goodNewsSharing + kpDashboard (2 radios × heldCalls denominator)
    const formatFlags = held.flatMap(r => [r.goodNewsSharing, r.kpDashboard]);
    const avgFormat = pctYesNA(formatFlags, held.length * 2);

    const avgKP  = pctYesNA(held.map(r => r.gaps),      held.length);
    const avgWWW = pctYesNA(held.map(r => r.www),        held.length);
    const avgEF  = pctYesNA(held.map(r => r.feedback),         held.length);
    const avgCI  = pctYesNA(held.map(r => r.collectiveIntelligence),  held.length);

    // avgAuality (spec's "dashboard quality"): derived from opspReview radio
    // AND the average of all 5 member-score dimensions. We blend the two 50/50.
    const qualityFlagPct = pctYesNA(held.map(r => r.opspReview), held.length);
    const perMeetingMemberAvgs = held.map(r => {
      if (!r.memberScores.length) return 0;
      const perMember = r.memberScores.map(s => (s.kpiWeeklyQTD + s.kpiCoding + s.priorityNotes + s.priorityStartEndDate + s.priorityColor) / 5);
      return perMember.reduce((a, b) => a + b, 0) / perMember.length;
    });
    const avgMemberScore = perMeetingMemberAvgs.length ? perMeetingMemberAvgs.reduce((a, b) => a + b, 0) / perMeetingMemberAvgs.length : 0;
    const avgAuality = (qualityFlagPct + avgMemberScore) / 2;

    const attendancePercents = held.map(r => r.totalMembers > 0 ? ((r.totalMembers - r.absentCount) / r.totalMembers) * 100 : 0);
    const avgAttendance = attendancePercents.length ? attendancePercents.reduce((a, b) => a + b, 0) / attendancePercents.length : 0;

    const avgHeld     = heldAndCancelled.length ? (held.length / heldAndCancelled.length) * 100 : 0;
    const avgPunctual = held.length ? (punctual   / held.length) * 100 : 0;
    const avgDur      = held.length ? (durationOk / held.length) * 100 : 0;

    const total = avg([avgHeld, avgPunctual, avgDur, avgAuality, avgKP, avgWWW, avgEF, avgCI, avgAttendance]);

    return {
      monthName: MONTH_NAMES[month], year, monthNumber: month,
      totalCalls, heldCalls: held.length,
      avgHeld: smartRound(avgHeld),
      avgPunctual: smartRound(avgPunctual),
      avgDurationFollowed: smartRound(avgDur),
      avgFormat: smartRound(avgFormat),
      avgAttendance: smartRound(avgAttendance),
      avgStuckCalls: 0,
      avgAuality: smartRound(avgAuality),
      avgKP:  smartRound(avgKP),
      avgWWW: smartRound(avgWWW),
      avgEF:  smartRound(avgEF),
      avgCI:  smartRound(avgCI),
      Total: smartRound(total),
      isUpdate: held.length > 0,
    };
  });
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/* ─── Member Punch-In aggregator (spec §7.8) ────────────────────────────────── */

export interface MemberPunchMeeting {
  meetingDate: string; // YYYY-MM-DD
  kpiWeeklyQTD: number | "AB" | "NA";
  kpiCoding: number | "AB" | "NA";
  priorityNotes: number | "AB" | "NA";
  priorityStartEndDate: number | "AB" | "NA";
  priorityColor: number | "AB" | "NA";
}

export interface MemberPunchReport {
  memberId: string;
  memberName: string;
  weeks: MemberPunchMeeting[];
  totals: {
    kpiWeeklyQTD: number; kpiCoding: number; priorityNotes: number;
    priorityStartEndDate: number; priorityColor: number;
  };
  WeeklyTotalAverage: number;
}

/**
 * §7.8 — For each member, walk the month's meetings; record their 5 KPI
 * scores, or "AB" if absent and no entry, or "NA" if on the dashboardNA list.
 * Then compute per-KPI mean across meetings, and a single top-line average.
 */
export function computeMemberPunchIn(
  meetings: Array<{
    id: string;
    meetingDate: Date;
    absentUserIds: string[];
    dashboardNAUserIds: string[];
    memberScores: Array<{
      userId: string;
      kpiWeeklyQTD: number; kpiCoding: number; priorityNotes: number;
      priorityStartEndDate: number; priorityColor: number;
    }>;
  }>,
  member: { id: string; name: string },
): MemberPunchReport {
  const KPI_KEYS = ["kpiWeeklyQTD", "kpiCoding", "priorityNotes", "priorityStartEndDate", "priorityColor"] as const;

  const sorted = [...meetings].sort((a, b) => a.meetingDate.getTime() - b.meetingDate.getTime());
  const weeks: MemberPunchMeeting[] = sorted.map(mtg => {
    const onDashboardNA = mtg.dashboardNAUserIds.includes(member.id);
    const present = mtg.memberScores.find(s => s.userId === member.id);
    const isAbsent = mtg.absentUserIds.includes(member.id);

    const dateStr = mtg.meetingDate.toISOString().slice(0, 10);
    if (onDashboardNA && !present) {
      return { meetingDate: dateStr,
        kpiWeeklyQTD: "NA", kpiCoding: "NA", priorityNotes: "NA",
        priorityStartEndDate: "NA", priorityColor: "NA" };
    }
    if (isAbsent && !present) {
      return { meetingDate: dateStr,
        kpiWeeklyQTD: "AB", kpiCoding: "AB", priorityNotes: "AB",
        priorityStartEndDate: "AB", priorityColor: "AB" };
    }
    return {
      meetingDate: dateStr,
      kpiWeeklyQTD: present?.kpiWeeklyQTD ?? 0,
      kpiCoding: present?.kpiCoding ?? 0,
      priorityNotes: present?.priorityNotes ?? 0,
      priorityStartEndDate: present?.priorityStartEndDate ?? 0,
      priorityColor: present?.priorityColor ?? 0,
    };
  });

  // Per-KPI average — only count numeric entries (skip AB/NA).
  const totals = Object.fromEntries(KPI_KEYS.map(k => {
    const nums = weeks.map(w => w[k]).filter((v): v is number => typeof v === "number");
    return [k, nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0];
  })) as MemberPunchReport["totals"];

  const WeeklyTotalAverage = smartRound(
    (totals.kpiWeeklyQTD + totals.kpiCoding + totals.priorityNotes +
     totals.priorityStartEndDate + totals.priorityColor) / 5
  );

  return { memberId: member.id, memberName: member.name, weeks, totals, WeeklyTotalAverage };
}

/** §7.9 — average of every member's WeeklyTotalAverage. */
export function calculateOverallFinalAverage(reports: MemberPunchReport[]): number {
  if (!reports.length) return 0;
  const sum = reports.reduce((a, r) => a + r.WeeklyTotalAverage, 0);
  return Math.round((sum / reports.length) * 100) / 100;
}

/* ─── Color rules (for UI rendering) — spec §10 ─────────────────────────────── */

export type PerformanceColor = "blue" | "green" | "yellow" | "red" | "gray";

export function performanceColor(pct: number, isUpdate: boolean): PerformanceColor {
  if (!isUpdate) return "gray";
  if (pct >= 98) return "blue";
  if (pct >= 90) return "green";
  if (pct >= 80) return "yellow";
  return "red";
}
