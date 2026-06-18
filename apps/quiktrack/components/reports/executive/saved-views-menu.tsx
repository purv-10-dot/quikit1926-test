"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, ChevronDown, Pin, Trash2 } from "lucide-react";
import type { ExecutiveFilters, SavedView } from "./types";

interface Props {
  views: SavedView[];
  activeId: string | null;
  onApply: (view: SavedView) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
}

export function SavedViewsMenu({ views, activeId, onApply, onDelete, onTogglePin }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = views.find((v) => v.id === activeId);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-9 px-3 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50"
      >
        <Bookmark className="h-3.5 w-3.5 text-gray-500" />
        <span className="text-gray-700 truncate max-w-[160px]">
          {active ? active.name : "Saved views"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 right-0 w-72 bg-white border border-gray-200 rounded-md shadow-lg py-1 max-h-80 overflow-y-auto">
          {views.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">
              No saved views yet. Adjust filters and click <span className="font-medium">Save view</span>.
            </div>
          ) : (
            views.map((v) => (
              <ViewRow
                key={v.id}
                view={v}
                isActive={v.id === activeId}
                onApply={() => {
                  onApply(v);
                  setOpen(false);
                }}
                onDelete={() => onDelete(v.id)}
                onTogglePin={() => onTogglePin(v.id, !v.isPinned)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ViewRow({
  view,
  isActive,
  onApply,
  onDelete,
  onTogglePin,
}: {
  view: SavedView;
  isActive: boolean;
  onApply: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-50 ${
        isActive ? "bg-accent-50" : ""
      }`}
    >
      <button
        type="button"
        onClick={onApply}
        className="flex-1 min-w-0 text-left text-sm text-gray-800 truncate"
      >
        {view.name}
      </button>
      <button
        type="button"
        onClick={onTogglePin}
        title={view.isPinned ? "Unpin" : "Pin"}
        className={`p-1 rounded hover:bg-gray-100 ${
          view.isPinned ? "text-amber-500" : "text-gray-300 group-hover:text-gray-500"
        }`}
      >
        <Pin className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete"
        className="p-1 rounded text-gray-300 hover:bg-red-50 hover:text-red-500 group-hover:text-gray-500"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface SaveModalProps {
  open: boolean;
  initialName?: string;
  initialPinned?: boolean;
  onCancel: () => void;
  onSubmit: (name: string, isPinned: boolean) => Promise<void>;
}

export function SaveViewModal({
  open,
  initialName = "",
  initialPinned = false,
  onCancel,
  onSubmit,
}: SaveModalProps) {
  const [name, setName] = useState(initialName);
  const [pinned, setPinned] = useState(initialPinned);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setPinned(initialPinned);
      setError(null);
    }
  }, [open, initialName, initialPinned]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please give this view a name.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(name.trim(), pinned);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save view");
    } finally {
      setSubmitting(false);
    }
  }

  function onBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onCancel();
  }

  return (
    <div
      onClick={onBackdropClick}
      className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5"
      >
        <h3 className="text-base font-semibold text-gray-900 mb-1">Save report view</h3>
        <p className="text-xs text-gray-500 mb-4">
          Save the current filters so the CEO can return to this exact view next time.
        </p>
        <label className="block text-xs font-medium text-gray-700 mb-1">View name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Last 12 weeks — all teams"
          className="w-full h-9 px-2.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-accent-300"
          maxLength={80}
        />
        <label className="mt-3 inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-accent-600 focus:ring-accent-400"
          />
          Pin to top of saved views
        </label>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium bg-accent-600 text-white rounded-md hover:bg-accent-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save view"}
          </button>
        </div>
      </form>
    </div>
  );
}
