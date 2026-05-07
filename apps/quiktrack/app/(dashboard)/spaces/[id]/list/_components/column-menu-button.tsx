"use client";

import { useEffect, useRef, useState } from "react";
import { Columns, RotateCcw } from "lucide-react";
import { COLUMN_DEFS, COLUMN_LABELS } from "./list-columns";

interface Props {
  hidden: Set<string>;
  onToggle: (col: string) => void;
  onShowAll: () => void;
}

export function ColumnMenuButton({ hidden, onToggle, onShowAll }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!open) return;
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const hiddenCount = hidden.size;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Columns"
        className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        <Columns className="h-4 w-4" />
        {hiddenCount > 0 && (
          <span className="rounded-full bg-accent-600 px-1.5 text-[10px] font-medium text-white">
            {COLUMN_DEFS.length - hiddenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded border border-gray-200 bg-white p-1 shadow-lg">
          <div className="max-h-72 overflow-y-auto">
            {COLUMN_DEFS.map((c) => {
              const visible = !hidden.has(c.key);
              const disabled = c.required;
              return (
                <label
                  key={c.key}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${disabled ? "text-gray-400" : "text-gray-700 hover:bg-gray-50 cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    checked={visible || disabled}
                    disabled={disabled}
                    onChange={() => !disabled && onToggle(c.key)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                  />
                  <span className="flex-1">{COLUMN_LABELS[c.key]}</span>
                </label>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => { onShowAll(); setOpen(false); }}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              <RotateCcw className="h-3 w-3" /> Show all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
