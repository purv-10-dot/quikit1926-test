"use client";

import * as React from "react";

// ============================================================================
// Segmented — a flat radiogroup (the All / Mentions / None level control)
// ============================================================================

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible label for the group. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
  className = "",
}: SegmentedProps<T>) {
  const move = (dir: 1 | -1) => {
    const idx = options.findIndex((o) => o.value === value);
    const next = options[(idx + dir + options.length) % options.length];
    if (next) onChange(next.value);
  };
  return (
    <div
      className={`qc-segmented ${className}`.trim()}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="qc-segmented__opt"
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Switch — a flat on/off toggle (role="switch")
// ============================================================================

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, disabled, className = "" }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`qc-switch ${className}`.trim()}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="qc-switch__knob" aria-hidden />
    </button>
  );
}

// ============================================================================
// TimeInput — a thin HH:MM wrapper over <input type="time">
// ============================================================================

export interface TimeInputProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function TimeInput({ value, onChange, label, disabled, className = "" }: TimeInputProps) {
  return (
    <input
      type="time"
      className={`qc-timeinput ${className}`.trim()}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
