"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { PopoverPanel } from "../cells/popover-panel";

export interface FilterSelectOption {
  value: string;
  label: string;
  /** Optional color-dot rendered before the label (and in the trigger). */
  dot?: string;
  /** Render the option label in muted gray — used for "any/unassigned" rows. */
  muted?: boolean;
  /** Small label rendered right-aligned in the option row — e.g. sprint status. */
  hint?: string;
}

interface FilterSelectProps {
  value: string;
  onChange: (next: string) => void;
  options: FilterSelectOption[];
  /** Trigger label when no option is selected (i.e. value matches no option). */
  placeholder: string;
  width?: number;
  align?: "left" | "right";
  /** Stretch the trigger to fill its parent (used inside stacked filter rows). */
  expand?: boolean;
  /** Show a search box above the options (for long lists e.g. members). */
  searchable?: boolean;
}

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  width = 220,
  align = "left",
  expand = false,
  searchable = false,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const current = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options),
    [q, options],
  );
  const isPlaceholder = !current || current.muted;
  const widthClasses = expand
    ? "flex w-full justify-between max-w-none"
    : "inline-flex shrink-0 max-w-[180px]";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${widthClasses} items-center gap-1.5 h-8 px-2.5 text-xs font-medium border rounded-md transition ${
          open
            ? "border-blue-400 ring-2 ring-blue-100 bg-white text-gray-900"
            : isPlaceholder
              ? "border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900"
              : "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300"
        }`}
        title={current?.label ?? placeholder}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current?.dot && (
          <span
            className="h-2 w-2 rounded-full shrink-0 ring-1 ring-white"
            style={{ background: current.dot }}
            aria-hidden
          />
        )}
        <span className="truncate">{current?.label ?? placeholder}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform shrink-0 ${
            open ? "rotate-180" : ""
          } ${isPlaceholder ? "text-gray-400" : ""}`}
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
                placeholder="Search…"
                className="h-7 w-full rounded border border-gray-200 pl-7 pr-2 text-xs placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
            </div>
          </div>
        )}
        <div className="max-h-64 overflow-y-auto py-0.5" role="listbox">
          {filtered.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-gray-400">No matches</div>
          )}
          {filtered.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value || "__none__"}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                  if (o.value !== value) onChange(o.value);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${
                  isSelected
                    ? "bg-blue-50 text-blue-700"
                    : o.muted
                      ? "text-gray-500 hover:bg-gray-50"
                      : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {o.dot ? (
                  <span
                    className="h-2 w-2 rounded-full shrink-0 ring-1 ring-white"
                    style={{ background: o.dot }}
                    aria-hidden
                  />
                ) : (
                  <span className="h-2 w-2 shrink-0" aria-hidden />
                )}
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && (
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 shrink-0">
                    {o.hint}
                  </span>
                )}
                {isSelected && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverPanel>
    </>
  );
}
