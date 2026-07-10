/**
 * Pure row-count logic for the OPSP preview's Category/Projected tables
 * (`CatProjTable` in OPSPDocument.tsx). Kept out of OPSPDocument so it can be
 * unit-tested without importing the heavy `@react-pdf/renderer` runtime.
 */

export interface CatProjRow {
  category: string;
  projected: string;
}

const blankRow = (): CatProjRow => ({ category: "", projected: "" });

/**
 * Decide which rows the preview renders for a Category/Projected table.
 *
 * - Keeps only rows that have a category (drops empty placeholder rows), capped
 *   at `maxRows`.
 * - Grows the table to at least `minRows` by appending blank padding rows, but
 *   never beyond `maxRows`.
 *
 * So with `{ minRows: 6, maxRows: 10 }` (the ACTIONS (QTR) config):
 *   - 4 filled  → 6 rows (4 filled + 2 blank)
 *   - 8 filled  → 8 rows (no padding)
 *   - 10 filled → 10 rows
 *   - 12 filled → 10 rows (capped)
 *   - 0 filled  → 6 blank rows
 *
 * With the default `{ minRows: 0 }` (Targets / Goals) the result is exactly the
 * previous `rows.filter(hasCategory).slice(0, maxRows)` behaviour — no padding.
 *
 * Padding rows have an empty `category`, so callers can distinguish them from
 * filled rows when rendering (blank cells vs. real data / "—").
 */
export function computeCatProjRows(
  rows: CatProjRow[],
  opts?: { minRows?: number; maxRows?: number },
): CatProjRow[] {
  const minRows = Math.max(0, opts?.minRows ?? 0);
  const maxRows = Math.max(0, opts?.maxRows ?? 6);

  const filled = (rows ?? [])
    .filter((r) => r.category && r.category.trim())
    .slice(0, maxRows);

  const displayCount = Math.min(maxRows, Math.max(minRows, filled.length));

  const out = filled.slice(0, displayCount);
  while (out.length < displayCount) out.push(blankRow());
  return out;
}
