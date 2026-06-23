"use client";

import { useEffect } from "react";
import { CalendarClock, AlertTriangle, Clock } from "lucide-react";

export interface CopyWeekPreview {
  created: number; // entries that WOULD be copied
  skippedFuture: number; // last-week entries on days still ahead this week
  skippedExisting: number; // this week already has time for that task/day
}

/**
 * Confirm dialog for "Copy last week". Shows a comparison of what will happen —
 * what copies, what's kept (already filled this week), what waits (future days)
 * — before writing anything.
 */
export function CopyWeekModal({
  open,
  loading,
  preview,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Preview is still being fetched. */
  loading: boolean;
  preview: CopyWeekPreview | null;
  /** The real copy is in flight. */
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const nothing = !loading && (preview?.created ?? 0) === 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-100">
          <CalendarClock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Copy last week
        </h3>

        {loading ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-slate-400">Checking last week…</p>
        ) : nothing ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-slate-300">
            Nothing to copy up to today.{" "}
            {(preview?.skippedFuture ?? 0) > 0
              ? "Last week's entries fall on days later this week — they'll copy once those days arrive."
              : "There were no entries in last week for these days."}
          </p>
        ) : (
          <div className="mt-4 space-y-2.5 text-sm">
            <p className="flex items-start gap-2 text-gray-800 dark:text-slate-200">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>{preview!.created}</strong>{" "}
                {preview!.created === 1 ? "entry" : "entries"} from last week will be copied into
                this week, on the matching weekdays up to today.
              </span>
            </p>
            {preview!.skippedExisting > 0 && (
              <p className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{preview!.skippedExisting}</strong> day(s) this week already have time for
                  a task — those are <strong>kept as-is</strong> and won't be overwritten.
                </span>
              </p>
            )}
            {preview!.skippedFuture > 0 && (
              <p className="flex items-start gap-2 text-gray-500 dark:text-slate-400">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{preview!.skippedFuture}</strong> entr
                  {preview!.skippedFuture === 1 ? "y is" : "ies are"} on days later this week —
                  they'll copy when those days arrive.
                </span>
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || nothing || busy}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Copying…" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
