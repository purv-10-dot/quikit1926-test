"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

/**
 * One inline-editable grid cell.
 *
 * Two variants share this file because they share the tricky parts: committing on
 * blur without double-saving, cancelling on Escape, and — critically — not letting a
 * click inside the cell bubble up to the row, which opens the case detail panel.
 *
 * Optimistic: the new value shows immediately and reverts if the request fails. On a
 * grid, waiting for a round-trip per cell makes editing feel broken.
 */

interface Option {
  value: string;
  label: string;
  /** Optional swatch, so Priority reads the same as its pill. */
  color?: string;
}

/** Stops a cell interaction from triggering the row's open-case handler. */
const swallow = (e: React.SyntheticEvent) => e.stopPropagation();

export function InlineText({
  value,
  onSave,
  disabled,
  className = "",
}: {
  value: string;
  onSave: (next: string) => Promise<boolean>;
  disabled?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = async () => {
    // A queued blur can fire after Escape; the flag makes it a no-op rather than
    // saving the value the user just abandoned.
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    const next = draft.trim();
    setEditing(false);
    if (!next || next === value) {
      setDraft(value);
      return;
    }
    setSaving(true);
    const okay = await onSave(next);
    setSaving(false);
    if (!okay) setDraft(value);
  };

  const cancel = () => {
    cancelRef.current = true;
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        onClick={
          disabled
            ? undefined
            : (e) => {
                swallow(e);
                setEditing(true);
              }
        }
        className={`block truncate rounded px-1 py-0.5 ${
          disabled ? "" : "cursor-text hover:bg-white hover:ring-1 hover:ring-gray-200"
        } ${saving ? "opacity-50" : ""} ${className}`}
        title={disabled ? undefined : "Click to edit"}
      >
        {value}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1" onClick={swallow}>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onClick={swallow}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="min-w-0 flex-1 rounded border border-accent-500 px-1 py-0.5 text-sm focus:outline-none"
      />
      {/* mouseDown + preventDefault keeps focus on the input, so onBlur never races
          with these clicks. */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          void commit();
        }}
        aria-label="Save"
        className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          cancel();
        }}
        aria-label="Cancel"
        className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function InlineSelect({
  value,
  options,
  onSave,
  disabled,
  render,
}: {
  value: string;
  options: Option[];
  onSave: (next: string) => Promise<boolean>;
  disabled?: boolean;
  /** How the value looks when not editing — keeps the existing pills intact. */
  render: (value: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = async (next: string) => {
    setOpen(false);
    if (next === value) return;
    setSaving(true);
    await onSave(next);
    setSaving(false);
  };

  if (disabled) return <>{render(value)}</>;

  return (
    <span ref={boxRef} className="relative inline-block" onClick={swallow}>
      <button
        type="button"
        onClick={(e) => {
          swallow(e);
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white hover:ring-1 hover:ring-gray-200 ${
          saving ? "opacity-50" : ""
        }`}
        title="Click to change"
      >
        {render(value)}
        <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
      </button>

      {open && (
        <span className="absolute left-0 z-30 mt-1 block max-h-56 w-44 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                void pick(o.value);
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent-50 ${
                o.value === value ? "font-medium text-accent-700" : "text-gray-700"
              }`}
            >
              {o.color && (
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: o.color }}
                />
              )}
              <span className="flex-1 truncate">{o.label}</span>
              {o.value === value && <Check className="h-3 w-3 shrink-0" />}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
