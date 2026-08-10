"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange } from "lucide-react";
import {
  endOfMonth,
  endOfQuarter,
  format,
  startOfMonth,
  startOfQuarter,
  subDays,
} from "date-fns";

export type RangePreset = "today" | "7d" | "30d" | "month" | "quarter" | "custom";

export type RangeValue = { fromIso: string; toIso: string };

const PRESETS: { id: Exclude<RangePreset, "custom">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "month", label: "This month" },
  { id: "quarter", label: "This quarter" },
];

function toIsoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function presetToRange(preset: Exclude<RangePreset, "custom">, now: Date = new Date()): RangeValue {
  const today = now;
  switch (preset) {
    case "today":
      return { fromIso: toIsoDate(today), toIso: toIsoDate(today) };
    case "7d":
      return { fromIso: toIsoDate(subDays(today, 6)), toIso: toIsoDate(today) };
    case "30d":
      return { fromIso: toIsoDate(subDays(today, 29)), toIso: toIsoDate(today) };
    case "month":
      return { fromIso: toIsoDate(startOfMonth(today)), toIso: toIsoDate(endOfMonth(today)) };
    case "quarter":
      return { fromIso: toIsoDate(startOfQuarter(today)), toIso: toIsoDate(endOfQuarter(today)) };
  }
}

export function DateRangePicker({
  value,
  onChange,
  preset,
}: {
  value: RangeValue;
  onChange: (v: RangeValue, preset: RangePreset) => void;
  /** Currently active preset (or "custom" if none match). */
  preset: RangePreset;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.fromIso);
  const [customTo, setCustomTo] = useState(value.toIso);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomFrom(value.fromIso);
    setCustomTo(value.toIso);
  }, [value.fromIso, value.toIso]);

  useEffect(() => {
    if (!customOpen) return;
    const onClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setCustomOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCustomOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [customOpen]);

  function applyPreset(id: Exclude<RangePreset, "custom">) {
    onChange(presetToRange(id), id);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    if (customFrom > customTo) return;
    onChange({ fromIso: customFrom, toIso: customTo }, "custom");
    setCustomOpen(false);
  }

  const btnBase =
    "inline-flex h-8 items-center gap-1 rounded-md border border-crm-border bg-white px-2.5 text-xs font-medium text-crm-text shadow-sm transition hover:bg-crm-panel";
  const activeBtn = "border-crm-blue bg-crm-blue-soft text-crm-blue";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => applyPreset(p.id)}
          className={`${btnBase} ${preset === p.id ? activeBtn : ""}`}
        >
          {p.label}
        </button>
      ))}
      <div className="relative" ref={popRef}>
        <button
          type="button"
          onClick={() => setCustomOpen((o) => !o)}
          className={`${btnBase} ${preset === "custom" ? activeBtn : ""}`}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          {preset === "custom" ? `${value.fromIso} → ${value.toIso}` : "Custom…"}
        </button>
        {customOpen ? (
          <div className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-crm-border bg-white p-3 shadow-crm-dropdown">
            <label className="block text-xs text-crm-muted">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              max={customTo || undefined}
              className="mt-1 w-full rounded-md border border-crm-border bg-white px-2 py-1.5 text-sm"
            />
            <label className="mt-2 block text-xs text-crm-muted">To</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              min={customFrom || undefined}
              className="mt-1 w-full rounded-md border border-crm-border bg-white px-2 py-1.5 text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className={btnBase}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCustom}
                className="inline-flex h-8 items-center rounded-md bg-crm-blue px-3 text-xs font-medium text-white hover:bg-crm-blue-dark"
              >
                Apply
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
