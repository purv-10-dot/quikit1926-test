"use client";

import { AlertTriangle, Package, Plus, Trash2 } from "lucide-react";
import { GroupedMaterialSelect } from "@/components/GroupedMaterialSelect";
import type { EstimationMaterial, EstimationDetail } from "@/lib/projects/estimation-detail";
import { fmtQty, fmtInr, rowTotals } from "../lib/shared";
import type { useEstimationDetail } from "../lib/useEstimationDetail";

type HookReturn = ReturnType<typeof useEstimationDetail>;

type MaterialCompositionCardProps = Pick<
  HookReturn,
  | "isEditing"
  | "materials"
  | "lines"
  | "itemGroups"
  | "editTotals"
  | "updateLine"
  | "addLine"
  | "removeLine"
> & {
  estimation: EstimationDetail;
};

export function MaterialCompositionCard({
  isEditing,
  materials,
  lines,
  itemGroups,
  editTotals,
  updateLine,
  addLine,
  removeLine,
  estimation,
}: MaterialCompositionCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Material Composition
          </h2>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
          {isEditing ? lines.length : materials.length} line
          {(isEditing ? lines.length : materials.length) === 1 ? "" : "s"}
        </span>
      </div>

      {/* Warning banner when BOQ Qty is 0 — totals will all read
          zero regardless of rates/waste until the user sets it. */}
      {Number(estimation.boqQuantity) === 0 && (
        <div className="mx-6 mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          BOQ Quantity is not set — every row&apos;s Total Qty and Amount
          will compute to zero.
        </div>
      )}

      {/* Read-only render */}
      {!isEditing && (
        <>
          {materials.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No material lines.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold w-10">
                      #
                    </th>
                    <th className="px-4 py-3 text-left font-bold">
                      Material
                    </th>
                    <th className="px-4 py-3 text-right font-bold">
                      Qty / Unit
                    </th>
                    <th className="px-4 py-3 text-right font-bold">
                      Waste %
                    </th>
                    <th className="px-4 py-3 text-right font-bold">
                      Total Qty
                    </th>
                    <th className="px-4 py-3 text-right font-bold">
                      Std Rate (₹)
                    </th>
                    <th className="px-6 py-3 text-right font-bold">
                      Amount (₹)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {materials.map((m: EstimationMaterial, idx: number) => (
                    <tr key={m.itemId ?? idx} className="hover:bg-indigo-50/20 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                        {String(idx + 1).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {m.itemName ?? "—"}
                          </span>
                          {m.uomCode && (
                            <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                              {m.uomCode}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {fmtQty(m.qtyPerUnit)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {m.wastePercent ? (
                          <span className="inline-flex items-center text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                            {m.wastePercent}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {fmtQty(m.totalQty)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {fmtInr(m.standardRate)}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {fmtInr(m.estimatedCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gradient-to-r from-gray-50 to-orange-50/40 border-t-2 border-gray-200 text-sm font-bold">
                  <tr>
                    <td className="px-4 py-3 uppercase text-[10px] tracking-wider text-gray-500" colSpan={6}>
                      Grand Total
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-orange-700 text-base">
                      {fmtInr(estimation.totalCost)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* Edit render — editable rows + add/remove */}
      {isEditing && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">
                  Material <span className="text-rose-500">*</span>
                </th>
                <th className="px-3 py-2.5 text-right font-medium w-28">
                  Qty / Unit <span className="text-rose-500">*</span>
                </th>
                <th className="px-3 py-2.5 text-right font-medium w-24">
                  Waste %
                </th>
                <th className="px-3 py-2.5 text-right font-medium w-28">
                  Total Qty
                </th>
                <th className="px-3 py-2.5 text-right font-medium w-28">
                  Std Rate (₹)
                </th>
                <th className="px-3 py-2.5 text-right font-medium w-32">
                  Amount (₹)
                </th>
                <th className="px-2 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l, idx) => {
                const r = rowTotals(l, Number(estimation.boqQuantity) || 0);
                return (
                  <tr key={idx}>
                    <td className="px-4 py-2">
                      <GroupedMaterialSelect
                        lazy
                        value={l.itemId}
                        selectedLabel={l.itemName ?? ""}
                        onChange={(v) => updateLine(idx, "itemId", v)}
                        onSelect={(item) => {
                          if (!item) return;
                          const it = item as {
                            name?: string;
                            uomCode?: string;
                            standardRate?: string | number | null;
                          };
                          updateLine(idx, "itemName", it.name ?? "");
                          updateLine(idx, "uomCode", it.uomCode ?? "");
                          updateLine(
                            idx,
                            "standardRate",
                            it.standardRate != null ? String(it.standardRate) : "",
                          );
                        }}
                        items={[]}
                        groups={itemGroups.map((g) => ({
                          id: g.id,
                          name: g.name,
                          status: g.status,
                          itemCount: g.itemCount,
                        }))}
                        placeholder="Select material…"
                        size="sm"
                      />
                      {l.uomCode && (
                        <div className="text-[10px] text-gray-500 mt-1">
                          {l.uomCode}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={l.qtyPerUnit}
                        onChange={(e) =>
                          updateLine(idx, "qtyPerUnit", e.target.value)
                        }
                        className="w-full text-right text-sm px-2.5 py-1.5 border border-gray-300 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.wasteFactor}
                        onChange={(e) =>
                          updateLine(idx, "wasteFactor", e.target.value)
                        }
                        className="w-full text-right text-sm px-2.5 py-1.5 border border-gray-300 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {fmtQty(r.totalQty)}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.standardRate}
                        onChange={(e) =>
                          updateLine(idx, "standardRate", e.target.value)
                        }
                        className="w-full text-right text-sm px-2.5 py-1.5 border border-gray-300 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                      {fmtInr(r.estimatedCost)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length <= 1}
                        title={
                          lines.length <= 1
                            ? "At least one row is required"
                            : "Remove row"
                        }
                        className="p-1.5 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 text-sm font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={5}>
                  Total
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {fmtInr(editTotals.totalCost)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          <div className="px-4 py-3 border-t border-gray-100">
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
            >
              <Plus className="w-3.5 h-3.5" /> Add Material
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
