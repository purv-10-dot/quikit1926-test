"use client";

import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import type { FormulaExplain } from "./kpiFormulaTooltips";

/**
 * FormulaTooltip — renders a `FormulaExplain` ("how was this number
 * calculated?") on hover.
 *
 * Wraps the shared Tooltip primitive, which portals to document.body, so it is
 * safe inside table cells and the dashboard cards without overflow clipping.
 *
 * Styling is the neutral dark tooltip chrome (bg-gray-900) used by NameTooltip
 * / WeekTooltip. No `accent-*` and no cell styling is touched — this only ever
 * wraps text/div wrappers, never a <td>, so the four locked tables' colors are
 * unaffected (see CLAUDE.md § LOCKED TABLES).
 */
export function FormulaTooltip({
  explain,
  children,
  triggerClassName = "inline-flex",
}: {
  explain: FormulaExplain;
  children: ReactNode;
  /** Layout classes for the trigger wrapper (the tooltip anchors to it). */
  triggerClassName?: string;
}) {
  return (
    <Tooltip
      widthClass="w-72"
      arrow="center"
      triggerClassName={triggerClassName}
      contentClassName="px-3 py-2.5"
      content={
        <div className="space-y-1.5 leading-snug">
          <p className="font-semibold text-white">{explain.title}</p>
          <p className="font-mono text-[11px] text-gray-100 break-words">{explain.formula}</p>
          {explain.substitution && (
            <p className="font-mono text-[11px] text-gray-300 break-words">
              = {explain.substitution}
            </p>
          )}
          {explain.result && (
            <p className="font-mono text-[11px] font-semibold text-white break-words">
              = {explain.result}
            </p>
          )}
          {explain.note && (
            <p className="text-[10px] text-gray-400 pt-0.5 border-t border-white/10">
              {explain.note}
            </p>
          )}
        </div>
      }
    >
      {children}
    </Tooltip>
  );
}
