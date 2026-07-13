"use client";

import { useState } from "react";
import { Check, Trash2, Calendar } from "lucide-react";
import { StatusPicker } from "./status-picker";
import type { ChecklistItem, ChecklistStatus, ItemPatch } from "./use-checklist";

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isOverdue(iso: string | null, completed: boolean): boolean {
  if (!iso || completed) return false;
  return new Date(iso).getTime() <= Date.now();
}

export function ChecklistItemRow({
  item,
  statuses,
  onPatch,
  onRemove,
  onCreateStatus,
}: {
  item: ChecklistItem;
  statuses: ChecklistStatus[];
  onPatch: (fields: ItemPatch) => void;
  onRemove: () => void;
  onCreateStatus: (name: string, color: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const overdue = isOverdue(item.dueDate, item.isCompleted);

  function commitName() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== item.name) onPatch({ name: next });
    else setDraft(item.name);
  }

  return (
    <div className="group flex items-start gap-3 rounded-md px-1 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/40">
      {/* Complete toggle — blue filled check when done, gray ring otherwise. */}
      <button
        type="button"
        onClick={() => onPatch({ isCompleted: !item.isCompleted })}
        aria-label={item.isCompleted ? "Mark as not complete" : "Mark as complete"}
        className="mt-0.5 shrink-0"
      >
        {item.isCompleted ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
            <Check className="h-3 w-3" />
          </span>
        ) : (
          <span className="block h-5 w-5 rounded-full border-2 border-gray-300 transition-colors hover:border-gray-400 dark:border-gray-600" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        {/* Name (click to edit) */}
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setDraft(item.name);
                setEditing(false);
              }
            }}
            className="w-full h-6 px-1 text-sm border border-blue-400 rounded focus:outline-none dark:bg-gray-800 dark:text-gray-100"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(item.name);
              setEditing(true);
            }}
            className={`block max-w-full truncate text-left text-sm font-medium ${
              item.isCompleted
                ? "text-gray-400 line-through font-normal dark:text-gray-500"
                : "text-gray-900 dark:text-gray-100"
            }`}
          >
            {item.name}
          </button>
        )}

        {/* Sub-line: status + due date (hidden once complete, like the reference). */}
        {!item.isCompleted && (
          <div className="mt-1 flex items-center gap-3">
            <StatusPicker
              statuses={statuses}
              value={item.statusId}
              onChange={(statusId) => onPatch({ statusId })}
              onCreateStatus={onCreateStatus}
            />

            {/* Due date — shows "Jul 4" when set; otherwise a subtle calendar on hover. */}
            <label
              className={`relative inline-flex items-center gap-1 text-xs cursor-pointer ${
                item.dueDate
                  ? overdue
                    ? "text-red-600"
                    : "text-gray-500 dark:text-gray-400"
                  : "text-gray-400 opacity-0 group-hover:opacity-100 dark:text-gray-500"
              }`}
              title={item.dueDate ? "Due date" : "Set due date"}
            >
              <Calendar className="h-3.5 w-3.5" />
              {item.dueDate && <span>{shortDate(item.dueDate)}</span>}
              <input
                type="date"
                value={toDateInput(item.dueDate)}
                onChange={(e) => {
                  const v = e.target.value;
                  onPatch({ dueDate: v ? new Date(`${v}T00:00:00`).toISOString() : null });
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>
        )}
      </div>

      {/* Delete (hover) */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Delete task"
        className="mt-0.5 p-1 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
