"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export type FiscalBudget = {
  id: string
  fiscalYear: string
  q1Amount: number
  q2Amount: number
  q3Amount: number
  q4Amount: number
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export type FiscalBudgetFormData = {
  fiscalYear: string
  q1Amount: string
  q2Amount: string
  q3Amount: string
  q4Amount: string
  notes: string
}

interface Props {
  budget?: FiscalBudget
  defaultFiscalYear?: string
  onClose: () => void
  onSave: (data: FiscalBudgetFormData) => Promise<void>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function fmtTotal(q1: string, q2: string, q3: string, q4: string): string {
  const total = [q1, q2, q3, q4].reduce((s, v) => s + (parseFloat(v) || 0), 0)
  if (total === 0) return "₹0"
  if (total >= 10_000_000) return `₹${(total / 10_000_000).toFixed(1)}Cr`
  if (total >= 100_000)    return `₹${(total / 100_000).toFixed(1)}L`
  if (total >= 1_000)      return `₹${(total / 1_000).toFixed(1)}K`
  return `₹${total.toLocaleString()}`
}

const FISCAL_YEARS = Array.from({ length: 12 }, (_, i) => {
  const start = 2022 + i
  return `FY ${start}-${String(start + 1).slice(-2)}`
})

export default function FiscalBudgetModal({ budget, defaultFiscalYear, onClose, onSave }: Props) {
  const [form, setForm] = useState<FiscalBudgetFormData>({
    fiscalYear: budget?.fiscalYear ?? defaultFiscalYear ?? "",
    q1Amount:   budget?.q1Amount != null ? String(budget.q1Amount) : "",
    q2Amount:   budget?.q2Amount != null ? String(budget.q2Amount) : "",
    q3Amount:   budget?.q3Amount != null ? String(budget.q3Amount) : "",
    q4Amount:   budget?.q4Amount != null ? String(budget.q4Amount) : "",
    notes:      budget?.notes ?? "",
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FiscalBudgetFormData, string>>>({})
  const [saving, setSaving] = useState(false)

  function set(field: keyof FiscalBudgetFormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: "" }))
  }

  function validate() {
    const e: typeof errors = {}
    if (!form.fiscalYear) e.fiscalYear = "Required"
    const total = [form.q1Amount, form.q2Amount, form.q3Amount, form.q4Amount]
      .reduce((s, v) => s + (parseFloat(v) || 0), 0)
    if (total <= 0) e.q1Amount = "At least one quarter must have an amount"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const inputCls = cn("w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white")
  const selectCls = (empty: boolean) => cn(
    "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white appearance-none",
    errors.fiscalYear ? "border-red-300" : "border-gray-200",
    empty ? "text-gray-400" : "text-gray-800"
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{budget ? "Edit Fiscal Budget" : "Add Fiscal Budget"}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Fiscal Year" required>
            <div className="relative">
              <select value={form.fiscalYear} onChange={(e) => set("fiscalYear", e.target.value)}
                className={selectCls(!form.fiscalYear)}>
                <option value="">Select Fiscal Year</option>
                {FISCAL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {errors.fiscalYear && <p className="text-[10px] text-red-500 mt-0.5">{errors.fiscalYear}</p>}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            {([
              { key: "q1Amount", label: "Q1 Budget (Apr–Jun)" },
              { key: "q2Amount", label: "Q2 Budget (Jul–Sep)" },
              { key: "q3Amount", label: "Q3 Budget (Oct–Dec)" },
              { key: "q4Amount", label: "Q4 Budget (Jan–Mar)" },
            ] as const).map(({ key, label }) => (
              <Field key={key} label={label}>
                <input
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  type="number" min="0" step="1000"
                  placeholder="₹ 0"
                  className={cn(inputCls, key === "q1Amount" && errors.q1Amount ? "border-red-300" : "")}
                />
              </Field>
            ))}
          </div>
          {errors.q1Amount && <p className="text-[10px] text-red-500 -mt-2">{errors.q1Amount}</p>}

          <div className="bg-accent-50 border border-accent-100 rounded-lg px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-accent-700">Total Annual Budget</span>
            <span className="text-sm font-bold text-accent-800">{fmtTotal(form.q1Amount, form.q2Amount, form.q3Amount, form.q4Amount)}</span>
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
              placeholder="Optional notes…" rows={2}
              className={cn(inputCls, "resize-none")} />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : budget ? "Save Changes" : "Add Budget"}
          </button>
        </div>
      </div>
    </div>
  )
}
