"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search, X } from "lucide-react";
import { clsx } from "clsx";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  group?: string;
}

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  error?: boolean;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Reusable good-looking dropdown. Replaces native <select>.
 * Supports search, groups, icons, descriptions, clear button.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select",
  disabled,
  searchable,
  clearable,
  error,
  className,
  size = "md",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        rootRef.current && !rootRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const update = () => {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      // Menu must be wide enough to show full option labels even when the
      // trigger is narrow (e.g. "+ Requisition"). Widen to a minimum, clamp
      // to the viewport, and nudge left so it never overflows the right edge.
      const GUTTER = 8;
      const width = Math.min(Math.max(r.width, 240), window.innerWidth - GUTTER * 2);
      const left = Math.min(r.left, window.innerWidth - width - GUTTER);
      setMenuPos({ top: r.bottom + 4, left: Math.max(GUTTER, left), width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 10);
    }
  }, [open, searchable]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) ||
      (o.description ?? "").toLowerCase().includes(q)
    );
  }, [options, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, SelectOption[]>();
    for (const o of filtered) {
      const g = o.group ?? "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt && !opt.disabled) {
        onChange(opt.value);
        setOpen(false);
        setQuery("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  const sizeClasses = size === "sm"
    ? "h-8 px-2.5 text-secondary"
    : "h-10 px-3 text-body";

  return (
    <div ref={rootRef} className={clsx("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={clsx(
          "w-full flex items-center justify-between gap-2 rounded-lg border bg-white text-left shadow-sm transition",
          "focus:outline-none focus:ring-2",
          disabled && "opacity-60 cursor-not-allowed bg-slate-50",
          error
            ? "border-red-400 focus:ring-red-400"
            : "border-slate-300 hover:border-slate-400 focus:ring-green-500 focus:border-green-500",
          sizeClasses,
        )}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          {selected?.icon && <span className="shrink-0 text-slate-500">{selected.icon}</span>}
          <span className={clsx("truncate", selected ? "text-slate-800 font-medium" : "text-slate-400")}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && selected && !disabled && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="p-0.5 text-slate-400 hover:text-slate-700 rounded"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown
            size={14}
            className={clsx("text-slate-400 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open && menuPos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          className="z-[9999] bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 max-h-72 overflow-auto animate-in fade-in zoom-in-95 duration-150"
        >
          {searchable && (
            <div className="px-2 pb-2 sticky top-0 bg-white border-b border-slate-100">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
                  onKeyDown={onKeyDown}
                  placeholder="Search..."
                  className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-400">No results</div>
          ) : (
            grouped.map(([groupLabel, opts]) => (
              <div key={groupLabel || "_"}>
                {groupLabel && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {groupLabel}
                  </div>
                )}
                {opts.map((opt) => {
                  const idx = filtered.indexOf(opt);
                  const active = opt.value === value;
                  const highlighted = idx === highlight;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={opt.disabled}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => {
                        if (opt.disabled) return;
                        onChange(opt.value);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={clsx(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition",
                        opt.disabled && "opacity-50 cursor-not-allowed",
                        !opt.disabled && highlighted && "bg-green-50",
                        active && "bg-green-50",
                      )}
                    >
                      {opt.icon && (
                        <span className={clsx("shrink-0", active ? "text-green-600" : "text-slate-500")}>
                          {opt.icon}
                        </span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className={clsx("block truncate", active ? "text-green-700 font-semibold" : "text-slate-800")}>
                          {opt.label}
                        </span>
                        {opt.description && (
                          <span className="block text-[11px] text-slate-400 truncate">{opt.description}</span>
                        )}
                      </span>
                      {active && <Check size={14} className="text-green-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
