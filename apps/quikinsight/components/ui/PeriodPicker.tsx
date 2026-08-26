"use client";

/**
 * Range + comparison picker.
 *
 * Local rather than from @quikit/ui: this app deliberately does not import
 * @quikit/ui/styles and runs its own design system ported from the prototype,
 * so a Tailwind-styled shared component would not match. Built from the classes
 * that already exist in app/globals.css (.range-select, .pill) plus two new
 * rules (.period-picker, .date-input).
 *
 * Fully controlled. The custom-date drafts are the one piece of local state,
 * because a half-typed range must not fire onChange and trigger a fetch.
 */
import { useEffect, useState } from "react";
import Pill from "@/components/ui/Pill";
import { periodLabel, resolvePeriod } from "@/lib/period/resolve";
import type { CompareMode, PeriodSpec, RangePreset } from "@/lib/period/types";

const RANGE_OPTIONS: Array<{ value: RangePreset; label: string }> = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last 12 months" },
  { value: "custom", label: "Custom range…" },
];

const COMPARE_OPTIONS: Array<{ value: CompareMode; label: string }> = [
  { value: "none", label: "No comparison" },
  { value: "previous", label: "vs. previous period" },
  { value: "wow", label: "vs. previous week" },
  { value: "mom", label: "vs. previous month" },
  { value: "yoy", label: "vs. previous year" },
  { value: "custom", label: "vs. custom range…" },
];

export interface PeriodPickerProps {
  value: PeriodSpec;
  onChange: (next: PeriodSpec) => void;
  /** Hide the comparison control where a baseline is meaningless. */
  allowCompare?: boolean;
  className?: string;
}

export default function PeriodPicker({
  value,
  onChange,
  allowCompare = true,
  className = "",
}: PeriodPickerProps) {
  const [start, setStart] = useState(value.customStart ?? "");
  const [end, setEnd] = useState(value.customEnd ?? "");
  const [cmpStart, setCmpStart] = useState(value.compareStart ?? "");
  const [cmpEnd, setCmpEnd] = useState(value.compareEnd ?? "");

  // Keep drafts in step when the spec changes from outside (e.g. a URL load).
  useEffect(() => {
    setStart(value.customStart ?? "");
    setEnd(value.customEnd ?? "");
    setCmpStart(value.compareStart ?? "");
    setCmpEnd(value.compareEnd ?? "");
  }, [value.customStart, value.customEnd, value.compareStart, value.compareEnd]);

  const resolved = resolvePeriod(value);
  const customIncomplete = value.preset === "custom" && !(start && end && start <= end);
  const compareIncomplete =
    value.compare === "custom" && !(cmpStart && cmpEnd && cmpStart <= cmpEnd);

  /** Commit a custom window only once both ends are present and ordered. */
  function commitCustom(nextStart: string, nextEnd: string) {
    setStart(nextStart);
    setEnd(nextEnd);
    if (nextStart && nextEnd && nextStart <= nextEnd) {
      onChange({ ...value, preset: "custom", customStart: nextStart, customEnd: nextEnd });
    }
  }

  function commitCompare(nextStart: string, nextEnd: string) {
    setCmpStart(nextStart);
    setCmpEnd(nextEnd);
    if (nextStart && nextEnd && nextStart <= nextEnd) {
      onChange({ ...value, compare: "custom", compareStart: nextStart, compareEnd: nextEnd });
    }
  }

  return (
    <div className={`period-picker ${className}`.trim()}>
      <select
        className="range-select"
        aria-label="Date range"
        value={String(value.preset)}
        onChange={(e) => {
          const raw = e.target.value;
          const preset = (raw === "custom" ? "custom" : Number(raw)) as RangePreset;
          // Changing the range keeps the comparison mode — the user picked it.
          onChange({ ...value, preset });
        }}
      >
        {RANGE_OPTIONS.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>

      {value.preset === "custom" && (
        <>
          <input
            type="date"
            className="date-input"
            aria-label="Range start"
            value={start}
            max={end || undefined}
            onChange={(e) => commitCustom(e.target.value, end)}
          />
          <span className="period-picker-sep">→</span>
          <input
            type="date"
            className="date-input"
            aria-label="Range end"
            value={end}
            min={start || undefined}
            onChange={(e) => commitCustom(start, e.target.value)}
          />
        </>
      )}

      {allowCompare && (
        <select
          className="range-select"
          aria-label="Comparison"
          value={value.compare}
          onChange={(e) => onChange({ ...value, compare: e.target.value as CompareMode })}
        >
          {COMPARE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {allowCompare && value.compare === "custom" && (
        <>
          <input
            type="date"
            className="date-input"
            aria-label="Comparison start"
            value={cmpStart}
            max={cmpEnd || undefined}
            onChange={(e) => commitCompare(e.target.value, cmpEnd)}
          />
          <span className="period-picker-sep">→</span>
          <input
            type="date"
            className="date-input"
            aria-label="Comparison end"
            value={cmpEnd}
            min={cmpStart || undefined}
            onChange={(e) => commitCompare(cmpStart, e.target.value)}
          />
        </>
      )}

      {/* Always show the literal windows. Calendar comparisons can legitimately
          differ in length (31-day March vs 28-day February), and naming the mode
          alone would hide that. */}
      {customIncomplete || compareIncomplete ? (
        <Pill tone="neutral">Pick both dates</Pill>
      ) : (
        <Pill tone="neutral">{periodLabel(resolved)}</Pill>
      )}
    </div>
  );
}
