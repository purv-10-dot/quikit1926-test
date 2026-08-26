"use client";

import { useEffect, useRef, useState } from "react";
import { Columns } from "lucide-react";
import {
  CASE_COLUMNS,
  DEFAULT_CASE_COLUMNS,
  type CaseColumnKey,
} from "./case-meta";

/**
 * Column customiser for the case list (QUIKTR-335).
 *
 * Selection is a local preference, not server state — it is per-person view
 * chrome, so it lives in localStorage rather than costing a table and a
 * round-trip. Keyed per project so two projects can differ.
 */

const STORAGE_PREFIX = "quiktest.caseColumns.";

/** Reads the stored preference, dropping any key that no longer exists. */
export function loadColumns(projectId: string): CaseColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_CASE_COLUMNS;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + projectId);
    if (!raw) return DEFAULT_CASE_COLUMNS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_CASE_COLUMNS;
    const valid = new Set<string>(CASE_COLUMNS.map((c) => c.key));
    // Filter against the current column set: a stored key from an older build
    // must not render a header with no cells under it.
    const kept = parsed.filter(
      (k): k is CaseColumnKey => typeof k === "string" && valid.has(k),
    );
    // An empty result means every stored key is stale — fall back rather than
    // showing a table of just ID and Title.
    return kept.length > 0 ? kept : DEFAULT_CASE_COLUMNS;
  } catch {
    // Corrupt JSON or a storage-disabled browser: the preference is not worth
    // breaking the page over.
    return DEFAULT_CASE_COLUMNS;
  }
}

function saveColumns(projectId: string, keys: CaseColumnKey[]) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(keys));
  } catch {
    // Ignore — the table still works, the choice just won't persist.
  }
}

interface ColumnsMenuProps {
  projectId: string;
  visible: CaseColumnKey[];
  onChange: (next: CaseColumnKey[]) => void;
}

export function ColumnsMenu({ projectId, visible, onChange }: ColumnsMenuProps) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape, so the popover behaves like the app's other
  // menus rather than needing its own dismiss button.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const set = (keys: CaseColumnKey[]) => {
    onChange(keys);
    saveColumns(projectId, keys);
  };

  const toggle = (key: CaseColumnKey) => {
    // Preserve CASE_COLUMNS order rather than click order, so the table's column
    // sequence is stable no matter how the user got there.
    const next = visible.includes(key)
      ? visible.filter((k) => k !== key)
      : CASE_COLUMNS.filter((c) => c.key === key || visible.includes(c.key)).map(
          (c) => c.key,
        );
    set(next);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1.5 rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
      >
        <Columns className="h-3.5 w-3.5" />
        Columns
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded border border-gray-200 bg-white p-2 shadow-lg">
          <p className="px-1 pb-1.5 text-[11px] uppercase tracking-wide text-gray-400">
            Show columns
          </p>
          {CASE_COLUMNS.map((col) => (
            <label
              key={col.key}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-gray-700 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={visible.includes(col.key)}
                onChange={() => toggle(col.key)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-accent-600 focus:ring-accent-400 focus:ring-offset-0"
              />
              {col.label}
            </label>
          ))}
          <button
            type="button"
            onClick={() => set(DEFAULT_CASE_COLUMNS)}
            className="mt-1.5 w-full rounded px-1 py-1 text-left text-xs text-accent-700 hover:bg-gray-50"
          >
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}
