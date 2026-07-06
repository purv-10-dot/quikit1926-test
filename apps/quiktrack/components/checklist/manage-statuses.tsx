"use client";

import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import type { ChecklistStatus } from "./use-checklist";

export function ManageStatuses({
  statuses,
  onAdd,
  onPatch,
  onRemove,
  onBack,
}: {
  statuses: ChecklistStatus[];
  onAdd: (name: string, color: string) => void;
  onPatch: (id: string, fields: { name?: string; color?: string }) => void;
  onRemove: (id: string) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2563eb");

  function add() {
    const next = name.trim();
    if (!next) return;
    onAdd(next, color);
    setName("");
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to checklist
      </button>

      <div className="space-y-1.5">
        {statuses.map((s) => (
          <StatusEditRow
            key={s.id}
            status={s}
            onPatch={(fields) => onPatch(s.id, fields)}
            onRemove={() => onRemove(s.id)}
          />
        ))}
        {statuses.length === 0 && (
          <p className="text-xs text-gray-400 py-2 dark:text-gray-500">No statuses yet — add one below.</p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-7 w-8 shrink-0 cursor-pointer rounded border border-gray-200 bg-white p-0.5 dark:border-gray-600 dark:bg-gray-700"
          aria-label="New status color"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="New status name"
          maxLength={40}
          className="h-8 flex-1 min-w-0 rounded border border-gray-200 px-2 text-sm focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={add}
          disabled={!name.trim()}
          className="inline-flex h-8 items-center gap-1 rounded bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

function StatusEditRow({
  status,
  onPatch,
  onRemove,
}: {
  status: ChecklistStatus;
  onPatch: (fields: { name?: string; color?: string }) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(status.name);

  return (
    <div className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <input
        type="color"
        value={status.color}
        onChange={(e) => onPatch({ color: e.target.value })}
        className="h-6 w-7 shrink-0 cursor-pointer rounded border border-gray-200 bg-white p-0.5 dark:border-gray-600 dark:bg-gray-700"
        aria-label={`${status.name} color`}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const next = name.trim();
          if (next && next !== status.name) onPatch({ name: next });
          else setName(status.name);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        maxLength={40}
        className="h-7 flex-1 min-w-0 rounded border border-transparent px-1.5 text-sm hover:border-gray-200 focus:border-blue-400 focus:outline-none dark:text-gray-100 dark:hover:border-gray-600"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Delete ${status.name}`}
        className="p-1 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
