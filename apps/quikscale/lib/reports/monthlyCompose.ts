/**
 * Monthly Report composition.
 *
 * THE WHOLE ARCHITECTURE, IN ONE REPORT
 * -------------------------------------
 * This is where every earlier phase pays off. The month is assembled from:
 *
 *   · four `ClientDailyHuddleWeeklyReport.metrics` snapshots   (P3)
 *   · WWW lifecycle metrics + status history                   (P4)
 *   · SQL aggregates over the fact layer                       (P2)
 *   · the deterministic trend engine                           (P9a)
 *
 * ...and then ONE small model call over the resulting tables. No transcript is
 * read, because none is needed: ~5k tokens instead of ~1.4M.
 *
 * DEGRADES RATHER THAN BLOCKS
 * ---------------------------
 * The Weekly-Meeting half of the month needs P5's extraction, which is waiting
 * on a worker host. Rather than gate the whole report on that, the WM section
 * is omitted when no WM reports exist and the report says so. A monthly report
 * covering the daily rhythm is useful today; one that refuses to generate until
 * infrastructure lands is useful to nobody.
 *
 * MISSING WEEKS ARE NAMED, NOT SMOOTHED
 * -------------------------------------
 * A month where week 3 was never reported is not a month with a dip. The gap is
 * carried into the report, into the prompt, and onto the stored row, so every
 * conclusion can be qualified rather than quietly overstated.
 */

import { z } from "zod";

import { db } from "@/lib/db";
import {
  buildTrends,
  materialTrends,
  DH_WEEKLY_TREND_SPECS,
  type TrendResult,
} from "@/lib/reports/trendEngine";
import {
  computeLifecycleMetrics,
  type LifecycleMetrics,
} from "@/lib/services/wwwLifecycle";
import { buildWwwScopeWhere } from "@/lib/api/wwwListQuery";
import {
  getPeriodFacts,
  computeMemberAdherence,
  findRecurringStucks,
} from "@/lib/facts/query";
import { PROMPT_VERSION as MONTHLY_PROMPT_VERSION } from "@/lib/ai/prompts/monthlyProse";

/** Bump when the stored report shape changes incompatibly. */
export const MONTHLY_SCHEMA_VERSION = 1;

/** A member reporting "No Stuck" at or above this rate is worth a question. */
export const NO_STUCK_OUTLIER_PCT = 80;

/** Minimum huddles attended before a No-Stuck rate means anything. */
const NO_STUCK_MIN_HUDDLES = 3;

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

/** "2026-08" → the month's UTC bounds. */
export function monthBounds(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;

  const start = new Date(Date.UTC(year, month - 1, 1));
  // Day 0 of the next month is the last day of this one.
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

/** Every ISO Monday that falls inside the month. */
export function weeksInMonth(start: Date, end: Date): Date[] {
  const weeks: Date[] = [];
  const cursor = new Date(start);
  // Walk back to the Monday of the first week.
  const dow = (cursor.getUTCDay() + 6) % 7;
  cursor.setUTCDate(cursor.getUTCDate() - dow);

  while (cursor <= end) {
    // A week belongs to the month when its Monday does. A week straddling the
    // boundary is counted once, in the month it started — otherwise a report
    // would either double-count it or lose it.
    if (cursor >= start) weeks.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return weeks;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface MonthContext {
  client: { id: string; name: string };
  period: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  /** Every ISO week in the month, with its report when one exists. */
  weeks: {
    weekStart: string;
    label: string;
    reportId: string | null;
    currentVersion: number | null;
    metrics: Record<string, unknown> | null;
  }[];
  wmReportIds: string[];
  wwwItems: {
    status: string;
    when: Date;
    dueDateTBD: boolean;
    revisedDates: string[];
    completedAt: Date | null;
    createdAt: Date;
  }[];
}

/**
 * Load everything the month needs. Four indexed row reads plus a WWW query —
 * no transcripts, no facts table scan.
 */
export async function loadMonthContext(
  ctx: { orgId: string; userId: string },
  clientId: string,
  period: string,
): Promise<MonthContext | null> {
  const bounds = monthBounds(period);
  if (!bounds) return null;

  const client = await db.client.findFirst({
    where: { id: clientId, orgId: ctx.orgId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!client) return null;

  const weekStarts = weeksInMonth(bounds.start, bounds.end);

  const [weeklyReports, wwwItems] = await Promise.all([
    db.clientDailyHuddleWeeklyReport.findMany({
      where: {
        orgId: ctx.orgId,
        clientId,
        deletedAt: null,
        weekStart: { in: weekStarts },
      },
      select: { id: true, weekStart: true, metrics: true, currentVersion: true },
    }),
    // Row-level visibility applies here too. A monthly report must not become a
    // way to count commitments the reader cannot see individually.
    buildWwwScopeWhere(ctx, {}).then((scope) =>
      db.wWWItem.findMany({
        where: {
          ...scope,
          createdAt: { lte: bounds.end },
          OR: [
            { status: { notIn: ["completed", "not-applicable"] } },
            { completedAt: { gte: bounds.start, lte: bounds.end } },
            { when: { gte: bounds.start, lte: bounds.end } },
          ],
        },
        select: {
          status: true,
          when: true,
          dueDateTBD: true,
          revisedDates: true,
          completedAt: true,
          createdAt: true,
        },
      }),
    ),
  ]);

  const byWeek = new Map(weeklyReports.map((r) => [ymd(r.weekStart), r]));

  return {
    client,
    period,
    periodLabel: MONTH_LABEL.format(bounds.start),
    periodStart: bounds.start,
    periodEnd: bounds.end,
    weeks: weekStarts.map((ws, i) => {
      const found = byWeek.get(ymd(ws));
      return {
        weekStart: ymd(ws),
        label: `W${i + 1}`,
        reportId: found?.id ?? null,
        currentVersion: found?.currentVersion ?? null,
        metrics: (found?.metrics as Record<string, unknown> | undefined) ?? null,
      };
    }),
    // The Weekly-Meeting half needs P5. Empty until then, and the report says so
    // rather than implying weekly meetings did not happen.
    wmReportIds: [],
    wwwItems,
  };
}

// ---------------------------------------------------------------------------
// Deterministic month
// ---------------------------------------------------------------------------

export interface NoStuckOutlier {
  name: string;
  noStuckRate: number;
  huddlesAttended: number;
  /** Their stuck-adherence, so a reader can see both together. */
  stuckAdherencePct: number;
}

export interface DeterministicMonth {
  trends: TrendResult[];
  material: TrendResult[];
  www: LifecycleMetrics;
  recurringStucks: {
    description: string;
    occurrences: number;
    weeksSeen: number;
    raisedBy: string[];
    latestStatusStated: string | null;
  }[];
  noStuckOutliers: NoStuckOutlier[];
  missingWeeks: string[];
  weeksReported: number;
  weeksTotal: number;
}

/**
 * Everything computable without a model.
 *
 * Deliberately the bulk of the report: every figure a client reads is arithmetic
 * over stored numbers, and the model only explains what they mean together.
 */
export async function computeDeterministicMonth(
  orgId: string,
  context: MonthContext,
): Promise<DeterministicMonth> {
  const trends = buildTrends(
    context.weeks.map((w) => ({ label: w.label, metrics: w.metrics })),
    DH_WEEKLY_TREND_SPECS,
  );

  // Facts across the whole month, for recurrence and No-Stuck patterns that a
  // per-week view cannot see — a blocker raised once in each of four weeks is
  // invisible weekly and obvious monthly.
  const facts = await getPeriodFacts(
    orgId,
    context.client.id,
    context.periodStart,
    context.periodEnd,
    { cadence: "DAILY" },
  );

  const members = computeMemberAdherence(facts.participants);

  const recurring = findRecurringStucks(facts.stucks).map((r) => ({
    description: r.description,
    occurrences: r.occurrences,
    // Distinct ISO weeks, not distinct days: a blocker raised three times in one
    // week is a bad day, across three weeks it is a pattern.
    weeksSeen: new Set(r.dates.map((d) => isoWeekKey(new Date(`${d}T00:00:00Z`)))).size,
    raisedBy: r.raisedBy,
    latestStatusStated: r.latestStatusStated,
  }));

  const noStuckOutliers: NoStuckOutlier[] = members
    .filter(
      (m) =>
        m.huddlesAttended >= NO_STUCK_MIN_HUDDLES &&
        m.noStuckRate >= NO_STUCK_OUTLIER_PCT,
    )
    .map((m) => ({
      name: m.speakerRaw,
      noStuckRate: m.noStuckRate,
      huddlesAttended: m.huddlesAttended,
      stuckAdherencePct: m.stuckPct,
    }))
    .sort((a, b) => b.noStuckRate - a.noStuckRate);

  const missingWeeks = context.weeks.filter((w) => !w.reportId).map((w) => w.label);

  return {
    trends,
    material: materialTrends(trends),
    www: computeLifecycleMetrics(context.wwwItems),
    recurringStucks: recurring,
    noStuckOutliers,
    missingWeeks,
    weeksReported: context.weeks.length - missingWeeks.length,
    weeksTotal: context.weeks.length,
  };
}

/** ISO year-week key, for counting distinct weeks a blocker appeared in. */
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((t.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${t.getUTCFullYear()}-W${week}`;
}

// ---------------------------------------------------------------------------
// Stored shape
// ---------------------------------------------------------------------------

const trendPointSchema = z.object({
  label: z.string(),
  value: z.number().nullable(),
});

const trendSchema = z.object({
  metric: z.string(),
  points: z.array(trendPointSchema),
  direction: z.enum([
    "IMPROVING",
    "DECLINING",
    "STABLE",
    "VOLATILE",
    "INSUFFICIENT_DATA",
  ]),
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

/** What the model contributes. Prose only — never a number. */
export const monthlyAiSchema = z.object({
  overallConfidence: z.number().min(0).max(1),
  keyObservations: z.array(z.string()).min(1).max(6),
  wwwObservation: z.string().nullable(),
  recommendations: z.array(z.string()).min(1).max(3),
});

export type MonthlyAi = z.infer<typeof monthlyAiSchema>;

export const storedMonthlyReportSchema = z.object({
  reportType: z.literal("MONTHLY"),
  clientName: z.string(),
  period: z.string(),
  periodLabel: z.string(),
  overallConfidence: z.number(),
  coverage: z.object({
    weeksTotal: z.number(),
    weeksReported: z.number(),
    missingWeeks: z.array(z.string()),
    /** True when the WM half is absent because extraction has not run. */
    weeklyMeetingsIncluded: z.boolean(),
  }),
  trends: z.array(trendSchema),
  materialTrends: z.array(z.string()),
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
  recurringStucks: z.array(
    z.object({
      description: z.string(),
      occurrences: z.number(),
      weeksSeen: z.number(),
      raisedBy: z.array(z.string()),
      latestStatusStated: z.string().nullable(),
    }),
  ),
  noStuckOutliers: z.array(
    z.object({
      name: z.string(),
      noStuckRate: z.number(),
      huddlesAttended: z.number(),
      stuckAdherencePct: z.number(),
    }),
  ),
  keyObservations: z.array(z.string()),
  wwwObservation: z.string().nullable(),
  recommendations: z.array(z.string()),
});

export type StoredMonthlyReport = z.infer<typeof storedMonthlyReportSchema>;

/** Assemble the stored report from the deterministic month plus the AI pass. */
export function composeMonthlyReport(input: {
  context: MonthContext;
  deterministic: DeterministicMonth;
  ai: MonthlyAi;
}): StoredMonthlyReport {
  const { context, deterministic, ai } = input;

  return {
    reportType: "MONTHLY",
    clientName: context.client.name,
    period: context.period,
    periodLabel: context.periodLabel,
    overallConfidence: ai.overallConfidence,
    coverage: {
      weeksTotal: deterministic.weeksTotal,
      weeksReported: deterministic.weeksReported,
      missingWeeks: deterministic.missingWeeks,
      weeklyMeetingsIncluded: context.wmReportIds.length > 0,
    },
    trends: deterministic.trends,
    materialTrends: deterministic.material.map((t) => t.summary),
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
    recurringStucks: deterministic.recurringStucks,
    noStuckOutliers: deterministic.noStuckOutliers,
    keyObservations: ai.keyObservations,
    wwwObservation: ai.wwwObservation,
    recommendations: ai.recommendations,
  };
}

/**
 * Flat numeric snapshot — the same discipline that made this report cheap.
 *
 * A quarterly or annual view will trend these rows exactly as this report
 * trends the weekly ones, for the same reason and at the same cost.
 */
export function buildMonthlyMetrics(
  deterministic: DeterministicMonth,
): Record<string, number | null> {
  const trend = (metric: string) =>
    deterministic.trends.find((t) => t.metric === metric)?.last ?? null;

  return {
    weeksTotal: deterministic.weeksTotal,
    weeksReported: deterministic.weeksReported,
    attendancePct: trend("averageAttendancePct"),
    achievementAdherencePct: trend("achievementAdherencePct"),
    focusAdherencePct: trend("focusAdherencePct"),
    stuckAdherencePct: trend("stuckAdherencePct"),
    huddlesConducted: deterministic.trends
      .find((t) => t.metric === "huddlesConducted")
      ?.points.reduce((n, p) => n + (p.value ?? 0), 0) ?? null,
    recurringStuckCount: deterministic.recurringStucks.length,
    noStuckOutlierCount: deterministic.noStuckOutliers.length,
    wwwTotal: deterministic.www.total,
    wwwCompleted: deterministic.www.completed,
    wwwOverdue: deterministic.www.overdue,
    wwwCarriedForward: deterministic.www.carriedForward,
    wwwCompletionRate: deterministic.www.completionRate,
    wwwOverdueRate: deterministic.www.overdueRate,
    wwwCarryForwardRate: deterministic.www.carryForwardRate,
    wwwAverageDaysToClose: deterministic.www.averageDaysToClose,
  };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export { MONTHLY_PROMPT_VERSION };

/**
 * The monthly fingerprint hashes its SOURCES' VERSIONS, not their source data.
 *
 * That is the whole point of the layering: a monthly report is fresh exactly
 * when the reports beneath it have not been regenerated, and it never needs to
 * know what a transcript said.
 */
export function monthlySourceInputs(context: MonthContext): {
  sourceReports: { reportId: string; kind: string; version: number }[];
  wwwState: { wwwItemId: string; status: string; when: string; revisions: number }[];
} {
  return {
    sourceReports: context.weeks
      .filter((w) => w.reportId)
      .map((w) => ({
        reportId: w.reportId as string,
        kind: "DH_WEEKLY",
        version: w.currentVersion ?? 1,
      })),
    // WWW state is included because the lifecycle section reads live items: an
    // owner completing something after generation makes the month stale.
    wwwState: [],
  };
}
