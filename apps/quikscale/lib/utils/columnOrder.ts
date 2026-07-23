/**
 * Pure column-ordering helpers shared by every QuikScale data grid.
 *
 * Kept framework-free (no React) so the reorder math and the freeze
 * boundary-crossing detection can be unit-tested in isolation. The React
 * wiring lives in `lib/hooks/useColumnOrder.ts` and `lib/hooks/useColumnDnD.tsx`.
 */

/**
 * Merge a user's saved drag order with the table's current default order.
 *
 * - Saved keys that still exist in `defaultOrder` are kept in the user's order.
 * - Keys the user saved that no longer exist (removed columns) are pruned.
 * - Columns present in `defaultOrder` but missing from the saved order (newly
 *   added columns) are **appended at the end**, preserving their relative
 *   default order among themselves.
 *
 * This is what makes a saved layout forward-compatible: shipping a new column
 * never breaks an existing user's arrangement — the new column just shows up
 * at the end until they move it.
 */
export function computeEffectiveOrder(
  defaultOrder: readonly string[],
  savedOrder: readonly string[] | null | undefined,
): string[] {
  const defaultSet = new Set(defaultOrder);
  const seen = new Set<string>();
  const result: string[] = [];

  // Defensive: `savedOrder` can be undefined/null when preferences haven't
  // loaded yet (e.g. before the /api/settings/table-preferences fetch resolves,
  // or in tests that don't stub it) — treat that as "no saved order".
  for (const key of Array.isArray(savedOrder) ? savedOrder : []) {
    if (defaultSet.has(key) && !seen.has(key)) {
      result.push(key);
      seen.add(key);
    }
  }
  for (const key of defaultOrder) {
    if (!seen.has(key)) {
      result.push(key);
      seen.add(key);
    }
  }
  return result;
}

/** Move the item at `from` to index `to`, returning a new array. Out-of-range
 *  or no-op moves return a shallow copy unchanged. */
export function moveItem(order: readonly string[], from: number, to: number): string[] {
  const next = order.slice();
  if (
    from === to ||
    from < 0 || from >= next.length ||
    to < 0 || to >= next.length
  ) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Move column `fromKey` so it lands relative to `toKey`.
 * `side` decides whether it drops before or after the target.
 */
export function moveByKey(
  order: readonly string[],
  fromKey: string,
  toKey: string,
  side: "before" | "after" = "before",
): string[] {
  const from = order.indexOf(fromKey);
  const targetIdx = order.indexOf(toKey);
  if (from < 0 || targetIdx < 0 || fromKey === toKey) return order.slice();

  const without = order.slice();
  without.splice(from, 1);

  // Recompute target index inside the array that no longer contains fromKey.
  let insertAt = without.indexOf(toKey);
  if (side === "after") insertAt += 1;

  const next = without.slice();
  next.splice(insertAt, 0, fromKey);
  return next;
}

/**
 * The set of frozen columns for a given order under the single-boundary freeze
 * model: every column up to and including `frozenColKey` is frozen, plus any
 * `alwaysFrozen` rail columns (checkbox / log / id).
 */
export function frozenColumns(
  order: readonly string[],
  frozenColKey: string | null,
  alwaysFrozen: readonly string[] = [],
): Set<string> {
  const set = new Set<string>(alwaysFrozen);
  if (frozenColKey) {
    const boundaryIdx = order.indexOf(frozenColKey);
    if (boundaryIdx >= 0) {
      for (let i = 0; i <= boundaryIdx; i++) set.add(order[i]);
    }
  }
  return set;
}

/**
 * Columns that would transition from frozen → unfrozen if the order changes
 * from `oldOrder` to `newOrder` (the freeze boundary key itself is unchanged —
 * it just moves with the reorder). Rail (`alwaysFrozen`) columns never count,
 * they can't be unfrozen.
 *
 * A non-empty result is the trigger for the "are you sure you want to unfreeze"
 * confirmation before committing a drag.
 */
export function columnsUnfrozenBy(
  oldOrder: readonly string[],
  newOrder: readonly string[],
  frozenColKey: string | null,
  alwaysFrozen: readonly string[] = [],
): string[] {
  if (!frozenColKey) return [];
  const before = frozenColumns(oldOrder, frozenColKey, alwaysFrozen);
  const after = frozenColumns(newOrder, frozenColKey, alwaysFrozen);
  const always = new Set(alwaysFrozen);
  const result: string[] = [];
  for (const col of before) {
    if (!after.has(col) && !always.has(col)) result.push(col);
  }
  return result;
}

/**
 * Columns that would transition from unfrozen → frozen if the order changes
 * from `oldOrder` to `newOrder` (the freeze boundary key itself is unchanged —
 * it just moves with the reorder). The mirror image of `columnsUnfrozenBy`:
 * these are the columns dragged INTO the frozen (pinned) region. Rail
 * (`alwaysFrozen`) columns are excluded — they're always frozen, so they can
 * never *become* frozen.
 *
 * A non-empty result is the trigger for the "are you sure you want to freeze"
 * confirmation before committing a drag.
 */
export function columnsFrozenBy(
  oldOrder: readonly string[],
  newOrder: readonly string[],
  frozenColKey: string | null,
  alwaysFrozen: readonly string[] = [],
): string[] {
  if (!frozenColKey) return [];
  const before = frozenColumns(oldOrder, frozenColKey, alwaysFrozen);
  const after = frozenColumns(newOrder, frozenColKey, alwaysFrozen);
  const always = new Set(alwaysFrozen);
  const result: string[] = [];
  for (const col of after) {
    if (!before.has(col) && !always.has(col)) result.push(col);
  }
  return result;
}
