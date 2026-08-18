"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function displayDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

function isoOf(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * A date input with a popover calendar portalled over document.body. Value is
 * an ISO date string ("YYYY-MM-DD"), empty string = unset. Date-only variant
 * of the workflows feature's DatePickerInput (app/(dashboard)/spaces/[id]/
 * settings/workflows/[wfId]/_components/flow/date-picker-input.tsx) — kept as
 * a local copy per this app's "copy the closest analog" convention.
 */
export function DatePickerInput({
  value,
  onChange,
  placeholder = "Select a date",
}: {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number } | null>(null);

  const initial = useMemo(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      if (y && m) return { y, m0: m - 1 };
    }
    const now = new Date();
    return { y: now.getFullYear(), m0: now.getMonth() };
  }, [value]);
  const [view, setView] = useState(initial);
  useEffect(() => setView(initial), [initial]);

  const measure = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4 });
  };
  useLayoutEffect(() => { if (open) measure(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || calRef.current?.contains(t)) return;
      setOpen(false);
    };
    const reposition = () => measure();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const firstDow = new Date(view.y, view.m0, 1).getDay();
  const daysInMonth = new Date(view.y, view.m0 + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const stepMonth = (delta: number) => {
    const m = view.m0 + delta;
    setView({ y: view.y + Math.floor(m / 12), m0: ((m % 12) + 12) % 12 });
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded border border-gray-300 px-3 text-sm text-left hover:bg-gray-50 focus:border-blue-500 focus:outline-none"
      >
        <span className={value ? "text-gray-800" : "text-gray-400"}>
          {value ? displayDate(value) : placeholder}
        </span>
        {value && (
          <X
            className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        )}
      </button>

      {open && rect &&
        createPortal(
          <div
            ref={calRef}
            style={{ position: "fixed", left: rect.left, top: rect.top, zIndex: 60, width: 280 }}
            className="rounded-md border border-gray-200 bg-white p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => stepMonth(-1)} className="rounded p-1 text-gray-500 hover:bg-gray-100">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-gray-800">{MONTHS[view.m0]} {view.y}</span>
              <button type="button" onClick={() => stepMonth(1)} className="rounded p-1 text-gray-500 hover:bg-gray-100">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w) => (
                <span key={w} className="text-[11px] font-medium text-gray-400">{w}</span>
              ))}
              {cells.map((d, i) => {
                if (d == null) return <span key={`e${i}`} />;
                const iso = isoOf(view.y, view.m0, d);
                const selected = iso === value;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => { onChange(iso); setOpen(false); }}
                    className={`rounded py-1 text-sm ${selected ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
