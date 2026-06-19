"use client";

import { useRef, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import type { BoardStatus } from "./board-meta";

/**
 * The "+" tile at the right edge of the kanban that lets the user add a new
 * column. Click to open an inline input. Enter / ✓ saves, Esc / ✗ cancels.
 * On save it POSTs to /api/projects/:id/statuses and notifies the parent.
 */
export function AddColumnTile({
  projectId,
  defaultCategory = "BACKLOG",
  onCreated,
}: {
  projectId: string;
  defaultCategory?: BoardStatus["category"];
  onCreated: (s: BoardStatus) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setEditing(false);
    setName("");
    setError(null);
  }

  async function save() {
    const v = name.trim();
    if (!v) {
      reset();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/statuses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: v, category: defaultCategory }),
      }).then((r) => r.json());
      if (!res?.success) {
        setError(res?.error || "Failed to create column");
        return;
      }
      onCreated(res.data as BoardStatus);
      reset();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setEditing(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-[44px] h-[44px] shrink-0 rounded border border-dashed border-gray-300 hover:border-gray-400 flex items-center justify-center text-gray-500"
        aria-label="Add column"
      >
        <Plus className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="w-[300px] shrink-0">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") reset();
        }}
        placeholder="Column name"
        disabled={saving}
        className="w-full h-9 px-2 text-sm border-2 border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="mt-2 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={save}
          disabled={saving || !name.trim()}
          className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          aria-label="Save"
        >
          <Check className="h-3.5 w-3.5 text-gray-700" />
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5 text-gray-700" />
        </button>
      </div>
      {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
    </div>
  );
}
