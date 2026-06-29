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
 *   - Category auto-fill for the OVERLAPPING rows only: copy each Goal's
 *     category into its matching Action row, resetting that row's projected +
 *     month cells when the bound category changes (so stale values don't
 *     strand against an out-of-date category). Action rows beyond the Goals
 *     count keep their own categories.
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

  // 2) Category auto-fill for the overlapping (Goal-backed) rows only.
  const overlap = Math.min(goalLen, next.length);
  for (let i = 0; i < overlap; i++) {
    if (goalRows[i].category !== next[i].category) {
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
