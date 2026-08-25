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
 * body, it floats above any modal/overflow container instead of being
 * clipped. Values are chosen — never typed. Shared copy of the workflows
 * feature's PortalDropdown (app/(dashboard)/spaces/[id]/settings/workflows/
 * [wfId]/_components/flow/portal-dropdown.tsx) — kept local per this app's
 * "copy the closest analog, don't cross-import between feature folders"
 * convention.
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
  usePills?: boolean;
  disabled?: boolean;
}) {
  const options = optionsProp ?? [];
  const selected = selectedProp ?? [];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const measure = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: r.width });
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
        className="flex min-h-[36px] w-full items-center gap-1 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:opacity-60"
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
            style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, zIndex: 1500 }}
            className="max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            {options.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No options</div>}
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${on ? "bg-blue-50/60 dark:bg-gray-700/60" : ""}`}
                >
                  {multiple && (
                    <input type="checkbox" readOnly checked={on} className="pointer-events-none" />
                  )}
                  {o.pill ? (
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${o.pill}`}>{o.label}</span>
                  ) : (
                    <span className={`text-gray-700 dark:text-gray-300 ${on && !multiple ? "font-medium" : ""}`}>{o.label}</span>
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
