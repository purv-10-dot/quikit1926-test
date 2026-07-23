"use client";

/**
 * ItemPickerModal — multi-select picker with checkboxes, used by the
 * RFQ drawer's per-vendor "Assign items" action. Generic enough for
 * any "pick a subset of these rows" flow: pass an `items` list, the
 * currently `selectedIds`, and `onSave` gets the new selection.
 *
 * Keeps its own draft state while open so users can cancel without
 * committing. Includes Select all / Clear all shortcuts for long
 * lists (e.g. a 50-item RFQ).
 */

import { useEffect, useState } from "react";
import { X, Check, Search } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./PageShell";

export interface ItemPickerItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  open: boolean;
  title?: string;
  subtitle?: string;
  items: ItemPickerItem[];
  selectedIds: string[];
  onClose: () => void;
  onSave: (ids: string[]) => void;
  // When true, at least one item must be picked before Save — used by
  // the PO / RFQ vendor "Assign items" flow where an empty selection is
  // no longer allowed to mean "include all".
  requireSelection?: boolean;
}

export function ItemPickerModal({
  open,
  title = "Assign items",
  subtitle,
  items,
  selectedIds,
  onClose,
  onSave,
  requireSelection = false,
}: Props) {
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset draft whenever the modal reopens so a prior session's
  // unsaved changes don't leak into the next vendor's picker.
  useEffect(() => {
    if (open) {
      setDraft(new Set(selectedIds));
      setSearch("");
      setError(null);
    }
  }, [open, selectedIds]);

  // Esc to close — only when not in the middle of a save (there's no
  // async here, so always safe).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (it) =>
          it.label.toLowerCase().includes(q) ||
          (it.sublabel ?? "").toLowerCase().includes(q),
      )
    : items;

  const toggle = (id: string) => {
    setError(null);
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => {
    setError(null);
    setDraft(new Set(items.map((i) => i.id)));
  };
  const clearAll = () => setDraft(new Set());

  const handleSave = () => {
    if (requireSelection && draft.size === 0) {
      setError("Please select the item material for the vendor.");
      return;
    }
    onSave(Array.from(draft));
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0 rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            )}
            <p className="text-[11px] text-gray-400 mt-1">
              {draft.size} of {items.length} selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 pt-3 pb-2 flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="w-full text-xs pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={selectAll}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-2"
          >
            Clear
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-8 text-center">
              No items match.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((it) => {
                const checked = draft.has(it.id);
                return (
                  <li key={it.id}>
                    <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer rounded-lg">
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          checked
                            ? "bg-accent-500 border-accent-500 text-white"
                            : "bg-white border-gray-300"
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(it.id)}
                        className="sr-only"
                      />
                      <div className="min-w-0">
                        <div className="text-sm text-gray-900 truncate">
                          {it.label}
                        </div>
                        {it.sublabel && (
                          <div className="text-[11px] text-gray-500 truncate">
                            {it.sublabel}
                          </div>
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0 rounded-b-2xl">
          {error && (
            <p className="mr-auto text-xs font-medium text-red-600">{error}</p>
          )}
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave}>
            Save ({draft.size})
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
