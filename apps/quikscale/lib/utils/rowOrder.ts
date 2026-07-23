/**
 * Pure helpers for manual (drag-to-reorder) ROW ordering, shared by the server
 * reorder util and the client DnD hook. Framework-free so the fractional-position
 * math and the neighbor mapping can be unit-tested in isolation.
 *
 * Rows are ordered ASCENDING by a Float `position` (top row = smallest). A drop
 * between two neighbors takes the midpoint of their positions, so inserts never
 * renumber the whole list. `position` is org-shared (everyone sees one order).
 */

/** Gap used when seeding / appending at an end. Matches the migration backfill. */
export const POSITION_STEP = 1000;

/**
 * Compute a new position for a row dropped between `before` (the row visually
 * above the drop slot, smaller position) and `after` (the row below, larger
 * position). Nulls mean "no neighbor on that side" (drop at the very top/bottom).
 */
export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return POSITION_STEP; // empty list
  if (before == null) return after! - POSITION_STEP;         // dropped at top
  if (after == null) return before + POSITION_STEP;          // dropped at bottom
  return (before + after) / 2;                               // between two rows
}

/**
 * True when the midpoint of two finite neighbor positions can no longer be
 * represented distinctly (float precision exhausted after many inserts in the
 * same gap). The caller should then renumber the affected list.
 */
export function needsRenumber(before: number | null, after: number | null): boolean {
  if (before == null || after == null) return false;
  const mid = (before + after) / 2;
  return !(mid > before && mid < after);
}

export interface RowNeighbors {
  beforeId: string | null;
  afterId: string | null;
}

/**
 * Map a drag ("move `fromId` to `side` of `toId`") against the currently
 * visible ordered row ids to the two neighbor ids that will sandwich the moved
 * row in the NEW order. The moved row is excluded from the neighbor search.
 * Returns null for a no-op (same row, unknown target).
 */
export function rowNeighbors(
  orderedIds: readonly string[],
  fromId: string,
  toId: string,
  side: "before" | "after",
): RowNeighbors | null {
  if (fromId === toId) return null;
  const arr = orderedIds.filter((id) => id !== fromId);
  const idx = arr.indexOf(toId);
  if (idx === -1) return null;
  if (side === "before") {
    return { beforeId: arr[idx - 1] ?? null, afterId: toId };
  }
  return { beforeId: toId, afterId: arr[idx + 1] ?? null };
}
