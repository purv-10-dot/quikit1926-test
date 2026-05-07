/**
 * Hierarchy resolver — assign parentBoqNo + sortOrder to a list of normalised rows.
 *
 * Algorithm: prefix-first, stack-fallback.
 *
 * 1. Group rows by category (parents NEVER cross categories).
 * 2. For each category, walk rows in source order and maintain a parent
 *    stack indexed by depth.
 * 3. For each row at depth D, the candidate parent is the prefix-derived
 *    parent (e.g. "1.2.3" → "1.2").
 *      - If that prefix exists earlier in the same category, use it.
 *      - Otherwise fall back to the row currently sitting at depth D-1
 *        in the parent stack.
 * 4. Push the current row onto the stack at index D and trim deeper.
 *
 * Why both? Many real BOQs have non-contiguous numbering (e.g. "1.2.5"
 * exists but "1.2.3" doesn't). Pure stack walks lose the prefix link;
 * pure prefix lookup loses rows that use letter suffixes ("1.2a")
 * or out-of-order entries.
 *
 * SortOrder is assigned globally across all categories so the BOQ tree
 * renders in the order the user uploaded it.
 */

import type { NormalizedBoqRow, ImportIssue } from "./types";
import { prefixParent } from "./cell-utils";

export interface HierarchyResult {
  rows: NormalizedBoqRow[];
  issues: ImportIssue[];
}

export function resolveHierarchy(rows: NormalizedBoqRow[]): HierarchyResult {
  const issues: ImportIssue[] = [];
  if (rows.length === 0) return { rows: [], issues };

  // Build per-category buckets — preserve insertion order
  const byCategory = new Map<string, NormalizedBoqRow[]>();
  for (const r of rows) {
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }

  let globalSortOrder = 0;
  const out: NormalizedBoqRow[] = [];

  byCategory.forEach((catRows, category) => {
    // Build a quick lookup of boqNo → row for prefix matching
    const refIndex = new Map<string, NormalizedBoqRow>();
    for (const r of catRows) refIndex.set(r.boqNo, r);

    const parentStack: string[] = []; // index = depth, value = boqNo

    for (const row of catRows) {
      const depth = row.depth;

      let parent: string | null = null;

      // 1) Prefix-first
      const pp = prefixParent(row.boqNo);
      if (pp && refIndex.has(pp) && pp !== row.boqNo) {
        parent = pp;
      }

      // 2) Stack-fallback (only if prefix didn't resolve)
      // IMPORTANT: only adopt a stack ancestor if it's an actual prefix of
      // the current boqNo. Without this guard, a row like `A.8.A.1` whose
      // own prefix `A.8.A` isn't in the data would grab `A.7.1` from the
      // stack at depth 2 — so the entire A.8 branch ends up nested under
      // A.7. A true prefix guarantees the fallback picks a genuine ancestor.
      if (!parent && depth > 0) {
        for (let d = depth - 1; d >= 0; d--) {
          const candidate = parentStack[d];
          if (!candidate) continue;
          if (
            row.boqNo.startsWith(candidate + ".") ||
            row.boqNo.startsWith(candidate + "-") ||
            row.boqNo.startsWith(candidate + "/")
          ) {
            parent = candidate;
            break;
          }
          // Not a prefix — keep walking up the stack (don't bridge branches).
        }
      }

      // 3) Orphan check — depth > 0 but no parent ever resolved
      if (depth > 0 && !parent) {
        issues.push({
          code: "ORPHAN_NODE",
          severity: "warning",
          sheet: row.sourceSheet,
          rowNumber: row.sourceRowNumber,
          boqNo: row.boqNo,
          message:
            `Item '${row.boqNo}' has depth ${depth} but no parent could be ` +
            `resolved (prefix '${pp ?? "n/a"}' not found and stack empty). ` +
            `Imported as a top-level item.`,
        });
      }

      row.parentBoqNo = parent;
      row.sortOrder = ++globalSortOrder;

      // Update parent stack
      parentStack[depth] = row.boqNo;
      parentStack.length = depth + 1; // trim deeper entries

      out.push(row);
    }

    void category;
  });

  return { rows: out, issues };
}
