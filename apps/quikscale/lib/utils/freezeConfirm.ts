import type { ConfirmOptions } from "@quikit/ui";

/**
 * Shared confirm gate for a column drag that crosses the freeze boundary.
 *
 * A single drag can only move one column across the boundary in ONE direction,
 * so `unfrozen` and `frozen` are mutually exclusive per drop:
 *
 *   - `unfrozen` non-empty → the column is leaving the pinned section
 *     ("Unfreeze column?", amber warning — the surprising/destructive case).
 *   - `frozen` non-empty   → the column is entering the pinned section
 *     ("Freeze column?", info tone — additive, non-destructive).
 *   - both empty           → an ordinary reorder, no dialog.
 *
 * Centralised so every data grid (KPI, Priority, WWW, client-meeting tables)
 * shows identical copy and there is a single place to tune wording.
 *
 * Returns `true` to proceed with the reorder, `false` to abort. Unfreeze is
 * checked first so that in the theoretical case both are non-empty, the more
 * consequential "unfreeze" prompt wins.
 */
export async function confirmFreezeChange(
  confirm: (opts: ConfirmOptions) => Promise<boolean>,
  unfrozen: readonly string[],
  frozen: readonly string[],
): Promise<boolean> {
  if (unfrozen.length > 0) {
    return confirm({
      tone: "warning",
      title: "Unfreeze column?",
      description:
        "Moving this column will remove it from the frozen (pinned) section. Are you sure you want to continue?",
      confirmLabel: "Yes, move it",
      cancelLabel: "No",
    });
  }
  if (frozen.length > 0) {
    return confirm({
      tone: "default",
      title: "Freeze column?",
      description:
        "Moving this column into the frozen (pinned) section will pin it to the left of the table. Are you sure you want to continue?",
      confirmLabel: "Yes, freeze it",
      cancelLabel: "No",
    });
  }
  return true;
}
