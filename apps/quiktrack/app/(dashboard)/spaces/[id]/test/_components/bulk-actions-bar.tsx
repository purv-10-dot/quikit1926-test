"use client";

import { RotateCcw, Trash2, X } from "lucide-react";

/**
 * Selection toolbar for the case list — appears only when something is selected.
 *
 * Shows the COUNT in the button label ("Delete 3 cases"), not just "Delete". A
 * destructive bulk action should state its blast radius on the control itself, not
 * only in the confirmation that follows.
 */
export function BulkActionsBar({
  count,
  mode,
  busy,
  onDelete,
  onRestore,
  onClear,
}: {
  count: number;
  /** Which list is on screen — decides whether the action is delete or restore. */
  mode: "live" | "deleted";
  busy: boolean;
  onDelete: () => void;
  onRestore: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 border-b border-accent-200 bg-accent-50 px-4 py-2">
      <span className="text-xs font-medium text-accent-900">
        {count} selected
      </span>

      {mode === "live" ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {busy ? "Deleting…" : `Delete ${count} case${count === 1 ? "" : "s"}`}
        </button>
      ) : (
        <button
          type="button"
          onClick={onRestore}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {busy ? "Restoring…" : `Restore ${count} case${count === 1 ? "" : "s"}`}
        </button>
      )}

      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </button>
    </div>
  );
}
