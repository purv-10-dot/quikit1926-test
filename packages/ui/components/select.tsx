"use client";

import React from "react";

/**
 * Shared Select component — standardized native <select> wrapper.
 *
 * Matches QuikScale's form select pattern:
 * - text-sm, border-gray-200, rounded-lg, focus:ring-1 ring-accent-400
 * - Optional label + error display
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  /** Optional label displayed above the select */
  label?: string;
  /** Error message displayed below the select */
  error?: string;
  /** Options to render */
  options: SelectOption[];
  /** Placeholder option (disabled, shown when no value selected) */
  placeholder?: string;
}

export function Select({
  label,
  error,
  options,
  placeholder,
  id,
  className = "",
  ...props
}: SelectProps) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div>
      {label && (
        <label
          htmlFor={selectId}
          className="text-xs font-medium text-gray-600 block mb-1.5"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 bg-white transition-colors ${
          error
            ? "border-red-300 focus:ring-red-400"
            : "border-gray-200 focus:ring-accent-400"
        } ${className}`}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
