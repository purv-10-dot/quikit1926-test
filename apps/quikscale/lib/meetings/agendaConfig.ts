/**
 * Weekly Meeting agenda configuration.
 *
 * WHAT THIS UNBLOCKS
 * ------------------
 * Requirement doc §5.2 asks for **Expected Duration** and **Actual Duration**
 * per segment, and classifies time discipline as On Track / Rushed / Over-ran /
 * Skipped. Nothing in the schema held an expected duration, so "Rushed" and
 * "Over-ran" were not computable at all — only Done / Partial / Not Done was.
 * This is the missing input (doc 17 gap G13).
 *
 * IT MIRRORS COLUMNS THAT ALREADY EXIST
 * -------------------------------------
 * `ClientWeeklyMeeting` already carries seven `ClientMeetingFlag` columns and
 * seven `segmentTime1..7` companions, in the order Good News → OPSP Review —
 * exactly the seven segments in the reference report. So the human-entered
 * coverage signal is already there; this adds the *expected* side and gives the
 * segments stable keys, rather than inventing a parallel agenda model.
 *
 * The eighth entry (the one-phrase close) has no flag column. It appears in the
 * reference report and is detectable from the transcript, so it is included as
 * a transcript-only segment rather than dropped for lacking a column.
 *
 * ⚠️ THE DEFAULT DURATIONS ARE A PLACEHOLDER.
 * Doc 17 open question Q6 asks the client for the canonical Scaling Up
 * time-box per segment. Until that is answered these are a defensible 90-minute
 * shape, NOT a client-confirmed standard, and every "Rushed"/"Over-ran"
 * judgement inherits that uncertainty. Per-client overrides live in
 * `Client.weeklyAgendaConfig` precisely so a real answer can land without a
 * code change.
 */

/** Stable keys. Never renumber — facts and reports reference these. */
export const SEGMENT_KEYS = [
  "goodNews",
  "kpDashboard",
  "gaps",
  "www",
  "feedback",
  "collectiveIntelligence",
  "opspReview",
  "onePhraseClose",
] as const;

export type SegmentKey = (typeof SEGMENT_KEYS)[number];

export interface AgendaSegment {
  key: SegmentKey;
  label: string;
  order: number;
  /** Placeholder pending Q6. */
  expectedMinutes: number;
  /**
   * The `ClientWeeklyMeeting` flag column carrying the HUMAN coverage verdict.
   * Null for the close, which has no column.
   */
  flagColumn:
    | "goodNewsSharing"
    | "kpDashboard"
    | "gaps"
    | "www"
    | "feedback"
    | "collectiveIntelligence"
    | "opspReview"
    | null;
  /** The paired `segmentTimeN` column, 1-based. Null for the close. */
  timeColumn: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
  /**
   * Phrases that mark a transition INTO this segment.
   *
   * Feeds both the chunker's boundary scoring and `SEGMENT_MARKER` detection.
   * Deliberately per-client configurable: every team says this differently, and
   * doc 17 open question Q11 asks for a real vocabulary tuned against a genuine
   * 3-4 hour transcript rather than these guesses.
   */
  cues: string[];
}

/**
 * The default agenda — the seven columns plus the close.
 *
 * Order and labels follow the reference Weekly Meeting report so a generated
 * report can be compared against the hand-written one section by section.
 */
export const DEFAULT_AGENDA: AgendaSegment[] = [
  {
    key: "goodNews",
    label: "Good News Sharing",
    order: 1,
    expectedMinutes: 10,
    flagColumn: "goodNewsSharing",
    timeColumn: 1,
    cues: ["good news", "let's start with good news", "personal and professional"],
  },
  {
    key: "kpDashboard",
    label: "K&P Dashboard Review",
    order: 2,
    expectedMinutes: 30,
    flagColumn: "kpDashboard",
    timeColumn: 2,
    cues: ["k&p", "kp dashboard", "dashboard review", "scorecard", "your numbers", "kpi review"],
  },
  {
    key: "gaps",
    label: "GAPS & Action Plan",
    order: 3,
    expectedMinutes: 15,
    flagColumn: "gaps",
    timeColumn: 3,
    cues: ["gaps", "action plan", "what is getting in the way", "blockers"],
  },
  {
    key: "www",
    label: "WWW Review & Follow-up",
    order: 4,
    expectedMinutes: 10,
    flagColumn: "www",
    timeColumn: 4,
    cues: ["www", "who what when", "action items", "last week's actions", "follow-up"],
  },
  {
    key: "feedback",
    label: "Customer & Employee Feedback",
    order: 5,
    expectedMinutes: 5,
    flagColumn: "feedback",
    timeColumn: 5,
    cues: ["customer feedback", "employee feedback", "cef", "client feedback"],
  },
  {
    key: "collectiveIntelligence",
    label: "Collective Intelligence",
    order: 6,
    expectedMinutes: 12,
    flagColumn: "collectiveIntelligence",
    timeColumn: 6,
    cues: ["collective intelligence", "ci topic", "let's put this to the group"],
  },
  {
    key: "opspReview",
    label: "OPSP Review",
    order: 7,
    expectedMinutes: 5,
    flagColumn: "opspReview",
    timeColumn: 7,
    cues: ["opsp", "one page strategic plan", "critical number", "quarterly theme"],
  },
  {
    key: "onePhraseClose",
    label: "One-Phrase Close",
    order: 8,
    expectedMinutes: 3,
    // No flag column exists for the close. It is in the reference report and is
    // detectable from the transcript, so it is tracked rather than dropped for
    // lacking a column.
    flagColumn: null,
    timeColumn: null,
    cues: ["one phrase", "one-phrase", "one word close", "closing round", "final thoughts"],
  },
];

/** Total planned minutes — the denominator for "the meeting over-ran". */
export const DEFAULT_AGENDA_MINUTES = DEFAULT_AGENDA.reduce(
  (n, s) => n + s.expectedMinutes,
  0,
);

/**
 * Merge a per-client override over the default.
 *
 * A partial override is enough: supplying only `expectedMinutes` for K&P
 * changes that and leaves everything else standard. Unknown keys are ignored
 * rather than rejected — a stale config from a renamed segment must not stop a
 * report generating.
 */
export function resolveAgenda(config: unknown): AgendaSegment[] {
  if (!Array.isArray(config) || config.length === 0) return DEFAULT_AGENDA;

  const overrides = new Map<string, Partial<AgendaSegment>>();
  for (const raw of config) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.key !== "string") continue;
    overrides.set(o.key, {
      label: typeof o.label === "string" ? o.label : undefined,
      order: typeof o.order === "number" ? o.order : undefined,
      expectedMinutes:
        typeof o.expectedMinutes === "number" && o.expectedMinutes >= 0
          ? o.expectedMinutes
          : undefined,
      cues: Array.isArray(o.cues) ? o.cues.filter((c): c is string => typeof c === "string") : undefined,
    });
  }

  return DEFAULT_AGENDA.map((seg) => {
    const o = overrides.get(seg.key);
    if (!o) return seg;
    return {
      ...seg,
      label: o.label ?? seg.label,
      order: o.order ?? seg.order,
      expectedMinutes: o.expectedMinutes ?? seg.expectedMinutes,
      // Cues REPLACE rather than merge: a client who supplies their own
      // vocabulary means "these are the phrases we use", and silently keeping
      // the defaults alongside would fire on phrases they never say.
      cues: o.cues ?? seg.cues,
    };
  }).sort((a, b) => a.order - b.order);
}

/** Every cue across the agenda, for the chunker's boundary scoring. */
export function agendaCues(agenda: AgendaSegment[] = DEFAULT_AGENDA): string[] {
  return [...new Set(agenda.flatMap((s) => s.cues.map((c) => c.toLowerCase())))];
}

/** Look up a segment by key. */
export function segmentByKey(
  key: string,
  agenda: AgendaSegment[] = DEFAULT_AGENDA,
): AgendaSegment | undefined {
  return agenda.find((s) => s.key === key);
}

/**
 * Read the human coverage flag for a segment off a `ClientWeeklyMeeting` row.
 *
 * Returns null for the close (no column) and for a row that never recorded the
 * flag — `NA` is a real answer meaning "not applicable", and must not be
 * confused with "nobody filled this in".
 */
export function humanFlagFor(
  segment: AgendaSegment,
  meeting: Record<string, unknown> | null,
): "YES" | "NO" | "NA" | null {
  if (!meeting || !segment.flagColumn) return null;
  const value = meeting[segment.flagColumn];
  return value === "YES" || value === "NO" || value === "NA" ? value : null;
}

/** Read the human-entered segment time (HH:mm) off the row. */
export function humanTimeFor(
  segment: AgendaSegment,
  meeting: Record<string, unknown> | null,
): string | null {
  if (!meeting || segment.timeColumn === null) return null;
  const value = meeting[`segmentTime${segment.timeColumn}`];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
