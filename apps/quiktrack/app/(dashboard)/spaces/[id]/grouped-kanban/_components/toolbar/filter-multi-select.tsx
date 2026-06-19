"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { PopoverPanel } from "../cells/popover-panel";
import type { FilterSelectOption } from "./filter-select";

interface FilterMultiSelectProps {
  /** Currently-selected option values. Empty array renders the placeholder. */
  values: string[];
  onChange: (next: string[]) => void;
  options: FilterSelectOption[];
  /** Trigger label when nothing is selected. */
  placeholder: string;
  /** Noun used in the "N selected" trigger summary, e.g. "people". */
  summaryNoun?: string;
  /** Show a search box above the options when the list is long. */
  searchable?: boolean;
  width?: number;
  align?: "left" | "right";
  /** Stretch the trigger to fill its parent (used inside stacked filter rows). */
  expand?: boolean;
}

export function FilterMultiSelect({
  values,
  onChange,
  options,
  placeholder,
  summaryNoun = "selected",
  searchable = false,
  width = 248,
  align = "left",
  expand = false,
}: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const selectedSet = useMemo(() => new Set(values), [values]);
  const hasSelection = values.length > 0;
  const triggerLabel = !hasSelection
    ? placeholder
    : values.length === 1
      ? options.find((o) => o.value === values[0])?.label ?? `1 ${summaryNoun}`
      : `${values.length} ${summaryNoun}`;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  const widthClasses = expand
    ? "flex w-full justify-between max-w-none"
    : "inline-flex shrink-0 max-w-[180px]";

  const toggle = (value: string) => {
    if (selectedSet.has(value)) onChange(values.filter((v) => v !== value));
    else onChange([...values, value]);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${widthClasses} items-center gap-1.5 h-8 px-2.5 text-xs font-medium border rounded-md transition ${
          open
            ? "border-blue-400 ring-2 ring-blue-100 bg-white text-gray-900"
            : hasSelection
              ? "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300"
              : "border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900"
        }`}
        title={triggerLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform shrink-0 ${
            open ? "rotate-180" : ""
          } ${hasSelection ? "" : "text-gray-400"}`}
        />
      </button>
      <PopoverPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => {
          setOpen(false);
          setQuery("");
        }}
        align={align}
        width={width}
        estimatedHeight={Math.min(options.length, 9) * 32 + (searchable ? 48 : 0) + 16}
      >
        {searchable && (
          <div className="sticky top-0 z-10 border-b border-gray-100 bg-white p-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people"
                className="h-7 w-full rounded border border-gray-200 pl-7 pr-6 text-xs placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}
        <div className="max-h-64 overflow-y-auto py-0.5" role="listbox" aria-multiselectable>
          {filtered.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-gray-400">No matches</div>
          )}
          {filtered.map((o) => {
            const isSelected = selectedSet.has(o.value);
            return (
              <button
                key={o.value || "__none__"}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(o.value)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                  isSelected
                    ? "bg-blue-50 text-blue-700"
                    : o.muted
                      ? "text-gray-500 hover:bg-gray-50"
                      : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                    isSelected ? "border-blue-600 bg-blue-600" : "border-gray-300 bg-white"
                  }`}
                  aria-hidden
                >
                  {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                </span>
                {o.dot ? (
                  <span
                    className="h-2 w-2 rounded-full shrink-0 ring-1 ring-white"
                    style={{ background: o.dot }}
                    aria-hidden
                  />
                ) : null}
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && (
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 shrink-0">
                    {o.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {hasSelection && (
          <div className="sticky bottom-0 border-t border-gray-100 bg-white p-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              <X className="h-3 w-3" /> Clear ({values.length})
            </button>
          </div>
        )}
      </PopoverPanel>
    </>
  );
}
