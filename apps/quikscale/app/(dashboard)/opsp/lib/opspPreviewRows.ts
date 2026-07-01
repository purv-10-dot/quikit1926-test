/**
 * Pure row helpers for the OPSP on-screen preview (OPSPDocument).
 *
 * `padRows` guarantees a list renders at least `min` ruled rows. It backs the
 * Strengths / Core Competencies and Weaknesses lists so their underlines show
 * even on an empty or inherited quarter — previously those lists were filtered
 * to non-empty values, so an empty quarter rendered zero rows (no lines).
 *
 * Unlike a fixed-size pad (see `padTo` in OPSPDocument, which is for the
 * always-three People rows and TRUNCATES), `padRows` never drops values: a list
 * longer than `min` is returned intact. Non-string slots are coerced to "".
 */
export function padRows(list: unknown, min: number): string[] {
  const arr = Array.isArray(list) ? list : [];
  const out = arr.map((v) => (typeof v === "string" ? v : ""));
  while (out.length < min) out.push("");
  return out;
}
