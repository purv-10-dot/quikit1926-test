"use client";

import { Truck, Plus, Trash2 } from "lucide-react";
import { SelectInput } from "@/components/FormDrawer";
import { Section } from "../components/Section";
import { EmptyHint } from "../components/EmptyHint";
import { NumCell } from "../components/NumCell";
import type { MachineryRow } from "../lib/types";

export function Machinery({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  machineryMaster,
}: {
  rows: MachineryRow[];
  onAdd: () => void;
  onUpdate: (idx: number, field: keyof MachineryRow, value: string) => void;
  onRemove: (idx: number) => void;
  machineryMaster: Array<{
    id: string;
    code?: string;
    name?: string;
    type?: string;
    status?: string;
  }>;
}) {
  return (
    <Section
      id="dpr-machinery"
      icon={<Truck className="w-4 h-4" />}
      title="MACHINERY DEPLOYED"
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
          text="No machinery recorded yet."
          icon={<Truck className="w-4 h-4" />}
          onAdd={onAdd}
          addLabel="Add machinery"
        />
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left w-[130px]">Condition</th>
                <th className="px-3 py-2 text-right w-[110px]">Required Qty</th>
                <th className="px-3 py-2 text-right w-[110px]">Actual Qty</th>
                <th className="px-3 py-2 text-left">Remarks</th>
                <th className="px-3 py-2 w-[40px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((m, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2">
                    <SelectInput
                      value={m.description}
                      onChange={(v) => onUpdate(idx, "description", v)}
                      placeholder="Select machinery…"
                      options={(() => {
                        const opts = machineryMaster
                          .filter((mc) => mc.status === "active")
                          .map((mc) => ({
                            value: mc.name ?? "",
                            label: mc.code ? `${mc.code} — ${mc.name ?? ""}` : (mc.name ?? ""),
                            hint: mc.type ?? "",
                          }));
                        // Keep any custom / legacy free-text description
                        // selectable so editing an old DPR still shows it.
                        if (
                          m.description &&
                          !opts.some((o) => o.value === m.description)
                        ) {
                          opts.push({ value: m.description, label: m.description, hint: "" });
                        }
                        return opts;
                      })()}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SelectInput
                      value={m.condition}
                      onChange={(v) => onUpdate(idx, "condition", v)}
                      options={[
                        { value: "Running", label: "Running" },
                        { value: "Idle", label: "Idle" },
                        { value: "Breakdown", label: "Breakdown" },
                        { value: "Under Repair", label: "Under Repair" },
                      ]}
                    />
                  </td>
                  <NumCell value={m.requiredQty} onChange={(v) => onUpdate(idx, "requiredQty", v)} />
                  <NumCell value={m.actualQty} onChange={(v) => onUpdate(idx, "actualQty", v)} />
                  <td className="px-3 py-2">
                    <input
                      value={m.remarks}
                      onChange={(e) => onUpdate(idx, "remarks", e.target.value)}
                      placeholder="Remarks"
                      className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => onRemove(idx)} className="text-gray-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}