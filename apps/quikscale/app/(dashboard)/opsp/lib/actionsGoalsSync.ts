/**
 * Goals (1 YR.) → Actions (QTR) reconciliation — pure, framework-free.
 *
 * Extracted from the cascade effect in `hooks/useOPSPForm.ts` so the row-sync
 * rules are unit-testable and unambiguous.
 *
 * Semantics ("auto-fill, allow extra"):
 *   - GROW only: ensure every Goal has a matching Action row (capped at
 *     `maxRows`). Never SHRINK — the user may have added independent Action
 *     rows via "Add New", and removing/clearing a Goal must not delete them.
 *   - CHANGE-driven category auto-fill for the OVERLAPPING rows only: copy a
 *     Goal's category into its matching Action row ONLY when the user actually
 *     edited that Goal category (i.e. it differs from `prevGoalCats[i]`),
 *     resetting that row's projected + month cells so stale values don't strand
 *     against an out-of-date category. A row whose Goal category is UNCHANGED
 *     is left alone even if the Action category differs — so an Action row the
 *     user cleared downstream is never re-seeded from an unchanged Goal.
 *     Action rows beyond the Goals count keep their own categories.
 *
 * `prevGoalCats` is the category snapshot from the previous reconcile. Pass an
 * empty array on first run — every non-empty Goal category then reads as a
 * change and seeds its Action row (the original first-fill behavior).
 *
 * Returns the SAME `actionsQtr` reference when nothing changed (so the caller's
 * `setForm` can bail out of a re-render), or a new array when it did.
 */
import type { ActionRow } from "../types";

const emptyActionRow = (): ActionRow => ({
  category: "",
  projected: "",
  m1: "",
  m2: "",
  m3: "",
});

export function reconcileActionsWithGoals(
  goalRows: ReadonlyArray<{ category: string }>,
  actionsQtr: ActionRow[],
  maxRows: number,
  prevGoalCats: ReadonlyArray<string> = [],
  /**
   * Overlapping-row indices whose category auto-fill must be SKIPPED — used to
   * defer a synchronized-category rename to the confirmation flow while still
   * applying the grow-only length sync + every other row's auto-fill. Empty by
   * default (fully-automatic legacy behavior).
   */
  skipIndices: ReadonlySet<number> = new Set(),
): ActionRow[] {
  const goalLen = goalRows.length;
  const actLen = actionsQtr.length;
  let next: ActionRow[] = actionsQtr;

  // 1) Grow-only length sync — capped at maxRows, never below the current count.
  const targetLen = Math.min(maxRows, Math.max(actLen, goalLen));
  if (targetLen > actLen) {
    next = [
      ...actionsQtr,
      ...Array.from({ length: targetLen - actLen }, emptyActionRow),
    ];
  }

  // 2) Index-aligned AUTO reflection for the overlapping (Goal-backed) rows:
  //    only first-fill an EMPTY Action row, or CLEAR one that mirrored the old
  //    Goal value. Overwriting an OCCUPIED Action row with a different category
  //    is a "reflect" that needs confirmation — those indices are in
  //    `skipIndices` (gated rename) or blocked (duplicate) and handled by the
  //    caller, so they're skipped here and never silently clobbered.
  const overlap = Math.min(goalLen, next.length);
  const trim = (s: string | undefined) => (s ?? "").trim();
  for (let i = 0; i < overlap; i++) {
    if (skipIndices.has(i)) continue;
    const goalCat = trim(goalRows[i].category);
    const actCat = trim(next[i].category);
    const wasGoalCat = trim(prevGoalCats[i]);
    if (goalCat === actCat) continue; // already reflected
    const isFirstFill = actCat === "" && goalCat !== "";
    const isSyncedClear = goalCat === "" && actCat !== "" && actCat === wasGoalCat;
    if (isFirstFill || isSyncedClear) {
      if (next === actionsQtr) next = [...next]; // clone-on-first-write
      next[i] = {
        ...next[i],
        category: goalRows[i].category,
        projected: "",
        m1: "",
        m2: "",
        m3: "",
      };
    }
  }

  return next;
}
