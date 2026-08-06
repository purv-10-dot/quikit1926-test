"use client";

/**
 * SearchableSelect — combobox-style dropdown with a type-to-filter
 * search input. Drop-in replacement for a native `<select>` in any
 * form that has long option lists (States, Cities, Locations, Items,
 * Vendors, …) where users were scrolling forever.
 *
 * API is intentionally minimal so any place that hands us a
 * `{ value, label }[]` can swap to searchable without gymnastics:
 *
 *   <SearchableSelect
 *     value={state}
 *     onChange={setState}
 *     options={stateOptions}
 *     placeholder="Select state…"
 *   />
 *
 * Filtering is case-insensitive substring match on `label` (and on
 * `value` as a fallback for pure-code options). Keyboard: Enter
 * commits the highlighted option, Escape closes, Arrow Up/Down moves
 * the highlight.
 *
 * The dropdown panel renders through a portal into `document.body`,
 * positioned from the trigger's bounding rect (same pattern as
 * `GroupedMaterialSelect`). Rendering inline with `position: absolute`
 * broke when this select sits inside a repeated card row (e.g. the
 * RFQ/PO Vendors grid) — later sibling rows/sections painted on top of
 * the open dropdown instead of the dropdown winning purely on z-index,
 * since intervening ancestors don't all form one stacking context.
 * Anchoring to the viewport with `position: fixed` sidesteps that
 * entirely, and also stops the panel being clipped by any scrollable
 * ancestor (the drawer body, in particular).
 */

import { useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X as XIcon } from "lucide-react";

export interface Option {
  value: string;
  label: string;
}

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Emit `""` via onChange and keep the field rendered — useful when
   *  a parent is cascading (e.g. From City needs to reset when From
   *  State changes). Set to false to hide the clear affordance. */
  clearable?: boolean;
  /** Size variant — `sm` fits into dense line-item grids. */
  size?: "sm" | "md";
  /** Optional empty-state text shown when filtering returns zero rows. */
  emptyText?: string;
}

type PanelPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

const ESTIMATED_PANEL_HEIGHT = 240;

function usePanelPosition(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement>,
): PanelPosition | null {
  const [pos, setPos] = useState<PanelPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") {
      setPos(null);
      return;
    }
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const vh = window.innerHeight;
      const spaceBelow = vh - r.bottom;
      const spaceAbove = r.top;
      if (spaceBelow >= ESTIMATED_PANEL_HEIGHT || spaceBelow >= spaceAbove) {
        const maxHeight = Math.max(120, Math.min(ESTIMATED_PANEL_HEIGHT, spaceBelow - 8));
        setPos({ top: r.bottom + 4, left: r.left, width: r.width, maxHeight });
      } else {
        const maxHeight = Math.max(120, Math.min(ESTIMATED_PANEL_HEIGHT, spaceAbove - 8));
        setPos({ bottom: vh - r.top + 4, left: r.left, width: r.width, maxHeight });
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, triggerRef]);

  return pos;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className = "",
  clearable = true,
  size = "md",
  emptyText = "No matches",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const panelPos = usePanelPosition(open, triggerRef);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  // Close when clicking outside the trigger AND the (portalled) panel.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search when dropdown opens, reset highlight to 0 whenever
  // the filtered list changes so the first visible match is picked on
  // Enter. Clears the query on close so next open starts fresh.
  useEffect(() => {
    if (open) {
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[highlight];
      if (pick) commit(pick.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const triggerCls =
    size === "sm"
      ? "w-full px-2 py-1.5 rounded border border-gray-300 text-xs bg-white"
      : "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus-within:ring-2 focus-within:ring-accent-500";
  const triggerDisabled = disabled
    ? "bg-gray-100 text-gray-500 cursor-not-allowed"
    : "";

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`${triggerCls} ${triggerDisabled} flex items-center justify-between gap-2 text-left`}
      >
        <span className={selected ? "truncate text-gray-900" : "truncate text-gray-400"}>
          {selected?.label ?? placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && clearable && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              title="Clear"
            >
              <XIcon className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </span>
      </button>

      {open &&
        panelPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: panelPos.top,
              bottom: panelPos.bottom,
              left: panelPos.left,
              width: panelPos.width,
            }}
            className="z-[100] rounded-lg border border-gray-200 bg-white shadow-lg flex flex-col"
          >
            <div className="px-2 py-2 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-gray-200 bg-gray-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-accent-500">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                />
              </div>
            </div>
            <div
              className="overflow-y-auto py-1"
              style={{ maxHeight: panelPos.maxHeight }}
            >
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-gray-400">
                  {emptyText}
                </div>
              ) : (
                filtered.map((o, idx) => {
                  const isActive = idx === highlight;
                  const isSelected = o.value === value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => commit(o.value)}
                      onMouseEnter={() => setHighlight(idx)}
                      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                        isActive ? "bg-accent-50 text-accent-900" : "hover:bg-gray-50 text-gray-800"
                      } ${isSelected ? "font-semibold" : ""}`}
                    >
                      <span className="truncate">{o.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
