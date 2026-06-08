"use client";

import { useEffect, useRef } from "react";
import { DOC_TEMPLATES } from "./templates-meta";

/**
 * Compact template picker shown when creating a page inside a folder. Anchored
 * popover listing the doc templates (emoji + name + description); selecting one
 * creates the page in that folder seeded with the template, then routes into
 * the editor. Closes on outside-click or Escape.
 */
export function TemplateMenu({
  onPick,
  onClose,
}: {
  onPick: (templateKey: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg"
    >
      <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        New page from template
      </p>
      <div className="max-h-80 overflow-y-auto">
        {DOC_TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="menuitem"
            onClick={() => onPick(t.key)}
            className="flex w-full items-start gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-blue-50"
          >
            <span className="mt-0.5 text-lg leading-none">{t.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900">{t.name}</span>
              <span className="block truncate text-xs text-gray-500">{t.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
