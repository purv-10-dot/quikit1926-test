"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";

/**
 * Heading row for the QuikTest panel: title (optionally an accordion toggle) plus the
 * actions menu.
 *
 * Split from `quiktest-results-panel.tsx`, which crossed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md when the collapsible variant was added for the edit drawer.
 */
export function QuikTestPanelHeader({
  collapsible,
  open,
  onToggle,
  total,
  onHide,
}: {
  collapsible: boolean;
  open: boolean;
  onToggle: () => void;
  /** Shown as a badge when collapsed, so a shut section still says whether it holds anything. */
  total: number | null;
  /** Omit to render no ⋯ menu at all — an empty menu is worse than none. */
  onHide?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click / Escape. Without this the menu stayed open until
  // something was chosen, which is what the owner's screenshot shows.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="mb-2 flex items-center justify-between">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="-ml-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-sm font-semibold text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          QuikTest: Results
          {total !== null && total > 0 && (
            <span className="rounded bg-gray-100 px-1.5 text-[11px] font-normal text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {total}
            </span>
          )}
        </button>
      ) : (
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          QuikTest: Results
        </h3>
      )}

      <div className="relative" ref={menuRef}>
        {onHide && (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
            aria-label="Panel actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
        {menuOpen && onHide && (
          <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Actions
            </p>
            <button
              type="button"
              onClick={() => {
                onHide();
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Hide QuikTest: Results
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
