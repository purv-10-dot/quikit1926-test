"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export function MultiSelectDropdown({
  options,
  value,
  onChange,
  placeholder = "— Select —",
  disabled = false,
  invalid = false,
}: {
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const displayLabel =
    value.length === 0
      ? placeholder
      : value.length <= 2
        ? value.join(", ")
        : `${value.length} selected`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function toggle(option: string) {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={[
          "crm-input flex w-full items-center justify-between gap-2 text-left text-sm disabled:opacity-60",
          invalid ? "border-red-500 ring-1 ring-red-200" : "",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
      >
        <span className={value.length > 0 ? "truncate text-crm-text" : "truncate text-crm-muted"}>
          {displayLabel}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-crm-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && !disabled ? (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-crm-border bg-white shadow-crm-dropdown"
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-multiselectable className="max-h-56 overflow-auto py-1">
            {options.map((option) => {
              const checked = value.includes(option);
              return (
                <li key={option}>
                  <label
                    className={[
                      "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-crm-panel",
                      checked ? "bg-accent-50 text-accent-800" : "text-crm-text",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(option)}
                      className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-400"
                    />
                    <span>{option}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
