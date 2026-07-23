"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Search, ChevronDown, Check } from "lucide-react";
import { BENEFIT_PRESETS, INVESTMENT_SECTIONS } from "@/lib/data/payroll-presets";
import { Select } from "@/components/hrms/ui/select";
import { inputCls } from "./types";

export function NewBenefitForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const api = useApiClient();
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    category: BENEFIT_PRESETS[0].category,
    nameInPayslip: "",
    investmentSection: "",
    investmentType: "",
    isActive: true,
  });

  const [invOpen, setInvOpen] = useState(false);
  const [search, setSearch] = useState("");

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/payroll/salary-components", body),
    onSuccess: () => { onCreated(); setErr(null); },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const label = form.nameInPayslip.trim() || form.investmentType || BENEFIT_PRESETS[0].label;
    createMut.mutate({
      name: label,
      nameInPayslip: label,
      code: label.replace(/\s+/g, "_").toUpperCase().slice(0, 32) + "_" + Date.now().toString().slice(-4),
      type: "Benefit",
      category: form.category,
      amountType: "Fixed",
      amountValue: null,
      frequency: "Monthly",
      isRecurring: true,
      taxable: false,
      includeInCTC: true,
      includeInGross: false,
      showInPayslip: true,
      investmentSection: form.investmentSection || null,
      investmentType: form.investmentType || null,
      isActive: form.isActive,
    });
  };

  const selectedLabel = form.investmentType
    ? INVESTMENT_SECTIONS.flatMap((s) => s.options).find((o) => o.value === form.investmentType)?.label
    : null;

  return (
    <form onSubmit={submit} className="p-4 space-y-4 max-w-xl">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Benefit Plan</label>
        <Select
          value={form.category}
          onChange={(v) => setForm({ ...form, category: v })}
          placeholder="Select a Benefit Plan"
          searchable
          options={BENEFIT_PRESETS.map((p) => ({ value: p.category, label: p.label }))}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name in Payslip</label>
        <input
          value={form.nameInPayslip}
          onChange={(e) => setForm({ ...form, nameInPayslip: e.target.value })}
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Associate this benefit with</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setInvOpen((v) => !v)}
            className="w-full px-3 py-2 text-xs bg-white border border-[var(--border)] rounded-md flex items-center justify-between hover:border-[#86efac]"
          >
            <span className={selectedLabel ? "text-gray-900" : "text-gray-400"}>{selectedLabel || "Select an Investment"}</span>
            <ChevronDown size={14} className="text-gray-400" />
          </button>
          {invOpen && (
            <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg z-20 max-h-80 overflow-y-auto">
              <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                <div className="relative">
                  <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-7 pr-2 py-1.5 text-xs border border-[var(--border)] rounded" autoFocus />
                </div>
              </div>
              {INVESTMENT_SECTIONS.map((sec) => {
                const opts = sec.options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));
                if (!opts.length) return null;
                return (
                  <div key={sec.section}>
                    <p className="px-3 py-1.5 text-[11px] font-bold text-gray-700 bg-gray-50 uppercase tracking-wide">{sec.label}</p>
                    {opts.map((o) => {
                      const active = form.investmentType === o.value;
                      return (
                        <button
                          type="button"
                          key={o.value}
                          onClick={() => { setForm({ ...form, investmentType: o.value, investmentSection: sec.section }); setInvOpen(false); }}
                          className={
                            "w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[#dcfce7] " +
                            (active ? "bg-green-600 text-white hover:bg-green-700" : "text-gray-700")
                          }
                        >
                          {o.label}
                          {active && <Check size={14} />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-2">
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="text-[#22c55e] rounded" />
        Mark this as Active
      </label>

      <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
        <span className="font-semibold">Note:</span> Once you associate this benefits with an employee, you will only be able to edit the Name in Payslip. The change will be reflected in both new and existing employees.
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
      </div>
    </form>
  );
}
