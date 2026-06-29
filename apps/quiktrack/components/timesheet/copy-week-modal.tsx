"use client";

import { useEffect } from "react";
import { CalendarClock } from "lucide-react";
import { formatHours } from "@/lib/utils/timesheetPeriod";

/** One last-week entry and what will happen to it this week. */
export interface CopyWeekDetail {
  issueKey: string;
  issueTitle: string;
  weekday: string;
  sourceDate: string; // the day in LAST week the entry came from
  targetDate: string; // the matching day THIS week it copies to
  lastWeekHours: number; // hours logged last week (what would copy)
  thisWeekHours: number; // hours already logged this week that day (0 if none)
  status: "copy" | "existing" | "future";
}

/** Short, locale-aware date label, e.g. "Jun 16". */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface CopyWeekPreview {
  created: number; // entries that WOULD be copied
  skippedFuture: number; // last-week entries on days still ahead this week
  skippedExisting: number; // this week already has time for that task/day
  details?: CopyWeekDetail[]; // per-entry breakdown for the comparison table
}

const STATUS_META: Record<CopyWeekDetail["status"], { label: string; cls: string }> = {
  copy: {
    label: "Will copy",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  existing: {
    label: "Kept as-is",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  future: {
    label: "Waits for the day",
    cls: "bg-gray-100 text-gray-500 dark:bg-slate-600/30 dark:text-slate-300",
  },
};

/**
 * Confirm dialog for "Copy last week". Shows a comparison table of every
 * last-week entry and what happens to it this week (copied / kept / waiting)
 * before writing anything.
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
  const rows = preview?.details ?? [];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
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
          <>
            {/* Summary line */}
            <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">
              <strong className="text-gray-700 dark:text-slate-200">{preview!.created}</strong> will copy
              {preview!.skippedExisting > 0 && <> · {preview!.skippedExisting} kept</>}
              {preview!.skippedFuture > 0 && <> · {preview!.skippedFuture} waiting</>}
            </p>

            {/* Comparison table: each last-week entry → what happens this week. */}
            <div className="mt-3 max-h-72 overflow-y-auto rounded border border-gray-200 dark:border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-slate-700/60 dark:text-slate-300">
                  <tr>
                    <th className="px-2.5 py-1.5">Work item</th>
                    <th className="px-2.5 py-1.5">Day</th>
                    <th className="px-2.5 py-1.5">Last week</th>
                    <th className="px-2.5 py-1.5">This week</th>
                    <th className="px-2.5 py-1.5">What happens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {rows.map((d, i) => {
                    const meta = STATUS_META[d.status];
                    return (
                      <tr key={`${d.issueKey}-${d.targetDate}-${i}`}>
                        <td className="max-w-[200px] px-2.5 py-1.5">
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-gray-400 dark:text-slate-500">
                              {d.issueKey}
                            </span>
                            <span className="truncate text-gray-800 dark:text-slate-200">
                              {d.issueTitle}
                            </span>
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 text-gray-600 dark:text-slate-300">{d.weekday}</td>
                        {/* Last week: date + hours logged that day. */}
                        <td className="whitespace-nowrap px-2.5 py-1.5">
                          <span className="text-gray-500 dark:text-slate-400">{shortDate(d.sourceDate)}</span>
                          <span className="ml-1.5 tabular-nums font-medium text-gray-700 dark:text-slate-200">
                            {formatHours(d.lastWeekHours)}
                          </span>
                        </td>
                        {/* This week: date + hours already logged (— if none yet). */}
                        <td className="whitespace-nowrap px-2.5 py-1.5">
                          <span className="text-gray-500 dark:text-slate-400">{shortDate(d.targetDate)}</span>
                          <span className="ml-1.5 tabular-nums font-medium text-gray-700 dark:text-slate-200">
                            {d.thisWeekHours > 0 ? formatHours(d.thisWeekHours) : "—"}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5">
                          <span
                            className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
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
