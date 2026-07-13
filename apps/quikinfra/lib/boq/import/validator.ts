/**
 * Pipeline validator — runs AFTER hierarchy resolution, on the merged set of
 * normalised rows from all sheets.
 *
 * Per-row warnings are already attached by the adapters (negative qty,
 * missing description, depth capping, etc.). This module enforces
 * cross-row invariants:
 *
 *   - DUPLICATE_BOQ_NO_IN_CATEGORY: a (project, category, boqNo) tuple
 *     that appears more than once in the import. Hard error — the schema
 *     unique constraint would reject it anyway.
 *   - NO_VALID_ROWS: nothing left to import after parsing.
 *
 * It also rolls per-row warnings up into the top-level issue list so the
 * API can return one consolidated array.
 */

import type { NormalizedBoqRow, ImportIssue } from "./types";

export interface ValidationResult {
  rows: NormalizedBoqRow[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export function validateNormalizedRows(rows: NormalizedBoqRow[]): ValidationResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  // Roll per-row warnings up
  for (const r of rows) {
    for (const w of r.warnings) {
      if (w.severity === "error") errors.push(w);
      else warnings.push(w);
    }
  }

  // Duplicate detection scoped to (category, boqNo) — AAKAR spec rule V05.
  // Real-world BOQs often repeat the same short ref (`a.`, `1`, `2`) under
  // different parents, so hard-blocking imports on duplicates makes the
  // feature unusable. Instead we:
  //   1. auto-suffix the second occurrence with `_2`, then `_3`, …
  //   2. store the original as `rawBoqNo` so the audit trail is intact
  //   3. emit a non-blocking warning so the user sees which rows were renamed
  // The DB unique constraint (orgId, projectId, category, boqNo) is thus
  // satisfied without losing any data.
  const seen = new Map<string, number>(); // key → times-seen count
  const deduped: NormalizedBoqRow[] = [];
  for (const r of rows) {
    const originalKey = `${r.category}::${r.boqNo}`;
    const count = seen.get(originalKey) ?? 0;

    if (count === 0) {
      seen.set(originalKey, 1);
      deduped.push(r);
      continue;
    }

    // Already seen — synthesise a fresh suffix that isn't also taken.
    let suffix = count + 1;
    let candidate = `${r.boqNo}_${suffix}`;
    while (seen.has(`${r.category}::${candidate}`)) {
      suffix++;
      candidate = `${r.boqNo}_${suffix}`;
    }

    const originalBoqNo = r.boqNo;
    r.rawBoqNo = r.rawBoqNo ?? originalBoqNo;
    r.boqNo = candidate;

    seen.set(originalKey, count + 1);
    seen.set(`${r.category}::${candidate}`, 1);
    deduped.push(r);

    warnings.push({
      code: "DUPLICATE_BOQ_NO_IN_CATEGORY",
      severity: "warning",
      sheet: r.sourceSheet,
      rowNumber: r.sourceRowNumber,
      boqNo: candidate,
      message:
        `Duplicate BOQ No '${originalBoqNo}' in category '${r.category}' ` +
        `(row ${r.sourceRowNumber}) — renamed to '${candidate}' so it can be ` +
        `imported. The original value is kept in the audit trail.`,
    });
  }

  if (deduped.length === 0) {
    errors.push({
      code: "NO_VALID_ROWS",
      severity: "error",
      message:
        "After parsing, no valid BOQ rows were found. Check that the file " +
        "matches either the strict QuikInfra template or the generic " +
        "SOR BOQ format and that at least one sheet contains data.",
    });
  }

  return { rows: deduped, errors, warnings };
}
