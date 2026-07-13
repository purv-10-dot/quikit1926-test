"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { ChecklistStatus } from "./use-checklist";

const NO_STATUS_COLOR = "#9ca3af";

/**
 * Tinted status pill that opens a dropdown of the user's custom statuses and
 * lets them create a new one inline (name + color) without leaving the flow.
 */
export function StatusPicker({
  statuses,
  value,
  onChange,
  onCreateStatus,
}: {
  statuses: ChecklistStatus[];
  value: string | null;
  onChange: (statusId: string) => void;
  onCreateStatus: (name: string, color: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = statuses.find((s) => s.id === value) ?? null;
  const col = current?.color ?? NO_STATUS_COLOR;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function create() {
    const next = name.trim();
    if (!next || saving) return;
    setSaving(true);
    const id = await onCreateStatus(next, color);
    setSaving(false);
    if (id) onChange(id);
    setName("");
    setCreating(false);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ color: col }}
        className="inline-flex items-center gap-1.5 text-xs font-medium hover:opacity-80"
      >
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: col }} />
        <span className="truncate max-w-[120px]">{current?.name ?? "No status"}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-52 rounded-md border border-gray-200 bg-white py-1 shadow-lg z-30 dark:border-gray-700 dark:bg-gray-800">
          <div className="max-h-52 overflow-y-auto">
            {statuses.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="flex-1 text-left truncate">{s.name}</span>
                {s.id === value && <Check className="h-3.5 w-3.5 text-blue-500" />}
              </button>
            ))}
          </div>

          <div className="mt-1 border-t border-gray-100 pt-1 dark:border-gray-700">
            {creating ? (
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-6 w-7 shrink-0 cursor-pointer rounded border border-gray-200 bg-white p-0.5 dark:border-gray-600 dark:bg-gray-700"
                  aria-label="New status color"
                />
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  placeholder="Status name"
                  maxLength={40}
                  className="h-7 flex-1 min-w-0 rounded border border-gray-200 px-1.5 text-xs focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={create}
                  disabled={!name.trim() || saving}
                  className="h-7 shrink-0 rounded bg-blue-600 px-2 text-[11px] font-medium text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-gray-600"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10"
              >
                <Plus className="h-3.5 w-3.5" /> New status
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
