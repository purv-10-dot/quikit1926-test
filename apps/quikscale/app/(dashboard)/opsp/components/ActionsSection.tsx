"use client";

/**
 * ActionsSection — "ACTIONS (QTR) / Rocks / Critical #" + "THEME / Scoreboard / Celebration / Reward"
 *
 * Extracted from `page.tsx` in Phase 3 of the OPSP decomposition.
 * The actionsQtr rows inherit category+projected from goalRows (locked rows
 * using the current quarter's goal value); that cascade is owned by
 * useOPSPForm — this component only renders the locked state when active.
 */

import { Lock, Maximize2 } from "lucide-react";
import { Card, CardH } from "./Card";
import { FInput, FTextarea } from "./RichEditor";
import { CritBlock } from "./CritBlock";
import { CategorySelect, ProjectedInput, displayCategory } from "./category";
import { WithTooltip, OwnerSelect } from "./pickers";
import type { FormData } from "../hooks/useOPSPForm";
import type { GoalRow } from "../types";

interface Props {
  form: FormData;
  set: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  onExpandActions: () => void;
  onExpandRocks: () => void;
}

export function ActionsSection({
  form,
  set,
  onExpandActions,
  onExpandRocks,
}: Props) {
  return (
    <>
      {/* Actions QTR */}
      <Card className="space-y-4">
        <div>
          <CardH
            title="ACTIONS (QTR)"
            subtitle="(How)"
            expand
            onExpand={onExpandActions}
          />
          <div className="grid grid-cols-5 gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
            <span className="col-span-3">Category</span>
            <span className="col-span-2 text-right">Projected</span>
          </div>
          {form.actionsQtr.map((row, i) => {
            const g = i < form.goalRows.length ? form.goalRows[i] : null;
            const qKey = form.quarter.toLowerCase() as keyof GoalRow;
            const gQVal = g ? String(g[qKey] ?? "").trim() : "";
            const inherited = !!(
              g &&
              g.category.trim() &&
              g.projected.trim() &&
              gQVal
            );
            return (
              <div
                key={i}
                className="grid grid-cols-5 gap-1.5 items-start py-0.5"
              >
                <div className="col-span-3 min-w-0">
                  {inherited ? (
                    <div className="w-full flex items-center justify-between border border-gray-200 rounded px-2 py-1.5 bg-gray-50 gap-1 cursor-not-allowed">
                      <WithTooltip
                        content={displayCategory(row.category) || ""}
                        className="relative flex-1 min-w-0"
                      >
                        <span className="block text-sm whitespace-nowrap truncate text-left text-gray-500">
                          {displayCategory(row.category) || "—"}
                        </span>
                      </WithTooltip>
                      <WithTooltip
                        content="Locked — set in Goals"
                        className="relative flex-shrink-0"
                      >
                        <Lock className="h-3 w-3 text-gray-400" />
                      </WithTooltip>
                    </div>
                  ) : (
                    <CategorySelect
                      value={row.category}
                      onChange={(v) => {
                        const next = [...form.actionsQtr];
                        next[i] = {
                          ...next[i],
                          category: v,
                          projected: "",
                          m1: "",
                          m2: "",
                          m3: "",
                        };
                        set("actionsQtr", next);
                      }}
                    />
                  )}
                </div>
                <div className="col-span-2 min-w-0">
                  {inherited ? (
                    <div className="flex items-center border border-gray-200 rounded bg-gray-50 overflow-hidden cursor-not-allowed">
                      <WithTooltip
                        content={row.projected || ""}
                        className="relative flex-1 min-w-0"
                      >
                        <span className="block text-sm text-gray-500 truncate px-2 py-1.5">
                          {row.projected || "—"}
                        </span>
                      </WithTooltip>
                      <WithTooltip
                        content="Locked — set in Goals"
                        className="relative flex-shrink-0 mr-1.5"
                      >
                        <Lock className="h-3 w-3 text-gray-400" />
                      </WithTooltip>
                    </div>
                  ) : (
                    <ProjectedInput
                      categoryName={row.category}
                      value={row.projected}
                      onChange={(v) => {
                        const next = [...form.actionsQtr];
                        next[i] = { ...next[i], projected: v };
                        set("actionsQtr", next);
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Rocks — 3-column table (rank | Quarterly Priority | Who/OwnerSelect). Matches Key Thrusts/Capabilities pattern. */}
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-xs font-bold text-gray-800 uppercase">Rocks</p>
              <p className="text-xs text-gray-500">Quarterly Priorities</p>
            </div>
            <button
              onClick={onExpandRocks}
              data-expand="true"
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
            <span className="w-5 flex-shrink-0">#</span>
            <span className="flex-1">Quarterly Priorities</span>
            <span className="w-[95px] flex-shrink-0">Who</span>
          </div>
          <div className="divide-y divide-gray-100">
            {form.rocks.map((row, i) => (
              <div key={i} className="flex items-center gap-1.5 py-1.5">
                <span className="text-xs text-gray-400 w-5 flex-shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <WithTooltip
                  content={row.desc}
                  className="relative flex-1 min-w-0"
                >
                  <FInput
                    value={row.desc}
                    placeholder="Quarterly Priority"
                    onChange={(v) => {
                      const next = [...form.rocks];
                      next[i] = { ...next[i], desc: v };
                      set("rocks", next);
                    }}
                  />
                </WithTooltip>
                <div className="relative w-[95px] flex-shrink-0">
                  <OwnerSelect
                    value={row.owner}
                    onChange={(v) => {
                      const next = [...form.rocks];
                      next[i] = { ...next[i], owner: v };
                      set("rocks", next);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-gray-100 pt-3 space-y-3">
          <CritBlock
            label="Critical #"
            value={form.criticalNumProcess}
            onChange={(v) => set("criticalNumProcess", v)}
          />
          <CritBlock
            label="Balancing Critical #"
            value={form.balancingCritNumProcess}
            onChange={(v) => set("balancingCritNumProcess", v)}
          />
        </div>
      </Card>

      {/* Theme — equal split between all 4 sections */}
      <Card className="flex flex-col gap-0 p-0 overflow-hidden">
        <div className="flex-1 flex flex-col p-4">
          <p className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-1">
            THEME
          </p>
          <p className="text-xs text-gray-500 mb-2">(QTR/ANNUAL)</p>
          <FTextarea
            value={form.theme}
            onChange={(v) => set("theme", v)}
            rows={4}
            className="flex-1 min-h-[60px]"
          />
        </div>
        <div className="flex-1 flex flex-col p-4 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-800 uppercase mb-0.5">
            Scoreboard Design
          </p>
          <p className="text-xs text-gray-500 mb-2">
            Describe and/or sketch your design in this space
          </p>
          <FTextarea
            value={form.scoreboardDesign}
            onChange={(v) => set("scoreboardDesign", v)}
            rows={3}
            className="flex-1 min-h-[60px]"
          />
        </div>
        <div className="flex-1 flex flex-col p-4 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-800 uppercase mb-2">
            Celebration
          </p>
          <FTextarea
            value={form.celebration}
            onChange={(v) => set("celebration", v)}
            rows={3}
            className="flex-1 min-h-[60px]"
          />
        </div>
        <div className="flex-1 flex flex-col p-4 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-800 uppercase mb-2">
            Reward
          </p>
          <FTextarea
            value={form.reward}
            onChange={(v) => set("reward", v)}
            rows={3}
            className="flex-1 min-h-[60px]"
          />
        </div>
      </Card>
    </>
  );
}

export type ActionsSectionProps = Props;
