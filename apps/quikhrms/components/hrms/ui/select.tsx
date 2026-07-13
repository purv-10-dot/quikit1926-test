"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search as SearchIcon } from "lucide-react";
import { clsx } from "clsx";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
  optional?: boolean;
  searchable?: boolean;
  size?: "sm" | "md";
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select",
  required = false,
  disabled = false,
  className,
  label,
  optional = false,
  searchable = false,
  size = "md",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [placeUp, setPlaceUp] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Recompute menu position whenever the trigger moves (open, scroll, resize).
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const t = triggerRef.current;
      if (!t) return;
      const rect = t.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const menuMax = 280;
      const up = below < menuMax && above > below;
      setPlaceUp(up);
      // The menu must be wide enough to show full option labels (e.g.
      // "Father-in-law") even when the trigger sits in a narrow column.
      // Widen to a sensible minimum, but clamp to the viewport and nudge left
      // so it never overflows the right edge.
      const GUTTER = 8;
      const width = Math.min(Math.max(rect.width, 200), window.innerWidth - GUTTER * 2);
      const left = Math.min(rect.left, window.innerWidth - width - GUTTER);
      setMenuRect({
        top: up ? rect.top - 6 : rect.bottom + 6,
        left: Math.max(GUTTER, left),
        width,
      });
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable) setTimeout(() => inputRef.current?.focus(), 40);
    if (!open) setQuery("");
    setHighlight(0);
  }, [open, searchable]);

  const pick = (o: SelectOption) => {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const opt = filtered[highlight]; if (opt) pick(opt); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  const triggerPad = size === "sm" ? "h-8 px-2.5 text-secondary" : "h-10 px-3 text-body";

  return (
    <div className={className} ref={rootRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
          {optional && <span className="text-gray-400 font-normal"> (optional)</span>}
          {required && !optional && <span className="text-red-500"> *</span>}
        </label>
      )}

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          className={clsx(
            "w-full flex items-center gap-2 border rounded-lg text-left transition",
            triggerPad,
            "focus:outline-none focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e]",
            open ? "border-[#22c55e] ring-2 ring-[#22c55e]/20" : "border-gray-300 hover:border-gray-400",
            disabled && "bg-gray-50 cursor-not-allowed opacity-60",
          )}
          onKeyDown={onKeyDown}
        >
          <span className={clsx("flex-1 truncate", selected ? "text-gray-900" : "text-gray-400")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown size={14} className={clsx("text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
        </button>

        {required && (
          <input tabIndex={-1} aria-hidden required value={value} onChange={() => {}} className="sr-only" />
        )}

        {open && menuRect && typeof window !== "undefined" && createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: placeUp ? undefined : menuRect.top,
              bottom: placeUp ? window.innerHeight - menuRect.top : undefined,
              left: menuRect.left,
              width: menuRect.width,
              zIndex: 1000,
            }}
            className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
          >
            {searchable && (
              <div className="p-2 border-b border-gray-100 bg-gray-50">
                <div className="relative">
                  <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Search..."
                    className="w-full pl-8 pr-2 py-1.5 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#22c55e] focus:border-[#22c55e]"
                  />
                </div>
              </div>
            )}

            <ul className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-center text-xs text-gray-400">No matches</li>
              ) : filtered.map((o, i) => {
                const isSelected = o.value === value;
                const isHighlight = i === highlight;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(o)}
                      disabled={o.disabled}
                      className={clsx(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] transition",
                        o.disabled && "opacity-40 cursor-not-allowed",
                        !o.disabled && isSelected && "bg-emerald-50",
                        !o.disabled && isHighlight && !isSelected && "bg-gray-50",
                        !o.disabled && !isHighlight && !isSelected && "hover:bg-gray-50",
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={clsx("truncate", isSelected ? "text-emerald-700 font-medium" : "text-gray-900")}>
                          {o.label}
                        </div>
                        {o.description && (
                          <div className={clsx("text-[11px] truncate", isSelected ? "text-emerald-600/80" : "text-gray-500")}>
                            {o.description}
                          </div>
                        )}
                      </div>
                      {isSelected && <Check size={14} className="shrink-0 text-emerald-600" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}
