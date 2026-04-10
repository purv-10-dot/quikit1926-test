"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Per-owner breakdown entry used for team KPI tooltips.
 * `name` — owner display name
 * `pct` — contribution percentage (0–100)
 * `target` — this owner's target for the week (derived from weeklyOwnerTargets)
 * `actual` — this owner's actual for the week (may be null until Phase 2 per-owner actuals ship)
 */
export interface WeekOwnerBreakdown {
  id: string;
  name: string;
  pct: number;
  target: number | null;
  actual?: number | null;
}

export function WeekTooltip({ weekNumber, value, note, owners, children }: {
  weekNumber: number;
  value?: number | null;
  note?: string | null;
  owners?: WeekOwnerBreakdown[];
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const hasOwners = !!owners && owners.length > 0;
  const hasContent = (value !== undefined && value !== null) || !!note || hasOwners;
  if (!hasContent) return <>{children}</>;

  function handleEnter() {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left + r.width / 2 });
    }
  }

  // Wider tooltip when we have a per-owner breakdown
  const widthClass = hasOwners ? "w-72" : "w-52";

  return (
    <div
      ref={ref}
      className="relative inline-flex justify-center w-full h-full"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateX(-50%)", zIndex: 9999 }}
          className={`${widthClass} bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none`}
        >
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
          <p className="font-semibold text-gray-200 mb-1.5 text-[11px]">Week {weekNumber}</p>
          {value !== undefined && value !== null && (
            <p className="text-gray-300 text-[11px]">
              Total achieved: <span className="text-white font-medium">{value}</span>
            </p>
          )}

          {hasOwners && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Owner breakdown
              </p>
              <div className="space-y-1">
                {owners!.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-gray-300 truncate flex-1">
                      {o.name}
                      <span className="text-gray-500 ml-1">({o.pct.toFixed(0)}%)</span>
                    </span>
                    <span className="text-gray-400 whitespace-nowrap flex-shrink-0">
                      <span className="text-white font-medium">
                        {o.actual !== undefined && o.actual !== null ? o.actual : "—"}
                      </span>
                      <span className="text-gray-500 mx-0.5">/</span>
                      <span className="text-gray-300">
                        {o.target !== null ? o.target : "—"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-gray-500 mt-1.5 italic">
                Values shown as achieved / target per owner
              </p>
            </div>
          )}

          {note && (
            <p className="text-gray-300 text-[11px] leading-relaxed whitespace-pre-wrap mt-2 pt-2 border-t border-gray-700">
              {note}
            </p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
