/**
 * The cross-meeting Week Rollup (doc 17 §R3).
 *
 * THREE THINGS SOUND ALIKE; THIS IS THE THIRD
 * -------------------------------------------
 *   DH Weekly Report  — the week's DAILY HUDDLES, rolled up
 *   WM Report         — ONE weekly meeting occurrence
 *   Week Rollup       — EVERYTHING that happened this week, across both
 *
 * It answers "what happened this week", which neither of the other two does.
 * A blocker raised in Tuesday's huddle and again in Thursday's weekly meeting
 * is one recurring problem seen from two rhythms — and it is invisible in both
 * of the existing reports, because each only sees its own.
 *
 * WHY IT IS CHEAP
 * ---------------
 * It reads `metrics` and `factSet` off the reports beneath it. No transcript,
 * no fact table, one small model call over finished tables. Its cost scales
 * with the number of source REPORTS, not with the number of facts — the same
 * property that lets the monthly report exist, which is why a quarterly view
 * over these rows will work the same way.
 */

import { z } from "zod";

import {
  buildTrends,
  materialTrends,
  type TrendResult,
  type TrendSpec,
} from "@/lib/reports/trendEngine";
import {
  computeLifecycleMetrics,
  type LifecycleMetrics,
} from "@/lib/services/wwwLifecycle";
import { PROMPT_VERSION as WEEK_ROLLUP_PROMPT_VERSION } from "@/lib/ai/prompts/weekRollupProse";

import { aggregateFactSets, type MeetingFactSet } from "./factSet";

/** Bump when the stored report shape changes incompatibly. */
export const WEEK_ROLLUP_SCHEMA_VERSION = 1;

/**
 * How many weeks of history the week-over-week comparison looks back over.
 *
 * Four, including this one. Enough to tell a trend from a bad week; short
 * enough that a change three weeks ago is still recent enough to act on.
 */
export const TRAILING_WEEKS = 4;

/** A blocker recurring in this many of the week's meetings is cross-rhythm. */
export const CROSS_RHYTHM_THRESHOLD = 2;

export { WEEK_ROLLUP_PROMPT_VERSION };

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

/** "2026-08-03" → that ISO week's UTC bounds, Monday to Sunday. */
export function weekBounds(weekStart: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return null;
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;

  // Normalise to the Monday, so a caller passing a Wednesday still gets the
  // week they meant rather than a seven-day window starting mid-week.
  const dow = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - dow);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const WEEK_LABEL = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

export function weekLabel(start: Date, end: Date): string {
  return `${WEEK_LABEL.format(start)} – ${WEEK_LABEL.format(end)}`;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** One source report feeding the rollup. */
export interface RollupSource {
  id: string;
  kind: "DH_WEEKLY" | "WM";
  label: string;
  date: string;
  metrics: Record<string, unknown> | null;
  factSet: MeetingFactSet | null;
  currentVersion: number;
}

export interface WeekRollupContext {
  client: { id: string; name: string };
  weekStart: Date;
  weekEnd: Date;
  label: string;
  /** This week's reports — the rollup's actual subject. */
  sources: RollupSource[];
  /**
   * The trailing weeks' DH metrics, oldest first, for week-over-week movement.
   *
   * Read from the weekly reports that already exist rather than from previous
   * rollups: a rollup must not depend on itself having been generated before,
   * or the first one for a client would have no history at all.
   */
  history: Array<{ label: string; metrics: Record<string, unknown> | null }>;
  wwwItems: Array<{
    status: string;
    when: Date;
    dueDateTBD: boolean;
    revisedDates: string[];
    completedAt: Date | null;
    createdAt: Date;
  }>;
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * What the week rollup trends across the trailing weeks.
 *
 * Reads the same `ClientDailyHuddleWeeklyReport.metrics` snapshots the monthly
 * report reads. Nothing new is computed and no new source is introduced — the
 * rollup shows where this week sits, it does not re-derive the weeks.
 */
export const WEEK_ROLLUP_TREND_SPECS: TrendSpec[] = [
  {
    metric: "averageAttendancePct",
    label: "Daily huddle attendance",
    isPercentage: true,
    extract: (m) => num(m.averageAttendancePct),
  },
  {
    metric: "startedOnTimePct",
    label: "Started on time",
    isPercentage: true,
    extract: (m) => num(m.startedOnTimePct),
  },
  {
    metric: "achievementAdherencePct",
    label: "Achievement adherence",
    isPercentage: true,
    extract: (m) => num(m.achievementAdherencePct) ?? num(m.achievementPct),
  },
  {
    metric: "stuckAdherencePct",
    label: "Stuck adherence",
    isPercentage: true,
    extract: (m) => num(m.stuckAdherencePct) ?? num(m.stuckPct),
  },
  {
    metric: "blockersRaised",
    label: "Blockers raised",
    polarity: "LOWER_IS_BETTER",
    extract: (m) => num(m.blockersRaised),
  },
];

// ---------------------------------------------------------------------------
// Deterministic half
// ---------------------------------------------------------------------------

export interface CrossMeetingBlocker {
  description: string;
  occurrences: number;
  /** How many of the week's MEETINGS raised it. 2+ means it crossed rhythms. */
  meetingsSeen: number;
  raisedBy: string[];
  latestStatusStated: string | null;
  /** True when it appeared in both the daily rhythm and the weekly meeting. */
  crossRhythm: boolean;
}

export interface DeterministicWeekRollup {
  trends: TrendResult[];
  material: TrendResult[];
  blockers: CrossMeetingBlocker[];
  www: LifecycleMetrics;
  /** Present sources, by kind, for the coverage line. */
  sourcesPresent: { dhWeekly: boolean; weeklyMeetings: number };
  missingSources: string[];
  topics: string[];
  /** True when every source digest held everything it had. */
  complete: boolean;
  omittedNotes: string[];
}

/**
 * Compute the week. Pure: context in, tables out.
 *
 * No database and no model, so the arithmetic is testable on its own — the same
 * discipline every other composer in this system follows.
 */
export function computeDeterministicWeekRollup(
  context: WeekRollupContext,
): DeterministicWeekRollup {
  const trends = buildTrends(context.history, WEEK_ROLLUP_TREND_SPECS);

  const digests = context.sources
    .map((s) => s.factSet)
    .filter((f): f is MeetingFactSet => f !== null);
  const aggregated = aggregateFactSets(digests);

  // Which SOURCE each blocker came from, so "crossed both rhythms" is a fact
  // rather than an inference from a count. Two huddle mentions in one week is a
  // repeated blocker; a huddle mention and a weekly-meeting mention is the
  // cross-rhythm signal neither existing report can see.
  const kindsByKey = new Map<string, Set<string>>();
  for (const source of context.sources) {
    if (!source.factSet) continue;
    for (const s of source.factSet.stucks) {
      const set = kindsByKey.get(s.normalizedKey) ?? new Set<string>();
      set.add(source.kind);
      kindsByKey.set(s.normalizedKey, set);
    }
  }

  const blockers: CrossMeetingBlocker[] = aggregated.stucks.map((s) => {
    const kinds = kindsByKey.get(s.normalizedKey) ?? new Set<string>();
    return {
      description: s.description,
      occurrences: s.occurrences,
      meetingsSeen: s.periodsSeen,
      raisedBy: s.raisedBy,
      latestStatusStated: s.latestStatusStated,
      crossRhythm: kinds.size >= CROSS_RHYTHM_THRESHOLD,
    };
  });

  const dhWeekly = context.sources.some((s) => s.kind === "DH_WEEKLY");
  const weeklyMeetings = context.sources.filter((s) => s.kind === "WM").length;

  return {
    trends,
    material: materialTrends(trends),
    blockers,
    www: computeLifecycleMetrics(context.wwwItems),
    sourcesPresent: { dhWeekly, weeklyMeetings },
    missingSources: missingSourceLabels(context),
    topics: aggregated.topics,
    complete: aggregated.complete,
    omittedNotes: aggregated.omitted.map((o) => o.reason),
  };
}

/**
 * What the week expected and did not get.
 *
 * A rollup with no daily-huddle report is not a week with no huddles — it is a
 * week whose huddles were never reported on. Naming the difference is the only
 * way a reader can tell, and quietly rendering an empty section would say the
 * opposite of what happened.
 */
function missingSourceLabels(context: WeekRollupContext): string[] {
  const missing: string[] = [];
  if (!context.sources.some((s) => s.kind === "DH_WEEKLY")) {
    missing.push("No daily-huddle report was generated for this week.");
  }
  if (!context.sources.some((s) => s.kind === "WM")) {
    missing.push("No weekly-meeting report was generated for this week.");
  }
  return missing;
}

// ---------------------------------------------------------------------------
// The AI half — prose only
// ---------------------------------------------------------------------------

export const weekRollupAiSchema = z.object({
  overallConfidence: z.number().min(0).max(1),
  weekSummary: z.string().min(1).max(1200),
  keyObservations: z.array(z.string().max(400)).min(1).max(5),
  blockerObservation: z.string().max(400).nullable(),
  wwwObservation: z.string().max(400).nullable(),
  recommendations: z.array(z.string().max(400)).min(1).max(3),
});

export type WeekRollupAi = z.infer<typeof weekRollupAiSchema>;

// ---------------------------------------------------------------------------
// The stored report
// ---------------------------------------------------------------------------

/**
 * Mirrors `TrendResult` exactly, including the per-period points.
 *
 * The points are stored, not just the summary: a reader who wants to see the
 * shape of the last four weeks should not have to open four reports, and a
 * later quarterly view can plot them without recomputing anything.
 */
const trendSchema = z.object({
  metric: z.string(),
  points: z.array(z.object({ label: z.string(), value: z.number().nullable() })),
  direction: z.string(),
  delta: z.number().nullable(),
  deltaPct: z.number().nullable(),
  first: z.number().nullable(),
  last: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  mean: z.number().nullable(),
  observations: z.number(),
  significant: z.boolean(),
  summary: z.string(),
});

export const storedWeekRollupReportSchema = z.object({
  reportType: z.literal("WEEK_ROLLUP"),
  clientName: z.string(),
  weekStart: z.string(),
  weekEnd: z.string(),
  label: z.string(),
  overallConfidence: z.number(),

  coverage: z.object({
    dhWeekly: z.boolean(),
    weeklyMeetings: z.number(),
    missingSources: z.array(z.string()),
    /** True when every source digest held everything it had. */
    complete: z.boolean(),
    notes: z.array(z.string()),
  }),

  sources: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      label: z.string(),
      date: z.string(),
    }),
  ),

  trends: z.array(trendSchema),
  materialTrends: z.array(z.string()),

  blockers: z.array(
    z.object({
      description: z.string(),
      occurrences: z.number(),
      meetingsSeen: z.number(),
      raisedBy: z.array(z.string()),
      latestStatusStated: z.string().nullable(),
      crossRhythm: z.boolean(),
    }),
  ),

  www: z.object({
    total: z.number(),
    completed: z.number(),
    overdue: z.number(),
    carriedForward: z.number(),
    cancelled: z.number(),
    completionRate: z.number().nullable(),
    overdueRate: z.number().nullable(),
    carryForwardRate: z.number().nullable(),
    averageDaysToClose: z.number().nullable(),
  }),

  topics: z.array(z.string()),
  weekSummary: z.string(),
  keyObservations: z.array(z.string()),
  blockerObservation: z.string().nullable(),
  wwwObservation: z.string().nullable(),
  recommendations: z.array(z.string()),
});

export type StoredWeekRollupReport = z.infer<typeof storedWeekRollupReportSchema>;

/** Assemble the stored report from the deterministic tables plus the AI pass. */
export function composeWeekRollupReport(input: {
  context: WeekRollupContext;
  deterministic: DeterministicWeekRollup;
  ai: WeekRollupAi;
}): StoredWeekRollupReport {
  const { context, deterministic, ai } = input;

  return {
    reportType: "WEEK_ROLLUP",
    clientName: context.client.name,
    weekStart: ymd(context.weekStart),
    weekEnd: ymd(context.weekEnd),
    label: context.label,
    overallConfidence: ai.overallConfidence,

    coverage: {
      dhWeekly: deterministic.sourcesPresent.dhWeekly,
      weeklyMeetings: deterministic.sourcesPresent.weeklyMeetings,
      missingSources: deterministic.missingSources,
      complete: deterministic.complete,
      notes: deterministic.omittedNotes,
    },

    sources: context.sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      date: s.date,
    })),

    trends: deterministic.trends,
    materialTrends: deterministic.material.map((t) => t.summary),
    blockers: deterministic.blockers,

    www: {
      total: deterministic.www.total,
      completed: deterministic.www.completed,
      overdue: deterministic.www.overdue,
      carriedForward: deterministic.www.carriedForward,
      cancelled: deterministic.www.cancelled,
      completionRate: deterministic.www.completionRate,
      overdueRate: deterministic.www.overdueRate,
      carryForwardRate: deterministic.www.carryForwardRate,
      averageDaysToClose: deterministic.www.averageDaysToClose,
    },

    topics: deterministic.topics,
    weekSummary: ai.weekSummary,
    keyObservations: ai.keyObservations,
    blockerObservation: ai.blockerObservation,
    wwwObservation: ai.wwwObservation,
    recommendations: ai.recommendations,
  };
}

/**
 * Flat numeric snapshot, so a quarter can trend weeks the way the month trends
 * them — the same discipline, one level up.
 */
export function buildWeekRollupMetrics(
  deterministic: DeterministicWeekRollup,
): Record<string, number | null> {
  const trend = (metric: string) =>
    deterministic.trends.find((t) => t.metric === metric)?.last ?? null;

  return {
    attendancePct: trend("averageAttendancePct"),
    startedOnTimePct: trend("startedOnTimePct"),
    achievementAdherencePct: trend("achievementAdherencePct"),
    stuckAdherencePct: trend("stuckAdherencePct"),
    blockersRaised: trend("blockersRaised"),
    blockerGroups: deterministic.blockers.length,
    crossRhythmBlockers: deterministic.blockers.filter((b) => b.crossRhythm).length,
    weeklyMeetingsReported: deterministic.sourcesPresent.weeklyMeetings,
    wwwTotal: deterministic.www.total,
    wwwCompleted: deterministic.www.completed,
    wwwOverdue: deterministic.www.overdue,
    wwwCompletionRate: deterministic.www.completionRate,
  };
}
