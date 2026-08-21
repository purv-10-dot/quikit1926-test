/**
 * Pure text-manipulation helpers for the TQL editor's autocomplete — finding
 * the word under the cursor and replacing it, independent of React/DOM so
 * they're trivial to unit test.
 */
export interface WordAtCursor {
  word: string;
  start: number;
  end: number;
}

// A "word" here is deliberately narrow: letters/digits/underscore only. This
// intentionally excludes quoted strings, operators, and cf[...] brackets —
// autocomplete only ever targets a bare field-name-shaped token, matching
// where NATIVE_FIELD_SUGGESTIONS/customFieldSuggestion actually apply.
const WORD_CHAR = /[A-Za-z0-9_]/;

export function wordAtCursor(text: string, cursor: number): WordAtCursor {
  let start = cursor;
  while (start > 0 && WORD_CHAR.test(text[start - 1]!)) start--;
  let end = cursor;
  while (end < text.length && WORD_CHAR.test(text[end]!)) end++;
  return { word: text.slice(start, end), start, end };
}

/** Replace the word at `start..end` with `replacement`, returning the new
 *  text and the cursor position to place after (end of the inserted text). */
export function replaceWord(
  text: string,
  start: number,
  end: number,
  replacement: string,
): { text: string; cursor: number } {
  const next = text.slice(0, start) + replacement + text.slice(end);
  return { text: next, cursor: start + replacement.length };
}
