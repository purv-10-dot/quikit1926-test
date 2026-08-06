/**
 * Goals (1 YR.) → Actions (QTR) reconciliation — pure, framework-free.
 *
 * Extracted from the cascade effect in `hooks/useOPSPForm.ts` so the row-sync
 * rules are unit-testable and unambiguous.
 *
 * Semantics ("grow only, sync-clear only — no auto-fill"):
 *   - GROW only: ensure every Goal has a matching (blank) Action row (capped at
 *     `maxRows`). Never SHRINK — the user may have added independent Action
 *     rows via "Add New", and removing/clearing a Goal must not delete them.
 *   - Category auto-fill for the OVERLAPPING rows is LIMITED to synced-clear
 *     only: if a Goal category that was previously mirrored into its Action
 *     row gets cleared, the Action row is cleared too. A Goal category with NO
 *     existing Action row at its index (whether the row was already empty, or
 *     just grown to keep alignment) is NEVER auto-copied into Actions — that
 *     Goal stays confined to the 1-Year tier permanently. The user must type
 *     the category into Quarterly Actions themselves if they want it tracked
 *     there. Once they do, that row is "occupied" like any other, and a later
 *     Goal rename targeting it goes through the normal `classifyCascade`
 *     confirmation flow (Replace/Append), same as any other occupied row —
 *     no separate permanent-exclusion tracking is needed to get this for free,
 *     since the condition is re-evaluated fresh from current row contents on
 *     every reconcile call.
 *     Action rows beyond the Goals count keep their own categories.
 *
 * `prevGoalCats` is the category snapshot from the previous reconcile — used
 * only by the synced-clear check.
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
  //    ONLY clear an Action row that mirrored the old Goal value (synced-clear).
  //    A Goal category with no existing Action row at its index is NEVER
  //    auto-copied down — it stays goals-only permanently (see file doc
  //    comment). Overwriting an OCCUPIED Action row with a different category
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
    const isSyncedClear = goalCat === "" && actCat !== "" && actCat === wasGoalCat;
    if (isSyncedClear) {
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
