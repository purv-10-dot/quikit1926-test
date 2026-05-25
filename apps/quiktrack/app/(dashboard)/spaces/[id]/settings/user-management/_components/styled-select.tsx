"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface StyledOption {
  value: string;
  label: string;
  sub?: string;
}

interface Props {
  label?: string;
  value: string;
  options: StyledOption[];
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const POPOVER_MAX_H = 280;

export function StyledSelect({ label, value, options, onChange, placeholder, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; flip: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const selected = options.find((o) => o.value === value) ?? null;
  const displayLabel = selected?.label ?? placeholder ?? "Select…";

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    function place() {
      const r = btnRef.current!.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const flip = spaceBelow < POPOVER_MAX_H + 12 && r.top > spaceBelow;
      setPos({
        top: flip ? r.top - 4 : r.bottom + 4,
        left: r.left,
        width: r.width,
        flip,
      });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
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

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div>
      {label && <span className="text-sm text-gray-700 mb-1 block">{label}</span>}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full h-9 px-3 text-sm rounded-md border bg-white inline-flex items-center justify-between gap-2 transition-colors ${
          open ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200 hover:border-gray-300"
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate text-left ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {displayLabel}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {mounted && open && pos &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            style={{
              position: "fixed",
              top: pos.flip ? undefined : pos.top,
              bottom: pos.flip ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              width: pos.width,
              maxHeight: POPOVER_MAX_H,
            }}
            className="z-[1000] bg-white rounded-md shadow-xl border border-gray-200 py-1 overflow-y-auto"
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No options.</div>
            ) : (
              options.map((o) => {
                const isSelected = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pick(o.value)}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-gray-50 ${
                      isSelected ? "bg-blue-50/60" : ""
                    }`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-900 truncate">{o.label}</span>
                      {o.sub && <span className="block text-[11px] text-gray-500 truncate">{o.sub}</span>}
                    </span>
                    {isSelected && <Check className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
