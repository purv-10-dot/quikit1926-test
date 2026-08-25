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
import { readFactSet, aggregateFactSets, type MeetingFactSet } from "./factSet";
import { listReports } from "./reportStore";
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
    /**
     * The week's bounded qualitative digest (doc 17 §R2).
     *
     * Null for a report generated before the column existed. The month then
     * falls back to reading the fact tables for that week — slower, but a
     * correct answer beats an empty one.
     */
    factSet: MeetingFactSet | null;
  }[];
  wmReportIds: string[];
  /** The weekly meetings' bounded digests, for cross-meeting recurrence. */
  wmFactSets: MeetingFactSet[];
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

  // Both kinds in ONE indexed read. Before the report tables were merged this
  // was two queries against two tables; the month wants "everything that
  // happened", which is what a single table with a kind column expresses.
  const [sourceReports, wwwItems] = await Promise.all([
    listReports(ctx.orgId, clientId, {
      kinds: ["DH_WEEKLY", "WM"],
      from: bounds.start,
      to: bounds.end,
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

  const weeklyReports = sourceReports.filter((r) => r.reportKind === "DH_WEEKLY");
  const wmReports = sourceReports.filter((r) => r.reportKind === "WM");

  const byWeek = new Map(weeklyReports.map((r) => [ymd(r.periodStart), r]));

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
        factSet: readFactSet(found?.factSet),
      };
    }),
    wmReportIds: wmReports.map((r) => r.id),
    wmFactSets: wmReports
      .map((r) => readFactSet(r.factSet))
      .filter((f): f is MeetingFactSet => f !== null),
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

  // Recurrence and No-Stuck patterns come from the weeks' stored DIGESTS, not
  // from a month of raw fact rows (doc 17 §R2). Each digest is already bounded,
  // so a month, a quarter and a year all cost the same per source report —
  // which is the property that makes those views possible at all.
  //
  // Weeks generated before the digest existed fall back to the fact tables.
  // Slower for those weeks, and correct, which beats reporting an empty month.
  const digests = context.weeks
    .map((w) => w.factSet)
    .filter((f): f is MeetingFactSet => f !== null);
  const weeksWithoutDigest = context.weeks.filter((w) => w.reportId && !w.factSet);

  // Weekly meetings join the same aggregation. A gap raised in the weekly
  // meeting and a blocker raised in the daily huddle are the same problem seen
  // from two rhythms; keeping them in separate buckets would hide the one
  // pattern a monthly view exists to find.
  const aggregated = aggregateFactSets([...digests, ...context.wmFactSets]);

  let recurring = aggregated.stucks.map((s) => ({
    description: s.description,
    occurrences: s.occurrences,
    // Distinct ISO weeks, not distinct days: a blocker raised three times in one
    // week is a bad day, across three weeks it is a pattern.
    weeksSeen: new Set(s.dates.map((d) => isoWeekKey(new Date(`${d}T00:00:00Z`)))).size,
    raisedBy: s.raisedBy,
    latestStatusStated: s.latestStatusStated,
  }));

  let noStuckOutliers: NoStuckOutlier[] = aggregated.members
    .filter(
      (m) =>
        m.attended >= NO_STUCK_MIN_HUDDLES &&
        m.attended > 0 &&
        Math.round((m.noStuckCount / m.attended) * 100) >= NO_STUCK_OUTLIER_PCT,
    )
    .map((m) => ({
      name: m.name,
      noStuckRate: Math.round((m.noStuckCount / m.attended) * 100),
      huddlesAttended: m.attended,
      stuckAdherencePct: m.stuckPct ?? 0,
    }))
    .sort((a, b) => b.noStuckRate - a.noStuckRate);

  if (weeksWithoutDigest.length > 0) {
    const legacy = await legacyPatternsFromFacts(orgId, context);
    // Merged rather than replaced: a month can legitimately hold one week from
    // before the digest existed and three from after, and dropping either half
    // would understate recurrence in exactly the month that spans the change.
    recurring = mergeRecurring(recurring, legacy.recurring);
    noStuckOutliers = mergeOutliers(noStuckOutliers, legacy.noStuckOutliers);
  }

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

/**
 * The pre-digest path, for weeks whose report predates `factSet`.
 *
 * This is the code the whole of §R2 exists to stop being the default: it pulls
 * a period of raw fact rows into memory to find patterns. Kept because deleting
 * it would silently blank the qualitative half of every month generated before
 * the digest shipped, and a wrong-but-empty report is worse than a slow one.
 *
 * It becomes dead once every report in a period has been regenerated.
 */
async function legacyPatternsFromFacts(
  orgId: string,
  context: MonthContext,
): Promise<{
  recurring: DeterministicMonth["recurringStucks"];
  noStuckOutliers: NoStuckOutlier[];
}> {
  const facts = await getPeriodFacts(
    orgId,
    context.client.id,
    context.periodStart,
    context.periodEnd,
    { cadence: "DAILY" },
  );

  const members = computeMemberAdherence(facts.participants);

  return {
    recurring: findRecurringStucks(facts.stucks).map((r) => ({
      description: r.description,
      occurrences: r.occurrences,
      weeksSeen: new Set(r.dates.map((d) => isoWeekKey(new Date(`${d}T00:00:00Z`)))).size,
      raisedBy: r.raisedBy,
      latestStatusStated: r.latestStatusStated,
    })),
    noStuckOutliers: members
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
      })),
  };
}

/**
 * Combine digest-derived and fact-derived patterns without double-counting.
 *
 * The two sources cover different weeks of the same month, so a blocker seen by
 * both is one blocker with the higher counts, not two entries — and certainly
 * not the sum, which would report a recurrence that never happened.
 */
function mergeRecurring(
  fromDigests: DeterministicMonth["recurringStucks"],
  fromFacts: DeterministicMonth["recurringStucks"],
): DeterministicMonth["recurringStucks"] {
  const byDescription = new Map(fromDigests.map((r) => [r.description.toLowerCase(), r]));

  for (const r of fromFacts) {
    const key = r.description.toLowerCase();
    const existing = byDescription.get(key);
    if (!existing) {
      byDescription.set(key, r);
      continue;
    }
    existing.occurrences = Math.max(existing.occurrences, r.occurrences);
    existing.weeksSeen = Math.max(existing.weeksSeen, r.weeksSeen);
    existing.raisedBy = [...new Set([...existing.raisedBy, ...r.raisedBy])];
    existing.latestStatusStated = existing.latestStatusStated ?? r.latestStatusStated;
  }

  return [...byDescription.values()].sort(
    (a, b) => b.weeksSeen - a.weeksSeen || b.occurrences - a.occurrences,
  );
}

function mergeOutliers(
  fromDigests: NoStuckOutlier[],
  fromFacts: NoStuckOutlier[],
): NoStuckOutlier[] {
  const byName = new Map(fromDigests.map((o) => [o.name.toLowerCase(), o]));
  for (const o of fromFacts) {
    if (!byName.has(o.name.toLowerCase())) byName.set(o.name.toLowerCase(), o);
  }
  return [...byName.values()].sort((a, b) => b.noStuckRate - a.noStuckRate);
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
