"use client";

import { useState, useRef, useEffect } from "react";

function avatarBg(name: string): string {
  const colors = [
    "bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500",
    "bg-rose-500","bg-cyan-500","bg-fuchsia-500","bg-teal-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

export function userToFilterOption(u: {
  id: string; firstName: string; lastName: string; email: string;
}): FilterOption {
  const full = `${u.firstName} ${u.lastName}`;
  return {
    value: u.id,
    label: full,
    sublabel: u.email,
    avatarInitials: `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase(),
    avatarColor: avatarBg(full),
  };
}

export interface FilterOption {
  value: string;
  label: string;
  sublabel?: string;
  avatarInitials?: string;
  avatarColor?: string;
}

interface FilterPickerProps {
  value: string;
  onChange: (val: string) => void;
  options: FilterOption[];
  allLabel?: string;
  placeholder?: string;
}

export function FilterPicker({
  value,
  onChange,
  options,
  allLabel = "All",
  placeholder = "Search...",
}: FilterPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const selected = options.find(o => o.value === value);
  const filtered = search.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        (o.sublabel?.toLowerCase().includes(search.toLowerCase()))
      )
    : options;

  function select(val: string) {
    onChange(val);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors ${
          open ? "border-blue-300 ring-1 ring-blue-400" : "border-gray-200"
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {selected?.avatarInitials && (
            <span className={`h-4 w-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0 ${selected.avatarColor ?? "bg-gray-400"}`}>
              {selected.avatarInitials}
            </span>
          )}
          <span className={`truncate ${selected ? "text-gray-700" : "text-gray-400"}`}>
            {selected ? selected.label : allLabel}
          </span>
        </span>
        <svg
          className={`h-3 w-3 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[220px] bg-white border border-gray-200 rounded-xl shadow-xl z-[100] overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                autoFocus
                type="text"
                placeholder={placeholder}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-400"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto">
            {/* All option */}
            {!search.trim() && (
              <button
                onClick={() => select("")}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  !value ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className={`w-3.5 h-3.5 flex-shrink-0 ${!value ? "opacity-100" : "opacity-0"}`}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-xs font-medium">{allLabel}</span>
              </button>
            )}

            {filtered.map(opt => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  onClick={() => select(opt.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    isSelected ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>

                  {opt.avatarInitials && (
                    <span className={`h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${opt.avatarColor ?? "bg-gray-400"}`}>
                      {opt.avatarInitials}
                    </span>
                  )}

                  <div className="min-w-0">
                    <span className="block text-xs truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span className={`block text-[10px] truncate ${isSelected ? "text-gray-300" : "text-gray-400"}`}>
                        {opt.sublabel}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
