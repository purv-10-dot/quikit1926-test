/**
 * AI prose layer for the Daily Huddle Weekly Report (§4.2 highlights, §4.5B
 * recurring-stuck grouping, §4.6 facilitator observations, WWW suggestions).
 *
 * The contract with `weeklyHuddleAggregate.ts` is deliberate and strict: this
 * module hands the model the ALREADY-COMPUTED tables and the per-person
 * qualitative notes, and asks only for interpretation. It never sends raw
 * transcripts (five days of them would blow the context and invite the model
 * to re-derive numbers we already know), and the model is told in as many
 * words that it may not restate or contradict a figure.
 *
 * Two schema choices exist purely so the validation layer can do its job
 * mechanically rather than by scraping prose:
 *
 *   - every observation carries `namedMembers` + `sourceDates`, so
 *     roster-containment and scope checks are set operations, not regexes;
 *   - every recurring-stuck group carries `blockerIndexes` into the input
 *     list, so a group can be proved to reference real blockers.
 *
 * `buildWeeklyReportPrompt` and `parseWeeklyReportResponse` are pure and
 * exported for unit testing; the DB-touching orchestration lives in the route.
 */

import { z } from "zod";
import { generateContent } from "./geminiKeyPool";
import { QUIKSCALE_OVERVIEW } from "./quikscaleOverview";
import type {
  AdherenceHeatMap,
  AttendanceMatrix,
  ExecutiveMetrics,
  UnrecognizedSpeaker,
  WeekBlocker,
} from "./weeklyHuddleAggregate";

/** Raised when the model's output can't be parsed into a valid report. */
export class WeeklyReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeeklyReportError";
  }
}

// ---------------------------------------------------------------------------
// Output schema — prose only
// ---------------------------------------------------------------------------

const observationSchema = z.object({
  text: z.string(),
  /** Roster names the observation names, for mechanical validation. */
  namedMembers: z.array(z.string()).default([]),
  /** Reporting-week dates (yyyy-mm-dd) the observation draws on. */
  sourceDates: z.array(z.string()).default([]),
});
export type WeeklyObservation = z.infer<typeof observationSchema>;

/** The six §4.6 rows, in the doc's order. Fixed keys — not a free-form list. */
const facilitatorObservationsSchema = z.object({
  attendanceParticipation: observationSchema,
  strongPerformers: observationSchema,
  achievementGap: observationSchema,
  focusSpecificity: observationSchema,
  stuckProtocol: observationSchema,
  recommendations: observationSchema,
});
export type FacilitatorObservations = z.infer<typeof facilitatorObservationsSchema>;

const recurringStuckSchema = z.object({
  /** One canonical phrasing of the underlying issue. */
  blocker: z.string(),
  occurrences: z.number(),
  /** Indexes into the `blockers` array supplied in the prompt. */
  blockerIndexes: z.array(z.number()).default([]),
  raisedBy: z.array(z.string()).default([]),
  raisedFor: z.array(z.string()).default([]),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).nullish(),
});
export type RecurringStuck = z.infer<typeof recurringStuckSchema>;

/**
 * Version of this prose prompt.
 *
 * Part of the DH Weekly Report's cache key, so bumping it marks every affected
 * report STALE — offered for regeneration, never regenerated automatically.
 * Bump it for a real instruction change; do not bump it for a comment or a
 * whitespace tidy, because the cost is a fleet-wide regeneration prompt.
 */
export const PROMPT_VERSION = "dh-weekly-prose@1.0.0";

export const WWW_KINDS = ["BLOCKER", "KPI_RELATED", "PRIORITY_RELATED", "ACTION"] as const;

const wwwSuggestionSchema = z.object({
  who: z.string().nullish(),
  what: z.string(),
  /** Only when the week actually stated a date — never inferred. */
  when: z.string().nullish(),
  kind: z.enum(WWW_KINDS),
  confidence: z.number(),
  sourceDate: z.string().nullish(),
  sourceQuote: z.string().nullish(),
});
export type WwwSuggestion = z.infer<typeof wwwSuggestionSchema>;

export const weeklyReportAiSchema = z.object({
  overallConfidence: z.number(),
  /** §4.2 — 3–5 team-level, insight-led bullets. */
  keyHighlights: z.array(z.string()),
  /** §4.5B — groups over the blockers supplied in the prompt. */
  recurringStucks: z.array(recurringStuckSchema),
  /** §4.6 */
  facilitatorObservations: facilitatorObservationsSchema,
  wwwSuggestions: z.array(wwwSuggestionSchema),
});
export type WeeklyReportAi = z.infer<typeof weeklyReportAiSchema>;

// ---------------------------------------------------------------------------
// Prompt input
// ---------------------------------------------------------------------------

/** One person's qualitative notes on one day — the evidence base for §4.6. */
export interface ParticipantDayNote {
  date: string;
  participant: string;
  achievementNote?: string | null;
  focusNote?: string | null;
  stuckNote?: string | null;
}

export interface WeeklyReportAiInput {
  clientName: string;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  metrics: ExecutiveMetrics;
  /** Team-average row from §4.4, reused verbatim as §4.2's agenda adherence. */
  agendaAdherence: AdherenceHeatMap["teamAverage"];
  attendance: AttendanceMatrix;
  heatMap: AdherenceHeatMap;
  blockers: WeekBlocker[];
  notes: ParticipantDayNote[];
  unrecognized: UnrecognizedSpeaker[];
}

/**
 * Bound the qualitative notes sent to the model. Five days x a dozen people x
 * three notes stays far under this in practice; the cap exists so one
 * pathological week can't blow the context window.
 */
export const NOTES_CAP = 40_000;

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `${n}%`);

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/** Render the computed tables as compact text the model can reason over. */
function renderTables(t: WeeklyReportAiInput): string[] {
  const attendanceRows = t.attendance.rows.map((r) => {
    const cells = r.cells.map((c) => `${c.date.slice(5)}:${c.state[0]}`).join(" ");
    return `- ${r.name}: ${cells} → ${r.attendancePct}% (present ${r.presentDays}/${r.expectedDays}${
      r.onLeaveDays ? `, on leave ${r.onLeaveDays}` : ""
    })`;
  });

  const heatRows = t.heatMap.rows.map(
    (r) =>
      `- ${r.participant}: achievement ${pct(r.achievementPct)}, focus ${pct(r.focusPct)}, stuck ${pct(
        r.stuckPct,
      )}, avg ${pct(r.avgScorePct)} (assessed over ${r.daysAssessed} huddle(s)${
        r.noStuckDays ? `, explicit "No Stuck" on ${r.noStuckDays}` : ""
      })`,
  );

  const blockerRows = t.blockers.map(
    (b, i) =>
      `[${i}] ${b.date} — raisedBy: ${b.raisedBy}; raisedFor: ${b.raisedFor ?? "unstated"}; category: ${
        b.category
      }; status: ${b.status ?? "unstated"}; ${b.description}`,
  );

  return [
    "COMPUTED FIGURES (authoritative — do not recompute, restate as a list, or contradict):",
    `- Daily Huddles planned: ${t.metrics.huddlesPlanned}`,
    `- Daily Huddles conducted: ${t.metrics.huddlesConducted}`,
    `- Average attendance: ${pct(t.metrics.averageAttendancePct)}`,
    `- Meetings started on time: ${pct(t.metrics.startedOnTimePct)}`,
    `- Average duration (min): ${t.metrics.averageDurationMinutes ?? "n/a"}`,
    `- Team agenda adherence — Yesterday Achievement ${pct(t.agendaAdherence.achievementPct)}, Today Focus ${pct(
      t.agendaAdherence.focusPct,
    )}, Stuck ${pct(t.agendaAdherence.stuckPct)}`,
    "",
    "ATTENDANCE (P=present, A=absent, N=not applicable):",
    ...(attendanceRows.length ? attendanceRows : ["(none)"]),
    "",
    "ADHERENCE PER PERSON:",
    ...(heatRows.length ? heatRows : ["(none)"]),
    "",
    "STUCKS RAISED THIS WEEK (index in brackets — cite these indexes when grouping):",
    ...(blockerRows.length ? blockerRows : ["(none raised)"]),
  ];
}

/** Build the weekly-report prompt. Pure — exported for unit testing. */
export function buildWeeklyReportPrompt(t: WeeklyReportAiInput): string {
  const rosterNames = t.heatMap.rows.map((r) => r.participant);

  let notesText = t.notes
    .map((n) =>
      [
        `${n.date} — ${n.participant}:`,
        n.achievementNote ? `  achievement: ${n.achievementNote}` : "",
        n.focusNote ? `  focus: ${n.focusNote}` : "",
        n.stuckNote ? `  stuck: ${n.stuckNote}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
  const notesTruncated = notesText.length > NOTES_CAP;
  if (notesTruncated) notesText = notesText.slice(0, NOTES_CAP);

  return [
    QUIKSCALE_OVERVIEW,
    "",
    `You are a meeting facilitator analyst producing the Daily Huddle Weekly Report for ${t.clientName}, reporting week ${t.weekLabel} (${t.weekStart} to ${t.weekEnd}).`,
    "",
    "A Daily Huddle is a stand-up where every member states three things: their key achievement yesterday, their focus today, and any Stuck/blocker (or an explicit 'No Stuck'). Adherence answers 'was the update given?'. Your job is the separate question: 'how good was the update?'.",
    "",
    "ABSOLUTE RULES:",
    "1. The figures below are already computed from system records. Treat them as fact. Never recompute, re-derive, or state a number that contradicts them.",
    "2. Use ONLY this reporting week. Never compare with previous weeks, and never mention a date outside the week above.",
    "3. Every observation must be evidence-based and traceable to the data below. Never infer attitude, ownership, motivation, competence, or intent.",
    "4. Only ever refer to a person by a name that appears in this exact list: " +
      (rosterNames.length ? rosterNames.join(", ") : "(no identified participants)") +
      ". Never invent, abbreviate, or merge names.",
    "5. Evaluate a person only over the huddles they attended.",
    "6. Be specific and actionable. No generic meeting advice.",
    "",
    ...renderTables(t),
    "",
    t.unrecognized.length
      ? `NOTE — these transcript speakers could not be matched to the roster and must NOT be named in your output: ${t.unrecognized
          .map((u) => `${u.name} (${u.reason})`)
          .join(", ")}`
      : "",
    "",
    "QUALITATIVE NOTES PER PERSON PER DAY (your evidence for the observations):",
    notesText || "(none available)",
    notesTruncated ? "…[truncated]" : "",
    "",
    "PRODUCE EXACTLY THESE PARTS:",
    "",
    "A. `keyHighlights` — 3 to 5 concise, insight-led bullets covering attendance, adherence and stucks. Include both strengths and areas needing attention. Do NOT simply list the metrics again; say what they mean. Keep it TEAM level: do not name any individual UNLESS that person attended fewer than 50% of the huddles held.",
    "",
    "B. `recurringStucks` — group the stucks above that describe the SAME underlying issue. Cite the bracketed indexes in `blockerIndexes`, set `occurrences` to how many entries the group contains, and only include groups with 2 or more occurrences. Set `status` only if the data states it; otherwise null.",
    "",
    "C. `facilitatorObservations` — exactly these six, each one concise (1–3 sentences), each listing the roster names it mentions in `namedMembers` and the dates it draws on in `sourceDates`:",
    "   - `attendanceParticipation`: overall attendance pattern. Name a member only where attendance is under 50%. Treat planned leave separately from unexplained absence where the data distinguishes it.",
    "   - `strongPerformers`: members who consistently showed good discipline (specific achievement, clear focus, explicit Stuck/No Stuck) across at least ~80% of the huddles they attended.",
    "   - `achievementGap`: recurring missing, vague, activity-oriented or 'no achievement'/BAU updates instead of stated outcomes. Name individuals only where there is a consistent pattern.",
    "   - `focusSpecificity`: whether Today Focus was clear and specific. Call out both positive team patterns and recurring vague/BAU statements.",
    "   - `stuckProtocol`: whether Stuck/No Stuck was explicitly stated and whether raised stucks were clear. Highlight recurring or unresolved stucks and unusually frequent 'No Stuck' reporting.",
    "   - `recommendations`: 1 to 3 specific actions tied to the most material patterns above.",
    "   Name an individual only for strong performance or a meaningful repeated pattern — never for an isolated minor deviation.",
    "",
    "D. `wwwSuggestions` — action items this week implies. Set `kind` to:",
    "   - `BLOCKER` for an unresolved or recurring stuck that needs an owner;",
    "   - `KPI_RELATED` if the week discussed that a KPI ought to be created or tracked;",
    "   - `PRIORITY_RELATED` if it discussed that a Priority/rock ought to be created;",
    "   - `ACTION` for any other agreed action.",
    "   Set `who` to the person responsible when stated. Set `when` ONLY if a date or timeframe was actually stated — otherwise null, never a guess. Add `sourceDate` and a short `sourceQuote`.",
    "",
    "Give every item a `confidence` from 0 to 1, plus an `overallConfidence` for the report.",
    "",
    "Return ONLY a JSON object with this exact shape (no markdown, no prose outside the JSON):",
    '{"overallConfidence":number,"keyHighlights":[string],"recurringStucks":[{"blocker":string,"occurrences":number,"blockerIndexes":[number],"raisedBy":[string],"raisedFor":[string],"status":"OPEN|IN_PROGRESS|RESOLVED"|null}],"facilitatorObservations":{"attendanceParticipation":{"text":string,"namedMembers":[string],"sourceDates":[string]},"strongPerformers":{...},"achievementGap":{...},"focusSpecificity":{...},"stuckProtocol":{...},"recommendations":{...}},"wwwSuggestions":[{"who":string|null,"what":string,"when":string|null,"kind":"BLOCKER|KPI_RELATED|PRIORITY_RELATED|ACTION","confidence":number,"sourceDate":string|null,"sourceQuote":string|null}]}',
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * Parse the model's raw text into a validated `WeeklyReportAi`. Tolerant of
 * code-fenced JSON; clamps every confidence into [0,1].
 *
 * @throws {WeeklyReportError} on unparseable or schema-invalid output.
 */
export function parseWeeklyReportResponse(raw: string): WeeklyReportAi {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new WeeklyReportError("Model returned non-JSON output.");
  }

  const parsed = weeklyReportAiSchema.safeParse(json);
  if (!parsed.success) {
    throw new WeeklyReportError(
      `Weekly report did not match the expected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }

  const r = parsed.data;
  return {
    ...r,
    overallConfidence: clamp01(r.overallConfidence),
    wwwSuggestions: r.wwwSuggestions.map((w) => ({ ...w, confidence: clamp01(w.confidence) })),
  };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Ask Gemini for the prose layer of a weekly report.
 *
 * @throws {GeminiUnavailableError} when every key fails (route → `aiUnavailable`).
 * @throws {WeeklyReportError} when the output can't be parsed.
 */
export async function generateWeeklyReportProse(
  input: WeeklyReportAiInput,
  opts: { signal?: AbortSignal } = {},
): Promise<WeeklyReportAi> {
  const raw = await generateContent(buildWeeklyReportPrompt(input), {
    responseMimeType: "application/json",
    signal: opts.signal,
  });
  return parseWeeklyReportResponse(raw);
}
