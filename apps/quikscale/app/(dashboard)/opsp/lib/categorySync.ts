/**
 * Category synchronization — pure, framework-free comparison utility + service.
 *
 * The OPSP editor cascades categories downstream: Targets (3–5 yr) → Goals
 * (1 yr) → Actions (QTR). Appending brand-new categories and first-filling empty
 * downstream rows stays automatic (see `reconcileActionsWithGoals` +
 * `useOPSPForm`). What this module adds is the RENAME path: when a user
 * re-selects an already-synchronized category (a non-empty name that currently
 * exists downstream) to a different non-empty name, the downstream value is NOT
 * silently overwritten anymore — it is gated behind a confirmation flow.
 *
 * This file is the bottom two layers of that flow:
 *   - CategoryComparisonUtility — detect renames, find empty rows, dedupe.
 *   - CategorySyncService       — apply a confirmed replace / append-to-empty.
 *
 * Everything here is a pure function over plain arrays/rows so the rules are
 * unit-testable and reused unchanged for both cascade tiers (Goals & Actions).
 * Row value-cell resetting is delegated to a caller-supplied `resetRow` so the
 * util never needs to know a tier's period-cell shape (q1..q4 vs m1..m3).
 */

/** One synchronized-category rename requiring confirmation. */
export interface CategoryRename {
  /** The previously-selected (synchronized) category name. */
  oldName: string;
  /** The newly-selected category name. */
  newName: string;
  /** Source-row index the rename happened at (for stable ordering/labelling). */
  index: number;
}

/** A change that would create a duplicate downstream (blocked + warned). */
export interface CategoryDuplicate {
  /** The category name that already exists downstream. */
  name: string;
  /** Source-row index that attempted it. */
  index: number;
}

const norm = (s: string | undefined | null): string => (s ?? "").trim();

/* ══════════════════════════ CategoryComparisonUtility ══════════════════════════ */

/**
 * Result of classifying a source-category change against its downstream section.
 * The cascade is INDEX-ALIGNED: source row `i` maps to destination row `i`.
 */
export interface CascadePlan {
  /** Synchronized renames requiring a Replace confirmation. */
  renames: CategoryRename[];
  /** Changes blocked because the new name already exists elsewhere downstream. */
  duplicates: CategoryDuplicate[];
}

/**
 * Classify each changed source row against the INDEX-ALIGNED downstream row
 * (source row `i` ↔ destination row `i`) — reflecting an upstream category into
 * the same downstream position.
 *
 * For a changed source row `i` (old → new):
 *   - new is empty (clear): if the aligned row mirrored the old value it's a
 *     synced clear (auto — not returned here); otherwise nothing.
 *   - new already equals the aligned row → already reflected (nothing).
 *   - new already exists ELSEWHERE downstream → **duplicate** (block + warn; never
 *     create a second copy).
 *   - aligned row is EMPTY → first-fill (auto — not returned here).
 *   - aligned row is OCCUPIED by a different value → **rename** (confirm before
 *     overwriting it). `oldName` is the downstream value that would be replaced.
 *
 * Renames dedupe by old (downstream) name, duplicates by new name; both in order.
 * This decides only what needs confirmation/blocking; first-fill + synced-clear
 * are applied automatically by the caller.
 */
export function classifyCascade(
  prevSourceCats: readonly string[],
  curSourceCats: readonly string[],
  destCats: readonly string[],
): CascadePlan {
  const destSet = new Set(destCats.map(norm).filter(Boolean));
  const renames: CategoryRename[] = [];
  const duplicates: CategoryDuplicate[] = [];
  const seenRename = new Set<string>();
  const seenDup = new Set<string>();
  const len = Math.min(prevSourceCats.length, curSourceCats.length);
  for (let i = 0; i < len; i++) {
    const oldName = norm(prevSourceCats[i]);
    const newName = norm(curSourceCats[i]);
    if (oldName === newName) continue; // unchanged
    if (newName === "") continue; // clear → auto (synced-clear handled by caller)
    const destAtI = norm(destCats[i] ?? "");
    if (destAtI === newName) continue; // already reflected at this row
    // Duplicate guard: the incoming name already lives at ANOTHER downstream row.
    if (destSet.has(newName)) {
      if (!seenDup.has(newName)) {
        seenDup.add(newName);
        duplicates.push({ name: newName, index: i });
      }
      continue;
    }
    if (destAtI === "") continue; // first-fill empty aligned row → auto
    // Aligned row occupied by a different value → confirm before overwriting.
    if (!seenRename.has(destAtI)) {
      seenRename.add(destAtI);
      renames.push({ oldName: destAtI, newName, index: i });
    }
  }
  return { renames, duplicates };
}

/**
 * Advance the change-tracking baseline after a cascade run.
 *
 * Non-gated rows move to their CURRENT source value (they were applied,
 * first-filled, or cleared this run). GATED rows — a rename or duplicate deferred
 * to the confirmation flow — KEEP their previous baseline value so the pending
 * reflect stays "changed" and is re-detected by `classifyCascade` on the next
 * run, instead of latching silent when its modal is dismissed or superseded (the
 * `old === new` short-circuit would otherwise skip it forever). Confirming the
 * reflect writes the new value into the destination row, after which the
 * `destAtI === newName` "already reflected" check stops re-offering it.
 *
 * `cur` drives the length (the baseline mirrors the current source array).
 */
export function advanceBaseline(
  prev: readonly string[],
  cur: readonly string[],
  gated: ReadonlySet<number>,
): string[] {
  return cur.map((c, i) => (gated.has(i) ? (prev[i] ?? c) : c));
}

/** Indices of destination rows whose category is blank (candidate fill slots). */
export function emptyCategoryRowIndices(destCats: readonly string[]): number[] {
  const out: number[] = [];
  destCats.forEach((c, i) => {
    if (!norm(c)) out.push(i);
  });
  return out;
}

/**
 * The distinct, still-needed NEW names from a rename set that are NOT already
 * present downstream — the append-to-empty candidate list (dedupe/no-duplicate
 * rule). Preserves rename order.
 */
export function appendableNewNames(
  renames: readonly CategoryRename[],
  destCats: readonly string[],
): string[] {
  const present = new Set(destCats.map(norm).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of renames) {
    const name = norm(r.newName);
    if (!name || present.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/* ══════════════════════════ CategorySyncService ══════════════════════════ */

/** Result of a pure array transform — `changed` lets callers bail a re-render. */
export interface SyncResult<T> {
  rows: T[];
  changed: boolean;
}

/**
 * REFLECT flow (index-aligned): overwrite each rename's aligned destination row
 * (`rename.index`) with its `newName`, resetting that row's value cells via
 * `resetRow`. Other rows are untouched. Returns the SAME reference when nothing
 * changed. This is the confirmed "reflect Targets row i → Goals row i" apply.
 */
export function applyReflectAtIndices<T extends { category: string }>(
  destRows: readonly T[],
  renames: readonly CategoryRename[],
  resetRow: (row: T, newCategory: string) => T,
): SyncResult<T> {
  if (renames.length === 0) return { rows: destRows as T[], changed: false };
  const next = [...destRows];
  let changed = false;
  for (const r of renames) {
    if (r.index >= 0 && r.index < next.length) {
      next[r.index] = resetRow(next[r.index], r.newName);
      changed = true;
    }
  }
  return changed ? { rows: next, changed } : { rows: destRows as T[], changed: false };
}

/**
 * The 1-based destination row numbers `needed` categories would land in when
 * appending: existing EMPTY rows first (in order), then NEW rows grown at the
 * end (up to `maxRows`). Used to tell the user exactly where each name will go
 * ("row 6", "row 8 (new)"). Truncated when capacity runs out.
 */
export function appendPlacementRows(
  destCats: readonly string[],
  needed: number,
  maxRows: number,
): number[] {
  const empty = emptyCategoryRowIndices(destCats);
  const growSlots = Math.max(0, maxRows - destCats.length);
  const out: number[] = [];
  for (let k = 0; k < needed; k++) {
    if (k < empty.length) out.push(empty[k] + 1); // reuse an existing empty row
    else if (k < empty.length + growSlots) out.push(destCats.length + (k - empty.length) + 1); // grow
    else break; // no capacity left
  }
  return out;
}

/**
 * APPEND-OR-GROW flow: place `newNames` downstream by first FILLING empty rows,
 * then GROWING new rows at the end (via `makeEmptyRow`) up to `maxRows`. Names
 * already present downstream are skipped (no duplicates). Stops when the names,
 * the empty rows, and the grow capacity are all exhausted.
 *
 * Returns the transformed rows plus:
 *   - `filled`   — names that landed somewhere
 *   - `unfilled` — names with no room left (drives the "no slots" warning, which
 *                  now only triggers at the `maxRows` cap)
 */
export function applyAppendOrGrow<T extends { category: string }>(
  destRows: readonly T[],
  newNames: readonly string[],
  resetRow: (row: T, newCategory: string) => T,
  makeEmptyRow: () => T,
  maxRows: number,
): SyncResult<T> & { filled: string[]; unfilled: string[] } {
  const candidates = appendableNewNames(
    newNames.map((n, i) => ({ oldName: "", newName: n, index: i })),
    destRows.map((r) => r.category),
  );
  if (candidates.length === 0) {
    return { rows: destRows as T[], changed: false, filled: [], unfilled: [] };
  }
  const empty = emptyCategoryRowIndices(destRows.map((r) => r.category));
  const growSlots = Math.max(0, maxRows - destRows.length);
  const totalSlots = empty.length + growSlots;
  if (totalSlots === 0) {
    return { rows: destRows as T[], changed: false, filled: [], unfilled: candidates };
  }

  const rows = [...destRows];
  const filled: string[] = [];
  const fit = Math.min(candidates.length, totalSlots);
  for (let k = 0; k < fit; k++) {
    const name = candidates[k];
    if (k < empty.length) {
      rows[empty[k]] = resetRow(rows[empty[k]], name); // fill existing empty row
    } else {
      rows.push(resetRow(makeEmptyRow(), name)); // grow a new row
    }
    filled.push(name);
  }
  return { rows, changed: filled.length > 0, filled, unfilled: candidates.slice(fit) };
}
