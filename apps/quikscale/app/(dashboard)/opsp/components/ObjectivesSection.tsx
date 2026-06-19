"use client";

/**
 * ObjectivesSection — "Core Values / Purpose / Actions / Profit per X / BHAG"
 *
 * Extracted from `page.tsx` in Phase 3 of the OPSP decomposition.
 * Renders the first two cards of the People 4-col grid:
 *   • CORE VALUES/BELIEFS (rich editor)
 *   • PURPOSE (rich editor + actions list + profitPerX + BHAG)
 *
 * State mutation flows through the `set` / `setArr` helpers from the parent,
 * which already carry the read-only guard based on form.status === "finalized".
 * Passing them through also keeps cascade effects (targets→goals→actions) in
 * the central hook where they belong.
 */

import { Card, CardH } from "./Card";
import { FInput, FTextarea, RichEditor } from "./RichEditor";
import { WithTooltip } from "./pickers";
import type { FormData } from "../hooks/useOPSPForm";

interface Props {
  form: FormData;
  set: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  setArr: (key: keyof FormData, idx: number, value: string) => void;
}

export function ObjectivesSection({ form, set, setArr }: Props) {
  return (
    <>
      {/* Core Values */}
      <Card className="flex flex-col gap-3 flex-1 min-w-[280px]">
        <CardH title="CORE VALUES/BELIEFS" subtitle="(Should/Shouldn't)" />
        <div data-opsp-field="coreValues" className="flex-1 flex flex-col min-h-0">
          <RichEditor
            value={form.coreValues}
            onChange={(v) => set("coreValues", v)}
            placeholder="Enter core values..."
            className="flex-1 min-h-0"
            resetKey={`${form.year}-${form.quarter}`}
            maxLength={1500}
          />
        </div>
      </Card>

      {/* Purpose */}
      <Card className="flex flex-col gap-3 flex-1 min-w-[280px]">
        <div data-opsp-field="purpose">
          <CardH title="PURPOSE" subtitle="(Why)" />
          <RichEditor
            value={form.purpose}
            onChange={(v) => set("purpose", v)}
            placeholder="Enter purpose..."
            resetKey={`${form.year}-${form.quarter}`}
            maxLength={800}
          />
        </div>
        <div className="border-t border-gray-100 pt-3">
          <div className="mb-2">
            <p className="text-xs font-bold text-gray-800 uppercase">Actions</p>
            <p className="text-xs text-gray-500">To Live Values, Purposes, BHAG</p>
          </div>
          <div className="divide-y divide-gray-100">
            {form.actions.map((v, i) => (
              <div key={i} data-opsp-field={`actions.${i}`} className="flex items-center gap-3 py-1.5">
                <span className="text-xs text-gray-400 w-5 flex-shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <WithTooltip content={v} className="relative flex-1 min-w-0">
                  <FInput value={v} onChange={(nv) => setArr("actions", i, nv)} maxLength={80} />
                </WithTooltip>
              </div>
            ))}
          </div>
        </div>
        {/* Profit per X + BHAG — split remaining card space equally */}
        <div className="border-t border-gray-100 pt-3 flex-1 flex flex-col gap-3 min-h-0">
          <div data-opsp-field="profitPerX" className="flex-1 flex flex-col min-h-0">
            <p className="text-xs font-semibold text-gray-700 mb-2">Profit per X</p>
            <FTextarea
              value={form.profitPerX}
              onChange={(v) => set("profitPerX", v)}
              rows={5}
              className="flex-1 min-h-[140px]"
              maxLength={280}
            />
          </div>
          <div data-opsp-field="bhag" className="flex-1 flex flex-col min-h-0">
            <p className="text-xs font-semibold text-gray-700 mb-2">BHAG&reg;</p>
            <FTextarea
              value={form.bhag}
              onChange={(v) => set("bhag", v)}
              rows={5}
              className="flex-1 min-h-[140px]"
              maxLength={280}
            />
          </div>
        </div>
      </Card>
    </>
  );
}

export type ObjectivesSectionProps = Props;
