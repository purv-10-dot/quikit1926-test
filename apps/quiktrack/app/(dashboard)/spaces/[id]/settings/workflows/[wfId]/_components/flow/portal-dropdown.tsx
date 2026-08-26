"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  /** Optional colored pill classes (e.g. status categories). */
  pill?: string;
}

/**
 * A select/multiselect whose menu renders into document.body, positioned over
 * the trigger via getBoundingClientRect. Because the menu is portalled to the
 * body (not nested inside the modal's overflow-y-auto body), it floats ABOVE
 * the modal instead of being clipped by it. Values are chosen — never typed.
 */
export function PortalDropdown({
  options: optionsProp,
  selected: selectedProp,
  onChange,
  multiple,
  placeholder = "Select option",
  usePills,
  disabled,
}: {
  options: DropdownOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  /** Render chosen values as colored pills instead of plain text. */
  usePills?: boolean;
  /** When true, the trigger is greyed out and won't open the menu. */
  disabled?: boolean;
}) {
  // Defensive: a caller passing an undefined config field (e.g. a brand-new rule
  // whose config keys aren't set yet) must not crash the whole editor on
  // `selected.length` / `options.length`. Treat missing arrays as empty.
  const options = optionsProp ?? [];
  const selected = selectedProp ?? [];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{
    left: number;
    /** Set when opening downward — distance from viewport top to the menu top. */
    top?: number;
    /** Set when opening upward — distance from viewport bottom to the menu bottom. */
    bottom?: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  // Position the menu below the trigger by default, but flip it ABOVE when the
  // trigger sits near the viewport bottom (otherwise the fixed-position menu is
  // clipped off-screen — e.g. the "Select field" dropdown at the end of a long
  // Screens config). When flipping up we anchor the menu's BOTTOM to just above
  // the trigger (not its top) so a short list hugs the trigger instead of
  // floating high with empty space beneath it. Height is capped to the
  // available space so it always fits and scrolls internally if long.
  const measure = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const margin = 8; // keep a little breathing room from the viewport edge
    const spaceBelow = window.innerHeight - r.bottom - gap - margin;
    const spaceAbove = r.top - gap - margin;
    const desired = 240; // matches the menu's max-h-60
    const openUp = spaceBelow < Math.min(desired, 160) && spaceAbove > spaceBelow;
    if (openUp) {
      setRect({
        left: r.left,
        bottom: window.innerHeight - r.top + gap,
        width: r.width,
        maxHeight: Math.max(120, Math.min(desired, spaceAbove)),
      });
    } else {
      setRect({
        left: r.left,
        top: r.bottom + gap,
        width: r.width,
        maxHeight: Math.max(120, Math.min(desired, spaceBelow)),
      });
    }
  };

  useLayoutEffect(() => {
    if (open) measure();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => measure();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onScrollOrResize);
    // capture:true so we reposition when the modal body (or any ancestor) scrolls.
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  const toggle = (value: string) => {
    if (multiple) {
      onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
    } else {
      onChange([value]);
      setOpen(false);
    }
  };

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const pillOf = (v: string) => options.find((o) => o.value === v)?.pill;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        className="flex min-h-[38px] w-full items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-left text-sm focus:border-accent-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60"
      >
        <span className="flex flex-1 flex-wrap items-center gap-1">
          {selected.length === 0 ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : multiple ? (
            selected.map((v) => (
              <span
                key={v}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${usePills ? pillOf(v) ?? "bg-gray-100 text-gray-700" : "bg-gray-100 text-gray-700"}`}
              >
                {labelOf(v)}
                <X
                  className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); toggle(v); }}
                />
              </span>
            ))
          ) : usePills && pillOf(selected[0]) ? (
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${pillOf(selected[0])}`}>
              {labelOf(selected[0])}
            </span>
          ) : (
            <span className="text-gray-800">{labelOf(selected[0])}</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {open && rect &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: rect.left,
              ...(rect.top !== undefined ? { top: rect.top } : { bottom: rect.bottom }),
              width: rect.width,
              maxHeight: rect.maxHeight,
              zIndex: 60,
            }}
            className="overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          >
            {options.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No options</div>}
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${on ? "bg-blue-50/60" : ""}`}
                >
                  {multiple && (
                    <input type="checkbox" readOnly checked={on} className="pointer-events-none" />
                  )}
                  {o.pill ? (
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${o.pill}`}>{o.label}</span>
                  ) : (
                    <span className={`text-gray-700 ${on && !multiple ? "font-medium" : ""}`}>{o.label}</span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
