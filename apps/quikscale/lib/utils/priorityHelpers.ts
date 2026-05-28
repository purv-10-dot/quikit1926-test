import type { PriorityWeeklyStatus } from "@/lib/types/priority";

/**
 * Resolve the "Last Note" cell for a Priority row.
 *
 * Selection priority:
 *   1. Optimistic notes (in-memory, not-yet-saved edits) — by definition the
 *      freshest. When multiple optimistic entries exist (rare; would require
 *      two concurrent pickers), the highest weekNumber wins.
 *   2. Persisted weekly notes — pick the row with the max `updatedAt`. This
 *      mirrors "user just updated week 3 → week 3 shows", even when other
 *      weeks have later numbers but older edits.
 *   3. Priority-level `notes` (the textarea on the Notes tab of the edit
 *      modal) — fallback when no weekly notes exist.
 *
 * Returns `null` when nothing is available, so callers can render `—`.
 *
 * `weekNumber` is `null` only when the source is the priority-level note;
 * weekly entries always include their week so the UI can prefix `W{n}:`.
 */
export function getLatestPriorityNote(
  weeklyStatuses: PriorityWeeklyStatus[] | undefined | null,
  optimisticNotes?: Record<number, string> | undefined,
  fallbackNote?: string | null | undefined,
): { note: string; weekNumber: number | null } | null {
  // 1. Optimistic edits — transient, no timestamp, but the freshest possible.
  if (optimisticNotes) {
    let best: { note: string; weekNumber: number } | null = null;
    for (const [wStr, n] of Object.entries(optimisticNotes)) {
      const trimmed = n?.trim();
      const w = parseInt(wStr, 10);
      if (!trimmed || Number.isNaN(w)) continue;
      if (!best || w > best.weekNumber) best = { note: trimmed, weekNumber: w };
    }
    if (best) return best;
  }

  // 2. Persisted weekly statuses — max updatedAt wins.
  let best: { note: string; weekNumber: number; updatedAt: string } | null = null;
  for (const ws of weeklyStatuses ?? []) {
    const trimmed = ws.notes?.trim();
    if (!trimmed) continue;
    // Missing updatedAt (e.g., older payload shape) falls back to weekNumber
    // as a tiebreaker so a half-rolled-out frontend still renders something.
    const at = ws.updatedAt ?? "";
    if (!best || at > best.updatedAt || (at === best.updatedAt && ws.weekNumber > best.weekNumber)) {
      best = { note: trimmed, weekNumber: ws.weekNumber, updatedAt: at };
    }
  }
  if (best) return { note: best.note, weekNumber: best.weekNumber };

  // 3. Priority-level note fallback.
  const fb = fallbackNote?.trim();
  if (fb) return { note: fb, weekNumber: null };

  return null;
}
