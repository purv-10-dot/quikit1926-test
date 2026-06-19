"use client";

import { useState } from "react";
import { Trash2, Download, X } from "lucide-react";

interface Props {
  count: number;
  onClear: () => void;
  onDelete: () => Promise<void> | void;
  onExport: () => void;
}

export function BulkActionBar({ count, onClear, onDelete, onExport }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (count <= 0) return null;

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete();
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-blue-200 bg-blue-50 px-5 py-2 text-sm">
      <button
        type="button"
        onClick={onClear}
        className="flex items-center gap-1 rounded p-1 text-gray-600 hover:bg-white"
        title="Clear selection"
      >
        <X className="h-4 w-4" />
      </button>
      <span className="font-medium text-gray-900">{count} selected</span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1 text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-2 rounded border border-red-200 bg-white px-3 py-1">
            <span className="text-xs text-red-700">Delete {count}?</span>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="rounded px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded border border-red-200 bg-white px-3 py-1 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
