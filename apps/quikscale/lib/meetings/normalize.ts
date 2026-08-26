/**
 * Transcript normalisation — raw text in, clean speaker turns out.
 *
 * Stage 1 of the long-transcript pipeline (doc 17 §D.2). Entirely
 * deterministic: no model is involved, so this costs nothing to run and is
 * fully unit-testable. The output is the `MeetingTranscriptSegment` rows that
 * everything downstream anchors to — chunk ranges, evidence quotes, and the
 * `transcriptSegmentIds` on every extracted fact.
 *
 * NON-DESTRUCTIVE, ALWAYS
 * -----------------------
 * `ClientMeetingTranscript.rawText` is never written by this module. The
 * original survives exactly as ingested so the viewer and the DOCX export keep
 * showing what the recorder produced, and so a normaliser change can be
 * re-run against the true source rather than against its own last output.
 *
 * TWO GRAMMARS, ONLY ONE OF WHICH HAS TIME
 * ----------------------------------------
 * The same field arrives in two different shapes, and this is the single most
 * important fact about this file:
 *
 *   1. FATHOM UI EXPORT (manual .docx upload) — carries real timestamps:
 *          @0:00 - Augustine Vaz
 *          Continue with the second group weekly meeting...
 *          No such.
 *          @0:15 - Harjinder (Bobby) Kohli
 *
 *   2. FATHOM API (the automatic ingestion path) — timestamps are DISCARDED
 *      upstream. `transcriptToText` in `apps/quikflow/lib/connectors/fathom.ts`
 *      receives `{ speaker, text, timestamp }[]` and flattens it to:
 *          Augustine Vaz: Continue with the second group weekly meeting...
 *          Harjinder (Bobby) Kohli: Thank you. Good morning, Reena.
 *
 *   3. FATHOM .docx EXPORT read through mammoth — speaker, timestamp and the
 *      first words arrive concatenated in one paragraph:
 *          Vijay Chaurasia  0:09Good.
 *          Dhruv Sharma  0:27Guys, I have joined online.
 *      See `GLUED_HEADER`. Until v2 this matched nothing and the whole meeting
 *      became a single speakerless segment.
 *
 * Grammar 2 is the common case today and it has no time information at all,
 * which would defeat time-windowed chunking, evidence timestamps and the
 * time-weighted coverage gate. So timings are INTERPOLATED across the meeting's
 * known duration, and the result is labelled `timingSource: "INTERPOLATED"` —
 * never silently presented as measured.
 *
 * The real fix is upstream: preserve the timestamps the API already returns.
 * Until then, interpolation keeps the pipeline working and `timingSource` keeps
 * it honest. A caller that needs true timings must check that field.
 *
 * DIARISATION NOISE IS NOT OURS TO FIX
 * ------------------------------------
 * Real Fathom output mis-attributes speakers — in the 05 June huddle, the line
 * "Good morning, Puja." is attributed to Puja Barori, who is being greeted
 * rather than speaking. Nothing here tries to correct that: guessing at a
 * corrected speaker would fabricate evidence. Attribution is resolved against
 * the roster by `participantMatch.ts`, and anything unresolved stays unresolved.
 */

/**
 * Bump when parsing or cleaning changes in a way that alters the segments
 * produced. It is part of the extraction idempotency key, so bumping it forces
 * re-extraction — which is correct, because the facts were derived from
 * differently-shaped input.
 */
/*
 * v2 — added the GLUED grammar (`Name  0:09Text`, Fathom's .docx export via
 * mammoth). Transcripts uploaded that way previously parsed as ONE speakerless
 * segment, so their extraction had no speaker attribution at all; bumping this
 * forces those to re-extract, which is the point.
 */
export const NORMALIZATION_VERSION = 2;

/** Where a segment's start/end times came from. */
export type TimingSource =
  /** Every segment carried an explicit timestamp. */
  | "EXPLICIT"
  /** No timestamps at all; every segment is interpolated across the duration. */
  | "INTERPOLATED"
  /** Some explicit, some repaired from neighbours. */
  | "MIXED"
  /** No timestamps and no known duration — ordinal positions only. */
  | "NONE";

export interface NormalizedSegment {
  /** 0-based, stable, dense. The evidence anchor. */
  idx: number;
  startMs: number;
  endMs: number;
  /** Speaker exactly as the recorder labelled them. Never corrected. */
  speakerRaw: string;
  text: string;
  charCount: number;
  estTokens: number;
  /** True when this segment's timing was derived rather than measured. */
  timingInterpolated: boolean;
}

export interface NormalizationStats {
  /** Lines in the input, after splitting. */
  inputLines: number;
  /** Turns recognised before cleaning. */
  parsedTurns: number;
  /** Text lines folded into a preceding speaker header. */
  linesJoined: number;
  /** Adjacent same-speaker turns merged. */
  turnsMerged: number;
  /** Empty / bracket-only / recorder-chrome lines discarded. */
  droppedNonContent: number;
  /** Verbatim same-speaker repeats within the dedupe window. */
  droppedDuplicates: number;
  /** Segments whose timing had to be derived. */
  timingInterpolated: number;
  /** Characters removed by filler reduction. */
  fillerCharsRemoved: number;
  /** Distinct speaker labels seen. */
  distinctSpeakers: number;
  grammar: TranscriptGrammar;
}

export type TranscriptGrammar =
  /** `@M:SS - Speaker` headers (Fathom UI export / manual .docx). */
  | "TIMESTAMPED_HEADER"
  /** `Speaker: text` per line (Fathom API via transcriptToText). */
  | "SPEAKER_PREFIX"
  /** Structured segments supplied directly — the best case. */
  | "STRUCTURED"
  /** Nothing recognisable; the whole body becomes one segment. */
  | "UNKNOWN";

export interface NormalizedTranscript {
  segments: NormalizedSegment[];
  stats: NormalizationStats;
  timingSource: TimingSource;
  /** Total content span in ms. Drives the time-weighted coverage gate. */
  contentMs: number;
  estTokens: number;
}

/** A structured segment, when the ingestion path managed to preserve one. */
export interface RawSegmentInput {
  speaker?: string | null;
  text?: string | null;
  /** Seconds or "m:ss" / "h:mm:ss" from the recorder. */
  timestamp?: number | string | null;
}

export interface NormalizeInput {
  rawText?: string | null;
  /** Preferred when present — carries real timings. */
  rawSegments?: RawSegmentInput[] | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationMinutes?: number | null;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Adjacent turns by the same speaker closer than this merge into one. */
const MERGE_GAP_MS = 2_000;

/** Window for verbatim duplicate suppression (recorder re-emit artefact). */
const DUPLICATE_WINDOW_MS = 10_000;

/** A speaker label longer than this is almost certainly a sentence. */
const MAX_SPEAKER_CHARS = 60;
const MAX_SPEAKER_WORDS = 6;

/** Fallback per-segment duration when nothing better is known. */
const DEFAULT_SEGMENT_MS = 4_000;

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------

/** `@0:00 - Speaker`, `@12:34 – Speaker`, `@1:23:45 - Speaker`. */
const TS_HEADER = /^@\s*(\d{1,3}:\d{2}(?::\d{2})?)\s*[-–—]\s*(.+?)\s*$/;

/** `[00:04:32] Speaker:` — an alternative export shape. */
const BRACKET_HEADER = /^\[\s*(\d{1,3}:\d{2}(?::\d{2})?)\s*\]\s*(.+?)\s*:\s*(.*)$/;

/**
 * `Vijay Chaurasia  0:09Good.` — the fourth grammar, and the one that made
 * uploaded transcripts useless.
 *
 * Fathom's .docx export puts the speaker, the timestamp and the first words of
 * the turn in ONE paragraph as separate runs, and `mammoth.extractRawText`
 * concatenates runs with no separator. The result matches no other rule here,
 * so a whole meeting collapsed into a single speakerless UNKNOWN segment —
 * silently destroying per-participant adherence in the Daily Huddle report.
 *
 * The name is validated by `looksLikeSpeaker`, so prose containing a clock time
 * ("let's meet at 4:30 tomorrow") cannot be mistaken for a turn header.
 */
const GLUED_HEADER = /^(.{1,60}?)\s+(\d{1,3}:\d{2}(?::\d{2})?)\s*(.*)$/;

/**
 * Recorder chrome that is not speech.
 *
 * `ACTION ITEM:` earns its place here from real data: Fathom injects
 * action-item markers INLINE, mid-turn, in its export —
 *
 *     @5:01 - Puja Barori
 *     Okay, so from my end, good morning everyone...
 *     ACTION ITEM: Note Reena's stuck re: Goals module tech error - WATCH
 *     No slugs reported from my end...
 *
 * "ACTION ITEM" passes every speaker heuristic (two words, both capitalised,
 * no sentence punctuation), so without this it becomes a speaker who never
 * spoke, with a fabricated timestamp. Dropping it loses nothing: Fathom's
 * action items are stored separately on `ClientMeetingTranscript.actionItems`.
 */
const CHROME = [
  /^view recording\b/i,
  /^\d+\s*mins?\b/i,
  /^no highlights\b/i,
  /^transcript\s*$/i,
  /^recording\s*$/i,
  /^action items?\s*[:\-]/i,
  /^action items?\s*$/i,
  /^\(?\s*(?:recording (?:started|stopped)|meeting (?:started|ended))\s*\)?\.?$/i,
];

/** Bracket-only noise: `[inaudible]`, `(music)`, `[crosstalk]`. */
const BRACKET_ONLY = /^[[(][^\])]*[\])][.\s]*$/;

/** Bot join/leave notices. */
const BOT_NOTICE =
  /^\s*\S.*\b(fathom|notetaker|otter|fireflies|recorder)\b.*\b(joined|left|is recording|has joined|has left)\b/i;

/**
 * Parse `m:ss` / `h:mm:ss` / a plain second count into milliseconds.
 * Returns null rather than 0 for unparseable input, so "missing" and
 * "at the very start" stay distinguishable.
 */
export function parseTimestampMs(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    // Heuristic: the recorder reports seconds; very large values are already ms.
    return value > 100_000 ? Math.round(value) : Math.round(value * 1000);
  }

  const t = value.trim();
  if (!t) return null;

  const parts = t.split(":");
  if (parts.length < 2 || parts.length > 3) {
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : null;
  }

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;

  const [a, b, c] = nums;
  const seconds = parts.length === 3 ? a * 3600 + b * 60 + c : a * 60 + b;
  return Math.round(seconds * 1000);
}

/**
 * Does `candidate` look like a speaker label rather than the start of a
 * sentence? Deliberately conservative: mistaking prose for a speaker splits a
 * turn and attributes words to a person who never said them, which is worse
 * than missing a speaker boundary.
 */
export function looksLikeSpeaker(candidate: string): boolean {
  const s = candidate.trim();
  if (!s || s.length > MAX_SPEAKER_CHARS) return false;

  const words = s.split(/\s+/);
  if (words.length > MAX_SPEAKER_WORDS) return false;

  // Sentence punctuation means prose, not a name.
  if (/[.!?,;]/.test(s.replace(/\.$/, ""))) return false;
  // Needs at least one letter; pure numbers/symbols are not names.
  if (!/[a-z]/i.test(s)) return false;

  // Capitalisation is the signal that separates a name from a sentence
  // fragment. "Yesterday's achievement was the following" carries no sentence
  // punctuation and is short enough to pass every other check, but four of its
  // words are lowercase function words — real labels look like "Augustine Vaz",
  // "Harjinder (Bobby) Kohli", "N Dharmadhikari". One lowercase word is
  // tolerated for particles ("van", "de", "bin").
  const lowercaseWords = words.filter((w) => {
    const first = w.replace(/^[^\p{L}]+/u, "")[0];
    return first !== undefined && first === first.toLowerCase() && /\p{L}/u.test(first);
  });
  if (lowercaseWords.length > 1) return false;

  return true;
}

interface Turn {
  startMs: number | null;
  speakerRaw: string;
  lines: string[];
}

// ---------------------------------------------------------------------------
// Grammar parsers
// ---------------------------------------------------------------------------

interface ParseResult {
  turns: Turn[];
  grammar: TranscriptGrammar;
  linesJoined: number;
  droppedNonContent: number;
}

function isChrome(line: string): boolean {
  return CHROME.some((re) => re.test(line)) || BOT_NOTICE.test(line);
}

/**
 * Remove headerless turns collected before the first speaker header, returning
 * how many lines were discarded.
 *
 * Only ever called once the transcript has proved it uses headers. In an
 * unlabelled transcript (grammar UNKNOWN) the same leading text IS the content
 * and is kept.
 */
function dropLeadingPreamble(turns: Turn[]): number {
  let dropped = 0;
  while (turns.length > 0 && turns[0].speakerRaw === "" && turns[0].startMs === null) {
    dropped += turns[0].lines.length;
    turns.shift();
  }
  return dropped;
}

function parseText(rawText: string): ParseResult {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");

  const turns: Turn[] = [];
  let linesJoined = 0;
  let droppedNonContent = 0;
  let sawTsHeader = false;
  let sawPrefix = false;
  let current: Turn | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      droppedNonContent += 1;
      continue;
    }
    if (isChrome(line) || BRACKET_ONLY.test(line)) {
      droppedNonContent += 1;
      continue;
    }

    // `@0:00 - Speaker`
    const ts = TS_HEADER.exec(line);
    if (ts && looksLikeSpeaker(ts[2])) {
      // The first header proves this is a timestamped transcript, which means
      // anything before it was preamble — the meeting title, an export banner —
      // and not speech. Left in place it becomes an untimed, speakerless
      // segment that drags the whole transcript's provenance to MIXED and
      // fabricates a turn nobody spoke.
      if (!sawTsHeader) droppedNonContent += dropLeadingPreamble(turns);
      sawTsHeader = true;
      current = { startMs: parseTimestampMs(ts[1]), speakerRaw: ts[2].trim(), lines: [] };
      turns.push(current);
      continue;
    }

    // `[00:04:32] Speaker: text`
    const br = BRACKET_HEADER.exec(line);
    if (br && looksLikeSpeaker(br[2])) {
      if (!sawTsHeader) droppedNonContent += dropLeadingPreamble(turns);
      sawTsHeader = true;
      current = { startMs: parseTimestampMs(br[1]), speakerRaw: br[2].trim(), lines: [] };
      turns.push(current);
      if (br[3]?.trim()) current.lines.push(br[3].trim());
      continue;
    }

    // `Speaker  0:09text` — Fathom .docx export, runs concatenated.
    const glued = GLUED_HEADER.exec(line);
    if (glued) {
      const name = glued[1].trim().replace(/:$/, "").trim();
      if (looksLikeSpeaker(name)) {
        if (!sawTsHeader) droppedNonContent += dropLeadingPreamble(turns);
        sawTsHeader = true;
        current = { startMs: parseTimestampMs(glued[2]), speakerRaw: name, lines: [] };
        turns.push(current);
        if (glued[3]?.trim()) current.lines.push(glued[3].trim());
        continue;
      }
    }

    // `Speaker: text` — only when the prefix genuinely looks like a name.
    const colon = line.indexOf(":");
    if (colon > 0 && colon <= MAX_SPEAKER_CHARS) {
      const maybeSpeaker = line.slice(0, colon);
      const rest = line.slice(colon + 1).trim();
      if (rest && looksLikeSpeaker(maybeSpeaker)) {
        sawPrefix = true;
        current = { startMs: null, speakerRaw: maybeSpeaker.trim(), lines: [rest] };
        turns.push(current);
        continue;
      }
    }

    // A continuation line belonging to the open turn.
    if (current) {
      current.lines.push(line);
      linesJoined += 1;
    } else {
      // Text before any speaker header — a title, or an unlabelled transcript.
      current = { startMs: null, speakerRaw: "", lines: [line] };
      turns.push(current);
    }
  }

  const grammar: TranscriptGrammar = sawTsHeader
    ? "TIMESTAMPED_HEADER"
    : sawPrefix
      ? "SPEAKER_PREFIX"
      : "UNKNOWN";

  return { turns, grammar, linesJoined, droppedNonContent };
}

function parseStructured(rows: RawSegmentInput[]): ParseResult {
  const turns: Turn[] = [];
  let droppedNonContent = 0;

  for (const row of rows) {
    const text = (row.text ?? "").trim();
    if (!text || BRACKET_ONLY.test(text)) {
      droppedNonContent += 1;
      continue;
    }
    turns.push({
      startMs: parseTimestampMs(row.timestamp),
      speakerRaw: (row.speaker ?? "").trim(),
      lines: [text],
    });
  }

  return { turns, grammar: "STRUCTURED", linesJoined: 0, droppedNonContent };
}

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

/**
 * Leading/trailing filler and stutter repeats.
 *
 * Deliberately conservative — it only touches the edges of a turn and repeated
 * adjacent words. Mid-sentence text is never rewritten, because evidence quotes
 * must substring-match the stored segment: over-cleaning would silently break
 * every quote verification downstream.
 */
const LEADING_FILLER =
  /^(?:(?:um|uh|erm|ah|eh|hmm|like|so|well|okay|ok|right|you know|i mean|sort of|kind of|basically|actually)[,\s]+)+/i;
const TRAILING_FILLER =
  /(?:[,\s]+(?:um|uh|erm|ah|eh|hmm|you know|i mean|right|okay|ok))+\s*$/i;

export function reduceFiller(text: string): string {
  let out = text.trim();
  out = out.replace(LEADING_FILLER, "");
  out = out.replace(TRAILING_FILLER, "");
  // Immediate word repeats: "the the", "I I", "we we".
  out = out.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");
  // Collapse runs of whitespace introduced by the removals.
  out = out.replace(/\s{2,}/g, " ").trim();
  // Never return empty: an all-filler turn keeps its original text so the
  // segment index stays dense and evidence offsets stay meaningful.
  return out || text.trim();
}

/** Normalised key for verbatim-duplicate detection. */
const dupeKey = (speaker: string, text: string): string =>
  `${speaker.toLowerCase()}|${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

interface TimedTurn extends Turn {
  text: string;
  resolvedStartMs: number;
  interpolated: boolean;
}

/**
 * Give every turn a start time.
 *
 * Three cases, in order of trustworthiness:
 *   · explicit and monotonic          → used as-is
 *   · explicit but out of order/absent → repaired by interpolating between the
 *                                        nearest known neighbours
 *   · none at all                      → spread across the meeting duration,
 *                                        weighted by text length, so a long
 *                                        turn occupies proportionally more of
 *                                        the timeline than a two-word reply
 *
 * Length-weighting matters for the coverage gate: a chunk covering 12 minutes
 * of dense discussion must outweigh one covering 30 seconds of greetings, and
 * an even spread would erase that distinction.
 */
function assignTimings(
  turns: { speakerRaw: string; text: string; startMs: number | null }[],
  totalMs: number | null,
): { timed: TimedTurn[]; interpolatedCount: number } {
  const n = turns.length;
  if (n === 0) return { timed: [], interpolatedCount: 0 };

  const known: (number | null)[] = turns.map((t) => t.startMs);

  // Explicit timings must be non-decreasing to be trusted.
  let lastGood = -1;
  for (let i = 0; i < n; i++) {
    const v = known[i];
    if (v === null) continue;
    if (v < lastGood) known[i] = null; // out of order — repair below
    else lastGood = v;
  }

  const anyKnown = known.some((v) => v !== null);
  const spanMs =
    totalMs && totalMs > 0
      ? totalMs
      : anyKnown
        ? (known.filter((v): v is number => v !== null).at(-1) ?? 0) + DEFAULT_SEGMENT_MS
        : n * DEFAULT_SEGMENT_MS;

  const resolved = new Array<number>(n);
  const interpolated = new Array<boolean>(n).fill(false);

  if (!anyKnown) {
    // Length-weighted spread across the whole meeting.
    const weights = turns.map((t) => Math.max(1, t.text.length));
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      resolved[i] = Math.round((acc / total) * spanMs);
      acc += weights[i];
      interpolated[i] = true;
    }
    return { timed: attach(turns, resolved, interpolated), interpolatedCount: n };
  }

  // Anchor on known points, interpolate the gaps between them.
  let count = 0;
  let prevIdx = -1;
  let prevMs = 0;

  for (let i = 0; i < n; i++) {
    if (known[i] !== null) {
      const cur = known[i] as number;
      if (i - prevIdx > 1) {
        const gapCount = i - prevIdx - 1;
        const step = (cur - prevMs) / (gapCount + 1);
        for (let k = 1; k <= gapCount; k++) {
          resolved[prevIdx + k] = Math.round(prevMs + step * k);
          interpolated[prevIdx + k] = true;
          count += 1;
        }
      }
      resolved[i] = cur;
      prevIdx = i;
      prevMs = cur;
    }
  }

  // Trailing turns after the last known timestamp.
  if (prevIdx < n - 1) {
    const remaining = n - 1 - prevIdx;
    const end = Math.max(spanMs, prevMs + remaining * DEFAULT_SEGMENT_MS);
    const step = (end - prevMs) / (remaining + 1);
    for (let k = 1; k <= remaining; k++) {
      resolved[prevIdx + k] = Math.round(prevMs + step * k);
      interpolated[prevIdx + k] = true;
      count += 1;
    }
  }

  return { timed: attach(turns, resolved, interpolated), interpolatedCount: count };
}

function attach(
  turns: { speakerRaw: string; text: string; startMs: number | null }[],
  resolved: number[],
  interpolated: boolean[],
): TimedTurn[] {
  return turns.map((t, i) => ({
    ...t,
    lines: [],
    resolvedStartMs: resolved[i],
    interpolated: interpolated[i],
  }));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Normalise a transcript into ordered speaker turns.
 *
 * Pure and deterministic: the same input always produces the same segments,
 * which is what lets `extractionIdempotencyKey` decide that re-extraction is
 * unnecessary.
 */
export function normalizeTranscript(input: NormalizeInput): NormalizedTranscript {
  const totalMs = resolveTotalMs(input);

  const parsed =
    input.rawSegments && input.rawSegments.length > 0
      ? parseStructured(input.rawSegments)
      : parseText(input.rawText ?? "");

  const inputLines = (input.rawText ?? "").replace(/\r\n/g, "\n").split("\n").length;

  // 1. Collapse each turn's lines into one text body.
  let fillerCharsRemoved = 0;
  const flattened = parsed.turns
    .map((t) => {
      const joined = t.lines.join(" ").replace(/\s{2,}/g, " ").trim();
      const cleaned = reduceFiller(joined);
      fillerCharsRemoved += Math.max(0, joined.length - cleaned.length);
      return { speakerRaw: t.speakerRaw, text: cleaned, startMs: t.startMs };
    })
    .filter((t) => t.text.length > 0);

  // 2. Merge adjacent same-speaker turns that are close together.
  const merged: typeof flattened = [];
  let turnsMerged = 0;
  for (const turn of flattened) {
    const prev = merged.at(-1);
    const closeEnough =
      prev &&
      prev.speakerRaw === turn.speakerRaw &&
      prev.startMs !== null &&
      turn.startMs !== null &&
      turn.startMs - prev.startMs <= MERGE_GAP_MS;

    // With no timings we still merge consecutive same-speaker turns, because
    // the API grammar emits one line per utterance and a speaker's consecutive
    // lines are one contribution.
    const noTimings = prev && prev.speakerRaw === turn.speakerRaw && prev.startMs === null && turn.startMs === null;

    if (closeEnough || noTimings) {
      prev.text = `${prev.text} ${turn.text}`.trim();
      turnsMerged += 1;
    } else {
      merged.push({ ...turn });
    }
  }

  // 3. Drop verbatim same-speaker repeats inside the dedupe window.
  const deduped: typeof merged = [];
  let droppedDuplicates = 0;
  const recent = new Map<string, number>();
  for (const turn of merged) {
    const key = dupeKey(turn.speakerRaw, turn.text);
    const at = turn.startMs;
    const seenAt = recent.get(key);
    const isRepeat =
      seenAt !== undefined && (at === null || Math.abs(at - seenAt) <= DUPLICATE_WINDOW_MS);
    if (isRepeat) {
      droppedDuplicates += 1;
      continue;
    }
    recent.set(key, at ?? 0);
    deduped.push(turn);
  }

  // 4. Timings.
  const { timed, interpolatedCount } = assignTimings(deduped, totalMs);

  // 5. Materialise segments; endMs is the next segment's start.
  const segments: NormalizedSegment[] = timed.map((t, i) => {
    const next = timed[i + 1];
    const endMs = next
      ? Math.max(t.resolvedStartMs, next.resolvedStartMs)
      : Math.max(t.resolvedStartMs + DEFAULT_SEGMENT_MS, totalMs ?? 0);
    return {
      idx: i,
      startMs: t.resolvedStartMs,
      endMs,
      speakerRaw: t.speakerRaw,
      text: t.text,
      charCount: t.text.length,
      estTokens: estimateTokens(t.text),
      timingInterpolated: t.interpolated,
    };
  });

  const explicit = segments.length - interpolatedCount;
  const timingSource: TimingSource =
    segments.length === 0
      ? "NONE"
      : interpolatedCount === 0
        ? "EXPLICIT"
        : explicit === 0
          ? totalMs
            ? "INTERPOLATED"
            : "NONE"
          : "MIXED";

  const contentMs =
    segments.length === 0
      ? 0
      : Math.max(0, (segments.at(-1)?.endMs ?? 0) - segments[0].startMs);

  return {
    segments,
    timingSource,
    contentMs,
    estTokens: segments.reduce((n, s) => n + s.estTokens, 0),
    stats: {
      inputLines,
      parsedTurns: parsed.turns.length,
      linesJoined: parsed.linesJoined,
      turnsMerged,
      droppedNonContent: parsed.droppedNonContent,
      droppedDuplicates,
      timingInterpolated: interpolatedCount,
      fillerCharsRemoved,
      distinctSpeakers: new Set(segments.map((s) => s.speakerRaw).filter(Boolean)).size,
      grammar: parsed.grammar,
    },
  };
}

function resolveTotalMs(input: NormalizeInput): number | null {
  if (input.durationMinutes && input.durationMinutes > 0) {
    return Math.round(input.durationMinutes * 60_000);
  }
  if (input.startedAt && input.endedAt) {
    const ms = input.endedAt.getTime() - input.startedAt.getTime();
    if (ms > 0) return ms;
  }
  return null;
}

/**
 * True when the normalisation is too damaged to report on confidently.
 *
 * Note what this deliberately does NOT flag: a fully interpolated transcript.
 * Grammar 2 has no timestamps by construction, so every segment is
 * interpolated and calling that "degraded" would mark every automatically
 * ingested transcript degraded and make the signal meaningless. DEGRADED is
 * reserved for timings that were PRESENT and BROKEN — genuine data damage.
 */
export function isDegraded(result: NormalizedTranscript): boolean {
  if (result.segments.length === 0) return true;
  if (result.timingSource !== "MIXED") return false;
  return result.stats.timingInterpolated / result.segments.length > 0.2;
}
