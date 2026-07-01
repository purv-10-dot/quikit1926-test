/**
 * OPSP Review row-visibility helper.
 *
 * Lives in its own module (not the `page.tsx`, which Next.js forbids extra
 * named exports from) so it can be shared by the Review page and unit-tested.
 *
 * A category row appears in the Review only when it's COMPLETE — it has BOTH a
 * category AND a Projected value. Rows with a category but no Projected (and
 * fully-empty rows) are incomplete plan data and were leaking into the Review
 * as dash-only entries; this filter keeps them out. Display-only: rows are
 * still keyed by `rowIndex`, so saved achieved-values stay aligned.
 */
export function reviewRowVisible(row: { category: string; projected: string }): boolean {
  return row.category.trim() !== "" && row.projected.trim() !== "";
}
