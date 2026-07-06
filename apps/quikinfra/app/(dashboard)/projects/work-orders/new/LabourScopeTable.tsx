"use client";

import { Plus, Trash2 } from "lucide-react";
import { SelectInput, MultiSelectInput } from "@/components/FormDrawer";
import { buildLookupOptions } from "@/lib/masters/lookup";
import { LABOUR_TYPE_OPTIONS } from "@/lib/projects/labour-types";
import {
  type LabourScopeLine,
  newLabourScopeLine,
} from "@/lib/projects/labour-scope";

interface WorkCategoryOption {
  id: string;
  name: string;
  status?: string;
}

interface Props {
  lines: LabourScopeLine[];
  onChange: (lines: LabourScopeLine[]) => void;
  workCategories: WorkCategoryOption[];
}

export function LabourScopeTable({
  lines,
  onChange,
  workCategories,
}: Props) {
  const workCategoryOptions = workCategories
    .filter((w) => (w.status ?? "active") === "active")
    .map((w) => ({ value: w.id, label: w.name }));

  const updateLine = (
    idx: number,
    patch: Partial<LabourScopeLine>,
  ) => {
    onChange(lines.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const addLine = () => onChange([...lines, newLabourScopeLine()]);

  const removeLine = (idx: number) => {
    onChange(lines.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Row
        </button>
      </div>

      {lines.length === 0 ? (
        <button
          type="button"
          onClick={addLine}
          className="w-full border-2 border-dashed border-orange-200 bg-orange-50/30 hover:bg-orange-50/60 hover:border-orange-300 rounded-xl p-10 text-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <div className="text-sm font-semibold text-slate-800">
            No labour activities added yet
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Add rows to define activities, labour types, and quantities for this work order.
          </p>
        </button>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[1150px]">
            <thead className="bg-gradient-to-b from-slate-50 to-slate-100/70 border-b border-slate-200">
              <tr className="text-[11px] uppercase font-bold text-slate-600 tracking-wider">
                <th className="px-3 py-3 text-left w-[48px]">Sr</th>
                <th className="px-3 py-3 text-left w-[140px]">Date</th>
                <th className="px-3 py-3 text-left min-w-[180px]">Activity Name</th>
                <th className="px-3 py-3 text-left min-w-[160px]">Description</th>
                <th className="px-3 py-3 text-left min-w-[160px]">Group</th>
                <th className="px-3 py-3 text-left min-w-[160px]">Labour Name</th>
                <th className="px-3 py-3 text-left min-w-[200px]">Labour Type</th>
                <th className="px-3 py-3 text-right w-[120px]">Labour Qty</th>
                <th className="px-3 py-3 w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const { options: groupOptions, notice: groupNotice } =
                  buildLookupOptions({
                    rows: workCategories,
                    assigned: line.workCategoryId,
                    by: "id",
                    entityLabel: "work category",
                  });

                return (
                  <tr
                    key={idx}
                    className="border-t border-slate-100 hover:bg-orange-50/40 transition-colors align-top"
                  >
                    <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={line.lineDate}
                        onChange={(e) =>
                          updateLine(idx, { lineDate: e.target.value })
                        }
                        className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.activityName}
                        onChange={(e) =>
                          updateLine(idx, { activityName: e.target.value })
                        }
                        placeholder="Enter activity name"
                        className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) =>
                          updateLine(idx, { description: e.target.value })
                        }
                        placeholder="Enter description"
                        className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <SelectInput
                        value={line.workCategoryId}
                        onChange={(v) => updateLine(idx, { workCategoryId: v })}
                        placeholder="Select group…"
                        options={groupOptions}
                      />
                      {groupNotice && (
                        <p className="mt-1 text-[10px] text-amber-600">
                          {groupNotice}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.labourName}
                        onChange={(e) =>
                          updateLine(idx, { labourName: e.target.value })
                        }
                        placeholder="Enter labour name"
                        className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MultiSelectInput
                        values={line.labourTypes}
                        onChange={(v) => updateLine(idx, { labourTypes: v })}
                        placeholder="Select labour type(s)…"
                        options={LABOUR_TYPE_OPTIONS.map((o) => ({
                          value: o.value,
                          label: o.label,
                        }))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={line.labourQty}
                        onChange={(e) =>
                          updateLine(idx, { labourQty: e.target.value })
                        }
                        className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Remove row"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
