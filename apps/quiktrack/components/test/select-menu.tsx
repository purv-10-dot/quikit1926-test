"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * Custom dropdown for QuikTest, replacing native `<select>`.
 *
 * A native select renders the OS widget: on Windows that is the grey box with
 * mismatched fonts and a hard-coded blue highlight visible in the screenshots —
 * it cannot be styled to match the rest of the app, and it cannot show a colour
 * swatch or a description per option.
 *
 * Behaviour deliberately kept equivalent to the native control it replaces:
 * click/Enter/Space to open, Up/Down to move, Enter to choose, Escape to cancel,
 * Tab to leave, click-outside to dismiss. Typing a letter jumps to the next
 * matching option, which is the one native affordance people actually rely on.
 *
 * TODO(integration): upstream to @quikit/ui once the API settles — every app here
 * has the same native-select problem.
 */

export interface SelectMenuOption {
  value: string;
  label: string;
  /** Optional second line, e.g. what a template does. */
  hint?: string;
  /** Optional leading colour dot, e.g. a status colour. */
  color?: string;
}

interface SelectMenuProps {
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Rendered invisibly for screen readers when there is no visible <label>. */
  ariaLabel?: string;
  className?: string;
}

export function SelectMenu({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled,
  ariaLabel,
  className = "",
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Open with the current value highlighted rather than the first option, so
  // Up/Down moves relative to what is actually selected.
  useEffect(() => {
    if (open) setActive(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted row in view when navigating by keyboard.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const commit = (index: number) => {
    const opt = options[index];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "Tab") {
      // Let focus leave naturally rather than trapping it.
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit(active);
      return;
    }

    // Type-ahead: jump to the next option starting with the typed letter,
    // wrapping, so repeated presses cycle matches like a native select.
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const ch = e.key.toLowerCase();
      const n = options.length;
      for (let step = 1; step <= n; step++) {
        const i = (active + step) % n;
        if (options[i].label.toLowerCase().startsWith(ch)) {
          setActive(i);
          break;
        }
      }
    }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
            : open
              ? "border-accent-500 bg-white text-gray-900 ring-2 ring-accent-100 dark:bg-gray-900 dark:text-gray-100 dark:ring-accent-900/40"
              : "border-gray-300 bg-white text-gray-900 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-gray-500"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.color && (
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: selected.color }}
            />
          )}
          <span className={`truncate ${selected ? "" : "text-gray-400"}`}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          // z-50 clears the RightPanel's own stacking context; max-h keeps a long
          // list (e.g. every project member) from running off-screen.
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {options.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400">No options</li>
          )}
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  // mousedown, not click: the outside-click handler fires on
                  // mousedown and would close the menu before click landed.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(i);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm ${
                    i === active ? "bg-accent-50 dark:bg-gray-700" : ""
                  } ${isSelected ? "font-medium text-accent-700 dark:text-accent-300" : "text-gray-700 dark:text-gray-300"}`}
                >
                  {opt.color && (
                    <span
                      className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{opt.label}</span>
                    {opt.hint && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-gray-400">
                        {opt.hint}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
