"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { BoardStatus } from "./board-meta";

/**
 * The ⋯ menu in each kanban column header. Lets the user rename the column
 * inline, or delete it (with a confirm + reassignment dropdown when there are
 * issues in the column being deleted). PROJECT_ADMIN role is enforced server
 * side; this component just surfaces the actions.
 */
export function ColumnMenu({
  status,
  otherStatuses,
  projectId,
  onRenamed,
  onDeleted,
}: {
  status: BoardStatus;
  otherStatuses: BoardStatus[];
  projectId: string;
  onRenamed: (s: BoardStatus) => void;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(status.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moveTo, setMoveTo] = useState<string>(otherStatuses[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !renaming && !confirmingDelete) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, renaming, confirmingDelete]);

  async function commitRename() {
    const v = name.trim();
    if (!v || v === status.name) {
      setRenaming(false);
      setName(status.name);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/statuses/${status.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: v }),
      }).then((r) => r.json());
      if (!res?.success) {
        setError(res?.error || "Rename failed");
        return;
      }
      onRenamed(res.data as BoardStatus);
      setRenaming(false);
    } finally {
      setBusy(false);
    }
  }

  async function commitDelete() {
    setBusy(true);
    setError(null);
    try {
      const qs = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : "";
      const res = await fetch(
        `/api/projects/${projectId}/statuses/${status.id}${qs}`,
        { method: "DELETE" },
      ).then((r) => r.json());
      if (!res?.success) {
        setError(res?.error || "Delete failed");
        return;
      }
      onDeleted(status.id);
      setConfirmingDelete(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (renaming) {
    return (
      <div className="flex items-center gap-1" ref={ref}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename();
            if (e.key === "Escape") {
              setRenaming(false);
              setName(status.name);
            }
          }}
          disabled={busy}
          className="h-6 px-1 text-[11px] font-semibold uppercase tracking-wider border border-blue-500 rounded focus:outline-none w-[120px]"
        />
        <button
          type="button"
          onClick={commitRename}
          disabled={busy}
          className="p-0.5 rounded hover:bg-gray-200 text-gray-600"
          aria-label="Save"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setRenaming(false);
            setName(status.name);
          }}
          disabled={busy}
          className="p-0.5 rounded hover:bg-gray-200 text-gray-600"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded hover:bg-gray-200 text-gray-500"
        aria-label="Column actions"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && !confirmingDelete && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-30 py-1 text-sm">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setRenaming(true);
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-gray-800 hover:bg-gray-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete column
          </button>
        </div>
      )}
      {confirmingDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40"
          onClick={() => !busy && setConfirmingDelete(false)}
        >
          <div
            className="w-[420px] max-w-[95vw] bg-white rounded-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Delete &ldquo;{status.name}&rdquo;?
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Issues currently on this column will be moved to the column you pick below.
              </p>
              {otherStatuses.length > 0 ? (
                <select
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  className="w-full h-9 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {otherStatuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-red-600">
                  This is the last column — you can&rsquo;t delete it.
                </div>
              )}
              {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={busy}
                className="h-9 px-4 text-sm text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commitDelete}
                disabled={busy || otherStatuses.length === 0}
                className="h-9 px-5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:bg-gray-300"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
