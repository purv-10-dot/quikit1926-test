/**
 * The Week Rollup's analysis prompt (Level 2, doc 17 §R3).
 *
 * ONE CALL. NO TRANSCRIPTS. NO FACTS.
 * -----------------------------------
 * A week is roughly five daily huddles and one three-to-six hour weekly meeting
 * — well over 100,000 tokens of speech. What arrives here is a trend table, a
 * blocker list already grouped by recurrence key, and a WWW summary: about 2,000
 * tokens, and the same 2,000 however long the week's meetings ran.
 *
 * That works because each source report already stored a bounded digest
 * (doc 17 §R2). This prompt never sees a transcript OR a fact row, and a test
 * asserts it.
 *
 * WHAT THE MODEL IS FOR
 * ---------------------
 * The one thing this rollup can see that neither source report can: a problem
 * appearing in BOTH rhythms in the same week. The daily huddle report sees only
 * huddles; the weekly meeting report sees only that meeting. Connecting them is
 * the job.
 */

/**
 * Bump on any change that alters what the model produces. Part of the rollup's
 * cache key, so a bump marks affected reports stale.
 */
export const PROMPT_VERSION = "week-rollup-prose@1.0.0";

export interface WeekRollupPromptInput {
  clientName: string;
  /** "3 Aug – 9 Aug" */
  label: string;
  sources: Array<{ kind: string; label: string; date: string }>;
  missingSources: string[];
  /** Bounded-digest notes, when a source report did not list everything. */
  coverageNotes: string[];
  trends: Array<{
    label: string;
    direction: string;
    delta: number | null;
    last: number | null;
    summary: string;
  }>;
  blockers: Array<{
    description: string;
    occurrences: number;
    meetingsSeen: number;
    raisedBy: string[];
    crossRhythm: boolean;
    latestStatusStated: string | null;
  }>;
  www: {
    total: number;
    completed: number;
    overdue: number;
    carriedForward: number;
    completionRate: number | null;
  };
  topics: string[];
}

const RULES = `
You write the narrative for a WEEK ROLLUP — everything that happened across a
client's meetings in one week. Everything below has already been computed. You
add interpretation, and nothing else.

WHAT THIS REPORT SEES THAT OTHERS DO NOT
This is the only view that spans both rhythms. The daily-huddle report sees only
huddles; the weekly-meeting report sees only one meeting. A problem raised in
BOTH in the same week is the signal this report exists to surface, and it is
marked for you below.

ABSOLUTE RULES
1. Never produce, recompute, adjust or restate a number. Every figure here is
   calculated by backend code and is already correct.
2. Never name a person who does not appear below, and never characterise one.
   You may say what was raised; you may not say who is diligent or disengaged.
3. Never invent a blocker, a commitment or a meeting. If it is not in the tables,
   it did not happen as far as this report is concerned.
4. A missing source report means a report was not GENERATED — never that the
   meetings did not happen. Do not conclude anything from a gap in reporting.
5. Where a source listed only some of what it recorded, say your reading is
   partial rather than presenting it as the full picture.
6. Prefer connections ACROSS the week to a summary of each meeting in turn. A
   reader who wanted the meetings one at a time would open those reports.
7. Be concise. A facilitator reads this in ninety seconds.

WHAT MAKES AN OBSERVATION WORTH WRITING
  · a blocker that crossed both rhythms in one week
  · a trend that changed direction this week
  · commitments closing more slowly than they are opening
  · a topic that dominated both the huddles and the weekly meeting
  · something raised repeatedly with no owner or action attached

WHAT IS NOT WORTH WRITING
  · a meeting-by-meeting recap
  · restating the trend table in sentences
  · generic meeting advice that would apply to any team
  · anything about a person's attitude, motivation or ability
`.trim();

function renderSources(input: WeekRollupPromptInput): string {
  const lines =
    input.sources.length > 0
      ? input.sources.map((s) => `  ${s.kind}: ${s.label} (${s.date})`)
      : ["  (no reports were generated for this week)"];

  if (input.missingSources.length > 0) {
    // Stated as a REPORTING gap, never as an absence of meetings. The model is
    // told the difference because it cannot infer it.
    lines.push(...input.missingSources.map((m) => `  MISSING: ${m}`));
  }
  return `THIS WEEK'S REPORTS\n${lines.join("\n")}`;
}

function renderTrends(input: WeekRollupPromptInput): string {
  if (input.trends.length === 0) {
    return "WEEK-OVER-WEEK\n  (not enough history to compare)";
  }
  const lines = input.trends.map((t) => {
    const last = t.last === null ? "—" : String(t.last);
    const move =
      t.delta === null ? t.direction.toLowerCase() : `${t.delta > 0 ? "+" : ""}${t.delta}`;
    return `  ${t.label}: ${last} (${move}) — ${t.summary}`;
  });
  return `WEEK-OVER-WEEK (this week against the preceding weeks)\n${lines.join("\n")}`;
}

function renderBlockers(input: WeekRollupPromptInput): string {
  if (input.blockers.length === 0) return "BLOCKERS\n  (none raised this week)";

  const lines = input.blockers.map((b) => {
    const cross = b.crossRhythm ? "  [RAISED IN BOTH RHYTHMS]" : "";
    const who = b.raisedBy.length ? `, raised by ${b.raisedBy.slice(0, 5).join(", ")}` : "";
    const status = b.latestStatusStated
      ? `, last stated ${b.latestStatusStated}`
      : ", no status ever stated";
    return `  "${b.description}" — ${b.occurrences} time${b.occurrences === 1 ? "" : "s"} across ${b.meetingsSeen} meeting${b.meetingsSeen === 1 ? "" : "s"}${who}${status}${cross}`;
  });
  return `BLOCKERS ACROSS THE WEEK\n${lines.join("\n")}`;
}

function renderWww(input: WeekRollupPromptInput): string {
  const w = input.www;
  if (w.total === 0) return "WWW COMMITMENTS\n  (none in scope this week)";
  const pct = w.completionRate === null ? "—" : `${w.completionRate}%`;
  return [
    "WWW COMMITMENTS",
    `  ${w.total} in scope · ${w.completed} completed · ${w.overdue} overdue · ${w.carriedForward} carried forward`,
    `  completion ${pct}`,
  ].join("\n");
}

/**
 * Build the rollup prompt.
 *
 * Static rules first, data last, so the prefix is byte-identical across clients
 * and weeks and the provider can cache it.
 */
export function buildWeekRollupPrompt(input: WeekRollupPromptInput): string {
  const parts = [RULES];

  const context = [`Client: ${input.clientName}`, `Week: ${input.label}`];
  if (input.topics.length > 0) {
    context.push(`Workstreams discussed: ${input.topics.join(", ")}.`);
  }
  if (input.coverageNotes.length > 0) {
    context.push(
      "Some source reports listed only part of what they recorded:",
      ...input.coverageNotes.map((n) => `  · ${n}`),
      "Treat those sections as a sample, not as the complete list.",
    );
  }
  parts.push(`WEEK\n${context.map((c) => `  ${c}`).join("\n")}`);

  parts.push(renderSources(input));
  parts.push(renderTrends(input));
  parts.push(renderBlockers(input));
  parts.push(renderWww(input));

  parts.push(
    [
      "PRODUCE",
      "  weekSummary        2-4 sentences: what this week looked like across both rhythms",
      "  keyObservations    3-5 sentences, each about a connection across the week",
      "  blockerObservation one sentence on the blocker picture, or null",
      "  wwwObservation     one sentence on the commitment picture, or null",
      "  recommendations    1-3 specific actions tied to the patterns you named",
      "",
      "Return JSON only. No prose outside the JSON, no code fences.",
    ].join("\n"),
  );

  return parts.join("\n\n");
}

/** The cacheable prefix, exported for testing. */
export function weekRollupPromptPrefix(): string {
  return RULES;
}
