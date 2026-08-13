"use client";

/**
 * Generic searchable single-select dropdown — same trigger + open-card
 * aesthetic as UserPicker but for non-people lists (status, currency,
 * year, role, plan, etc.).
 *
 *   - searchable: false (default) — for ≤8 options. No search box.
 *   - searchable: true            — adds a search input above the list.
 *   - groups                       — optional group headers for nested lists.
 *
 * The popup renders in a portal (`position: fixed`, anchored to the trigger's
 * rect) so it escapes any `overflow-hidden`/`overflow-y-auto` ancestor —
 * without this, a trigger near the bottom of a scroll-clipped card (e.g. a
 * form's last field row) can have its own options sliced off even though
 * they're all present in `options`. Same technique as UserSelect, which
 * hit the identical bug for the same reason; see its comment for the
 * original repro (RightPanel form body clipping the lower rows).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional sublabel rendered as a small line under the main label. */
  hint?: string;
  /** Optional group key — when set on every option, items are grouped. */
  group?: string;
}

export interface DropdownPickerProps<T extends string = string> {
  value: T | "";
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  /** Trigger text override when nothing is selected. */
  emptyLabel?: string;
  /** Class name forwarded to the trigger button. */
  className?: string;
  /** Pixel max-height for the open list (default 256). Clamped down further
   *  when there isn't this much room in the viewport — see `updatePosition`. */
  maxListHeight?: number;
}

/** Where the portal-rendered menu is painted (fixed, viewport-relative). */
interface MenuPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

export function DropdownPicker<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchable = false,
  disabled = false,
  className = "",
  maxListHeight = 256,
}: DropdownPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  // Anchor to the trigger's rect; flip above it when there isn't room below.
  // Mirrors UserSelect's `updatePosition` exactly, using `maxListHeight` as
  // the cap instead of a hardcoded value so existing callers' sizing intent
  // is preserved.
  const updatePosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const GAP = 4;
    const MARGIN = 8; // keep a little breathing room from the viewport edge
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const avail = (openUp ? spaceAbove : spaceBelow) - GAP - MARGIN;
    const maxHeight = Math.max(120, Math.min(maxListHeight, avail));
    setPos({
      left: rect.left,
      width: rect.width,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
      maxHeight,
    });
  }, [maxListHeight]);

  // Position the menu when it opens; clear it when closed. Gating the menu's
  // render on `pos` means it never flashes at the wrong spot before measuring.
  useEffect(() => {
    if (open) updatePosition();
    else setPos(null);
  }, [open, updatePosition]);

  // Keep the menu pinned to the trigger while an ancestor scrolls/resizes
  // (capture phase catches scrolls on inner overflow containers too).
  useEffect(() => {
    if (!open) return;
    const onMove = () => updatePosition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    // Checks BOTH the trigger and the portaled menu — the menu is no longer a
    // DOM descendant of `ref` once rendered via createPortal, so relying on
    // `ref` alone would treat every click inside the open menu as "outside".
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
      setSearch("");
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.hint?.toLowerCase().includes(q) ||
          o.group?.toLowerCase().includes(q)
      )
    : options;

  // Group by `group` field when any option has one.
  const grouped = filtered.reduce<Record<string, DropdownOption<T>[]>>((acc, o) => {
    const k = o.group ?? "";
    (acc[k] ??= []).push(o);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped);
  const showGroups = groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== "");

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 ${
          disabled
            ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-70"
            : "border-gray-200 hover:bg-gray-50 text-gray-800"
        }`}
      >
        <span className="truncate text-left">
          {selected ? selected.label : <span className="text-gray-400">{placeholder}</span>}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: pos.left,
            width: pos.width,
            ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
          }}
          className="z-[260] bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
        >
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full px-3 py-1.5 text-xs border border-accent-300 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </div>
          )}

          <div className="overflow-y-auto" style={{ maxHeight: pos.maxHeight }}>
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs italic text-gray-400">No matches</p>
            ) : showGroups ? (
              groupKeys.map((g) => (
                <div key={g}>
                  {g && (
                    <p className="sticky top-0 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      {g}
                    </p>
                  )}
                  {grouped[g].map((opt) => (
                    <Item key={opt.value} opt={opt} selected={opt.value === value} onPick={(v) => { onChange(v); setOpen(false); setSearch(""); }} />
                  ))}
                </div>
              ))
            ) : (
              filtered.map((opt) => (
                <Item key={opt.value} opt={opt} selected={opt.value === value} onPick={(v) => { onChange(v); setOpen(false); setSearch(""); }} />
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Item<T extends string>({ opt, selected, onPick }: { opt: DropdownOption<T>; selected: boolean; onPick: (v: T) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(opt.value)}
      className={`w-full flex items-start gap-2 px-3 py-2 text-xs text-left hover:bg-gray-50 ${
        selected ? "bg-accent-50 text-accent-700" : "text-gray-800"
      }`}
    >
      <span className="w-4 flex-shrink-0 mt-0.5">
        {selected && <Check className="h-3.5 w-3.5 text-accent-600" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate font-medium">{opt.label}</span>
        {opt.hint && <span className="block truncate text-[11px] text-gray-400">{opt.hint}</span>}
      </span>
    </button>
  );
}
