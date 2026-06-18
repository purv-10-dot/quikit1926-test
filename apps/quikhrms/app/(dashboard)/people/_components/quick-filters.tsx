"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/hrms/modal";
import { RotateCcw } from "lucide-react";
import type { FilterChip } from "./filter-chips";

export interface FilterColumn {
  field: string; // e.g. "lifecycleStatus"
  label: string; // e.g. "Lifecycle status"
  options: { value: string; label: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  columns: FilterColumn[];
  initial: FilterChip[];
  onApply: (chips: FilterChip[]) => void;
}

export function QuickFilters({ open, onClose, columns, initial, onApply }: Props) {
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    const init: Record<string, Set<string>> = {};
    for (const chip of initial) init[chip.field] = new Set(chip.values);
    setSelections(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (field: string, value: string) => {
    setSelections((prev) => {
      const set = new Set(prev[field] ?? []);
      if (set.has(value)) set.delete(value); else set.add(value);
      return { ...prev, [field]: set };
    });
  };
  const toggleAll = (field: string, allValues: string[]) => {
    setSelections((prev) => {
      const cur = prev[field] ?? new Set();
      const allSelected = allValues.every((v) => cur.has(v));
      const next = new Set(allSelected ? [] : allValues);
      return { ...prev, [field]: next };
    });
  };
  const reset = () => setSelections({});

  const totalChips = Object.values(selections).filter((s) => s.size > 0).length;

  const apply = () => {
    const chips: FilterChip[] = [];
    for (const col of columns) {
      const set = selections[col.field];
      if (!set || set.size === 0) continue;
      const values = [...set].map((v) => col.options.find((o) => o.value === v)?.label ?? v);
      chips.push({
        key: col.field,
        field: col.label,
        op: set.size === 1 ? "equals" : "in",
        values,
      });
    }
    onApply(chips);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Quick filters" size="lg">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-500">Pick values to filter the list. Stack multiple categories.</span>
        <button onClick={reset} className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#3b82f6]">
          <RotateCcw size={12} /> Reset to default
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto">
        {columns.map((col) => {
          const cur = selections[col.field] ?? new Set();
          const allValues = col.options.map((o) => o.value);
          const allSelected = allValues.length > 0 && allValues.every((v) => cur.has(v));
          return (
            <div key={col.field} className="rounded-lg border border-gray-200 bg-white">
              <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">{col.label}</p>
              </div>
              <ul className="p-2 space-y-1 max-h-56 overflow-y-auto">
                <li>
                  <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 text-xs text-gray-700 font-semibold">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => toggleAll(col.field, allValues)}
                      className="rounded"
                    />
                    All
                  </label>
                </li>
                {col.options.map((o) => (
                  <li key={o.value}>
                    <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={cur.has(o.value)}
                        onChange={() => toggle(col.field, o.value)}
                        className="rounded"
                      />
                      {o.label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
        <button className="text-xs text-[#3b82f6] hover:underline">Switch to advanced filters</button>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button onClick={apply} className="btn btn-primary btn-sm">
            Apply{totalChips > 0 ? ` (${totalChips})` : ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}
