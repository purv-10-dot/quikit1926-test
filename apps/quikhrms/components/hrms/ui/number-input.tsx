"use client";

import { forwardRef, useEffect, useState } from "react";

type Native = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "defaultValue">;

export interface NumberInputProps extends Native {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  allowDecimal?: boolean;
  allowNegative?: boolean;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, allowDecimal = true, allowNegative = false, onBlur, className, ...rest },
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
      value={text}
      onChange={(e) => {
        let raw = e.target.value;
        if (!allowNegative && raw.startsWith("-")) raw = raw.replace(/-/g, "");
        // Integer-only: DROP the fractional part (keep digits before the dot).
        // Previously we deleted the dot itself, which turned "0.5" into "05" → 5
        // (a silent 10× corruption). Truncating gives the correct "0.5" → "0".
        if (!allowDecimal) raw = raw.split(".")[0];
        setText(raw);
        if (raw === "" || raw === "-" || raw === ".") {
          onChange(null);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
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
