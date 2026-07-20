"use client";

import { forwardRef, useEffect, useState } from "react";

type Native = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "defaultValue" | "min" | "max">;

export interface NumberInputProps extends Native {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  allowDecimal?: boolean;
  allowNegative?: boolean;
  min?: number;
  max?: number;
  /** When true, clamp the value AND the visible text to [min, max] as the user types. */
  clamp?: boolean;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, allowDecimal = true, allowNegative = false, min, max, clamp = false, onBlur, className, ...rest },
  ref,
) {
  const [text, setText] = useState<string>(value === null || value === undefined ? "" : String(value));

  useEffect(() => {
    const next = value === null || value === undefined ? "" : String(value);
    setText((prev) => (Number(prev) === Number(next) && prev !== "" ? prev : next));
  }, [value]);

  return (
    <input
      ref={ref}
      type="number"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      step={allowDecimal ? "any" : "1"}
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        let raw = e.target.value;
        if (!allowNegative && raw.startsWith("-")) raw = raw.replace(/-/g, "");
        // Integer-only: DROP the fractional part (keep digits before the dot).
        // Previously we deleted the dot itself, which turned "0.5" into "05" → 5
        // (a silent 10× corruption). Truncating gives the correct "0.5" → "0".
        if (!allowDecimal) raw = raw.split(".")[0];
        if (raw === "" || raw === "-" || raw === ".") {
          setText(raw);
          onChange(null);
          return;
        }
        let n = Number(raw);
        if (!Number.isFinite(n)) { setText(raw); return; }
        // Live clamp: reflect the ceiling/floor back into the visible text so the
        // user can never type past the limit. Fixes the "already at max" case
        // where clamping in the parent yields the same value, so the controlled
        // `value` never changes and this buffer would otherwise keep growing.
        if (clamp && max != null && n > max) { n = max; raw = String(max); }
        if (clamp && min != null && n < min) { n = min; raw = String(min); }
        setText(raw);
        onChange(n);
      }}
      onBlur={(e) => {
        if (text === "-" || text === ".") setText("");
        onBlur?.(e);
      }}
      className={className}
      {...rest}
    />
  );
});
