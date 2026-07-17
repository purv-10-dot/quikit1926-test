"use client";

import { Users, Plus, Trash2 } from "lucide-react";
import { Section } from "../components/Section";
import { EmptyHint } from "../components/EmptyHint";
import type { StaffRow } from "../lib/types";

export function Staff({
  rows,
  onAdd,
  onUpdate,
  onRemove,
}: {
  rows: StaffRow[];
  onAdd: () => void;
  onUpdate: (idx: number, field: keyof StaffRow, value: string | boolean) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <Section
      id="dpr-staff"
      icon={<Users className="w-4 h-4" />}
      title="STAFF DEPLOYED"
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
          text="No staff recorded yet."
          icon={<Users className="w-4 h-4" />}
          onAdd={onAdd}
          addLabel="Add a staff member"
        />
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Designation</th>
                <th className="px-3 py-2 text-center w-[90px]">Present</th>
                <th className="px-3 py-2 text-left">Reason (if absent)</th>
                <th className="px-3 py-2 w-[40px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((s, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2">
                    <input
                      value={s.name}
                      onChange={(e) => onUpdate(idx, "name", e.target.value)}
                      placeholder="Name"
                      className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={s.designation}
                      onChange={(e) => onUpdate(idx, "designation", e.target.value)}
                      placeholder="Designation"
                      className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={s.present}
                      onChange={(e) => onUpdate(idx, "present", e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 accent-orange-600 text-orange-600 focus:ring-orange-300 focus:border-orange-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={s.reason}
                      disabled={s.present}
                      onChange={(e) => onUpdate(idx, "reason", e.target.value)}
                      placeholder={s.present ? "—" : "Reason"}
                      className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
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