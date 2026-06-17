"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { BoardFilterOption } from "./board-filter-select";

/**
 * Multi-select sibling of {@link BoardFilterSelect}. The selection is held as a
 * comma-joined string (e.g. "id1,id2", or "null" for Unassigned) so it stays a
 * drop-in replacement wherever a single `value: string` / `onChange(v)` filter
 * was used — the issues API already expands the comma list into an IN/OR.
 */
export function BoardFilterMultiSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Any",
  summaryNoun = "selected",
  searchable = true,
  inline = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: BoardFilterOption[];
  placeholder?: string;
  /** Noun used in the "N selected" trigger summary, e.g. "people". */
  summaryNoun?: string;
  searchable?: boolean;
  /** Borderless trigger that blends into a details panel. */
  inline?: boolean;
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

  const selected = value ? value.split(",").filter(Boolean) : [];
  const selectedSet = new Set(selected);
  const hasSelection = selected.length > 0;

  const toggle = (v: string) => {
    const next = selectedSet.has(v)
      ? selected.filter((x) => x !== v)
      : [...selected, v];
    onChange(next.join(","));
  };

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuHeight = Math.min(340, options.length * 32 + (searchable ? 48 : 0) + 16);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + 16 && rect.top > menuHeight + 16;
    setCoords({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  }, [open, options.length, searchable]);

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

  const triggerLabel = !hasSelection
    ? placeholder
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? `1 ${summaryNoun}`
      : `${selected.length} ${summaryNoun}`;

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
            aria-multiselectable
            data-portal-popover
            style={{
              position: "fixed",
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              minWidth: coords.width,
              zIndex: 1100,
            }}
            className="bg-white border border-gray-200 rounded-md shadow-[0_12px_32px_-10px_rgba(15,23,42,0.18),0_4px_12px_-4px_rgba(15,23,42,0.08)] overflow-hidden max-h-[21rem] flex flex-col dark:bg-gray-900 dark:border-gray-700"
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
                const active = selectedSet.has(opt.value);
                return (
                  <button
                    key={opt.value || "__any"}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => toggle(opt.value)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors ${
                      active
                        ? "bg-accent-50 text-accent-700 font-medium dark:bg-accent-600 dark:text-white"
                        : "text-gray-700 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                    }`}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                        active
                          ? "border-accent-600 bg-accent-600 dark:border-white dark:bg-white"
                          : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800"
                      }`}
                      aria-hidden
                    >
                      {active && (
                        <Check className="h-2.5 w-2.5 text-white dark:text-accent-700" />
                      )}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
              {filteredOptions.length === 0 && (
                <p className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500">No options.</p>
              )}
            </div>
            {hasSelection && (
              <div className="border-t border-gray-100 p-1 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => onChange("")}
                  className="flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <X className="h-3 w-3" /> Clear ({selected.length})
                </button>
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={inline ? "text-xs" : "mb-2 text-xs"}>
      {label && (
        <div className="mb-1 flex items-center justify-between">
          <span className="block font-medium text-gray-600 dark:text-gray-300">{label}</span>
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative w-full h-8 pl-2.5 pr-8 inline-flex items-center justify-between text-left border rounded text-sm transition-colors cursor-pointer ${
          open
            ? "border-accent-400 bg-white ring-1 ring-accent-300 dark:bg-gray-800 dark:border-accent-400/50 dark:ring-accent-400/40"
            : inline
              ? "border-transparent bg-transparent hover:bg-gray-50 dark:border-transparent dark:hover:bg-gray-700/60"
              : "border-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-800/60 dark:border-gray-700 dark:hover:bg-gray-700/60"
        }`}
      >
        <span
          className={`truncate ${
            hasSelection
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
