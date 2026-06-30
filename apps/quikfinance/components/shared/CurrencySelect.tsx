"use client";

import { cn } from "@/lib/utils/cn";

const currencies = ["INR", "USD", "EUR", "GBP", "JPY", "CAD", "AUD"];

export function CurrencySelect({
  value,
  onChange,
  className
}: {
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      className={cn("h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring", className)}
    >
      {currencies.map((currency) => (
        <option key={currency} value={currency}>
          {currency}
        </option>
      ))}
    </select>
  );
}
