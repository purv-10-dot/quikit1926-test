/**
 * Composes the persisted Daily Huddle Weekly Report document from the
 * deterministic tables and the AI prose, and derives the flat metrics snapshot
 * the Monthly Report will trend over.
 *
 * `storedWeeklyReportSchema` is the contract for what lives in
 * `ClientDailyHuddleWeeklyReport.report` — the PUT route validates against it,
 * so a hand-edited report can never be saved in a shape the renderer can't
 * handle.
 *
 * Note the §4.2 "Agenda Adherence (Team)" table is not stored separately: it
 * IS `heatMap.teamAverage`, rendered twice. Storing one number in two places
 * is how the two tables silently drift apart.
 */

import { z } from "zod";

import { normalizeKey } from "@/lib/facts/consolidate";
import { buildFactSet, type MeetingFactSet } from "@/lib/reports/factSet";
import {
  buildAdherenceHeatMap,
  buildAttendanceMatrix,
  collectWeekBlockers,
  computeExecutiveMetrics,
  type HuddleDay,
  type RosterMember,
  type WeeklyClientConfig,
} from "./weeklyHuddleAggregate";
import { WWW_KINDS, type WeeklyReportAi } from "./weeklyHuddleReport";

// ---------------------------------------------------------------------------
// Stored document schema
// ---------------------------------------------------------------------------

const attendanceCellSchema = z.object({
  date: z.string(),
  state: z.enum(["PRESENT", "PARTIAL", "ABSENT", "NA", "UNKNOWN"]),
  /**
   * Which rung of the evidence ladder decided the cell. Defaulted so a report
   * stored before evidence tracking existed still parses — an old report is
   * historical fact and must not become unreadable.
   */
  evidence: z
    .enum([
      "HUMAN_MARKED",
      "NA_LEAVE",
      "NA_NOT_HELD",
      "TEAMS_REPORT",
      "TEAMS_REPORT_SHORT",
      "TEAMS_REPORT_ABSENT",
      "OPTIONAL_NOT_JOINED",
      "PRESENT_PARTICIPANT_LIST",
      "PRESENT_SPOKE",
      "INFERRED_ABSENT",
      "NO_DATA",
    ])
    .default("NO_DATA"),
});

const attendanceMatrixSchema = z.object({
  columns: z.array(
    z.object({
      date: z.string(),
      weekday: z.string(),
      held: z.boolean(),
      huddleId: z.string().nullable(),
      /** False when the huddle happened but no reliable attendance data exists. */
      attendanceKnown: z.boolean(),
    }),
  ),
  rows: z.array(
    z.object({
      memberId: z.string(),
      name: z.string(),
      role: z.string().nullable().default(null),
      /** Defaulted so reports stored before classification existed still parse. */
      attendanceType: z.enum(["REQUIRED", "OPTIONAL", "EXTERNAL"]).default("REQUIRED"),
      cells: z.array(attendanceCellSchema),
      /** Null for OPTIONAL/EXTERNAL — shown but not scored. */
      attendancePct: z.number().nullable().default(null),
      presentDays: z.number(),
      expectedDays: z.number(),
      onLeaveDays: z.number(),
      /** Days excluded from the percentage for want of evidence. */
      unknownDays: z.number().default(0),
    }),
  ),
  averageAttendancePct: z.number(),
});

const heatMapSchema = z.object({
  rows: z.array(
    z.object({
      memberId: z.string().nullable(),
      participant: z.string(),
      role: z.string().nullable(),
      achievementPct: z.number().nullable(),
      focusPct: z.number().nullable(),
      stuckPct: z.number().nullable(),
      avgScorePct: z.number().nullable(),
      daysAssessed: z.number(),
      noStuckDays: z.number(),
    }),
  ),
  teamAverage: z.object({
    achievementPct: z.number().nullable(),
    focusPct: z.number().nullable(),
    stuckPct: z.number().nullable(),
  }),
  unrecognized: z.array(
    z.object({
      name: z.string(),
      reason: z.enum(["exact", "partial", "ambiguous", "unknown"]),
      days: z.number(),
    }),
  ),
});

const weekBlockerSchema = z.object({
  date: z.string(),
  huddleId: z.string(),
  raisedBy: z.string(),
  raisedFor: z.string().nullable(),
  category: z.string(),
  description: z.string(),
  impact: z.string().nullable(),
  requiredAction: z.string().nullable(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).nullable(),
});

const observationSchema = z.object({
  text: z.string(),
  namedMembers: z.array(z.string()),
  sourceDates: z.array(z.string()),
});

/** WWW suggestions carry the same accept/duplicate annotations as the
 *  per-transcript report, so the existing review UI pattern transfers. */
const storedWwwSchema = z.object({
  who: z.string().nullish(),
  what: z.string(),
  when: z.string().nullish(),
  kind: z.enum(WWW_KINDS),
  confidence: z.number(),
  sourceDate: z.string().nullish(),
  sourceQuote: z.string().nullish(),
  duplicate: z
    .object({
      id: z.string(),
      name: z.string(),
      ownerName: z.string().nullish(),
      confidence: z.number().nullish(),
    })
    .nullish(),
  accepted: z.boolean().optional(),
  createdRecordId: z.string().nullish(),
});

export const storedWeeklyReportSchema = z.object({
  reportType: z.literal("DH_WEEKLY"),
  title: z.string(),
  clientName: z.string(),
  weekStart: z.string(),
  weekEnd: z.string(),
  weekLabel: z.string(),
  overallConfidence: z.number(),
  /** §4.1 */
  meetingDetails: z.object({
    meetingType: z.string(),
    weekLabel: z.string(),
    plannedStartTime: z.string().nullable(),
    plannedEndTime: z.string().nullable(),
    plannedDurationMinutes: z.number().nullable(),
    nonHuddleDay: z.string().nullable(),
    teamMemberCount: z.number(),
  }),
  /** §4.2 */
  executive: z.object({
    metrics: z.object({
      huddlesPlanned: z.number(),
      huddlesConducted: z.number(),
      averageAttendancePct: z.number(),
      startedOnTimePct: z.number().nullable(),
      averageDurationMinutes: z.number().nullable(),
    }),
    keyHighlights: z.array(z.string()),
  }),
  /** §4.3 */
  attendance: attendanceMatrixSchema,
  /** §4.4 — `teamAverage` doubles as §4.2's Agenda Adherence table. */
  heatMap: heatMapSchema,
  /** §4.5 */
  stucks: z.object({
    all: z.array(weekBlockerSchema),
    recurring: z.array(
      z.object({
        blocker: z.string(),
        occurrences: z.number(),
        blockerIndexes: z.array(z.number()),
        raisedBy: z.array(z.string()),
        raisedFor: z.array(z.string()),
        status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).nullish(),
      }),
    ),
  }),
  /** §4.6 */
  facilitatorObservations: z.object({
    attendanceParticipation: observationSchema,
    strongPerformers: observationSchema,
    achievementGap: observationSchema,
    focusSpecificity: observationSchema,
    stuckProtocol: observationSchema,
    recommendations: observationSchema,
  }),
  wwwSuggestions: z.array(storedWwwSchema),
  /** Which days fed the rollup, for traceability. */
  sourceDays: z.array(
    z.object({
      date: z.string(),
      huddleId: z.string().nullable(),
      transcriptId: z.string().nullable(),
      hasReport: z.boolean(),
    }),
  ),
});

export type StoredWeeklyReport = z.infer<typeof storedWeeklyReportSchema>;

// ---------------------------------------------------------------------------
// Deterministic layer
// ---------------------------------------------------------------------------

export interface DeterministicWeek {
  attendance: ReturnType<typeof buildAttendanceMatrix>;
  heatMap: ReturnType<typeof buildAdherenceHeatMap>;
  metrics: ReturnType<typeof computeExecutiveMetrics>;
  blockers: ReturnType<typeof collectWeekBlockers>;
}

/** Everything §4.1–§4.5A, computed with no AI involvement whatsoever. */
export function computeDeterministicWeek(input: {
  config: WeeklyClientConfig;
  roster: RosterMember[];
  days: HuddleDay[];
  weekStart: Date;
  onLeave?: Record<string, Date[]>;
}): DeterministicWeek {
  const { config, roster, days, weekStart, onLeave } = input;

  const attendance = buildAttendanceMatrix({ config, roster, days, weekStart, onLeave });
  const heatMap = buildAdherenceHeatMap({ roster, days });
  const metrics = computeExecutiveMetrics({
    config,
    days,
    weekStart,
    averageAttendancePct: attendance.averageAttendancePct,
  });
  const blockers = collectWeekBlockers(days);

  return { attendance, heatMap, metrics, blockers };
}

const minutesBetween = (start: string | null, end: string | null): number | null => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return null;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : null;
};

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export function composeWeeklyReport(input: {
  config: WeeklyClientConfig;
  roster: RosterMember[];
  weekStart: Date;
  weekEnd: Date;
  weekLabel: string;
  deterministic: DeterministicWeek;
  ai: WeeklyReportAi;
  sourceDays: { date: string; huddleId: string | null; transcriptId: string | null; hasReport: boolean }[];
}): StoredWeeklyReport {
  const { config, roster, weekStart, weekEnd, weekLabel, deterministic, ai, sourceDays } = input;
  const { attendance, heatMap, metrics, blockers } = deterministic;

  return {
    reportType: "DH_WEEKLY",
    title: `Daily Huddle Weekly Report — ${config.name}`,
    clientName: config.name,
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    weekLabel,
    overallConfidence: ai.overallConfidence,
    meetingDetails: {
      meetingType: "Daily Huddle",
      weekLabel,
      plannedStartTime: config.dailyStartTime,
      plannedEndTime: config.dailyEndTime,
      plannedDurationMinutes: minutesBetween(config.dailyStartTime, config.dailyEndTime),
      nonHuddleDay: config.weeklyDay,
      teamMemberCount: roster.length,
    },
    executive: {
      metrics,
      keyHighlights: ai.keyHighlights,
    },
    attendance,
    heatMap,
    stucks: {
      all: blockers,
      recurring: ai.recurringStucks,
    },
    facilitatorObservations: ai.facilitatorObservations,
    // Anything at or below 40% confidence starts unchecked — the reviewer opts
    // in rather than having to notice and opt out.
    wwwSuggestions: ai.wwwSuggestions.map((w) => ({ ...w, accepted: w.confidence > 0.4 })),
    sourceDays,
  };
}

// ---------------------------------------------------------------------------
// Flat metrics snapshot — the Monthly Report's trend source
// ---------------------------------------------------------------------------

export interface WeeklyMetricsSnapshot {
  weekStart: string;
  huddlesPlanned: number;
  huddlesConducted: number;
  averageAttendancePct: number;
  startedOnTimePct: number | null;
  averageDurationMinutes: number | null;
  achievementPct: number | null;
  focusPct: number | null;
  stuckPct: number | null;
  participantsAssessed: number;
  noStuckTotal: number;
  blockersRaised: number;
  recurringBlockerGroups: number;
  openBlockers: number;
  validationErrors: number;
  validationWarnings: number;
}

/**
 * Flatten a composed report into the numbers the Monthly Report trends.
 *
 * Deliberately flat and additive-only: the Monthly view reads four of these
 * rows and charts them, without ever parsing the full report document.
 */
export function buildMetricsSnapshot(
  report: StoredWeeklyReport,
  validation: { counts: { errors: number; warnings: number } },
): WeeklyMetricsSnapshot {
  return {
    weekStart: report.weekStart,
    huddlesPlanned: report.executive.metrics.huddlesPlanned,
    huddlesConducted: report.executive.metrics.huddlesConducted,
    averageAttendancePct: report.executive.metrics.averageAttendancePct,
    startedOnTimePct: report.executive.metrics.startedOnTimePct,
    averageDurationMinutes: report.executive.metrics.averageDurationMinutes,
    achievementPct: report.heatMap.teamAverage.achievementPct,
    focusPct: report.heatMap.teamAverage.focusPct,
    stuckPct: report.heatMap.teamAverage.stuckPct,
    participantsAssessed: report.heatMap.rows.length,
    noStuckTotal: report.heatMap.rows.reduce((sum, r) => sum + r.noStuckDays, 0),
    blockersRaised: report.stucks.all.length,
    recurringBlockerGroups: report.stucks.recurring.length,
    openBlockers: report.stucks.all.filter((b) => b.status === "OPEN" || b.status === null).length,
    validationErrors: validation.counts.errors,
    validationWarnings: validation.counts.warnings,
  };
}

/**
 * The bounded qualitative digest a rollup reads (doc 17 §R2).
 *
 * `buildMetricsSnapshot` gives a rollup this week's numbers; this gives it the
 * recurrence keys and per-member rates that numbers cannot carry. With both, a
 * month reads four small artefacts instead of a month of raw fact rows — and a
 * quarter reads thirteen, at the same cost per artefact.
 *
 * Built from the STORED report, so the digest can never disagree with the
 * document a facilitator signed off.
 */
export function buildWeeklyFactSet(report: StoredWeeklyReport): MeetingFactSet {
  return buildFactSet({
    kind: "DH_WEEKLY",
    periodStart: report.weekStart,
    periodEnd: report.weekEnd,
    members: report.heatMap.rows.map((r) => ({
      // The member id where identity resolved, else the label as spoken. A
      // rollup can only aggregate what it can key, and an unresolved speaker
      // aggregating under their own name is better than being dropped.
      key: r.memberId ?? r.participant,
      name: r.participant,
      attended: r.daysAssessed,
      achievementPct: r.achievementPct,
      focusPct: r.focusPct,
      stuckPct: r.stuckPct,
      noStuckCount: r.noStuckDays,
    })),
    stucks: report.stucks.all.map((b) => ({
      // Recomputed here only because the stored report keeps the description
      // rather than the key. `digestStucks` groups on it, so two spellings of
      // one blocker must normalise identically — the same function the fact
      // layer uses is used here for exactly that reason.
      normalizedKey: normalizeKey(b.description),
      description: b.description,
      raisedBy: b.raisedBy,
      date: b.date,
      statusStated: b.status,
      topicKey: null,
    })),
  });
}
