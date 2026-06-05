"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, X, Search } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

export function FilterDropdown({
  label,
  icon: Icon,
  value,
  onChange,
  options,
  searchable,
  minWidth = 170,
}: {
  label: string;
  icon?: React.ElementType;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  searchable?: boolean;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Clear the search box each time the menu closes.
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const query = q.trim().toLowerCase();
  const filtered = searchable && query
    ? options.filter((o) => o.label.toLowerCase().includes(query))
    : options;

  return (
    <div ref={ref} className="relative" style={{ minWidth }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full h-9 inline-flex items-center text-sm bg-white border rounded text-left transition-colors ${
          open
            ? "border-blue-500 ring-2 ring-blue-500/20"
            : selected
              ? "border-blue-200 hover:border-blue-300"
              : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {Icon && (
          <span className="pl-2.5 pr-1.5 shrink-0">
            <Icon className={`h-3.5 w-3.5 ${selected ? "text-blue-500" : "text-gray-400"}`} />
          </span>
        )}
        <span
          className={`flex-1 truncate pr-1 ${
            selected ? "text-gray-900 font-medium" : "text-gray-500"
          } ${!Icon ? "pl-3" : ""}`}
        >
          {selected?.label ?? label}
        </span>
        {selected ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="px-1.5 text-gray-400 hover:text-gray-700"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="pr-2 text-gray-400">
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg py-1 max-h-72 overflow-y-auto">
          {searchable && (
            <div className="px-2 pt-1 pb-1.5 sticky top-0 bg-white">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-7 pr-2 h-7 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No options</div>
          ) : (
            filtered.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
                    active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-800"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {active && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0 ml-2" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
