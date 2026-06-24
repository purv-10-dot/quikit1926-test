/**
 * react-pdf hyphenation helper for the OPSP PDF (`OPSPDocument`).
 *
 * react-pdf calls a registered hyphenation callback once per word to decide
 * where it may break. Returning `[word]` means "never split" — which avoids
 * mid-word hyphenation of normal names (e.g. "Bhavya Lohana" → "Bhavya
 * Lo-/hana"). The downside: a long token with NO spaces (e.g. pasted gibberish)
 * then has no break opportunity, so it overflows its table cell horizontally
 * instead of wrapping.
 *
 * Fix: leave normal-length words unbroken, but split only PATHOLOGICALLY long
 * tokens into fixed-size chunks. react-pdf wraps between chunks (it does NOT
 * insert a hyphen for these parts), so a huge token wraps cleanly inside the
 * cell and the row grows vertically — exactly the desired behaviour.
 *
 * Pure (no react-pdf import) so it's unit-tested in isolation.
 */

/** Tokens up to this length are never split (covers virtually all real words). */
export const HYPHENATE_MAX_UNBROKEN = 15;
/** Chunk size a longer token is broken into so it fits a narrow cell. */
export const HYPHENATE_CHUNK = 12;

export function hyphenateWord(word: string): string[] {
  if (word.length <= HYPHENATE_MAX_UNBROKEN) return [word];
  const chunks: string[] = [];
  for (let i = 0; i < word.length; i += HYPHENATE_CHUNK) {
    chunks.push(word.slice(i, i + HYPHENATE_CHUNK));
  }
  return chunks;
}
