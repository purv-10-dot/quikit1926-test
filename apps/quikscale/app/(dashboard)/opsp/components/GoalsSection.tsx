"use client";

/**
 * GoalsSection — "GOALS (1 YR.) / Key Initiatives / Critical #"
 *
 * Extracted from `page.tsx` in Phase 3 of the OPSP decomposition.
 * Goals inherit category+projected from targetRows (locked rows); that
 * cascade logic is owned by useOPSPForm and this component only renders
 * the locked state (Lock icon + gray row) when inheritance is active.
 */

import { Info, Lock, Maximize2 } from "lucide-react";
import { Card } from "./Card";
import { FInput } from "./RichEditor";
import { CritBlock } from "./CritBlock";
import { CategorySelect, ProjectedInput, displayCategory } from "./category";
import { WithTooltip, OwnerSelect } from "./pickers";
import type { FormData } from "../hooks/useOPSPForm";

interface Props {
  form: FormData;
  set: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  onExpandGoals: () => void;
  onExpandKeyInitiatives: () => void;
}

export function GoalsSection({
  form,
  set,
  onExpandGoals,
  onExpandKeyInitiatives,
}: Props) {
  return (
    <Card className="flex flex-col gap-3 flex-1 min-w-[300px]">
      <div>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1">
              GOALS (1 YR.)
              <Info className="h-3 w-3 text-gray-400 flex-shrink-0" />
            </p>
            <p className="text-xs text-gray-500">(What)</p>
          </div>
          <button
            onClick={onExpandGoals}
            data-expand="true"
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
          <span className="col-span-3">Category</span>
          <span className="col-span-2 text-right">Projected</span>
        </div>
        {form.goalRows.slice(0, 6).map((row, i) => {
          const t = i < form.targetRows.length ? form.targetRows[i] : null;
          const inherited = !!(
            t &&
            t.category.trim() &&
            t.projected.trim() &&
            t.y1.trim()
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
                      content="Locked — set in Targets"
                      className="relative flex-shrink-0"
                    >
                      <Lock className="h-3 w-3 text-gray-400" />
                    </WithTooltip>
                  </div>
                ) : (
                  <CategorySelect
                    value={row.category}
                    onChange={(v) => {
                      const next = [...form.goalRows];
                      next[i] = {
                        ...next[i],
                        category: v,
                        projected: "",
                        q1: "",
                        q2: "",
                        q3: "",
                        q4: "",
                      };
                      set("goalRows", next);
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
                      content="Locked — set in Targets"
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
                      const next = [...form.goalRows];
                      next[i] = { ...next[i], projected: v };
                      set("goalRows", next);
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Key Initiatives — 3-column table (rank | description | owner), matches Key Thrusts/Capabilities */}
      <div className="border-t border-gray-100 pt-3">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs font-bold text-gray-800 uppercase">
              Key Initiatives
            </p>
            <p className="text-xs text-gray-500">1 Year Priorities</p>
          </div>
          <button
            onClick={onExpandKeyInitiatives}
            data-expand="true"
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          {form.keyInitiatives.map((row, i) => (
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
                  placeholder="Initiative"
                  onChange={(v) => {
                    const next = [...form.keyInitiatives];
                    next[i] = { ...next[i], desc: v };
                    set("keyInitiatives", next);
                  }}
                />
              </WithTooltip>
              <div className="relative w-[95px] flex-shrink-0">
                <OwnerSelect
                  value={row.owner}
                  onChange={(v) => {
                    const next = [...form.keyInitiatives];
                    next[i] = { ...next[i], owner: v };
                    set("keyInitiatives", next);
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
          value={form.criticalNumGoals}
          onChange={(v) => set("criticalNumGoals", v)}
        />
        <CritBlock
          label="Balancing Critical #"
          value={form.balancingCritNumGoals}
          onChange={(v) => set("balancingCritNumGoals", v)}
        />
      </div>
    </Card>
  );
}

export type GoalsSectionProps = Props;
