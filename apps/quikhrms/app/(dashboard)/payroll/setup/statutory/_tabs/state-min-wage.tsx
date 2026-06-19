"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Save, Trash2, Info } from "lucide-react";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";

interface StateMinWage {
  id: string;
  state: string;
  scheduledEmployment: string;
  skillLevel: string;
  zone: string;
  monthlyWage: number | string;
  effectiveFrom: string;
  notes: string | null;
}

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#16243A] focus:border-transparent";

export function StateMinimumWageTab() {
  const api = useApiClient();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["payroll", "state-min-wage"],
    queryFn: () => api.get<StateMinWage[]>("/api/v1/hrms/payroll/state-min-wage"),
  });

  const [form, setForm] = useState({
    state: "Maharashtra",
    scheduledEmployment: "",
    skillLevel: "" as "" | "Unskilled" | "SemiSkilled" | "Skilled" | "HighlySkilled",
    zone: "",
    monthlyWage: null as number | null,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const saveMut = useMutation({
    mutationFn: (body: typeof form) =>
      api.post("/api/v1/hrms/payroll/state-min-wage", {
        ...body,
        scheduledEmployment: body.scheduledEmployment || null,
        skillLevel: body.skillLevel || null,
        zone: body.zone || null,
        notes: body.notes || null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "state-min-wage"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/payroll/state-min-wage/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "state-min-wage"] }),
  });

  const list = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-900">State Minimum Wages</h2>
        <p className="text-xs text-gray-500 mt-1">
          Used for statutory bonus calc cap = max(₹7,000, applicable state minimum wage). Update when state Govt notifies revisions.
        </p>
      </div>

      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900 flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Lookup uses state only by default. Optional refinements (scheduled employment, skill level, zone) are stored but the
          current bonus compute uses the most recent record per state. Leave blank for a tenant-wide single rate per state.
        </span>
      </div>

      {list.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">State</th>
                <th className="text-left px-3 py-2">Scheduled Employment</th>
                <th className="text-left px-3 py-2">Skill</th>
                <th className="text-left px-3 py-2">Zone</th>
                <th className="text-right px-3 py-2">Monthly Wage</th>
                <th className="text-left px-3 py-2">Effective From</th>
                <th className="text-left px-3 py-2">Notes</th>
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{r.state}</td>
                  <td className="px-3 py-2 text-gray-700">{r.scheduledEmployment || "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{r.skillLevel || "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{r.zone || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-900">₹ {Number(r.monthlyWage).toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2 text-gray-700">{new Date(r.effectiveFrom).toLocaleDateString("en-IN")}</td>
                  <td className="px-3 py-2 text-gray-500 truncate max-w-[160px]">{r.notes ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => deleteMut.mutate(r.id)}
                      title="Delete"
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }}
        className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
      >
        <p className="text-sm font-semibold text-gray-900">Add / Update Minimum Wage</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">State <span className="text-red-500">*</span></label>
            <Select value={form.state} onChange={(v) => setForm({ ...form, state: v })} searchable options={STATES.map((s) => ({ value: s, label: s }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Wage (₹) <span className="text-red-500">*</span></label>
            <NumberInput required value={form.monthlyWage} onChange={(v) => setForm({ ...form, monthlyWage: v })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Effective From <span className="text-red-500">*</span></label>
            <input type="date" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Skill Level</label>
            <Select
              value={form.skillLevel}
              onChange={(v) => setForm({ ...form, skillLevel: v as typeof form.skillLevel })}
              options={[
                { value: "", label: "— Any —" },
                { value: "Unskilled", label: "Unskilled" },
                { value: "SemiSkilled", label: "Semi-Skilled" },
                { value: "Skilled", label: "Skilled" },
                { value: "HighlySkilled", label: "Highly Skilled" },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Scheduled Employment</label>
            <input type="text" value={form.scheduledEmployment} onChange={(e) => setForm({ ...form, scheduledEmployment: e.target.value })} placeholder="e.g. IT/ITES" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Zone</label>
            <input type="text" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="A / B / C" className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Source / Govt notification ref" className={inputCls} />
          </div>
        </div>

        <div className="pt-2">
          <button type="submit" disabled={saveMut.isPending} className="inline-flex items-center gap-2 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-60 text-white rounded-md text-sm font-semibold shadow-sm">
            <Save size={14} /> {saveMut.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
