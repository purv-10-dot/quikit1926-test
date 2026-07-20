"use client";

import { Package, Plus, Trash2 } from "lucide-react";
import { SelectInput } from "@/components/FormDrawer";
import { GroupedMaterialSelect, type GroupedMaterialSelectItem } from "@/components/GroupedMaterialSelect";
import { Section } from "../components/Section";
import { EmptyHint } from "../components/EmptyHint";
import { NumCell } from "../components/NumCell";
import type { MaterialRow } from "../lib/types";

export function Materials({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  consumptionLocationId,
  onConsumptionLocationChange,
  locations,
  itemGroups,
  stockByItem,
}: {
  rows: MaterialRow[];
  onAdd: () => void;
  onUpdate: (idx: number, field: keyof MaterialRow, value: string) => void;
  onRemove: (idx: number) => void;
  consumptionLocationId: string;
  onConsumptionLocationChange: (v: string) => void;
  locations: Array<{ id: string; name?: string; status?: string }>;
  itemGroups: Array<{ id: string; name?: string; status?: string; itemCount?: number }>;
  stockByItem: Record<string, number>;
}) {
  return (
    <Section
      id="dpr-materials"
      icon={<Package className="w-4 h-4" />}
      title="MATERIALS"
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
      {/* Consumption location — stock is deducted from here on
          approval, so it's required whenever materials are logged. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Consumption Location
        </label>
        <div className="min-w-[240px]">
          <SelectInput
            value={consumptionLocationId}
            onChange={onConsumptionLocationChange}
            placeholder="Select location…"
            options={locations
              .filter((l) => l.status !== "inactive")
              .map((l) => ({ value: l.id, label: l.name ?? "" }))}
          />
        </div>
        <span className="text-[10px] text-slate-400">
          Required to approve when materials are logged — stock is deducted here.
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyHint
          text="No materials recorded yet."
          icon={<Package className="w-4 h-4" />}
          onAdd={onAdd}
          addLabel="Add a material"
        />
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-x-auto w-fit max-w-full">
          <table className="text-xs min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
              <tr>
                <th className="px-2 py-2 text-left w-[300px]">Material Name</th>
                <th className="px-2 py-2 text-left w-[80px]">Unit</th>
                <th className="px-2 py-2 text-right w-[150px]">Consumed Qty</th>
                <th className="px-2 py-2 text-left w-[280px]">Remarks</th>
                <th className="w-[44px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((m, idx) => {
                // UOM is denormalized onto the line at pick time / edit-load,
                // so the lazy picker doesn't need the full item master.
                const uomCode = m.uomCode || "—";
                return (
                  // Top-align every cell so the qty input (which carries
                  // a stock-warning line below it) stays level with the
                  // Remarks input instead of being pushed up by centering.
                  <tr key={idx} className="[&>td]:align-top">
                    <td className="px-2 py-1.5 min-w-[180px]">
                      <GroupedMaterialSelect
                        lazy
                        value={m.itemId}
                        selectedLabel={m.itemName ?? ""}
                        onChange={(v) => {
                          onUpdate(idx, "itemId", v);
                          if (!v) {
                            onUpdate(idx, "itemName", "");
                            onUpdate(idx, "uomId", "");
                            onUpdate(idx, "uomCode", "");
                          }
                        }}
                        onSelect={(item) => {
                          if (!item) return;
                          const it = item as GroupedMaterialSelectItem & { uomId?: string };
                          onUpdate(idx, "itemName", it.name ?? "");
                          onUpdate(idx, "uomId", it.uomId ?? "");
                          onUpdate(idx, "uomCode", it.uomCode ?? "");
                        }}
                        items={[]}
                        groups={itemGroups.map((g) => ({
                          id: g.id,
                          name: g.name ?? "",
                          status: g.status,
                          itemCount: g.itemCount,
                        }))}
                        placeholder="Material"
                        size="sm"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-gray-600 uppercase">
                      {uomCode}
                    </td>
                    <NumCell
                      value={m.consumedQty}
                      onChange={(v) => onUpdate(idx, "consumedQty", v)}
                      available={
                        m.itemId && m.itemId in stockByItem
                          ? stockByItem[m.itemId]
                          : null
                      }
                      unit={uomCode === "—" ? "" : uomCode}
                    />
                    <td className="px-2 py-1.5">
                      <input
                        value={m.remarks}
                        onChange={(e) =>
                          onUpdate(idx, "remarks", e.target.value)
                        }
                        placeholder="Optional note"
                        className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onClick={() => onRemove(idx)}
                        className="text-gray-400 hover:text-red-600"
                      >
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