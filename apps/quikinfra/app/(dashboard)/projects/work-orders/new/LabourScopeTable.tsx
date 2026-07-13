"use client";

import { Plus, Trash2, X } from "lucide-react";
import { SelectInput } from "@/components/FormDrawer";
import { buildLookupOptions } from "@/lib/masters/lookup";
import { LABOUR_TYPE_OPTIONS } from "@/lib/projects/labour-types";
import {
  type LabourScopeLine,
  newLabourScopeLine,
  sumLabourQty,
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
  /** When true, empty required cells are highlighted with an inline message. */
  showErrors?: boolean;
}

const ERR_INPUT = "border-rose-400 focus:ring-rose-300 focus:border-rose-400";

export function LabourScopeTable({
  lines,
  onChange,
  workCategories,
  showErrors = false,
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

  const addLabourType = (idx: number, type: string) => {
    if (!type) return;
    const row = lines[idx];
    if (row.labourTypes.some((lt) => lt.type === type)) return;
    updateLine(idx, {
      labourTypes: [...row.labourTypes, { type, count: "" }],
    });
  };

  const updateLabourCount = (idx: number, typeIdx: number, count: string) => {
    const row = lines[idx];
    updateLine(idx, {
      labourTypes: row.labourTypes.map((lt, i) =>
        i === typeIdx ? { ...lt, count } : lt,
      ),
    });
  };

  const removeLabourType = (idx: number, typeIdx: number) => {
    const row = lines[idx];
    updateLine(idx, {
      labourTypes: row.labourTypes.filter((_, i) => i !== typeIdx),
    });
  };

  const labelForType = (type: string) =>
    LABOUR_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;

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
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-gradient-to-b from-slate-50 to-slate-100/70 border-b border-slate-200">
              <tr className="text-[11px] uppercase font-bold text-slate-600 tracking-wider">
                <th className="px-3 py-3 text-left w-[48px]">Sr</th>
                <th className="px-3 py-3 text-left w-[140px]">Date</th>
                <th className="px-3 py-3 text-left min-w-[180px]">Activity Name</th>
                <th className="px-3 py-3 text-left min-w-[160px]">Description</th>
                <th className="px-3 py-3 text-left min-w-[160px]">Group</th>
                <th className="px-3 py-3 text-left min-w-[260px]">Labour Type &amp; Count</th>
                <th className="px-3 py-3 text-right w-[90px]">Total</th>
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

                const errDate = showErrors && !line.lineDate;
                const errActivity = showErrors && !line.activityName.trim();
                const errGroup = showErrors && !line.workCategoryId;
                const errNoLabour = showErrors && line.labourTypes.length === 0;

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
                        className={`w-full text-xs px-2 py-1.5 border rounded bg-white focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400 ${errDate ? ERR_INPUT : "border-gray-300"}`}
                      />
                      {errDate && (
                        <p className="mt-1 text-[10px] text-rose-600">
                          Date is required
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.activityName}
                        onChange={(e) =>
                          updateLine(idx, { activityName: e.target.value })
                        }
                        placeholder="Enter activity name"
                        className={`w-full text-xs px-2 py-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400 ${errActivity ? ERR_INPUT : "border-gray-300"}`}
                      />
                      {errActivity && (
                        <p className="mt-1 text-[10px] text-rose-600">
                          Activity name is required
                        </p>
                      )}
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
                        invalid={errGroup}
                      />
                      {errGroup ? (
                        <p className="mt-1 text-[10px] text-rose-600">
                          Group is required
                        </p>
                      ) : (
                        groupNotice && (
                          <p className="mt-1 text-[10px] text-amber-600">
                            {groupNotice}
                          </p>
                        )
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1.5">
                        {line.labourTypes.map((lt, typeIdx) => {
                          const errCount =
                            showErrors && !(parseFloat(lt.count) > 0);
                          return (
                            <div key={lt.type}>
                              <div className="flex items-center gap-2 bg-orange-50/60 border border-orange-200 rounded-lg pl-2.5 pr-1.5 py-1">
                                <span className="flex-1 text-xs font-medium text-orange-800 truncate">
                                  {labelForType(lt.type)}
                                </span>
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  value={lt.count}
                                  onChange={(e) =>
                                    updateLabourCount(idx, typeIdx, e.target.value)
                                  }
                                  placeholder="0"
                                  className={`w-14 text-xs px-1.5 py-1 border rounded text-right bg-white focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400 ${errCount ? ERR_INPUT : "border-gray-300"}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeLabourType(idx, typeIdx)}
                                  className="p-0.5 rounded text-orange-400 hover:text-rose-600 hover:bg-white transition-colors"
                                  title="Remove labour type"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {errCount && (
                                <p className="mt-1 text-[10px] text-rose-600">
                                  Enter a count greater than 0
                                </p>
                              )}
                            </div>
                          );
                        })}
                        <SelectInput
                          value=""
                          onChange={(v) => addLabourType(idx, v)}
                          placeholder="Add labour type…"
                          options={LABOUR_TYPE_OPTIONS.filter(
                            (o) =>
                              !line.labourTypes.some((lt) => lt.type === o.value),
                          ).map((o) => ({ value: o.value, label: o.label }))}
                        />
                        {errNoLabour && (
                          <p className="mt-1 text-[10px] text-rose-600">
                            Add at least one labour type
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold text-slate-700 tabular-nums align-top pt-3">
                      {sumLabourQty(line.labourTypes)}
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
