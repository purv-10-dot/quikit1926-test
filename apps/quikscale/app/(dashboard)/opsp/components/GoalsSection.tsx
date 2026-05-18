"use client";

/**
 * GoalsSection — "GOALS (1 YR.) / Key Initiatives / Critical #"
 *
 * goalRows are seeded (first-fill) from targetRows by useOPSPForm but remain
 * fully editable. Rows are dynamic: 6 by default, user can add up to 10 via
 * the "+ Add New" button. The scroll viewport keeps the card height fixed.
 */

import { Info, Maximize2, Plus, X } from "lucide-react";
import { Card } from "./Card";
import { FInput } from "./RichEditor";
import { CritBlock } from "./CritBlock";
import { CategorySelect, ProjectedInput } from "./category";
import { breakdownProjected } from "./modals";
import { WithTooltip } from "./pickers";
import type { FormData } from "../hooks/useOPSPForm";

interface Props {
  form: FormData;
  set: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  onExpandKeyInitiatives: () => void;
}

const MAX_GOAL_ROWS = 10;
const MIN_GOAL_ROWS = 6;
const emptyGoalRow = () => ({
  category: "",
  projected: "",
  q1: "",
  q2: "",
  q3: "",
  q4: "",
});

export function GoalsSection({
  form,
  set,
  onExpandKeyInitiatives,
}: Props) {
  return (
    <Card className="flex flex-col gap-3 flex-1 min-w-[300px]">
      <div>
        <div className="mb-3">
          <p className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1">
            GOALS (1 YR.)
            <Info className="h-3 w-3 text-gray-400 flex-shrink-0" />
          </p>
          <p className="text-xs text-gray-500">(What)</p>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
          <div className="grid grid-cols-5 gap-1.5">
            <span className="col-span-3">Category</span>
            <span className="col-span-2 text-right">Projected</span>
          </div>
          <span className="w-5" />
        </div>
        <div className="max-h-[268px] overflow-y-auto pr-1">
          {form.goalRows.slice(0, MAX_GOAL_ROWS).map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto] gap-1.5 items-start py-0.5 group"
            >
              <div className="grid grid-cols-5 gap-1.5 items-start">
                <div className="col-span-3 min-w-0">
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
                </div>
                <div className="col-span-2 min-w-0">
                  <ProjectedInput
                    categoryName={row.category}
                    value={row.projected}
                    onChange={(v) => {
                      const next = [...form.goalRows];
                      // Automatic categories: auto-fill q1..q4.
                      // Manual categories: breakdownProjected returns null →
                      // leave the quarter cells alone (user fills via modal).
                      const autofill = breakdownProjected(row.category, v, 4, {
                        force: true,
                      });
                      const qPatch = autofill
                        ? {
                            q1: autofill[0] ?? "",
                            q2: autofill[1] ?? "",
                            q3: autofill[2] ?? "",
                            q4: autofill[3] ?? "",
                          }
                        : {};
                      next[i] = { ...next[i], projected: v, ...qPatch };
                      set("goalRows", next);
                    }}
                  />
                </div>
              </div>
              {form.goalRows.length > MIN_GOAL_ROWS ? (
                <button
                  type="button"
                  aria-label="Remove row"
                  onClick={() => {
                    const next = [...form.goalRows];
                    next.splice(i, 1);
                    set("goalRows", next);
                  }}
                  className="w-5 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="w-5" />
              )}
            </div>
          ))}
        </div>
        {form.goalRows.length < MAX_GOAL_ROWS && (
          <button
            type="button"
            onClick={() =>
              set("goalRows", [...form.goalRows, emptyGoalRow()])
            }
            className="mt-2 inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Add New
          </button>
        )}
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
                  maxLength={70}
                  onChange={(v) => {
                    const next = [...form.keyInitiatives];
                    next[i] = { ...next[i], desc: v };
                    set("keyInitiatives", next);
                  }}
                />
              </WithTooltip>
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
