/**
 * The trend engine — turning four weeks of stored metrics into a direction.
 *
 * WHERE COMPARISON IS ALLOWED, AND WHERE IT IS FORBIDDEN
 * ------------------------------------------------------
 * The requirement doc draws a hard line. The **DH Weekly Report** must use only
 * its own reporting week and must NOT display comparisons with previous weeks.
 * The **Monthly Report** is the place where W1 → W2 → W3 → W4 comparison is not
 * only permitted but the entire point.
 *
 * So this module exists solely for the monthly path. Nothing in the weekly
 * generator imports it, and nothing should: the weekly report's data is
 * physically scoped to one week (`getPeriodFacts` bounds `meetingDate` in SQL),
 * which is what makes that rule enforced rather than merely intended.
 *
 * THREE DATA POINTS MINIMUM
 * -------------------------
 * Two points are a comparison, not a trend. Calling "improving" off a single
 * week-on-week move would make the report swing on noise, and a facilitator
 * would learn to ignore it within a month. Below three weeks the answer is
 * `INSUFFICIENT_DATA` — stated, not hidden.
 *
 * NO MODEL IS INVOLVED. Every direction, delta and significance judgement here
 * is arithmetic over numbers the weekly reports already stored.
 */

/** Which way a metric moved across the period. */
export type TrendDirection =
  | "IMPROVING"
  | "DECLINING"
  | "STABLE"
  /** Moved materially, but not consistently in one direction. */
  | "VOLATILE"
  | "INSUFFICIENT_DATA";

/**
 * Whether higher is better.
 *
 * Attendance rising is good; recurring blockers rising is not. Without this the
 * engine would report "improving" for a team whose stuck count doubled.
 */
export type MetricPolarity = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";

export interface TrendPoint {
  /** Period label, e.g. "W1" or "2026-08-10". */
  label: string;
  value: number | null;
}

export interface TrendResult {
  metric: string;
  points: TrendPoint[];
  direction: TrendDirection;
  /** First to last. Null when either end is missing. */
  delta: number | null;
  /** Percentage change, when a proportional reading is meaningful. */
  deltaPct: number | null;
  first: number | null;
  last: number | null;
  min: number | null;
  max: number | null;
  mean: number | null;
  /** Periods that actually carried a value — the honest denominator. */
  observations: number;
  /** True when the move exceeds this metric's noise threshold. */
  significant: boolean;
  /** One factual sentence, for the report. Never a judgement about people. */
  summary: string;
}

/**
 * Noise thresholds.
 *
 * Percentages move a couple of points week to week for reasons nobody controls
 * — one person on leave changes a small team's attendance by 8pp. A threshold
 * below that would fill the report with movement that means nothing.
 */
export const DEFAULT_PCT_THRESHOLD = 5;
export const DEFAULT_COUNT_THRESHOLD = 1;

export interface TrendOptions {
  polarity?: MetricPolarity;
  /** Absolute move required before a change counts as real. */
  threshold?: number;
  /** Percentages get a percentage-point threshold and a "%" suffix. */
  isPercentage?: boolean;
  /** Human label for the summary sentence. */
  label?: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Are the observed values monotonic in one direction?
 *
 * Monotonic-with-ties, deliberately: a team that holds at 100% for two weeks
 * and then rises is improving, not volatile. Requiring strict monotonicity
 * would classify most real series as volatile and make the field useless.
 */
function monotonic(values: number[]): "UP" | "DOWN" | "FLAT" | "MIXED" {
  let up = false;
  let down = false;

  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) up = true;
    else if (values[i] < values[i - 1]) down = true;
  }

  if (up && down) return "MIXED";
  if (up) return "UP";
  if (down) return "DOWN";
  return "FLAT";
}

/**
 * Compute the trend for one metric across a period.
 *
 * Missing periods are carried as null and excluded from the maths rather than
 * treated as zero. A week with no huddles is not a week of 0% attendance, and
 * zero-filling would manufacture a collapse that never happened.
 */
export function computeTrend(
  metric: string,
  points: TrendPoint[],
  options: TrendOptions = {},
): TrendResult {
  const polarity = options.polarity ?? "HIGHER_IS_BETTER";
  const isPct = options.isPercentage ?? false;
  const threshold =
    options.threshold ?? (isPct ? DEFAULT_PCT_THRESHOLD : DEFAULT_COUNT_THRESHOLD);
  const label = options.label ?? metric;

  const observed = points.filter((p) => p.value !== null) as { label: string; value: number }[];
  const values = observed.map((p) => p.value);

  const base = {
    metric,
    points,
    observations: observed.length,
    first: values[0] ?? null,
    last: values.at(-1) ?? null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    mean: values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null,
  };

  // Two points are a comparison, not a trend.
  if (observed.length < 3) {
    return {
      ...base,
      direction: "INSUFFICIENT_DATA",
      delta: null,
      deltaPct: null,
      significant: false,
      summary:
        observed.length === 0
          ? `No data for ${label} in this period.`
          : `Only ${observed.length} of ${points.length} periods have data for ${label} — not enough to read a trend.`,
    };
  }

  const first = values[0];
  const last = values.at(-1) as number;
  const delta = round1(last - first);
  const deltaPct = first !== 0 ? round1(((last - first) / Math.abs(first)) * 100) : null;

  const significant = Math.abs(delta) >= threshold;
  const shape = monotonic(values);

  let direction: TrendDirection;
  if (!significant) {
    direction = "STABLE";
  } else if (shape === "MIXED") {
    // Moved materially but not consistently — worth reporting as instability
    // rather than as a direction the team can act on.
    direction = "VOLATILE";
  } else {
    const rose = delta > 0;
    const good = polarity === "HIGHER_IS_BETTER" ? rose : !rose;
    direction = good ? "IMPROVING" : "DECLINING";
  }

  return {
    ...base,
    direction,
    delta,
    deltaPct,
    significant,
    summary: summarise({ label, direction, delta, first, last, isPct, values }),
  };
}

/**
 * A factual sentence about the movement.
 *
 * Strictly descriptive — "attendance fell from 94% to 78%", never "the team
 * disengaged". The requirement doc forbids inferring attitude or motivation,
 * and a summary line is exactly where that would creep in.
 */
function summarise(input: {
  label: string;
  direction: TrendDirection;
  delta: number;
  first: number;
  last: number;
  isPct: boolean;
  values: number[];
}): string {
  const { label, direction, delta, first, last, isPct, values } = input;
  const unit = isPct ? "%" : "";
  const from = `${round1(first)}${unit}`;
  const to = `${round1(last)}${unit}`;

  switch (direction) {
    case "STABLE":
      return `${label} held steady around ${to}.`;
    case "VOLATILE":
      return `${label} moved between ${round1(Math.min(...values))}${unit} and ${round1(Math.max(...values))}${unit} without a consistent direction, ending at ${to}.`;
    case "IMPROVING":
    case "DECLINING": {
      const verb = delta > 0 ? "rose" : "fell";
      return `${label} ${verb} from ${from} to ${to}.`;
    }
    default:
      return `${label}: not enough data.`;
  }
}

/** One metric's definition for the monthly trend table. */
export interface TrendSpec {
  metric: string;
  label: string;
  polarity?: MetricPolarity;
  isPercentage?: boolean;
  threshold?: number;
  /** Pull the value out of a weekly metrics snapshot. */
  extract: (metrics: Record<string, unknown>) => number | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * The metrics the Monthly Report trends.
 *
 * Every one reads off `ClientDailyHuddleWeeklyReport.metrics` — the flat
 * snapshot P3 stores precisely so four weeks can be trended with four row reads
 * and no transcripts. That is the whole reason the monthly path costs ~5k
 * tokens instead of ~1.4M.
 */
export const DH_WEEKLY_TREND_SPECS: TrendSpec[] = [
  {
    metric: "averageAttendancePct",
    label: "Attendance",
    isPercentage: true,
    extract: (m) => num(m.averageAttendancePct),
  },
  {
    metric: "achievementAdherencePct",
    label: "Yesterday Achievement adherence",
    isPercentage: true,
    extract: (m) => num(m.achievementAdherencePct) ?? num(m.teamAchievementPct),
  },
  {
    metric: "focusAdherencePct",
    label: "Today Focus adherence",
    isPercentage: true,
    extract: (m) => num(m.focusAdherencePct) ?? num(m.teamFocusPct),
  },
  {
    metric: "stuckAdherencePct",
    label: "Stuck adherence",
    isPercentage: true,
    extract: (m) => num(m.stuckAdherencePct) ?? num(m.teamStuckPct),
  },
  {
    metric: "huddlesConducted",
    label: "Huddles conducted",
    extract: (m) => num(m.huddlesConducted),
  },
  {
    metric: "startedOnTimePct",
    label: "Started on time",
    isPercentage: true,
    extract: (m) => num(m.startedOnTimePct),
  },
  {
    metric: "averageDurationMinutes",
    label: "Average duration",
    // Neither direction is inherently better — a huddle can be too short as
    // easily as too long — so it is reported without a good/bad reading.
    polarity: "HIGHER_IS_BETTER",
    threshold: 5,
    extract: (m) => num(m.averageDurationMinutes),
  },
  {
    metric: "blockersRaised",
    label: "Blockers raised",
    // Deliberately NOT lower-is-better. Fewer blockers raised can mean fewer
    // problems OR that people stopped surfacing them — and the client doc
    // specifically wants excessive "No Stuck" treated as a concern, not a win.
    polarity: "HIGHER_IS_BETTER",
    extract: (m) => num(m.blockersRaised) ?? num(m.totalBlockers),
  },
  {
    metric: "recurringBlockers",
    label: "Recurring blockers",
    polarity: "LOWER_IS_BETTER",
    extract: (m) => num(m.recurringBlockers),
  },
];

export interface PeriodMetrics {
  label: string;
  metrics: Record<string, unknown> | null;
}

/**
 * Build the monthly trend table from the stored weekly snapshots.
 *
 * Reads nothing but the `metrics` blobs. No transcripts, no facts, no model.
 */
export function buildTrends(
  periods: PeriodMetrics[],
  specs: TrendSpec[] = DH_WEEKLY_TREND_SPECS,
): TrendResult[] {
  return specs.map((spec) =>
    computeTrend(
      spec.metric,
      periods.map((p) => ({
        label: p.label,
        value: p.metrics ? spec.extract(p.metrics) : null,
      })),
      {
        polarity: spec.polarity,
        isPercentage: spec.isPercentage,
        threshold: spec.threshold,
        label: spec.label,
      },
    ),
  );
}

/**
 * The trends worth putting in front of a reader, most material first.
 *
 * Declines outrank improvements at equal magnitude — a report that leads with
 * good news while attendance is collapsing is not doing its job.
 */
export function materialTrends(trends: TrendResult[], limit = 5): TrendResult[] {
  const weight = (t: TrendResult): number => {
    if (!t.significant) return 0;
    const magnitude = Math.abs(t.delta ?? 0);
    switch (t.direction) {
      case "DECLINING":
        return magnitude * 2;
      case "VOLATILE":
        return magnitude * 1.5;
      case "IMPROVING":
        return magnitude;
      default:
        return 0;
    }
  };

  return [...trends]
    .filter((t) => weight(t) > 0)
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, limit);
}
