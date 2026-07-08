"use client";

import { useRef, useState, type ReactNode } from "react";
import { Filter, X } from "lucide-react";
import { PopoverPanel } from "@/app/(dashboard)/spaces/[id]/grouped-kanban/_components/cells/popover-panel";
import {
  FilterSelect,
  type FilterSelectOption,
} from "@/app/(dashboard)/spaces/[id]/grouped-kanban/_components/toolbar/filter-select";

/**
 * Shared "Filter" popover used across every work-item view (Backlog, Board,
 * List, Grouped Kanban) so they all read the same: a trigger button with an
 * active-count badge, a portaled panel (never clipped by content overflow, and
 * viewport-clamped) with a "Filters" header + Clear-all, and a responsive
 * two-column grid body so many fields stay short vertically.
 *
 * Callers pass the field rows as children — built-ins via {@link FilterRow} /
 * `FilterMultiSelect`, and custom fields via `<CustomFieldFilters className="contents">`
 * so each field flows into the same grid.
 */
export function FilterPanel({
  activeCount,
  onClearAll,
  children,
}: {
  activeCount: number;
  onClearAll: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 h-8 px-3 text-sm border rounded-md transition ${
          activeCount > 0
            ? "bg-blue-50 border-blue-300 text-blue-700"
            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        <Filter className="h-3.5 w-3.5" />
        Filter
        {activeCount > 0 && (
          <span className="ml-0.5 rounded-full bg-blue-600 px-1.5 text-[10px] font-medium text-white">
            {activeCount}
          </span>
        )}
      </button>
      <PopoverPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        align="right"
        width={520}
        estimatedHeight={440}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
          <span className="text-xs font-semibold text-gray-800">Filters</span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>
        <div className="grid max-h-[60vh] grid-cols-1 gap-x-4 gap-y-3 overflow-y-auto p-3 sm:grid-cols-2">
          {children}
        </div>
      </PopoverPanel>
    </>
  );
}

/** A labelled single-select filter cell — searchable automatically for long lists. */
export function FilterRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: FilterSelectOption[];
}) {
  return (
    <div className="text-xs">
      <span className="mb-1 block font-medium text-gray-600">{label}</span>
      <FilterSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Any"
        expand
        searchable={options.length > 8}
        width={240}
      />
    </div>
  );
}
