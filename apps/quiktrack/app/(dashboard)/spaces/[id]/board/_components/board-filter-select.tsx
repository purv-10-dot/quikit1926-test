"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

export interface BoardFilterOption {
  value: string;
  label: string;
}

export function BoardFilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Any",
  searchable = false,
  rightLabel,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: BoardFilterOption[];
  placeholder?: string;
  searchable?: boolean;
  rightLabel?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openUp: boolean;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuHeight = Math.min(320, options.length * 32 + 16);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + 16 && rect.top > menuHeight + 16;
    setCoords({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const triggerLabel = selected ? selected.label : placeholder;

  const q = query.trim().toLowerCase();
  const filteredOptions = searchable && q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  const menu =
    open && coords && typeof window !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: "fixed",
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              minWidth: coords.width,
              zIndex: 1100,
            }}
            className="bg-white border border-gray-200 rounded-md shadow-[0_12px_32px_-10px_rgba(15,23,42,0.18),0_4px_12px_-4px_rgba(15,23,42,0.08)] overflow-hidden max-h-[20rem] flex flex-col dark:bg-gray-900 dark:border-gray-700"
          >
            {searchable && (
              <div className="relative border-b border-gray-100 px-2 py-1.5 dark:border-gray-700">
                <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full h-7 pl-7 pr-2 text-[12.5px] bg-transparent border-none outline-none text-gray-800 placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </div>
            )}
            <div className="overflow-y-auto py-1">
            {filteredOptions.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value || "__any"}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors ${
                    active
                      ? "bg-accent-50 text-accent-700 font-medium dark:bg-accent-600 dark:text-white"
                      : "text-gray-700 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {active && <Check className="h-3.5 w-3.5 text-accent-600 shrink-0 dark:text-white" />}
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500">No options.</p>
            )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="mb-2 text-xs">
      {(label || rightLabel) && (
        <div className="mb-1 flex items-center justify-between">
          {label ? (
            <span className="block font-medium text-gray-600 dark:text-gray-300">{label}</span>
          ) : <span />}
          {rightLabel}
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative w-full h-8 pl-2.5 pr-8 inline-flex items-center justify-between text-left border rounded text-sm transition-colors cursor-pointer ${
          open
            ? "border-accent-400 bg-white ring-1 ring-accent-300 dark:bg-gray-800 dark:border-accent-400/50 dark:ring-accent-400/40"
            : "border-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-800/60 dark:border-gray-700 dark:hover:bg-gray-700/60"
        }`}
      >
        <span
          className={`truncate ${
            selected && value
              ? "text-gray-800 dark:text-gray-100"
              : "text-gray-700 dark:text-gray-200"
          }`}
        >
          {triggerLabel}
        </span>
        <ChevronDown
          className={`absolute right-2.5 h-3.5 w-3.5 text-gray-400 transition-transform dark:text-gray-500 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {menu}
    </div>
  );
}
