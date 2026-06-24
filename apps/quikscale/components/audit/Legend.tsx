"use client";

import { OPERATION_ORDER, OPERATION_TOKENS } from "./auditLogTokens";

/**
 * Legend popover listing all 8 operation pills + their meaning. Opened from the
 * (i) icon in the drawer header. Shows the full shared design-system set —
 * STATUS appears here even though the KPI timeline never emits it.
 */
export function Legend({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Operation legend"
      className="absolute right-0 top-8 z-[210] w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Legend</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-400 hover:text-gray-600"
          aria-label="Close legend"
        >
          ✕
        </button>
      </div>
      <div className="space-y-1.5">
        {OPERATION_ORDER.map((op) => {
          const t = OPERATION_TOKENS[op];
          return (
            <div key={op} className="flex items-center gap-2">
              <span
                className="inline-block w-[72px] shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold"
                style={{ color: t.fg, backgroundColor: t.bg }}
              >
                {t.label}
              </span>
              <span className="text-xs text-gray-500">{t.meaning}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
