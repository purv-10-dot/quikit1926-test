"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PortalDropdown } from "./portal-dropdown";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "9:00 AM" … "8:30 PM" in 30-min steps. */
const TIME_OPTIONS = (() => {
  const out: { value: string; label: string }[] = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const value = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out.push({ value, label: `${h12}:${String(min).padStart(2, "0")} ${ampm}` });
  }
  return out;
})();

/** Format an ISO date (YYYY-MM-DD) as M/D/YYYY for display. */
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
 * A date input with a popover calendar (portalled over the modal), plus an
 * optional 30-min time-of-day dropdown when `withTime` is set. Value is an ISO
 * date string ("YYYY-MM-DD"); time is "HH:MM" (24h).
 */
export function DatePickerInput({
  date,
  time,
  withTime,
  onChange,
}: {
  date: string;
  time: string;
  withTime?: boolean;
  onChange: (date: string, time: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLInputElement>(null);
  const calRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number } | null>(null);

  // The month currently shown in the calendar (derived from `date` or today).
  const initial = useMemo(() => {
    if (date) {
      const [y, m] = date.split("-").map(Number);
      if (y && m) return { y, m0: m - 1 };
    }
    const now = new Date();
    return { y: now.getFullYear(), m0: now.getMonth() };
  }, [date]);
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
    <div className={withTime ? "grid grid-cols-2 gap-3" : ""}>
      <input
        ref={triggerRef}
        type="text"
        readOnly
        value={displayDate(date)}
        onClick={() => setOpen((v) => !v)}
        placeholder="Select a date"
        className="w-full cursor-pointer rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
      />
      {withTime && (
        <PortalDropdown
          placeholder="Select a time"
          options={TIME_OPTIONS}
          selected={time ? [time] : []}
          onChange={(next) => onChange(date, next[0] ?? "")}
        />
      )}

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
                const selected = iso === date;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => { onChange(iso, time); setOpen(false); }}
                    className={`rounded py-1 text-sm ${selected ? "bg-accent-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
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
