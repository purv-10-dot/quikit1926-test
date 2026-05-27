"use client";

import { useRef } from "react";
import { Calendar as CalIcon, X } from "lucide-react";

interface DateCellProps {
  value: string | null;
  onCommit: (iso: string | null) => void;
  placeholder?: string;
}

function toInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fromInput(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function DateCell({ value, onCommit, placeholder = "—" }: DateCellProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const display = value ? new Date(value).toLocaleDateString() : null;

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      /* older Safari falls through */
    }
    input.focus();
    input.click();
  }

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      draggable={false}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-clear-date]")) return;
        openPicker();
      }}
      className="flex items-center justify-center gap-1 hover:bg-gray-100 rounded px-1 py-0.5 cursor-pointer w-full min-w-0"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      }}
    >
      <CalIcon className="h-3 w-3 text-gray-400 shrink-0" />
      <span className={`text-xs truncate ${display ? "text-gray-700" : "text-gray-400"}`}>
        {display ?? placeholder}
      </span>
      {display && (
        <button
          type="button"
          data-clear-date
          onClick={(e) => {
            e.stopPropagation();
            onCommit(null);
          }}
          className="ml-auto text-gray-300 hover:text-red-500 shrink-0"
          title="Clear due date"
          aria-label="Clear due date"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <input
        ref={inputRef}
        type="date"
        value={toInput(value)}
        onChange={(e) => onCommit(fromInput(e.target.value))}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
