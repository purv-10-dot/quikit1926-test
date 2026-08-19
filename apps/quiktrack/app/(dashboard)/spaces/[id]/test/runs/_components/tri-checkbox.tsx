"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Checkbox with a real indeterminate ("some children ticked") state.
 *
 * `@quikit/ui`'s Checkbox cannot express this: indeterminate is a DOM *property*,
 * not an HTML attribute, so it has to be assigned to the element after render —
 * passing it as a prop would just put an unknown attribute on the input and show
 * nothing. The folder rows in the case picker need the third state to be
 * readable at a glance, hence this local primitive.
 *
 * TODO(integration): upstream an `indeterminate` prop to @quikit/ui's Checkbox
 * and delete this file.
 */

interface TriCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
}

export function TriCheckbox({
  checked,
  indeterminate = false,
  disabled,
  onChange,
  label,
  ariaLabel,
}: TriCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      // A checked box is never also indeterminate — guard so a stale prop pair
      // can't render a ticked-and-dashed box.
      ref.current.indeterminate = indeterminate && !checked;
    }
  }, [indeterminate, checked]);

  return (
    <label
      className={`flex items-start gap-2 text-sm text-gray-700 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } select-none`}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-400 focus:ring-offset-0"
      />
      {label && <span className="leading-tight">{label}</span>}
    </label>
  );
}
