"use client";

import { Users, Plus, Trash2 } from "lucide-react";
import { SelectInput } from "@/components/FormDrawer";
import { buildLookupOptions } from "@/lib/masters/lookup";
import { Section } from "../components/Section";
import { EmptyHint } from "../components/EmptyHint";
import { NumCell } from "../components/NumCell";
import { MANPOWER_TRADES } from "../lib/constants";
import type { ManpowerRow } from "../lib/types";

export function Manpower({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  contractors,
}: {
  rows: ManpowerRow[];
  onAdd: () => void;
  onUpdate: (idx: number, field: keyof ManpowerRow, value: string) => void;
  onRemove: (idx: number) => void;
  contractors: Array<{ id: string; name: string; status?: string }>;
}) {
  return (
    <Section
      id="dpr-manpower"
      icon={<Users className="w-4 h-4" />}
      title="MANPOWER DEPLOYED"
      count={rows.length}
      action={
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 hover:border-orange-300 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      }
    >
      {rows.length === 0 ? (
        <EmptyHint
          text="No manpower recorded yet."
          icon={<Users className="w-4 h-4" />}
          onAdd={onAdd}
          addLabel="Add a contractor"
        />
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[1240px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
              <tr>
                <th className="px-2 py-2 text-left w-[200px]">Contractor</th>
                <th className="px-2 py-2 text-left min-w-[160px]">Working Area</th>
                {MANPOWER_TRADES.map((t) => (
                  <th key={t.key} className="px-2 py-2 text-right w-[88px]">
                    {t.label}
                  </th>
                ))}
                <th className="px-2 py-2 text-right w-[88px]">Total</th>
                <th className="w-[40px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((m, idx) => {
                const rowTotal = MANPOWER_TRADES.reduce(
                  (sum, t) => sum + (parseFloat(m[t.key]) || 0),
                  0
                );
                return (
                <tr key={idx}>
                  <td className="px-2 py-1.5">
                    {(() => {
                      const { options, notice } = buildLookupOptions({
                        rows: contractors,
                        assigned: m.contractorId,
                        by: "id",
                        entityLabel: "contractor",
                      });
                      return (
                        <>
                          <SelectInput
                            value={m.contractorId}
                            onChange={(v) => onUpdate(idx, "contractorId", v)}
                            placeholder="Self / Select…"
                            size="sm"
                            options={options}
                          />
                          {notice && (
                            <p className="mt-1 text-xs text-amber-600">⚠ {notice}</p>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={m.workingArea}
                      onChange={(e) =>
                        onUpdate(idx, "workingArea", e.target.value)
                      }
                      placeholder="Area"
                      className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                    />
                  </td>
                  {MANPOWER_TRADES.map((t) => (
                    <NumCell
                      key={t.key}
                      value={m[t.key]}
                      onChange={(v) => onUpdate(idx, t.key, v)}
                    />
                  ))}
                  <td className="px-2 py-1.5 text-right font-semibold text-orange-600 tabular-nums">
                    {Number.isInteger(rowTotal) ? rowTotal : rowTotal.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button onClick={() => onRemove(idx)} className="text-gray-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}