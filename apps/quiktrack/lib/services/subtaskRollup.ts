import { db } from "@/lib/db";

/**
 * Recompute a parent issue's ETA + start/due dates from the union of its
 * (non-deleted) subtasks and persist the rolled-up values.
 *
 * Behavior:
 *  - `eta` becomes the sum of all subtask ETAs. Subtasks without an ETA
 *    contribute 0. If no subtask has an ETA, the parent's ETA is left
 *    untouched (we don't want to wipe a manual estimate when subtasks
 *    haven't been estimated yet).
 *  - `startDate` becomes the min of subtask `startDate`s.
 *  - `dueDate` becomes the max of subtask `dueDate`s.
 *  - If the parent has no subtasks, nothing changes.
 *
 * Returns the post-update parent for the caller's convenience (e.g. so a
 * PATCH route can include the new rollup values in its response).
 */
export async function recalcParentRollup(
  parentId: string,
  orgId: string,
): Promise<void> {
  if (!parentId) return;
  try {
    const subtasks = await db.qtIssue.findMany({
      where: {
        parentId,
        orgId: orgId,
        isDeleted: false,
      },
      select: {
        eta: true,
        startDate: true,
        dueDate: true,
      },
    });
    if (subtasks.length === 0) return;

    const etasSum = subtasks.reduce((s, st) => s + (st.eta ?? 0), 0);
    const anyEta = subtasks.some((st) => st.eta != null);

    const startDates = subtasks
      .map((s) => s.startDate)
      .filter((d): d is Date => d instanceof Date);
    const dueDates = subtasks
      .map((s) => s.dueDate)
      .filter((d): d is Date => d instanceof Date);

    const minStart = startDates.length
      ? new Date(Math.min(...startDates.map((d) => d.getTime())))
      : null;
    const maxDue = dueDates.length
      ? new Date(Math.max(...dueDates.map((d) => d.getTime())))
      : null;

    await db.qtIssue.update({
      where: { id: parentId },
      data: {
        // Only overwrite the parent's estimate when at least one subtask has
        // contributed one — otherwise keep the manual value.
        ...(anyEta ? { eta: etasSum } : {}),
        ...(minStart ? { startDate: minStart } : {}),
        ...(maxDue ? { dueDate: maxDue } : {}),
      },
    });
  } catch (error: unknown) {
    console.error("[subtask-rollup] failed", error);
  }
}
