/**
 * The Monthly Report's analysis prompt (Level 2, doc 17 §F.2).
 *
 * ONE CALL. NO TRANSCRIPTS. EVER.
 * -------------------------------
 * A month is roughly 20 daily huddles and 4 weekly meetings. Sending those
 * transcripts would be ~1.4M tokens. This prompt receives a trend table, a WWW
 * lifecycle summary and a handful of recurrence counts — about 5k tokens, a
 * ~99.6% saving, and the single largest lever in the architecture (doc 17 §G
 * lever 12).
 *
 * That is only possible because the weekly reports stored flat `metrics`
 * snapshots and the fact layer is queryable. The monthly path never re-reads a
 * transcript because it never needs to.
 *
 * A test asserts the built prompt contains no transcript text. If someone ever
 * "helpfully" adds raw quotes here, the cost of a monthly report rises by three
 * orders of magnitude with no visible symptom until the bill arrives.
 *
 * WHAT THE MODEL IS FOR
 * ---------------------
 * Every number in this prompt is already computed. The model's job is to say
 * which of them matter together — the cross-metric patterns a table cannot show
 * — and to propose actions. It must never recompute, re-derive, or restate the
 * table it was given.
 */

import type { TrendResult } from "@/lib/reports/trendEngine";

/**
 * Bump on any change that alters what the model produces. Part of the monthly
 * report's cache key, so a bump marks affected reports stale.
 */
export const PROMPT_VERSION = "monthly-prose@1.0.0";

/**
 * How many of each list reach the prompt.
 *
 * Bounded on purpose — a month can recur thirty blockers and the model does not
 * read them better for seeing all thirty. What changed (doc 17 §R1) is that the
 * cap now ANNOUNCES itself: a section trimmed in silence reads as the complete
 * picture, which is how a truncation becomes a false statement.
 */
const RECURRING_LIMIT = 15;
const NO_STUCK_LIMIT = 10;

/**
 * Cap a list of secondary detail, and say when it was capped.
 *
 * "…and 7 more" costs four tokens and keeps the line true.
 */
function withMore(items: string[], limit: number): string[] {
  if (items.length <= limit) return items;
  return [...items.slice(0, limit), `…and ${items.length - limit} more`];
}

export interface MonthlyPromptInput {
  clientName: string;
  /** "August 2026" */
  periodLabel: string;
  /** Week labels in order, e.g. ["W1 (4 Aug)", "W2 (11 Aug)", …]. */
  weekLabels: string[];
  trends: TrendResult[];
  /** Recurring blockers across the month, already grouped and counted. */
  recurringStucks: {
    description: string;
    occurrences: number;
    weeksSeen: number;
    raisedBy: string[];
    latestStatusStated: string | null;
  }[];
  /** WWW lifecycle for the month, already computed deterministically. */
  www: {
    total: number;
    completed: number;
    overdue: number;
    carriedForward: number;
    cancelled: number;
    completionRate: number | null;
    overdueRate: number | null;
    carryForwardRate: number | null;
    averageDaysToClose: number | null;
  } | null;
  /** Members whose "No Stuck" rate stands out, with their adherence alongside. */
  noStuckOutliers: { name: string; noStuckRate: number; huddlesAttended: number }[];
  /** Weeks with no report, so the model can qualify rather than assume. */
  missingWeeks: string[];
}

const RULES = `
You write the qualitative analysis for a monthly meeting-rhythm report.

ABSOLUTE RULES
1. Every number below is ALREADY COMPUTED. Never recalculate, re-derive or
   restate a figure. Refer to a number only to explain what it means.
2. Never invent a number that is not in the data given to you.
3. Never infer attitude, motivation, ownership, competence or intent. Describe
   what the data shows, not what people are like.
4. Do not name an individual unless the data below names them. Where it does,
   use the name only when it makes an observation actionable.
5. If the data is thin or a week is missing, say so plainly instead of writing
   around it. An honest gap is worth more than a confident guess.
6. Look for patterns ACROSS metrics — connections a single trend line cannot
   show. That is the only thing here a table cannot already do.
7. Be concise. Three to five observations, not an essay. A facilitator reads
   this in two minutes.

WHAT MAKES AN OBSERVATION WORTH WRITING
  · a trend that changes what someone should do next week
  · two metrics moving together in a way that suggests one cause
  · a recurring blocker that has outlived several weeks
  · a gap between adherence and quality (people are answering, but vaguely)
  · a commitment pattern — items completed, carried forward, or quietly dropped

WHAT IS NOT WORTH WRITING
  · restating the trend table in sentences
  · "attendance was 92%" with no interpretation
  · generic meeting advice that would apply to any team
`.trim();

function renderTrends(trends: TrendResult[]): string {
  if (trends.length === 0) return "TRENDS\n  (no trend data for this period)";

  const lines = trends.map((t) => {
    const series = t.points
      .map((p) => `${p.label}: ${p.value === null ? "—" : p.value}`)
      .join("  ");
    const move =
      t.direction === "INSUFFICIENT_DATA"
        ? "insufficient data"
        : `${t.direction.toLowerCase()}${t.delta !== null ? ` (${t.delta > 0 ? "+" : ""}${t.delta})` : ""}`;
    return `  ${t.metric}: ${move}\n    ${series}`;
  });

  return `TRENDS ACROSS THE PERIOD\n${lines.join("\n")}`;
}

function renderRecurring(input: MonthlyPromptInput): string {
  if (input.recurringStucks.length === 0) {
    return "RECURRING BLOCKERS\n  (none recurred across the period)";
  }
  // Already ranked by recurrence upstream, so the cap keeps the ones that
  // recurred most — but it SAYS how many it left out. A silent cap would make
  // "three blockers recurred" read as the whole picture when it was thirty.
  const shown = input.recurringStucks.slice(0, RECURRING_LIMIT);
  const lines = shown.map(
    (s) =>
      `  "${s.description}" — ${s.occurrences} time${s.occurrences === 1 ? "" : "s"} across ${s.weeksSeen} week${s.weeksSeen === 1 ? "" : "s"}` +
      `, raised by ${withMore(s.raisedBy, 4).join(", ")}` +
      (s.latestStatusStated ? `, last stated status ${s.latestStatusStated}` : ", no status ever stated"),
  );

  const dropped = input.recurringStucks.length - shown.length;
  if (dropped > 0) {
    lines.push(
      `  (${dropped} further recurring blocker${dropped === 1 ? "" : "s"} recorded but not listed — treat this as a sample, not the full list)`,
    );
  }
  return `RECURRING BLOCKERS\n${lines.join("\n")}`;
}

function renderWww(input: MonthlyPromptInput): string {
  const w = input.www;
  if (!w || w.total === 0) return "WWW COMMITMENTS\n  (no items in scope this period)";

  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  return [
    "WWW COMMITMENTS",
    `  ${w.total} in scope · ${w.completed} completed · ${w.overdue} overdue · ${w.carriedForward} carried forward · ${w.cancelled} cancelled`,
    `  completion ${pct(w.completionRate)} · overdue ${pct(w.overdueRate)} · carry-forward ${pct(w.carryForwardRate)}`,
    w.averageDaysToClose !== null
      ? `  average time to close: ${w.averageDaysToClose} days`
      : "  average time to close: not enough completed items",
  ].join("\n");
}

function renderNoStuck(input: MonthlyPromptInput): string {
  if (input.noStuckOutliers.length === 0) return "";
  const shown = input.noStuckOutliers.slice(0, NO_STUCK_LIMIT);
  const lines = shown.map(
    (m) =>
      `  ${m.name}: reported "No Stuck" in ${m.noStuckRate}% of ${m.huddlesAttended} huddles attended`,
  );

  const dropped = input.noStuckOutliers.length - shown.length;
  if (dropped > 0) {
    lines.push(`  (and ${dropped} more, not listed)`);
  }
  return [
    'FREQUENT "NO STUCK" REPORTING',
    "  The client asks for this to be watched: consistently reporting no blockers",
    "  is worth probing, NOT worth treating as a fault. Do not assume anything is",
    "  being concealed — say only that it warrants a facilitator question.",
    ...lines,
  ].join("\n");
}

/**
 * Build the monthly analysis prompt.
 *
 * Static rules first, data last, so the prefix is stable across clients and
 * months and the provider can cache it.
 */
export function buildMonthlyPrompt(input: MonthlyPromptInput): string {
  const parts = [RULES];

  const context = [
    `Client: ${input.clientName}`,
    `Period: ${input.periodLabel}`,
    `Weeks in scope: ${input.weekLabels.join(", ") || "none"}`,
  ];
  if (input.missingWeeks.length > 0) {
    // Told explicitly so the model qualifies its reading rather than treating a
    // gap as a genuine drop to zero.
    context.push(
      `Weeks with NO report (exclude from any conclusion): ${input.missingWeeks.join(", ")}`,
    );
  }
  parts.push(`PERIOD\n${context.map((c) => `  ${c}`).join("\n")}`);

  parts.push(renderTrends(input.trends));
  parts.push(renderRecurring(input));
  parts.push(renderWww(input));

  const noStuck = renderNoStuck(input);
  if (noStuck) parts.push(noStuck);

  parts.push(
    [
      "PRODUCE",
      "  keyObservations   3-5 sentences, each about a pattern in the data above",
      "  wwwObservation    one sentence on the commitment picture, or null",
      "  recommendations   1-3 specific actions tied to the patterns you named",
      "",
      "Return JSON only. No prose outside the JSON, no code fences.",
    ].join("\n"),
  );

  return parts.join("\n\n");
}

/** The cacheable prefix, exported for testing. */
export function monthlyPromptPrefix(): string {
  return RULES;
}
