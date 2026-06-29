"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface ShareOption {
  value: string;
  label: string;
}

/**
 * Compact, theme-aware dropdown for the share panel — replaces native <select>,
 * whose option popup can't be styled and renders with OS chrome that clashes
 * with the dark UI. Light + dark variants; the menu is an absolutely-positioned
 * popover (the share dialog isn't overflow-clipped, so it can overflow freely).
 */
export function ShareSelect({
  value,
  options,
  onChange,
  disabled,
  align = "left",
  className = "",
}: {
  value: string;
  options: ShareOption[];
  onChange: (next: string) => void;
  disabled?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
          open
            ? "border-blue-400 ring-1 ring-blue-200 dark:border-blue-500 dark:ring-blue-500/30"
            : "border-gray-300 hover:bg-gray-50 dark:border-slate-600 dark:hover:bg-slate-700/60"
        } bg-white text-gray-800 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label ?? "Select"}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform dark:text-slate-400 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute top-full z-40 mt-1 min-w-[9rem] overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o) => {
            const isSel = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  isSel
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                    : "text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-700/60"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {isSel && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
