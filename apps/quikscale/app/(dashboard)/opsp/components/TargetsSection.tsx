"use client";

/**
 * TargetsSection — "TARGETS (3-5 YRS.) / Sandbox / Key Thrusts / Brand Promise"
 *
 * Extracted from `page.tsx` in Phase 3 of the OPSP decomposition.
 * Mutations flow through the parent's `set` helper, which carries the
 * read-only guard (form.status === "finalized"). The targetRows cascade
 * into goalRows inside useOPSPForm — don't mirror that here.
 */

import { Info, Maximize2 } from "lucide-react";
import { Card } from "./Card";
import { FInput, FTextarea } from "./RichEditor";
import { CategorySelect, ProjectedInput } from "./category";
import { WithTooltip, OwnerSelect } from "./pickers";
import type { FormData } from "../hooks/useOPSPForm";

interface Props {
  form: FormData;
  set: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  onExpandTargets: () => void;
  onExpandKeyThrusts: () => void;
}

export function TargetsSection({
  form,
  set,
  onExpandTargets,
  onExpandKeyThrusts,
}: Props) {
  return (
    <Card className="flex flex-col gap-3 flex-1 min-w-[300px]">
      <div>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1">
              TARGETS (3–5 YRS.)
              <Info className="h-3 w-3 text-gray-400 flex-shrink-0" />
            </p>
            <p className="text-xs text-gray-500">(Where)</p>
          </div>
          <button
            onClick={onExpandTargets}
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
        {form.targetRows.slice(0, 5).map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-1.5 items-start py-0.5"
          >
            <div className="col-span-3 min-w-0">
              <CategorySelect
                value={row.category}
                onChange={(v) => {
                  const next = [...form.targetRows];
                  next[i] = {
                    ...next[i],
                    category: v,
                    projected: "",
                    y1: "",
                    y2: "",
                    y3: "",
                    y4: "",
                    y5: "",
                  };
                  set("targetRows", next);
                }}
              />
            </div>
            <div className="col-span-2 min-w-0">
              <ProjectedInput
                categoryName={row.category}
                value={row.projected}
                onChange={(v) => {
                  const next = [...form.targetRows];
                  next[i] = { ...next[i], projected: v };
                  set("targetRows", next);
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">Sandbox</p>
        <FTextarea
          value={form.sandbox}
          onChange={(v) => set("sandbox", v)}
          rows={3}
        />
      </div>
      <div className="border-t border-gray-100 pt-3">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs font-bold text-gray-800 uppercase">
              Key Thrusts/Capabilities
            </p>
            <p className="text-xs text-gray-500">3–5 Year Priorities</p>
          </div>
          <button
            onClick={onExpandKeyThrusts}
            data-expand="true"
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Side-by-side: number | description | owner */}
        <div className="divide-y divide-gray-100">
          {form.keyThrusts.map((row, i) => (
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
                  placeholder="Capability"
                  onChange={(v) => {
                    const next = [...form.keyThrusts];
                    next[i] = { ...next[i], desc: v };
                    set("keyThrusts", next);
                  }}
                />
              </WithTooltip>
              <div className="relative w-[95px] flex-shrink-0">
                <OwnerSelect
                  value={row.owner}
                  onChange={(v) => {
                    const next = [...form.keyThrusts];
                    next[i] = { ...next[i], owner: v };
                    set("keyThrusts", next);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Brand Promise KPI + Brand Promise — equal split */}
      <div className="border-t border-gray-100 pt-3 flex-1 flex flex-col gap-3">
        <div className="flex-1 flex flex-col">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Brand Promise KPIs
          </p>
          <FTextarea
            value={form.brandPromiseKPIs}
            onChange={(v) => set("brandPromiseKPIs", v)}
            rows={3}
            className="flex-1 min-h-[60px]"
          />
        </div>
        <div className="flex-1 flex flex-col">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Brand Promise
          </p>
          <FTextarea
            value={form.brandPromise}
            onChange={(v) => set("brandPromise", v)}
            rows={3}
            className="flex-1 min-h-[60px]"
          />
        </div>
      </div>
    </Card>
  );
}

export type TargetsSectionProps = Props;
