"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { WIDGET_META, type WidgetType } from "./types";

/**
 * Modal that lists every widget kind the user can add to their dashboard.
 * Click a tile → fires `onPick` with the chosen widget type.
 */
export function WidgetPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (type: WidgetType) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[80] flex items-start justify-center pt-20"
      onClick={onClose}
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="w-[600px] max-w-[95vw] bg-white border border-gray-200 rounded-md shadow-xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Add widget</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(WIDGET_META) as WidgetType[]).map((t) => {
            const m = WIDGET_META[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => onPick(t)}
                className="text-left p-3 border border-gray-200 rounded-md hover:bg-blue-50/40 hover:border-blue-300"
              >
                <div className="text-sm font-semibold text-gray-900">{m.label}</div>
                <div className="mt-1 text-xs text-gray-600 leading-snug">
                  {m.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
