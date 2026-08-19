"use client";

/**
 * Id-keyed multi-select with a type-to-filter box.
 *
 * components/ui/multi-select-dropdown.tsx is value-keyed (`readonly string[]`),
 * which can't carry an id → label pair, and ICP links need real cuids. Rather
 * than change that shared component (or `@quikit/ui`, which app rules put
 * off-limits), this mirrors its markup, focus behaviour and classes exactly so
 * the two read as the same control.
 *
 * TODO(integration): fold an id-keyed variant back into @quikit/ui and drop this.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export interface EntityOption {
  id: string;
  label: string;
  /** Optional right-aligned muted hint — SKU, code, industry, … */
  hint?: string | null;
}

export function EntityMultiSelect({
  options,
  value,
  onChange,
  placeholder = "— Select —",
  disabled = false,
  invalid = false,
  emptyHint = "No options available.",
  searchThreshold = 8,
}: {
  options: readonly EntityOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  emptyHint?: string;
  /** Show the filter box only once the list is long enough to need it. */
  searchThreshold?: number;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const labelById = useMemo(() => new Map(options.map((o) => [o.id, o.label])), [options]);

  const displayLabel =
    value.length === 0
      ? placeholder
      : value.length <= 2
        ? value.map((id) => labelById.get(id) ?? "…").join(", ")
        : `${value.length} selected`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(f) || (o.hint ?? "").toLowerCase().includes(f),
    );
  }, [options, filter]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={[
          "crm-input flex w-full items-center justify-between gap-2 text-left text-sm disabled:opacity-60",
          invalid ? "border-red-500 ring-1 ring-red-200" : "",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={value.length > 0 ? "truncate text-crm-text" : "truncate text-crm-muted"}>
          {displayLabel}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-crm-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && !disabled ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-crm-border bg-white shadow-crm-dropdown">
          {options.length > searchThreshold && (
            <div className="border-b border-crm-border p-2">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted"
                />
                <input
                  autoFocus
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter…"
                  className="crm-input w-full pl-8 text-sm"
                  aria-label="Filter options"
                />
              </div>
            </div>
          )}
          <ul id={listId} role="listbox" aria-multiselectable className="max-h-56 overflow-auto py-1">
            {options.length === 0 ? (
              <li className="px-3 py-3 text-sm text-crm-muted">{emptyHint}</li>
            ) : shown.length === 0 ? (
              <li className="px-3 py-3 text-sm text-crm-muted">No matches.</li>
            ) : (
              shown.map((option) => {
                const checked = value.includes(option.id);
                return (
                  <li key={option.id}>
                    <label
                      className={[
                        "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-crm-panel",
                        checked ? "bg-accent-50 text-accent-800" : "text-crm-text",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(option.id)}
                        className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-400"
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.hint && (
                        <span className="shrink-0 text-xs text-crm-muted">{option.hint}</span>
                      )}
                    </label>
                  </li>
                );
              })
            )}
          </ul>
          {value.length > 0 && (
            <div className="flex items-center justify-between border-t border-crm-border px-3 py-2">
              <span className="text-xs text-crm-muted">{value.length} selected</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-crm-blue hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
