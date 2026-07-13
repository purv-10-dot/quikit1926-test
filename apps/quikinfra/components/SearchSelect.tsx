"use client";

/**
 * SearchSelect — searchable combobox for large option lists.
 *
 * Replaces the plain native <select> wherever dropdowns hit 100+ items.
 * Core use case: PR/MR material picker (#3), but reusable for vendors,
 * items, contractors, etc. wherever lookups need search.
 *
 * Features:
 *   - Keyboard accessible (arrow keys, enter, escape)
 *   - Case-insensitive substring match across primary label + sublabel + code
 *   - Debounced for async data sources (pass `onQueryChange`)
 *   - Current-value rendering, clear button
 *   - Empty / loading state
 *   - Click-outside closes the popover
 *
 * This is a client-only component. It does NOT touch localStorage, fetch,
 * or anything else — the parent owns data.
 */

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Search, X, ChevronDown, Check } from "lucide-react";

export interface SearchSelectOption {
  value: string;
  label: string;
  /** Secondary display line (e.g. item code, UOM) */
  sublabel?: string;
  /** Additional searchable text (e.g. aliases) — not displayed */
  searchText?: string;
  /** Right-side badge text */
  badge?: string;
  disabled?: boolean;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  /** Empty-state message when no options match the search */
  emptyText?: string;
  /** Loading state from the parent (async fetch) */
  loading?: boolean;
  /** Disable the whole control */
  disabled?: boolean;
  /** Called when the search query changes — for server-side filtering */
  onQueryChange?: (query: string) => void;
  /** Debounce delay for onQueryChange (ms). Default 200. */
  debounceMs?: number;
  /** CSS width override */
  className?: string;
  /** Autofocus on mount */
  autoFocus?: boolean;
  /** Custom option renderer */
  renderOption?: (opt: SearchSelectOption) => ReactNode;
}

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Search…",
  emptyText = "No matches",
  loading = false,
  disabled = false,
  onQueryChange,
  debounceMs = 200,
  className = "",
  autoFocus = false,
  renderOption,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Current selection
  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  // Client-side filter — skipped when parent provides onQueryChange (server filter)
  const filtered = useMemo(() => {
    if (onQueryChange) return options;
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => {
      const hay = `${o.label} ${o.sublabel ?? ""} ${o.searchText ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query, onQueryChange]);

  // Debounce onQueryChange
  useEffect(() => {
    if (!onQueryChange) return;
    const t = setTimeout(() => onQueryChange(query), debounceMs);
    return () => clearTimeout(t);
  }, [query, onQueryChange, debounceMs]);

  // Reset active index when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [filtered.length, open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Auto-focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Autofocus prop — open immediately
  useEffect(() => {
    if (autoFocus && !disabled) setOpen(true);
  }, [autoFocus, disabled]);

  const pick = useCallback(
    (opt: SearchSelectOption) => {
      if (opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
      setQuery("");
    },
    [onChange]
  );

  const clear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange("");
      setQuery("");
    },
    [onChange]
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) pick(opt);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* Trigger button showing current selection */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {selected ? (
          <div className="flex-1 min-w-0 text-left">
            <div className="truncate text-gray-900">{selected.label}</div>
            {selected.sublabel && (
              <div className="text-[10px] text-gray-500 truncate">{selected.sublabel}</div>
            )}
          </div>
        ) : (
          <span className="flex-1 text-left text-gray-400">{placeholder}</span>
        )}
        {selected && !disabled && (
          <span
            onClick={clear}
            role="button"
            aria-label="Clear selection"
            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>

      {/* Popover */}
      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-gray-100">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type to search…"
              className="flex-1 text-sm outline-none bg-transparent"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">{emptyText}</div>
            ) : (
              filtered.map((opt, i) => {
                const active = i === activeIndex;
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => pick(opt)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left px-2.5 py-2 flex items-center gap-2 ${
                      active ? "bg-orange-50" : ""
                    } ${opt.disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-orange-50"}`}
                  >
                    <div className="flex-1 min-w-0">
                      {renderOption ? (
                        renderOption(opt)
                      ) : (
                        <>
                          <div className="text-sm text-gray-900 truncate">{opt.label}</div>
                          {opt.sublabel && (
                            <div className="text-[10px] text-gray-500 truncate">{opt.sublabel}</div>
                          )}
                        </>
                      )}
                    </div>
                    {opt.badge && (
                      <span className="text-[9px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && <Check className="w-3.5 h-3.5 text-orange-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
