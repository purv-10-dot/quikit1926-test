"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, X } from "lucide-react";

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
  minWidth = 170,
}: {
  label: string;
  icon?: React.ElementType;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No options</div>
          ) : (
            options.map((o) => {
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
