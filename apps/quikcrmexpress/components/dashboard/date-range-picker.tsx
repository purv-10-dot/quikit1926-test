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

export function presetToRange(
  preset: Exclude<RangePreset, "custom">,
  now: Date = new Date(),
): RangeValue {
  switch (preset) {
    case "today":
      return { fromIso: toIsoDate(now), toIso: toIsoDate(now) };
    case "7d":
      return { fromIso: toIsoDate(subDays(now, 6)), toIso: toIsoDate(now) };
    case "30d":
      return { fromIso: toIsoDate(subDays(now, 29)), toIso: toIsoDate(now) };
    case "month":
      return { fromIso: toIsoDate(startOfMonth(now)), toIso: toIsoDate(endOfMonth(now)) };
    case "quarter":
      return {
        fromIso: toIsoDate(startOfQuarter(now)),
        toIso: toIsoDate(endOfQuarter(now)),
      };
  }
}

export function DateRangePicker({
  value,
  onChange,
  preset,
}: {
  value: RangeValue;
  onChange: (v: RangeValue, preset: RangePreset) => void;
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
      if (popRef.current && !popRef.current.contains(e.target as Node))
        setCustomOpen(false);
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
    if (!customFrom || !customTo || customFrom > customTo) return;
    onChange({ fromIso: customFrom, toIso: customTo }, "custom");
    setCustomOpen(false);
  }

  const base =
    "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition";
  const inactive =
    "border-transparent bg-crm-panel/60 text-crm-text hover:border-crm-border hover:bg-crm-panel";
  const active =
    "border-accent-400 bg-accent-50 text-accent-700 shadow-sm";

  return (
    <div className="flex flex-wrap items-center gap-1">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => applyPreset(p.id)}
          className={`${base} ${preset === p.id ? active : inactive}`}
        >
          {p.label}
        </button>
      ))}

      <div className="relative" ref={popRef}>
        <button
          type="button"
          onClick={() => setCustomOpen((o) => !o)}
          className={`${base} gap-1.5 ${preset === "custom" ? active : inactive}`}
        >
          <CalendarRange className="h-3.5 w-3.5 shrink-0" />
          {preset === "custom" ? `${value.fromIso} → ${value.toIso}` : "Custom…"}
        </button>

        {customOpen ? (
          <div className="absolute left-0 z-30 mt-2 w-72 rounded-xl border border-crm-border bg-white p-4 shadow-crm-dropdown">
            <p className="mb-3 text-xs font-semibold text-crm-text">Custom date range</p>
            <label className="block text-xs font-medium text-crm-muted">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              max={customTo || undefined}
              className="mt-1 w-full rounded-lg border border-crm-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <label className="mt-3 block text-xs font-medium text-crm-muted">To</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              min={customFrom || undefined}
              className="mt-1 w-full rounded-lg border border-crm-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="inline-flex h-8 items-center rounded-lg border border-crm-border bg-white px-3 text-xs font-medium text-crm-text hover:bg-crm-panel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCustom}
                className="inline-flex h-8 items-center rounded-lg bg-accent-600 px-4 text-xs font-medium text-white hover:bg-accent-700"
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
