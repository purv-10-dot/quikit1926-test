"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { REIMBURSEMENT_PRESETS } from "@/lib/data/payroll-presets";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { inputCls } from "./types";

export function NewReimbursementForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const api = useApiClient();
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    category: REIMBURSEMENT_PRESETS[0].category,
    nameInPayslip: "",
    isFBP: false,
    carryForwardUnclaimed: true,
    maxAmount: null as number | null,
    isActive: true,
    requireBillNumber: false,
    requireMerchantName: false,
    requireUploadDoc: false,
    claimInstructions: "",
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/payroll/salary-components", body),
    onSuccess: () => { onCreated(); setErr(null); },
    onError: (e: Error) => setErr(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const label = form.nameInPayslip.trim();
    if (!label) return setErr("Name in Payslip is required");
    if (form.maxAmount == null) return setErr("Amount is required");
    createMut.mutate({
      name: label,
      nameInPayslip: label,
      code: label.replace(/\s+/g, "_").toUpperCase().slice(0, 32) + "_" + Date.now().toString().slice(-4),
      type: "Reimbursement",
      category: form.category,
      amountType: "Fixed",
      amountValue: null,
      maxAmount: form.maxAmount,
      frequency: "Monthly",
      taxable: false,
      includeInCTC: true,
      includeInGross: false,
      isFBP: form.isFBP,
      carryForwardUnclaimed: form.carryForwardUnclaimed,
      requireBillNumber: form.requireBillNumber,
      requireMerchantName: form.requireMerchantName,
      requireUploadDoc: form.requireUploadDoc,
      claimInstructions: form.claimInstructions || null,
      showInPayslip: true,
      isActive: form.isActive,
    });
  };

  return (
    <form onSubmit={submit} className="p-5 space-y-4 max-w-xl">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Reimbursement Type</label>
        <Select
          value={form.category}
          onChange={(v) => setForm({ ...form, category: v })}
          placeholder="Select"
          searchable
          options={REIMBURSEMENT_PRESETS.map((p) => ({ value: p.category, label: p.label }))}
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
        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.isFBP} onChange={(e) => setForm({ ...form, isFBP: e.target.checked })} className="mt-0.5 text-[#3b82f6] rounded" />
          <span>
            Include this as a Flexible Benefit Plan component
            <span className="block text-xs text-gray-500 mt-0.5">FBP allows your employees to personalise their salary structure by choosing how much they want to receive under each FBP component.</span>
          </span>
        </label>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">How do you want to handle unclaimed reimbursement?</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" checked={form.carryForwardUnclaimed} onChange={() => setForm({ ...form, carryForwardUnclaimed: true })} className="text-[#3b82f6]" />
            Carry forward and encash at the end of the fiscal year
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" checked={!form.carryForwardUnclaimed} onChange={() => setForm({ ...form, carryForwardUnclaimed: false })} className="text-[#3b82f6]" />
            Do not carry forward and encash monthly
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Enter Amount <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center border border-[var(--border)] rounded-md overflow-hidden max-w-xs">
          <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm border-r border-gray-300">₹</span>
          <NumberInput
            step="0.01"
            value={form.maxAmount}
            onChange={(v) => setForm({ ...form, maxAmount: v })}
            required
            className="flex-1 px-3 py-2 text-sm outline-none"
          />
          <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm border-l border-gray-300">per month</span>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Claim form requirements</p>
        <p className="text-xs text-gray-500 mb-3">Fields employees must fill when submitting a claim against this reimbursement.</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.requireBillNumber} onChange={(e) => setForm({ ...form, requireBillNumber: e.target.checked })} className="text-[#3b82f6] rounded" />
            Require Bill Number
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.requireMerchantName} onChange={(e) => setForm({ ...form, requireMerchantName: e.target.checked })} className="text-[#3b82f6] rounded" />
            Require Merchant Name
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.requireUploadDoc} onChange={(e) => setForm({ ...form, requireUploadDoc: e.target.checked })} className="text-[#3b82f6] rounded" />
            Require Upload Document (bill / proof)
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Comment / Instructions for employee</label>
        <textarea
          value={form.claimInstructions}
          onChange={(e) => setForm({ ...form, claimInstructions: e.target.value })}
          rows={3}
          className={inputCls}
          placeholder="e.g. Attach original fuel bill with vehicle number visible. Claims older than 60 days will be rejected."
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pt-2">
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="text-[#3b82f6] rounded" />
        Mark this as Active
      </label>

      <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
        <span className="font-semibold">Note:</span> Once you associate this component with an employee, you will only be able to edit the Name in Payslip and Amount. The changes you make to Amount will apply only to new employees.
      </div>

      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{err}</p>}

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="flex gap-2">
          <button type="submit" disabled={createMut.isPending} className="px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-60 text-white rounded-md text-sm font-semibold shadow-sm">
            {createMut.isPending ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-sm font-medium">
            Cancel
          </button>
        </div>
        <p className="text-xs text-red-500">* indicates mandatory fields</p>
      </div>
    </form>
  );
}
