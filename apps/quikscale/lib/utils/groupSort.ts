/**
 * Group-aware stable sort for the OPSP Review tables.
 *
 * The Quarter-view primary table is GROUPED: one category spans several period
 * sub-rows (April/May/June + an aggregate), all sharing a `rowIndex`. Sorting by
 * a column must reorder whole category GROUPS by a group-level value while
 * keeping each group's sub-rows contiguous and in their original intra-group
 * order. Flat tables (Yearly / 3–5yr / secondary) are the trivial case where
 * every group has exactly one row.
 *
 * Framework-free so the ranking rules are unit-testable in isolation.
 */

export type SortDir = "asc" | "desc";
export type SortPrimitive = number | string | null | undefined;

/** Empty string / null / undefined all rank as "no value" (sorted last). */
function isBlank(v: SortPrimitive): boolean {
  return v == null || v === "";
}

/** Compare two non-blank primitives. Numbers numerically; strings naturally
 *  (case-insensitive, numeric-aware so "10" > "2"). */
export function compareValues(a: SortPrimitive, b: SortPrimitive): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Reorder `rows` by their group's value.
 *
 * @param rows       flat row list (groups may be interleaved-free — grouping is
 *                   by `groupKey`, and rows of one group are assumed contiguous)
 * @param groupKey   stable group identifier for a row (e.g. `row.rowIndex`)
 * @param groupValue the value that ranks a whole group (caller picks the
 *                   representative row, e.g. the aggregate/cumulative row)
 * @param direction  asc | desc — blanks always sort LAST regardless
 *
 * Stable: groups with equal (or both-blank) values keep their original order.
 */
export function sortGroups<T>(
  rows: readonly T[],
  groupKey: (row: T) => string | number,
  groupValue: (groupRows: T[]) => SortPrimitive,
  direction: SortDir,
): T[] {
  if (rows.length === 0) return [];

  // Partition into groups, preserving first-seen group order + intra-group order.
  const groups = new Map<string | number, T[]>();
  for (const r of rows) {
    const k = groupKey(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const entries = [...groups.values()].map((gr, i) => ({ gr, i, v: groupValue(gr) }));

  entries.sort((a, b) => {
    const ab = isBlank(a.v);
    const bb = isBlank(b.v);
    if (ab && bb) return a.i - b.i; // both blank → original order
    if (ab) return 1; // blanks last
    if (bb) return -1;
    const c = compareValues(a.v, b.v);
    if (c !== 0) return direction === "asc" ? c : -c;
    return a.i - b.i; // stable tie-break
  });

  return entries.flatMap((e) => e.gr);
}
