"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Search } from "lucide-react";

export interface ComboOption {
  value: string;
  label: string;
  color?: string | null;
}

/**
 * Custom single-select dropdown used by the bulk-edit form — replaces the
 * native <select> so styling is consistent in light/dark and supports an
 * optional search box (for long lists like Assignee / Epic). The empty-string
 * option is treated as the muted "— unchanged —" placeholder.
 */
export function ComboSelect({
  value,
  onChange,
  options,
  searchable = false,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  searchable?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  const isPlaceholder = !value;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const query = q.trim().toLowerCase();
  const filtered =
    searchable && query
      ? options.filter((o) => o.value !== "" && o.label.toLowerCase().includes(query))
      : options;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center justify-between gap-2 rounded border border-gray-300 px-2 text-xs focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800"
      >
        <span
          className={`flex min-w-0 items-center gap-1.5 truncate ${
            isPlaceholder ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-100"
          }`}
        >
          {current?.color && (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: current.color }} />
          )}
          <span className="truncate">{current?.label}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-full min-w-[190px] rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {searchable && (
            <div className="px-2 pb-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  className="h-7 w-full rounded border border-gray-200 pl-6 pr-2 text-xs focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
          )}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No matches</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value || "__unchanged"}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {o.color ? (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
                  ) : null}
                  <span className={`flex-1 truncate ${o.value === "" ? "text-gray-400 dark:text-gray-500" : ""}`}>
                    {o.label}
                  </span>
                  {o.value === value && <Check className="h-3.5 w-3.5 shrink-0 text-blue-500" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
