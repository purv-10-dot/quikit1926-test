/**
 * Robust paste-to-quiz parser.
 *
 * Accepts a free-form text block containing one or more multiple-choice
 * questions and converts it to the form-state shape used by QuizCreator.
 * The goal is to be liberal in what it accepts: question authors paste
 * questions in many different formats and the parser should recognise
 * the common ones without forcing the author to reformat.
 *
 * Recognised inputs (mix and match across questions):
 *   1. What is the capital of France?
 *   A) London
 *   B) Paris*
 *   C) Berlin
 *   D) Madrid
 *
 *   Q2. Pick the truthy values
 *      a. 1            [correct]
 *      b. 0
 *      c. "hello"      (correct)
 *      d. ""
 *
 *   Question 3: Is the sky blue?
 *   - True
 *   - False
 *   Answer: True
 *
 * Markers honoured:
 *   - Option labels: A./A)/(A)/A:/A-/1./1)/(1) and lower-case variants;
 *     plain bullets `-`, `*`, `•` if every option uses the same bullet
 *   - Correct answer markers (any of the following):
 *       trailing `*`,  trailing `[correct]` / `(correct)` / `[x]`,
 *       trailing `✓` / `✔`,  leading `*A)`,  or a separate
 *       `Answer:` / `Correct:` line referencing a letter or option text
 *   - Multi-select: more than one option flagged correct → returns an
 *     `Answer: B, D` line works too
 *   - True / False: exactly two options whose text reads as true/false
 *     are flipped to type 'True/False'
 *
 * Returns parsed questions plus a list of human-readable warnings the
 * caller can surface in the UI. The parser never throws — malformed
 * blocks become warnings so the author can fix the text and retry.
 */

export interface ParsedQuestion {
  text: string;
  type: 'MCQ' | 'True/False';
  options: string[];
  correctAnswerIndex: number | number[];
  isMultiSelect: boolean;
  warnings: string[];
}

export interface ParseResult {
  questions: ParsedQuestion[];
  /** Top-level warnings — e.g. "no questions found". */
  warnings: string[];
}

// ─── Pre-compiled regex ───────────────────────────────────────────────────

// Splits the input into per-question blocks.
const HARD_SEPARATOR = /^\s*(?:---+|===+|\*\*\*+|___+)\s*$/;

// Strips an optional question-number prefix from the question text.
// Matches: "Q1.", "Q 1:", "Question 1 -", "1.", "1)", "1:" at line start.
const QUESTION_PREFIX = /^(?:q(?:uestion)?\s*\d+|\d+)\s*[.):\-]?\s*/i;

// Lettered or numbered option label at the start of a line.
//   "A)", "A.", "A:", "A-", "(A)", lower-case, plus "1)", "1." etc.
// Capture group 1 = label letter or digit.
//
// LETTER_OPTION is the strict letter-only form — preferred when both letters
// and digits appear in the same block, because "1. What is …" at the top of
// a question would otherwise be misread as an option label.
const LETTER_OPTION  = /^\s*\(?([A-Za-z])\)?\s*[.):\-]\s+(.+)$/;
const DIGIT_OPTION   = /^\s*\(?([0-9]{1,2})\)?\s*[.):\-]\s+(.+)$/;
const LETTERED_OPTION = /^\s*\(?([A-Za-z]|[0-9]{1,2})\)?\s*[.):\-]\s+(.+)$/;

// A bare bullet (no letter) — only treated as an option marker if the
// whole block uses the same bullet for every option.
const BULLET_OPTION = /^\s*([-*•·●▪►])\s+(.+)$/;

// "Answer: B" / "Correct answer: Paris" / "Ans: A, D"
const ANSWER_LINE = /^\s*(?:correct\s*answer|correct|answer|ans|key)\s*[:\-]\s*(.+?)\s*$/i;

// Inline "this option is correct" markers — stripped from the option text.
const CORRECT_MARKERS: RegExp[] = [
  /\s*[\[(]\s*correct\s*[\])]\s*$/i,
  /\s*[\[(]\s*x\s*[\])]\s*$/i,
  /\s*\*+\s*$/, // trailing asterisks
  /\s*[✓✔]\s*$/,
];
const LEADING_CORRECT_STAR = /^\*+\s*/;

const TRUE_FALSE_WORDS = /^(true|false|yes|no|t|f)\.?$/i;

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Strip simple markdown emphasis so option text reads naturally. */
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** Normalise whitespace, smart quotes, and BOM characters. */
function normalise(raw: string): string {
  return raw
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/–|—/g, '-');
}

/** Remove a recognised option-correctness suffix and report whether one was present. */
function stripCorrectnessSuffix(text: string): { text: string; correct: boolean } {
  let t = text;
  let correct = false;
  for (const rx of CORRECT_MARKERS) {
    if (rx.test(t)) {
      correct = true;
      t = t.replace(rx, '');
    }
  }
  return { text: t.trim(), correct };
}

/** Convert a label letter/digit (e.g. "B" or "2") to a 0-based index. */
function labelToIndex(label: string): number | null {
  if (/^[A-Za-z]$/.test(label)) {
    return label.toUpperCase().charCodeAt(0) - 65;
  }
  if (/^\d+$/.test(label)) {
    const n = parseInt(label, 10);
    if (n >= 1 && n <= 26) return n - 1;
  }
  return null;
}

/**
 * Resolve an "Answer: …" payload to one or more option indices by either
 * matching label letters / numbers or looking up the option text.
 */
function resolveAnswers(payload: string, options: string[]): number[] {
  const out: number[] = [];
  // Split on commas, "and", "&", or whitespace between letters.
  const parts = payload.split(/\s*(?:,|\band\b|&|\/)\s*/i).map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    // Strip wrapping punctuation, like "(B)" → "B".
    const cleaned = part.replace(/^[\s(\[{"']+|[\s)\]}"'.]+$/g, '');
    const single = labelToIndex(cleaned);
    if (single !== null && single < options.length) {
      out.push(single);
      continue;
    }
    // Try a case-insensitive exact match against option text.
    const idx = options.findIndex(o => o.toLowerCase() === cleaned.toLowerCase());
    if (idx >= 0) {
      out.push(idx);
      continue;
    }
    // Loose substring match as a last resort.
    const loose = options.findIndex(o => o.toLowerCase().includes(cleaned.toLowerCase()) && cleaned.length >= 2);
    if (loose >= 0) out.push(loose);
  }
  return Array.from(new Set(out));
}

/**
 * Split the input into question-sized blocks. We use:
 *   1. Hard separators (`---`, `===`, etc.)
 *   2. Two or more consecutive blank lines
 *   3. A line that starts with a question prefix when one or more options
 *      have already been seen in the current block
 */
function splitIntoBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[][] = [];
  let current: string[] = [];
  let blankRun = 0;
  let optionsInCurrent = 0;

  const flush = () => {
    if (current.some(l => l.trim().length > 0)) blocks.push(current);
    current = [];
    optionsInCurrent = 0;
  };

  for (const raw of lines) {
    const line = raw;
    const trimmed = line.trim();

    if (HARD_SEPARATOR.test(line)) {
      flush();
      blankRun = 0;
      continue;
    }

    if (trimmed === '') {
      blankRun++;
      if (blankRun >= 2) {
        flush();
      } else {
        current.push(line);
      }
      continue;
    }
    const wasBlank = blankRun > 0;
    blankRun = 0;

    const looksLikeOption = LETTERED_OPTION.test(trimmed) || BULLET_OPTION.test(trimmed);
    const looksLikeAnswer = ANSWER_LINE.test(trimmed);
    const looksLikeQuestionPrefix = QUESTION_PREFIX.test(trimmed) && !looksLikeOption;

    // Soft-flush: once options have been collected, a *new* line that is
    // neither another option nor an Answer-line — especially preceded by a
    // blank line — almost certainly starts the next question.
    if (
      optionsInCurrent > 0 &&
      !looksLikeOption &&
      !looksLikeAnswer &&
      (looksLikeQuestionPrefix || wasBlank)
    ) {
      flush();
    }

    if (looksLikeOption) {
      optionsInCurrent++;
    }
    current.push(line);
  }
  flush();
  return blocks.map(b => b.join('\n'));
}

// ─── Per-block parser ─────────────────────────────────────────────────────

function parseBlock(block: string, indexInPaste: number): ParsedQuestion | null {
  const lines = block.split('\n').map(l => l.trimEnd());
  const warnings: string[] = [];

  // Phase 1: identify which lines are options vs. question / answer text.
  // We do TWO passes: first try lettered options; if we found at least 2,
  // use those; otherwise fall back to bullets (only when ALL non-question
  // lines share the same bullet character).
  type OptionEntry = { text: string; correct: boolean; lineIdx: number };

  // Try letter-labelled options first; only fall back to digit labels when
  // we can't find ≥2 letter-labelled lines. This prevents mistaking the
  // question's own "1." / "2." numbering for an option marker.
  const collect = (rx: RegExp): OptionEntry[] => {
    const acc: OptionEntry[] = [];
    let lastIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const m = trimmed.match(rx);
      if (!m) continue;
      const idx = labelToIndex(m[1]);
      if (idx === null) continue;
      // Reject backwards labels (A then A again, B then A, etc.) — those
      // tend to be unrelated text rather than the option list.
      if (idx <= lastIdx) continue;
      lastIdx = idx;
      acc.push({ text: m[2].trim(), correct: false, lineIdx: i });
    }
    return acc;
  };

  const tryLettered = (): OptionEntry[] | null => {
    const letters = collect(LETTER_OPTION);
    if (letters.length >= 2) return letters;
    const digits = collect(DIGIT_OPTION);
    return digits.length >= 2 ? digits : null;
  };

  const tryBullets = (): OptionEntry[] | null => {
    const candidates: { line: number; text: string; bullet: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const m = trimmed.match(BULLET_OPTION);
      if (m) candidates.push({ line: i, text: m[2].trim(), bullet: m[1] });
    }
    if (candidates.length < 2) return null;
    // Require all bullets identical so we don't accidentally treat a
    // bulleted list inside the question as the options.
    const firstBullet = candidates[0].bullet;
    if (!candidates.every(c => c.bullet === firstBullet)) return null;
    return candidates.map(c => ({ text: c.text, correct: false, lineIdx: c.line }));
  };

  let opts = tryLettered();
  if (!opts) opts = tryBullets();

  if (!opts || opts.length < 2) {
    return null; // can't recognise as a question
  }

  // Phase 2: question text = everything before the first option line, with
  // the question prefix stripped and leading "Q1." / "1." removed.
  const firstOptionLine = opts[0].lineIdx;
  let questionLines = lines
    .slice(0, firstOptionLine)
    .map(l => l.trim())
    .filter(l => l.length > 0);
  if (questionLines.length === 0) {
    return null;
  }
  // Drop a leading "Question N:" if it's on its own line.
  if (/^q(?:uestion)?\s*\d*\s*[:.\-]?\s*$/i.test(questionLines[0])) {
    questionLines = questionLines.slice(1);
  }
  const firstLine = questionLines[0]?.replace(QUESTION_PREFIX, '') ?? '';
  const questionText = stripMarkdown([firstLine, ...questionLines.slice(1)].join(' ')).trim();
  if (!questionText) return null;

  // Phase 3: extract correctness signals from each option text and clean up.
  for (const opt of opts) {
    let t = opt.text;
    if (LEADING_CORRECT_STAR.test(t)) {
      opt.correct = true;
      t = t.replace(LEADING_CORRECT_STAR, '');
    }
    const stripped = stripCorrectnessSuffix(t);
    if (stripped.correct) opt.correct = true;
    opt.text = stripMarkdown(stripped.text);
  }

  // Phase 4: handle a separate "Answer: X" line (anywhere after the last
  // option). External answer lines win over inline markers when both are
  // present and disagree.
  const lastOptionLine = opts[opts.length - 1].lineIdx;
  const tail = lines.slice(lastOptionLine + 1).map(l => l.trim()).filter(Boolean);
  const optTexts = opts.map(o => o.text);
  for (const line of tail) {
    const m = line.match(ANSWER_LINE);
    if (!m) continue;
    const indices = resolveAnswers(m[1], optTexts);
    if (indices.length > 0) {
      // External answer line is authoritative.
      opts.forEach((o, i) => { o.correct = indices.includes(i); });
    } else {
      warnings.push(`Question ${indexInPaste + 1}: could not match answer "${m[1]}" against the options.`);
    }
  }

  // Phase 5: build the final question object.
  const correctIdx: number[] = opts.map((o, i) => (o.correct ? i : -1)).filter(i => i >= 0);
  const isTrueFalse =
    opts.length === 2 &&
    opts.every(o => TRUE_FALSE_WORDS.test(o.text.trim()));

  const isMultiSelect = correctIdx.length > 1;
  if (correctIdx.length === 0) {
    warnings.push(`Question ${indexInPaste + 1}: no correct answer marked — defaulted to option A. Add a "*" or "Answer:" line to fix.`);
  }

  return {
    text: questionText,
    type: isTrueFalse ? 'True/False' : 'MCQ',
    options: opts.map(o => o.text),
    correctAnswerIndex: isMultiSelect
      ? correctIdx
      : (correctIdx[0] ?? 0),
    isMultiSelect,
    warnings,
  };
}

// ─── Public entry point ───────────────────────────────────────────────────

export function parseQuizPaste(raw: string): ParseResult {
  const text = normalise(raw);
  if (!text.trim()) {
    return { questions: [], warnings: ['Paste is empty.'] };
  }

  const blocks = splitIntoBlocks(text);
  const questions: ParsedQuestion[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const parsed = parseBlock(blocks[i], questions.length);
    if (parsed) {
      questions.push(parsed);
    } else if (blocks[i].trim().length > 0) {
      warnings.push(
        `Block ${i + 1} did not look like a question with at least 2 labelled options — skipped.`,
      );
    }
  }

  if (questions.length === 0 && warnings.length === 0) {
    warnings.push(
      'Could not detect any questions. Each question needs a question line followed by at least 2 options labelled A), B), C)... and a correct answer marked with "*", "[correct]", or an "Answer: …" line.',
    );
  }

  return { questions, warnings };
}
