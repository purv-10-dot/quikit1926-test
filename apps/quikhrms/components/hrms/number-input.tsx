"use client";

import { forwardRef, useState, useEffect, type InputHTMLAttributes, type FocusEvent } from "react";

interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: number;
  onChange: (n: number) => void;
  allowDecimal?: boolean;
  min?: number;
  max?: number;
}

/**
 * Reusable numeric input.
 * - Empty string renders instead of "0" so user doesn't have to backspace to edit.
 * - onFocus selects all so typing replaces value.
 * - Writes back as number (0 when empty).
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ value, onChange, allowDecimal = true, onFocus, min, max, ...rest }, ref) {
    const toText = (v: number) => (v === 0 ? "" : String(v));
    const [text, setText] = useState<string>(() => toText(value));

    // Sync when external value changes (e.g. form reset).
    useEffect(() => {
      setText((prev) => {
        const parsed = prev === "" ? 0 : Number(prev);
        return parsed === value ? prev : toText(value);
      });
    }, [value]);

    const handleChange = (raw: string) => {
      // Allow empty + digits (+ optional decimal).
      const re = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
      if (raw !== "" && !re.test(raw)) return;
      setText(raw);
      if (raw === "" || raw === "-" || raw === ".") {
        onChange(0);
        return;
      }
      const n = Number(raw);
      if (!isNaN(n)) onChange(n);
    };

    const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
      e.target.select();
      onFocus?.(e);
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        value={text}
        placeholder={rest.placeholder ?? "0"}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={(e) => {
          // Clamp on blur
          let n = text === "" ? 0 : Number(text);
          if (isNaN(n)) n = 0;
          if (min !== undefined && n < min) n = min;
          if (max !== undefined && n > max) n = max;
          if (n !== value) onChange(n);
          setText(toText(n));
          rest.onBlur?.(e);
        }}
        {...rest}
      />
    );
  },
);
