"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, X, Check } from "lucide-react";

/**
 * Generic, filter-agnostic UI primitives for the filter toolbar (pill
 * dropdown, active chip, single/multi select). Split out of
 * `filter-toolbar.tsx` so that file stays under the 300 LOC ceiling.
 */

export interface Option {
  value: string;
  label: string;
}

interface PillDropdownProps {
  label: string;
  badge?: number;
  children: (close: () => void) => React.ReactNode;
}

export function PillDropdown({ label, badge, children }: PillDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 h-8 px-2.5 text-sm border rounded ${
          open || badge
            ? "border-blue-300 text-blue-700 bg-blue-50"
            : "border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span>{label}</span>
        {badge ? <span className="text-blue-600 font-medium">({badge})</span> : null}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 min-w-[200px] bg-white border border-gray-200 rounded shadow-lg py-1">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

interface ActiveChipProps {
  label: string;
  op: string;
  value: string;
  onClear: () => void;
  renderValueMenu: (close: () => void) => React.ReactNode;
}

export function ActiveChip({ label, op, value, onClear, renderValueMenu }: ActiveChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative inline-flex">
      {/* The pill itself clips its segment borders (overflow-hidden); the
          popover lives OUTSIDE that clip so the dropdown isn't cut off. */}
      <div className="inline-flex items-center h-8 border border-blue-300 rounded bg-white text-sm overflow-hidden">
        <span className="inline-flex items-center gap-1 px-2.5 h-full text-blue-700 font-medium">
          {label}
          <span className="text-blue-500 font-normal">{op}</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-2.5 h-full text-blue-700 font-medium border-l border-blue-100 hover:bg-blue-50"
        >
          {value}
          <ChevronDown className="h-3.5 w-3.5 text-blue-500" />
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove ${label} filter`}
          className="h-full px-1.5 text-blue-500 hover:bg-blue-50 border-l border-blue-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-xl py-1">
          {renderValueMenu(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function SingleSelect({
  options,
  selected,
  onPick,
  searchable,
  searchPlaceholder = "Search…",
}: {
  options: Option[];
  selected?: string;
  onPick: (value: string, label: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = searchable && query
    ? options.filter((o) => o.label.toLowerCase().includes(query))
    : options;
  return (
    <div>
      {searchable && (
        <div className="px-2 pt-1 pb-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-7 pr-2 h-7 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>
      )}
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400">No options</div>
        ) : (
          filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onPick(o.value, o.label)}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
                o.value === selected ? "text-blue-700 font-medium" : "text-gray-700"
              }`}
            >
              {o.value === selected ? (
                <Check className="h-3.5 w-3.5 text-blue-600" />
              ) : (
                <span className="h-3.5 w-3.5" />
              )}
              {o.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function MultiSelect({
  options,
  selected,
  onChange,
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  };
  return (
    <div className="max-h-64 overflow-y-auto">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
              on ? "text-blue-700 font-medium" : "text-gray-700"
            }`}
          >
            <span
              className={`h-3.5 w-3.5 inline-flex items-center justify-center border rounded ${
                on ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300"
              }`}
            >
              {on && <Check className="h-3 w-3" />}
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function useOutsideClose(ref: React.RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose]);
}
