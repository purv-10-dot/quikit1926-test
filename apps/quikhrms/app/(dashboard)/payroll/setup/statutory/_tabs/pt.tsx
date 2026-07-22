"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Plus, Trash2, Save, Sparkles, Info } from "lucide-react";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { PT_STATE_PRESETS, getPTPreset } from "@/lib/data/pt-slab-presets";

interface PTSlab {
  fromAmount: number;
  toAmount: number | null;
  taxAmount: number;
  gender: "All" | "Male" | "Female";
}

interface PTCfg {
  id: string;
  enabled: boolean;
  locationId: string | null;
  state: string;
  ptNumber: string | null;
  deductionCycle: "Monthly" | "HalfYearly";
  slabs: PTSlab[];
}

const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-transparent";

const STATES = Object.keys(PT_STATE_PRESETS).sort();

export function ProfessionalTaxTab({ onSaved }: { onSaved?: () => void } = {}) {
  const api = useApiClient();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["payroll", "pt"],
    queryFn: () => api.get<PTCfg[]>("/api/v1/hrms/payroll/statutory/pt"),
  });

  const [form, setForm] = useState<Omit<PTCfg, "id">>({
    enabled: true, locationId: null, state: "Madhya Pradesh", ptNumber: "",
    deductionCycle: "Monthly", slabs: [{ fromAmount: 0, toAmount: 15000, taxAmount: 0, gender: "All" }],
  });

  const saveMut = useMutation({
    mutationFn: (body: Omit<PTCfg, "id">) => api.post("/api/v1/hrms/payroll/statutory/pt", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      onSaved?.();
    },
  });

  const list = data?.data ?? [];
  const activePreset = getPTPreset(form.state);

  const applyPreset = () => {
    const p = getPTPreset(form.state);
    if (!p) return;
    setForm({
      ...form,
      deductionCycle: p.deductionCycle,
      slabs: p.slabs.map((s) => ({ ...s })),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[13px] font-semibold text-gray-900">Professional Tax</h2>
        <p className="text-xs text-gray-500 mt-1">This tax is levied on an employee&apos;s income by the State Government. Tax slabs differ in each state.</p>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((cfg) => (
            <div key={cfg.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-[13px] font-semibold text-gray-900">{cfg.state}</p>
              <div className="mt-2 space-y-1 text-xs text-gray-600">
                <div className="flex justify-between"><span>PT Number</span><span className="font-medium text-gray-800">{cfg.ptNumber || "—"}</span></div>
                <div className="flex justify-between"><span>Deduction Cycle</span><span className="font-medium text-gray-800">{cfg.deductionCycle}</span></div>
                <div className="flex justify-between"><span>PT Slabs</span><span className="font-medium text-gray-800">{cfg.slabs.length} slabs</span></div>
                <div className="flex justify-between"><span>Status</span><span className={cfg.enabled ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{cfg.enabled ? "Enabled" : "Disabled"}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }}
        className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
      >
        <p className="text-[13px] font-semibold text-gray-900">Add / Update Configuration</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">State <span className="text-red-500">*</span></label>
            <Select
              value={form.state}
              onChange={(v) => setForm({ ...form, state: v })}
              searchable
              options={STATES.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">PT Number <span className="text-red-500">*</span></label>
            <input value={form.ptNumber ?? ""} onChange={(e) => setForm({ ...form, ptNumber: e.target.value })} required className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Deduction Cycle <span className="text-red-500">*</span></label>
            <Select
              value={form.deductionCycle}
              onChange={(v) => setForm({ ...form, deductionCycle: v as PTCfg["deductionCycle"] })}
              options={[
                { value: "Monthly", label: "Monthly" },
                { value: "HalfYearly", label: "Half Yearly" },
              ]}
            />
          </div>
        </div>

        {activePreset && (
          <div className="rounded-lg border border-[#bbf7d0] bg-gradient-to-r from-[#f0fdf4] to-white px-4 py-3 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#dcfce7] text-[#16a34a] flex items-center justify-center shrink-0">
              <Sparkles size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-900">
                Official {activePreset.state} slabs available
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Load {activePreset.slabs.length}-slab template ({activePreset.deductionCycle.toLowerCase()} cycle)
                {activePreset.note ? ` — ${activePreset.note}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={applyPreset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium shadow-sm shrink-0"
            >
              Apply preset
            </button>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">Tax Slabs <span className="text-red-500">*</span></p>
            <button type="button" onClick={() => setForm({ ...form, slabs: [...form.slabs, { fromAmount: 0, toAmount: null, taxAmount: 0, gender: "All" }] })} className="inline-flex items-center gap-1 text-xs text-[#22c55e] hover:underline">
              <Plus size={12} /> Add slab
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-2 inline-flex items-center gap-1">
            <Info size={11} /> Professional Tax is a fixed ₹/month per salary bracket (varies by state). Not to be confused with Income Tax (TDS).
          </p>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 items-center px-1">
              <span className="col-span-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">From (₹)</span>
              <span className="col-span-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">To (₹)</span>
              <span className="col-span-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Tax (₹)</span>
              <span className="col-span-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">% of From</span>
              <span className="col-span-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Gender</span>
              <span className="col-span-1" />
            </div>
            {form.slabs.map((slab, idx) => {
              const pct = slab.fromAmount > 0 ? (slab.taxAmount / slab.fromAmount) * 100 : 0;
              return (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <NumberInput placeholder="From" required value={slab.fromAmount} onChange={(v) => updateSlab(idx, { fromAmount: v ?? 0 })} className={`${inputCls} col-span-2`} />
                  <NumberInput placeholder="To" value={slab.toAmount} onChange={(v) => updateSlab(idx, { toAmount: v })} className={`${inputCls} col-span-2`} />
                  <NumberInput placeholder="Tax" required value={slab.taxAmount} onChange={(v) => updateSlab(idx, { taxAmount: v ?? 0 })} className={`${inputCls} col-span-2`} />
                  <div className="col-span-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-right">
                    {slab.fromAmount > 0 ? `${pct.toFixed(2)}%` : "—"}
                  </div>
                  <div className="col-span-3">
                    <Select
                      value={slab.gender}
                      onChange={(v) => updateSlab(idx, { gender: v as PTSlab["gender"] })}
                      size="sm"
                      options={[
                        { value: "All", label: "All" },
                        { value: "Male", label: "Male" },
                        { value: "Female", label: "Female" },
                      ]}
                    />
                  </div>
                  <button type="button" onClick={() => setForm({ ...form, slabs: form.slabs.filter((_, i) => i !== idx) })} className="col-span-1 text-gray-400 hover:text-red-600">
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-2">
          <button type="submit" disabled={saveMut.isPending} className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm">
            <Save size={13} /> {saveMut.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );

  function updateSlab(idx: number, patch: Partial<PTSlab>) {
    setForm({ ...form, slabs: form.slabs.map((s, i) => i === idx ? { ...s, ...patch } : s) });
  }
}
