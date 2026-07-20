"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/use-api";
import { Info, Search, Plus, ChevronDown, Check } from "lucide-react";
import { EARNING_PRESETS, type EarningPreset } from "@/lib/data/payroll-presets";
import { inputCls } from "./types";

export function NewEarningForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const api = useApiClient();
  const [err, setErr] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<EarningPreset>(EARNING_PRESETS[0]);
  const [typeDropOpen, setTypeDropOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    name: selectedPreset.label,
    nameInPayslip: selectedPreset.label,
    code: selectedPreset.key.toUpperCase(),
    category: selectedPreset.category,
    amountType: selectedPreset.amountType,
    amountValue: (selectedPreset.amountValue ?? null) as number | null,
    partOfSalaryStructure: selectedPreset.partOfSalaryStructure,
    taxable: selectedPreset.taxable,
    proRateOnLOP: selectedPreset.proRateOnLOP,
    considerForEPF: selectedPreset.considerForEPF,
    considerEPFIfPFWageLT15k: selectedPreset.considerEPFIfPFWageLT15k,
    considerForESI: selectedPreset.considerForESI,
    showInPayslip: selectedPreset.showInPayslip,
    isActive: true,
  });

  const pickPreset = (p: EarningPreset) => {
    setSelectedPreset(p);
    setTypeDropOpen(false);
    setForm({
      ...form,
      name: p.label,
      nameInPayslip: p.label,
      code: p.key.toUpperCase(),
      category: p.category,
      amountType: p.amountType,
      amountValue: p.amountValue ?? null,
      partOfSalaryStructure: p.partOfSalaryStructure,
      taxable: p.taxable,
      proRateOnLOP: p.proRateOnLOP,
      considerForEPF: p.considerForEPF,
      considerEPFIfPFWageLT15k: p.considerEPFIfPFWageLT15k,
      considerForESI: p.considerForESI,
      showInPayslip: p.showInPayslip,
    });
  };

  const pickCustom = () => {
    const customPreset: EarningPreset = {
      key: "custom_allowance",
      label: "Custom Allowance",
      description: "User-defined allowance. Edit name, code and amount as needed.",
      category: "Allowance",
      amountType: "Fixed",
      amountValue: 0,
      partOfSalaryStructure: true,
      taxable: true,
      proRateOnLOP: true,
      considerForEPF: false,
      considerEPFIfPFWageLT15k: false,
      considerForESI: false,
      showInPayslip: true,
    };
    setSelectedPreset(customPreset);
    setTypeDropOpen(false);
    setSearch("");
    setForm({
      ...form,
      name: "",
      nameInPayslip: "",
      code: "",
      category: customPreset.category,
      amountType: customPreset.amountType,
      amountValue: 0,
      partOfSalaryStructure: customPreset.partOfSalaryStructure,
      taxable: customPreset.taxable,
      proRateOnLOP: customPreset.proRateOnLOP,
      considerForEPF: customPreset.considerForEPF,
      considerEPFIfPFWageLT15k: customPreset.considerEPFIfPFWageLT15k,
      considerForESI: customPreset.considerForESI,
      showInPayslip: customPreset.showInPayslip,
    });
  };

  const filtered = EARNING_PRESETS.filter((p) => p.label.toLowerCase().includes(search.toLowerCase()));

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/payroll/salary-components", body),
    onSuccess: () => { onCreated(); setErr(null); },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createMut.mutate({
      name: form.name,
      nameInPayslip: form.nameInPayslip,
      code: form.code,
      type: "Earning",
      category: form.category,
      amountType: form.amountType,
      amountValue: null,
      frequency: "Monthly",
      partOfSalaryStructure: form.partOfSalaryStructure,
      taxable: form.taxable,
      includeInCTC: form.partOfSalaryStructure,
      includeInGross: form.partOfSalaryStructure,
      proRateOnLOP: form.proRateOnLOP,
      considerForEPF: form.considerForEPF,
      considerEPFIfPFWageLT15k: form.considerForEPF && form.considerEPFIfPFWageLT15k,
      considerForESI: form.considerForESI,
      showInPayslip: form.showInPayslip,
      isActive: form.isActive,
    });
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* LEFT */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Earning Type <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setTypeDropOpen((v) => !v)}
                className="w-full px-3 py-2 text-xs bg-white border border-[var(--border)] rounded-md flex items-center justify-between hover:border-[#86efac]"
              >
                <span>{selectedPreset.label}</span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              {typeDropOpen && (
                <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-20">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-7 pr-2 py-1.5 text-xs border border-[var(--border)] rounded"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {filtered.map((p) => (
                      <button
                        type="button"
                        key={p.key}
                        onClick={() => pickPreset(p)}
                        className={
                          "w-full text-left px-3 py-2 text-xs hover:bg-[#dcfce7] flex items-center justify-between " +
                          (selectedPreset.key === p.key ? "bg-green-600 text-white hover:bg-green-700" : "text-gray-700")
                        }
                      >
                        {p.label}
                        {selectedPreset.key === p.key && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={pickCustom} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#22c55e] border-t border-gray-100 hover:bg-[#dcfce7]">
                    <Plus size={14} /> New Custom Allowance
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name in Payslip <span className="text-red-500">*</span>
            </label>
            <input
              value={form.nameInPayslip}
              onChange={(e) => setForm({ ...form, nameInPayslip: e.target.value })}
              required
              className={inputCls}
            />
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Calculation Type</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: "Fixed",          label: "Flat Amount",          hint: "Fixed ₹ amount"  },
                { v: "PercentOfBasic", label: "% of Basic",           hint: "Based on Basic"  },
                { v: "PercentOfCTC",   label: "% of CTC",             hint: "Based on CTC"    },
                { v: "PercentOfGross", label: "% of Gross",           hint: "Based on Gross"  },
              ] as const).filter((opt) => !(selectedPreset.category === "Basic" && opt.v === "PercentOfBasic")).map((opt) => {
                const active = form.amountType === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setForm({ ...form, amountType: opt.v })}
                    className={clsx(
                      "relative text-left rounded-md border px-3 py-2.5 transition focus:outline-none focus:ring-2 focus:ring-[#22c55e]/30",
                      active
                        ? "border-[#22c55e] bg-[#22c55e]/5 ring-1 ring-[#22c55e]/40"
                        : "border-gray-200 hover:border-gray-300 bg-white",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center",
                        active ? "border-[#22c55e]" : "border-gray-300",
                      )}>
                        {active && <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />}
                      </span>
                      <span className={clsx("text-[13px] font-medium", active ? "text-[#15803d]" : "text-gray-800")}>
                        {opt.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 ml-5.5 pl-0.5">{opt.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-2">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="text-[#22c55e] rounded" />
            Mark this as Active
          </label>
        </div>

        {/* RIGHT */}
        <div className="space-y-4 border-l border-gray-200 pl-5">
          <div className="rounded-md bg-[#dcfce7] border border-[#dcfce7] px-3 py-2 text-xs text-[#15803d] flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>{selectedPreset.description}</span>
          </div>

          <p className="text-[13px] font-semibold text-gray-900">Other Configurations</p>

          <Toggle label="Make this earning a part of the employee's salary structure" checked={form.partOfSalaryStructure} onChange={(v) => setForm({ ...form, partOfSalaryStructure: v })} />
          <ToggleDescribed
            label="This is a taxable earning"
            description="The income tax amount will be divided equally and deducted every month across the financial year."
            checked={form.taxable}
            onChange={(v) => setForm({ ...form, taxable: v })}
          />
          <ToggleDescribed
            label="Calculate on pro-rata basis"
            description="Pay will be adjusted based on employee working days."
            checked={form.proRateOnLOP}
            onChange={(v) => setForm({ ...form, proRateOnLOP: v })}
          />

          <div>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.considerForEPF} onChange={(e) => setForm({ ...form, considerForEPF: e.target.checked })} className="text-[#22c55e] rounded" />
              Consider for EPF Contribution
            </label>
            {form.considerForEPF && (
              <div className="ml-6 mt-1 space-y-1 text-xs">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={!form.considerEPFIfPFWageLT15k} onChange={() => setForm({ ...form, considerEPFIfPFWageLT15k: false })} className="text-[#22c55e]" />
                  Always
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={form.considerEPFIfPFWageLT15k} onChange={() => setForm({ ...form, considerEPFIfPFWageLT15k: true })} className="text-[#22c55e]" />
                  Only when PF Wage is less than ₹ 15,000 <Info size={12} className="text-gray-400" />
                </label>
              </div>
            )}
          </div>

          <Toggle label="Consider for ESI Contribution" checked={form.considerForESI} onChange={(v) => setForm({ ...form, considerForESI: v })} />
          <Toggle label="Show this component in payslip" checked={form.showInPayslip} onChange={(v) => setForm({ ...form, showInPayslip: v })} />
        </div>
      </div>

      <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
        <span className="font-semibold">Note:</span> Once you associate this component with an employee, you will only be able to edit the Name and Amount/Percentage. The changes you make to Amount/Percentage will apply only to new employees.
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{err}</p>}

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="flex gap-2">
          <button type="submit" disabled={createMut.isPending} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm">
            {createMut.isPending ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium">
            Cancel
          </button>
        </div>
        <p className="text-xs text-red-500">* indicates mandatory fields</p>
      </div>
    </form>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="text-[#22c55e] rounded" />
      {label}
    </label>
  );
}

function ToggleDescribed({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="text-[#22c55e] rounded" />
        {label}
      </label>
      <p className="text-xs text-gray-500 ml-6 mt-0.5">{description}</p>
    </div>
  );
}
