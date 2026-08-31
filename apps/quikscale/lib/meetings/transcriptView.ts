/**
 * Transcript formatting for HUMAN DISPLAY — the viewer, the .txt download and
 * the .docx export.
 *
 * WHY THIS IS NOT `normalize.ts`
 * ------------------------------
 * `normalize.ts` prepares transcripts for the MODEL: it drops recorder chrome,
 * removes fillers, merges turns and de-duplicates repeats. Every one of those
 * is correct for extraction and wrong for a person reading the meeting — a
 * user who opens a transcript must see what was said, not a cleaned derivative.
 * So this module is deliberately separate and deliberately FAITHFUL: it
 * re-shapes lines into turns and drops nothing said in the meeting — only the
 * recorder's own export banner and the preamble ahead of the first speaker (see
 * `dropLeadingPreamble`). Anything it cannot parse survives verbatim as an
 * unattributed turn.
 *
 * GRAMMARS
 * --------
 * Four shapes reach us, and until now the viewer rendered all of them as one
 * undifferentiated blob:
 *
 *   1. STRUCTURED       `rawSegments` — {speaker, text, timestamp}. Best case:
 *                       real per-turn timings straight from the Fathom API.
 *   2. TS_HEADER        `@0:00 - Speaker`   (Fathom UI export)
 *   3. BRACKET          `[00:04:32] Speaker: text`
 *   4. PREFIX           `Speaker: text`     (Fathom API, flattened)
 *   5. GLUED            `Vijay Chaurasia  0:09Good.`
 *                       Fathom's .docx export puts the speaker, the timestamp
 *                       and the first words in ONE paragraph, and mammoth's
 *                       raw-text extraction concatenates the runs with no
 *                       separator. This is what made uploaded transcripts
 *                       unreadable, and — because `normalize.ts` didn't know it
 *                       either — collapsed a whole meeting into a single
 *                       speakerless segment.
 *
 * KEEP THIS MODULE DEPENDENCY-FREE (beyond `./normalize`)
 * -------------------------------------------------------
 * `apps/quikflow/scripts/fathom-parity-report.ts` imports this by relative path
 * so its "what the screen shows" column calls the REAL render functions rather
 * than a reimplementation that could quietly disagree. Adding a `@/`-aliased,
 * React or Prisma import here breaks that script.
 */
import { looksLikeSpeaker, parseTimestampMs } from "./normalize";

/** One rendered turn. `speaker`/`time` are null when the source didn't give one. */
export interface DisplayTurn {
  speaker: string | null;
  /** Display form, `m:ss` or `h:mm:ss`. */
  time: string | null;
  text: string;
}

export interface DisplaySegmentInput {
  speaker?: string | null;
  text?: string | null;
  timestamp?: number | string | null;
}

/** Recorder chrome we hide from the viewer's turn list (kept out of turns only,
 * never removed from the stored source). */
const EXPORT_BANNER = /^(?:.*-Meeting Recording|\d+m\s?\d*s?|VIEW RECORDING.*)$/i;

const TS_HEADER = /^@\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(.+)$/;
const BRACKET_HEADER = /^\[\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\]\s*([^:]{1,60}?)\s*:\s*(.*)$/;
/**
 * `Name  0:09Text` / `Name 0:09 Text`. The name is bounded and validated by
 * `looksLikeSpeaker` so prose that happens to contain a clock time
 * ("call at 4:30 tomorrow") can't be mistaken for a turn header.
 */
const GLUED_HEADER = /^(.{1,60}?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(.*)$/;

/** Seconds → `m:ss` / `h:mm:ss`, the form Fathom itself shows. */
export function formatClock(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Structured segments → turns. Preferred whenever `rawSegments` exists. */
export function segmentsToTurns(rows: DisplaySegmentInput[]): DisplayTurn[] {
  const turns: DisplayTurn[] = [];
  for (const row of rows) {
    const text = (row?.text ?? "").trim();
    if (!text) continue;
    turns.push({
      speaker: (row?.speaker ?? "")?.toString().trim() || null,
      time: formatClock(parseTimestampMs(row?.timestamp ?? null)),
      text,
    });
  }
  return turns;
}

/** Raw transcript text → turns, across all four text grammars. */
export function textToTurns(rawText: string): DisplayTurn[] {
  const turns: DisplayTurn[] = [];
  // An index rather than a reference: the open turn is mutated in place when a
  // continuation line arrives, and -1 means "no turn is open".
  let openIdx = -1;

  const push = (turn: DisplayTurn) => {
    openIdx = turns.push(turn) - 1;
  };

  for (const rawLine of rawText.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      // A blank line ends the open turn so the next prose block doesn't get
      // glued onto the previous speaker.
      openIdx = -1;
      continue;
    }
    if (EXPORT_BANNER.test(line)) {
      openIdx = -1;
      continue;
    }

    const ts = TS_HEADER.exec(line);
    if (ts && looksLikeSpeaker(ts[2])) {
      push({ speaker: ts[2].trim(), time: normalizeClock(ts[1]), text: "" });
      continue;
    }

    const br = BRACKET_HEADER.exec(line);
    if (br && looksLikeSpeaker(br[2])) {
      push({ speaker: br[2].trim(), time: normalizeClock(br[1]), text: (br[3] ?? "").trim() });
      continue;
    }

    const glued = GLUED_HEADER.exec(line);
    if (glued) {
      // `Speaker: 0:09 text` is the same grammar with a colon after the name.
      const name = glued[1].trim().replace(/:$/, "").trim();
      if (looksLikeSpeaker(name)) {
        push({ speaker: name, time: normalizeClock(glued[2]), text: (glued[3] ?? "").trim() });
        continue;
      }
    }

    const colon = line.indexOf(":");
    if (colon > 0 && colon <= 60) {
      const maybeSpeaker = line.slice(0, colon);
      const rest = line.slice(colon + 1).trim();
      if (rest && looksLikeSpeaker(maybeSpeaker)) {
        push({ speaker: maybeSpeaker.trim(), time: null, text: rest });
        continue;
      }
    }

    if (openIdx >= 0) {
      const open = turns[openIdx];
      open.text = open.text ? `${open.text}\n${line}` : line;
    } else {
      push({ speaker: null, time: null, text: line });
    }
  }

  return dropLeadingPreamble(
    turns
      .filter((t) => t.text.trim() || t.speaker)
      .map((t) => ({ ...t, text: respaceGluedSentences(t.text) })),
  );
}

/**
 * Drop the unattributed lines that precede the first real speaker turn.
 *
 * Only applied once the transcript has PROVED it labels speakers, exactly as
 * `normalize.ts` does. In that case those leading lines are export chrome — the
 * "…-Meeting Recording" banner, the date stamp, the duration — and rendering
 * them as speech puts three junk turns at the top of every uploaded transcript.
 * In an unlabelled transcript the same leading text IS the content, so it stays.
 */
function dropLeadingPreamble(turns: DisplayTurn[]): DisplayTurn[] {
  const first = turns.findIndex((t) => t.speaker);
  return first > 0 ? turns.slice(first) : turns;
}

/**
 * Re-space a sentence boundary the .docx export glued shut: `Okay.Actually, I'm
 * driving` → `Okay. Actually, I'm driving`.
 *
 * Same root cause as `GLUED_HEADER` — adjacent runs concatenated with no
 * separator — but inside a turn rather than at its head. Deliberately narrow:
 * it fires only on `.`/`?`/`!` sitting between a LOWERCASE letter and an
 * UPPERCASE one, which spares initialisms ("U.S.A."), decimals ("3.5x") and
 * domains ("fathom.Video" is not a thing). It inserts a space and never
 * removes, reorders or rewrites a character, so nothing said is altered.
 *
 * DISPLAY ONLY. `normalize.ts` must not do this: evidence quotes have to
 * substring-match the stored segment text.
 */
export function respaceGluedSentences(text: string): string {
  return text.replace(/([a-z])([.?!])([A-Z])/g, "$1$2 $3");
}

/** `0:09` / `00:04:32` → the canonical display form (drops a leading `00:`). */
function normalizeClock(value: string): string | null {
  return formatClock(parseTimestampMs(value));
}

/**
 * The single entry point: structured segments when we have them, parsed text
 * otherwise, and — if neither yields a turn — the raw text as one block so the
 * viewer NEVER shows less than what is stored.
 */
export function buildTranscriptTurns(input: {
  rawText?: string | null;
  rawSegments?: DisplaySegmentInput[] | null;
}): DisplayTurn[] {
  if (Array.isArray(input.rawSegments) && input.rawSegments.length > 0) {
    const turns = segmentsToTurns(input.rawSegments);
    if (turns.length > 0) return turns;
  }
  const raw = (input.rawText ?? "").trim();
  if (!raw) return [];
  const turns = textToTurns(raw);
  return turns.length > 0 ? turns : [{ speaker: null, time: null, text: raw }];
}

/**
 * Turns → plain text, one blank-line-separated block per turn. Shared by the
 * .txt download and the .docx export so all three surfaces render the same
 * transcript.
 */
export function turnsToPlainText(turns: DisplayTurn[]): string {
  return turns
    .map((t) => {
      const head = [t.speaker, t.time].filter(Boolean).join("  ");
      return head ? `${head}\n${t.text}` : t.text;
    })
    .join("\n\n");
}
