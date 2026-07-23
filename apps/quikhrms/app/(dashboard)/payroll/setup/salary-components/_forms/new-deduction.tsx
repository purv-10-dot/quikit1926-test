"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { DEDUCTION_PRESETS } from "@/lib/data/payroll-presets";
import { Select } from "@/components/hrms/ui/select";
import { inputCls } from "./types";

export function NewDeductionForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const api = useApiClient();
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    category: DEDUCTION_PRESETS[0].category,
    nameInPayslip: "",
    isRecurring: false,
    isActive: true,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/payroll/salary-components", body),
    onSuccess: () => { onCreated(); setErr(null); },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const label = form.nameInPayslip.trim();
    if (!label) return setErr("Name in Payslip is required");
    createMut.mutate({
      name: label,
      nameInPayslip: label,
      code: label.replace(/\s+/g, "_").toUpperCase().slice(0, 32) + "_" + Date.now().toString().slice(-4),
      type: "Deduction",
      category: form.category,
      amountType: "Fixed",
      amountValue: null,
      frequency: form.isRecurring ? "Monthly" : "OneTime",
      taxable: false,
      includeInCTC: false,
      includeInGross: false,
      proRateOnLOP: false,
      isRecurring: form.isRecurring,
      showInPayslip: true,
      isActive: form.isActive,
    });
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-4 max-w-xl">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Deduction Type</label>
        <Select
          value={form.category}
          onChange={(v) => setForm({ ...form, category: v })}
          searchable
          options={DEDUCTION_PRESETS.map((p) => ({ value: p.category, label: p.label }))}
        />
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
        <p className="text-[13px] font-semibold text-gray-700 mb-2">
          Select the deduction frequency <span className="text-red-500">*</span>
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input type="radio" checked={!form.isRecurring} onChange={() => setForm({ ...form, isRecurring: false })} className="text-[#22c55e]" />
            One-time deduction
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input type="radio" checked={form.isRecurring} onChange={() => setForm({ ...form, isRecurring: true })} className="text-[#22c55e]" />
            Recurring deduction for subsequent Payrolls
          </label>
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
        <p className="text-xs text-red-500">* indicates mandatory fields</p>
      </div>
    </form>
  );
}
