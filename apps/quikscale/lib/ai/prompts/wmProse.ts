/**
 * The Weekly Meeting report's analysis prompt (Level 2, doc 17 §F.2).
 *
 * ONE CALL. NO TRANSCRIPT. EVER.
 * ------------------------------
 * The meeting behind this prompt runs three to six hours — 60,000 to 90,000
 * tokens of speech. What arrives here is a handful of finished tables:
 * attendance, agenda coverage, the K&P grid, gaps, and the ten-metric
 * scorecard. About 3,000 tokens, and **the same 3,000 whether the meeting ran
 * ninety minutes or eight hours**. That property is the whole reason the
 * architecture chunks extraction rather than summarising transcripts.
 *
 * A test asserts the built prompt contains no transcript text. If someone adds
 * raw quotes here "for context", the cost of every report rises by an order of
 * magnitude and nothing visible changes until the bill arrives.
 *
 * WHAT THE MODEL IS FOR
 * ---------------------
 * Every number here is already computed. Its job is to say which of them matter
 * TOGETHER — the cross-section patterns a table cannot show — and to propose
 * actions. Not to recompute, not to restate, and never to characterise a
 * person.
 */

/**
 * Bump on any change that alters what the model produces. Part of the report's
 * cache key, so a bump marks affected reports stale.
 */
export const PROMPT_VERSION = "wm-prose@1.0.0";

export interface WmPromptInput {
  clientName: string;
  /** "16 June 2026" */
  meetingDateLabel: string;
  callHeld: boolean;
  attendance: {
    present: number;
    absent: number;
    expected: number;
    onLeave: number;
    unknown: number;
    attendancePct: number | null;
  };
  agenda: Array<{
    label: string;
    coverage: string;
    timeDiscipline: string;
    expectedMinutes: number;
    actualMinutes: number | null;
    flagDisagrees: boolean;
  }>;
  kpi: Array<{
    name: string;
    kpiRag: string;
    priorityRag: string;
    keyPoints: string[];
    ragConflict: boolean;
  }>;
  gaps: Array<{
    gap: string;
    agreedAction: string | null;
    scope: string;
    raisedBy: string[];
  }>;
  discussions: Array<{ kind: string; summary: string; wasDeferred: boolean }>;
  www: {
    reviewed: number;
    completed: number;
    overdue: number;
    carriedForward: number;
    newCaptured: number;
    /** New items missing an owner or a date — the report's most actionable line. */
    newIncomplete: number;
  } | null;
  scorecard: Array<{ label: string; reading: string; rag: string }>;
  overall: { reading: string; rag: string };
  /** Coverage below 100 means content nobody read. Named so conclusions are qualified. */
  coveragePct: number | null;
  missingWindowLabels: string[];
  /**
   * Facts recorded but not shown, because a section was bounded (doc 17 §R1).
   *
   * Told to the model so it qualifies its reading, exactly as it does for
   * incomplete coverage — and told for the same reason: a section that was
   * trimmed must not read as the complete picture. This is what replaced the
   * old silent `.slice()` calls.
   */
  omissionNotes: string[];
  /** Workstreams the meeting covered, where any were identified. */
  topics: string[];
}

/**
 * Cap a list of secondary detail, and say when it was capped.
 *
 * A prompt line listing twelve raisers helps nobody, but trimming to five and
 * saying nothing is the same silent truncation this work removed — one level
 * down. "…and 7 more" costs four tokens and keeps the statement true.
 */
function withMore(items: string[], limit: number): string[] {
  if (items.length <= limit) return items;
  return [...items.slice(0, limit), `…and ${items.length - limit} more`];
}

const RULES = `
You write the narrative for a Weekly Meeting report. Everything below has
already been computed. You add interpretation, and nothing else.

ABSOLUTE RULES
1. Never produce, recompute, adjust or restate a number. Every figure in the
   report is calculated by backend code and is already correct.
2. Never name a person who does not appear in the data below, and never
   characterise one. You may say what was discussed; you may not say who is
   diligent, disengaged, struggling or capable.
3. Never invent an agenda item, a gap, a commitment or a discussion. If it is
   not in the tables, it did not happen as far as this report is concerned.
4. A stated KPI status (RED/AMBER/GREEN) is a fact reported in the meeting.
   Repeat it if useful; never revise it, and never infer one that says
   NOT_STATED.
5. Where coverage is incomplete, say so plainly and qualify what you conclude.
   A gap in the recording is not evidence about the meeting.
6. Look for patterns ACROSS sections — a connection one table cannot show. That
   is the only thing here a table cannot already do.
7. Be concise. A facilitator reads this in two minutes.

WHAT MAKES AN OBSERVATION WORTH WRITING
  · a segment that consistently loses its time to another one
  · gaps raised with no action agreed against them
  · a RAG picture that does not match how the meeting spent its time
  · commitments discussed but never captured as WWW
  · a deferred segment that has now been deferred repeatedly

WHAT IS NOT WORTH WRITING
  · restating the scorecard in sentences
  · "attendance was 84%" with no interpretation
  · generic meeting advice that would apply to any team
  · anything about a person's attitude, motivation or ability
`.trim();

function renderAttendance(input: WmPromptInput): string {
  const a = input.attendance;
  const pct = a.attendancePct === null ? "not assessable" : `${a.attendancePct}%`;
  const notes: string[] = [];
  if (a.onLeave) notes.push(`${a.onLeave} on approved leave (excluded from the rate)`);
  if (a.unknown) notes.push(`${a.unknown} with no attendance evidence (excluded)`);

  return [
    "ATTENDANCE",
    `  ${a.present} present · ${a.absent} absent · ${a.expected} expected · ${pct}`,
    ...notes.map((n) => `  ${n}`),
  ].join("\n");
}

function renderAgenda(input: WmPromptInput): string {
  if (input.agenda.length === 0) return "AGENDA COVERAGE\n  (no segment data)";
  const lines = input.agenda.map((s) => {
    const actual = s.actualMinutes === null ? "not measured" : `${s.actualMinutes} min`;
    const flag = s.flagDisagrees ? "  [facilitator's flag disagrees with the recording]" : "";
    return `  ${s.label}: ${s.coverage}, ${s.timeDiscipline} — expected ${s.expectedMinutes} min, actual ${actual}${flag}`;
  });
  return `AGENDA COVERAGE (expected vs actual)\n${lines.join("\n")}`;
}

function renderKpi(input: WmPromptInput): string {
  if (input.kpi.length === 0) return "K&P DASHBOARD\n  (no dashboard reads captured)";
  const lines = input.kpi.map((k) => {
    const conflict = k.ragConflict ? "  [status stated differently at two points]" : "";
    const points = withMore(k.keyPoints, 3).join("; ");
    return `  ${k.name}: KPI ${k.kpiRag}, Priorities ${k.priorityRag}${points ? ` — ${points}` : ""}${conflict}`;
  });
  return `K&P DASHBOARD (statuses AS STATED in the meeting)\n${lines.join("\n")}`;
}

function renderGaps(input: WmPromptInput): string {
  if (input.gaps.length === 0) return "GAPS\n  (none surfaced)";
  const lines = input.gaps.map((g) => {
    const who = g.raisedBy.length
      ? ` (raised by ${withMore(g.raisedBy, 5).join(", ")})`
      : "";
    const action = g.agreedAction ? `agreed: ${g.agreedAction}` : "NO ACTION AGREED";
    return `  [${g.scope}] ${g.gap}${who} — ${action}`;
  });
  return `GAPS\n${lines.join("\n")}`;
}

function renderDiscussions(input: WmPromptInput): string {
  if (input.discussions.length === 0) return "";
  const held = input.discussions.filter((d) => !d.wasDeferred);
  const deferred = input.discussions.filter((d) => d.wasDeferred);

  const lines = held.map((d) => `  ${d.kind}: ${d.summary}`);
  if (deferred.length) {
    lines.push(
      ...deferred.map((d) => `  DEFERRED: ${d.summary}`),
    );
  }
  return `DISCUSSIONS\n${lines.join("\n")}`;
}

function renderWww(input: WmPromptInput): string {
  const w = input.www;
  if (!w) return "WWW\n  (the commitment sections were not available for this report)";
  return [
    "WWW COMMITMENTS",
    `  reviewed ${w.reviewed} · completed ${w.completed} · overdue ${w.overdue} · carried forward ${w.carriedForward}`,
    `  newly captured ${w.newCaptured}, of which ${w.newIncomplete} are missing an owner or a date`,
  ].join("\n");
}

function renderScorecard(input: WmPromptInput): string {
  const lines = input.scorecard.map((m) => `  ${m.label}: ${m.reading} [${m.rag}]`);
  return [
    "SCORECARD",
    ...lines,
    `  OVERALL: ${input.overall.reading} [${input.overall.rag}]`,
  ].join("\n");
}

/**
 * Build the analysis prompt.
 *
 * Static rules first, data last, so the prefix is byte-identical across clients
 * and meetings and the provider can cache it.
 */
export function buildWmPrompt(input: WmPromptInput): string {
  const parts = [RULES];

  const context = [
    `Client: ${input.clientName}`,
    `Meeting date: ${input.meetingDateLabel}`,
  ];
  if (!input.callHeld) {
    context.push("This meeting did NOT take place. Say so; do not analyse content.");
  }
  if (input.coveragePct !== null && input.coveragePct < 100) {
    // Told explicitly so a thin section reads as a recording gap rather than as
    // a finding about the meeting.
    context.push(
      `Recording coverage: ${input.coveragePct}%. Content in these windows was NOT read: ${input.missingWindowLabels.join(", ") || "unknown"}.`,
    );
    context.push(
      "Do not treat a sparse section as evidence of what the meeting did or did not cover.",
    );
  }
  if (input.topics.length > 0) {
    context.push(`Workstreams discussed: ${input.topics.join(", ")}.`);
  }
  if (input.omissionNotes.length > 0) {
    // A bounded section and an unread window are different failures and must
    // not be conflated: one means we did not print everything, the other means
    // nobody heard it. Both make a conclusion provisional, for different
    // reasons, and the model is told which is which.
    context.push(
      "Some sections below are BOUNDED — the facts exist and are recorded, but not all of them are listed here:",
      ...input.omissionNotes.map((n) => `  · ${n}`),
      "Treat a bounded section as a sample, not as the complete list. Do not conclude that only the listed items occurred.",
    );
  }
  parts.push(`MEETING\n${context.map((c) => `  ${c}`).join("\n")}`);

  parts.push(renderAttendance(input));
  parts.push(renderAgenda(input));
  parts.push(renderKpi(input));
  parts.push(renderGaps(input));

  const discussions = renderDiscussions(input);
  if (discussions) parts.push(discussions);

  parts.push(renderWww(input));
  parts.push(renderScorecard(input));

  parts.push(
    [
      "PRODUCE",
      "  meetingSummary    2-4 sentences: what this meeting was, and how it ran",
      "  keyObservations   3-5 sentences, each about a pattern across the sections",
      "  agendaObservation one sentence on how time was spent, or null",
      "  gapObservation    one sentence on the gaps picture, or null",
      "  recommendations   1-3 specific actions tied to the patterns you named",
      "",
      "Return JSON only. No prose outside the JSON, no code fences.",
    ].join("\n"),
  );

  return parts.join("\n\n");
}

/** The cacheable prefix, exported for testing. */
export function wmPromptPrefix(): string {
  return RULES;
}
