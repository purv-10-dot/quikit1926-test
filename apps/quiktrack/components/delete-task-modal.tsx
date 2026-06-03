"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";

interface SubtaskLite {
  id: string;
  key: string;
  title: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  subtaskCount: number;
  subtasks?: SubtaskLite[];
  onDeleted: () => void;
}

export function DeleteTaskModal({
  open,
  onClose,
  issueId,
  issueKey,
  issueTitle,
  subtaskCount,
  subtasks,
  onDeleted,
}: Props) {
  const [mode, setMode] = useState<"cascade" | "detach">("cascade");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode("cascade");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open || typeof window === "undefined") return null;

  const hasSubtasks = subtaskCount > 0;
  const shown = subtasks?.slice(0, 5) ?? [];
  const extra = Math.max(0, subtaskCount - shown.length);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const qs = hasSubtasks && mode === "detach" ? "?subtaskMode=detach" : "";
      const res = await fetch(`/api/issues/${issueId}${qs}`, { method: "DELETE" }).then((r) => r.json());
      if (!res.success) {
        setError(res.error || "Delete failed");
        return;
      }
      onDeleted();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete task"
        className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Delete this task?
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                <span className="font-mono">{issueKey}</span> · {issueTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {hasSubtasks ? (
            <>
              <div className="text-sm text-gray-700 dark:text-gray-200">
                This task has{" "}
                <span className="font-semibold">{subtaskCount} subtask{subtaskCount === 1 ? "" : "s"}</span>:
              </div>
              {shown.length > 0 && (
                <ul className="rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-40 overflow-y-auto">
                  {shown.map((s) => (
                    <li key={s.id} className="px-3 py-1.5 text-xs flex items-center gap-2">
                      <span className="font-mono text-gray-500 dark:text-gray-400 shrink-0">{s.key}</span>
                      <span className="truncate text-gray-700 dark:text-gray-200">{s.title}</span>
                    </li>
                  ))}
                  {extra > 0 && (
                    <li className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                      +{extra} more
                    </li>
                  )}
                </ul>
              )}

              <fieldset className="space-y-2 pt-1">
                <legend className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  What should happen to the subtasks?
                </legend>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="subtaskMode"
                    value="cascade"
                    checked={mode === "cascade"}
                    onChange={() => setMode("cascade")}
                    className="mt-0.5 accent-red-600"
                  />
                  <span>
                    <span className="font-medium text-gray-800 dark:text-gray-100">Delete subtasks too</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      All {subtaskCount} subtask{subtaskCount === 1 ? "" : "s"} will be moved to trash with the parent.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="subtaskMode"
                    value="detach"
                    checked={mode === "detach"}
                    onChange={() => setMode("detach")}
                    className="mt-0.5 accent-accent-600"
                  />
                  <span>
                    <span className="font-medium text-gray-800 dark:text-gray-100">Detach subtasks</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      Keep them as top-level tasks (parent link removed).
                    </span>
                  </span>
                </label>
              </fieldset>
            </>
          ) : (
            <p className="text-sm text-gray-700 dark:text-gray-200">
              This task will be moved to trash. You can restore it later from the trash view.
            </p>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-sm rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="h-8 px-3 text-sm font-medium rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
          >
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
