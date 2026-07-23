"use client";

import { Plus, Trash2 } from "lucide-react";
import { SelectInput } from "@/components/FormDrawer";
import { buildLookupOptions } from "@/lib/masters/lookup";
import {
  type LabourScopeLine,
  newLabourScopeLine,
} from "@/lib/projects/labour-scope";

interface WorkCategoryOption {
  id: string;
  name: string;
  status?: string;
}

interface LabourCategoryOption {
  id: string;
  name: string;
  code?: string;
  status?: string;
}

interface Props {
  lines: LabourScopeLine[];
  onChange: (lines: LabourScopeLine[]) => void;
  workCategories: WorkCategoryOption[];
  labourCategories: LabourCategoryOption[];
  /** When true, empty required cells are highlighted with an inline message. */
  showErrors?: boolean;
}

const INPUT =
  "w-full text-xs px-2.5 py-2 border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-300 focus:border-accent-400";
const ERR_INPUT = "border-rose-400 focus:ring-rose-300 focus:border-rose-400";
const OK_INPUT = "border-gray-300";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1";

function fieldClass(err: boolean) {
  return `${INPUT} ${err ? ERR_INPUT : OK_INPUT}`;
}

export function LabourScopeTable({
  lines,
  onChange,
  workCategories,
  labourCategories,
  showErrors = false,
}: Props) {
  const labourCategoryOptions = labourCategories
    .filter((c) => (c.status ?? "active") === "active")
    .map((c) => ({ value: c.id, label: c.code ? `${c.name} (${c.code})` : c.name }));

  const updateLine = (idx: number, patch: Partial<LabourScopeLine>) => {
    onChange(lines.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };
  const addLine = () => onChange([...lines, newLabourScopeLine()]);
  const removeLine = (idx: number) => onChange(lines.filter((_, i) => i !== idx));

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent-200 bg-accent-50 px-3 py-1.5 text-xs font-semibold text-accent-700 transition-colors hover:bg-accent-100 hover:text-accent-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add Row
        </button>
      </div>

      {lines.length === 0 ? (
        <button
          type="button"
          onClick={addLine}
          className="w-full cursor-pointer rounded-xl border-2 border-dashed border-accent-200 bg-accent-50 p-10 text-center transition-colors hover:border-accent-300 hover:bg-accent-50 focus:outline-none focus:ring-2 focus:ring-accent-300"
        >
          <div className="text-sm font-semibold text-slate-800">No labour lines added yet</div>
          <p className="mt-1 text-xs text-slate-500">
            Add rows to define activities, labour category, days, and rate for this work order.
          </p>
        </button>
      ) : (
        <div className="space-y-3">
          {lines.map((line, idx) => {
            const { options: groupOptions, notice: groupNotice } = buildLookupOptions({
              rows: workCategories,
              assigned: line.workCategoryId,
              by: "id",
              entityLabel: "work category",
            });
            const errDate = showErrors && !line.lineDate;
            const errActivity = showErrors && !line.activityName.trim();
            const errGroup = showErrors && !line.workCategoryId;
            const errCat = showErrors && !line.labourCategoryId;
            const errCount = showErrors && !(parseFloat(line.count) > 0);
            const errDays = showErrors && !(parseFloat(line.days) > 0);
            const errRate = showErrors && !(parseFloat(line.rate) > 0);
            const amount =
              (parseFloat(line.count) || 0) * (parseFloat(line.days) || 0) * (parseFloat(line.rate) || 0);

            return (
              <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    Line {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    title="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className={LABEL}>Date</label>
                    <input
                      type="date"
                      value={line.lineDate}
                      onChange={(e) => updateLine(idx, { lineDate: e.target.value })}
                      className={fieldClass(errDate)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Activity Name</label>
                    <input
                      type="text"
                      value={line.activityName}
                      onChange={(e) => updateLine(idx, { activityName: e.target.value })}
                      placeholder="Enter activity"
                      className={fieldClass(errActivity)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Group</label>
                    <SelectInput
                      value={line.workCategoryId}
                      onChange={(v) => updateLine(idx, { workCategoryId: v })}
                      placeholder="Select group…"
                      options={groupOptions}
                      invalid={errGroup}
                    />
                    {groupNotice && !errGroup && (
                      <p className="mt-1 text-[10px] text-amber-600">{groupNotice}</p>
                    )}
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={LABEL}>Description</label>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(idx, { description: e.target.value })}
                      placeholder="Enter description"
                      className={fieldClass(false)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Labour Category</label>
                    <SelectInput
                      value={line.labourCategoryId}
                      onChange={(v) => updateLine(idx, { labourCategoryId: v })}
                      placeholder="Select category…"
                      options={labourCategoryOptions}
                      invalid={errCat}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Count (workers)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={line.count}
                      onChange={(e) => updateLine(idx, { count: e.target.value })}
                      placeholder="0"
                      className={`${fieldClass(errCount)} text-right`}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Days</label>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={line.days}
                      onChange={(e) => updateLine(idx, { days: e.target.value })}
                      placeholder="0"
                      className={`${fieldClass(errDays)} text-right`}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Rate / day (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.rate}
                      onChange={(e) => updateLine(idx, { rate: e.target.value })}
                      placeholder="0.00"
                      className={`${fieldClass(errRate)} text-right`}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-500">
                    Amount{" "}
                    <span className="font-bold text-accent-700 tabular-nums">
                      ₹{amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
