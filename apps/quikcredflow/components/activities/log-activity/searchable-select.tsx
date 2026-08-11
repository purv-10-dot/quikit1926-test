"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export type SearchableOption = { id: string; label: string };

interface Props {
  label: string;
  placeholder?: string;
  value: string;
  options: SearchableOption[];
  loading?: boolean;
  disabled?: boolean;
  onChange: (id: string, option: SearchableOption | null) => void;
}

export function SearchableSelect({
  label,
  placeholder = "Search…",
  value,
  options,
  loading = false,
  disabled = false,
  onChange,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 80);
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 80);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1 block text-xs font-medium text-crm-muted">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="crm-input flex w-full items-center justify-between gap-2 text-left text-sm disabled:opacity-60"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={selected ? "truncate text-crm-text" : "truncate text-crm-muted"}>
          {loading ? "Loading…" : selected?.label ?? placeholder}
        </span>
        <ChevronDown size={14} className="shrink-0 text-crm-muted" />
      </button>
      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-crm-border bg-white shadow-crm-dropdown">
          <div className="flex items-center gap-2 border-b border-crm-border px-2 py-1.5">
            <Search size={14} className="shrink-0 text-crm-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-crm-muted"
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            className="max-h-48 overflow-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-crm-muted">No matches</li>
            ) : (
              filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.id === value}
                    className={
                      "w-full px-3 py-2 text-left text-sm hover:bg-crm-panel " +
                      (o.id === value ? "bg-accent-50 font-medium text-accent-800" : "text-crm-text")
                    }
                    onClick={() => {
                      onChange(o.id, o);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {o.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
