"use client"

import { useState } from "react"
import { X, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Assignment } from "@/types/assignment"

// Match the asset condition vocabulary (New, not Excellent) — see AssignAssetModal.
const CONDITIONS = ["New", "Good", "Fair", "Poor", "Damaged"]

interface Props {
  assignment: Assignment
  onClose: () => void
  onSave: (data: { condition: string; expectedReturn: string; notes: string }) => Promise<void>
}

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

export default function EditAssignmentModal({ assignment, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    condition:      assignment.condition ?? "",
    expectedReturn: assignment.expectedReturn ?? "",
    notes:          assignment.notes ?? "",
  })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({})
  const [saving, setSaving] = useState(false)

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: "" }))
  }

  function validate() {
    const e: typeof errors = {}
    if (!form.condition) e.condition = "Required"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const inputCls = (err?: string) => cn(
    "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white",
    err ? "border-red-300" : "border-gray-200"
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Edit Assignment</h2>
            <p className="text-xs text-gray-400 mt-0.5">{assignment.asset?.itemName} → {assignment.user?.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Read-only info */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Asset</p>
              <p className="text-xs font-semibold text-gray-800">{assignment.asset?.itemName ?? "—"}</p>
              <p className="text-[10px] text-gray-400 font-mono">{assignment.asset?.itemCode}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Assigned To</p>
              <p className="text-xs font-semibold text-gray-800">{assignment.user?.name ?? "—"}</p>
              <p className="text-[10px] text-gray-400">{assignment.user?.email}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Category</p>
              <p className="text-xs text-gray-700">{assignment.asset?.category?.name ?? "—"}</p>
              <p className="text-[10px] text-gray-400">{assignment.asset?.baseCategory?.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Department</p>
              <p className="text-xs text-gray-700">{assignment.user?.department ?? "—"}</p>
            </div>
          </div>

          {/* Condition */}
          <Field label="Condition" required error={errors.condition}>
            <div className="relative">
              <select
                value={form.condition}
                onChange={(e) => set("condition", e.target.value)}
                className={cn(
                  "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white appearance-none",
                  errors.condition ? "border-red-300" : "border-gray-200",
                  !form.condition ? "text-gray-400" : "text-gray-800"
                )}
              >
                <option value="">Select Condition</option>
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </Field>

          {/* Expected Return */}
          <Field label="Expected Return Date">
            <input
              type="date"
              value={form.expectedReturn}
              onChange={(e) => set("expectedReturn", e.target.value)}
              className={inputCls()}
            />
          </Field>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Assignment notes…"
              rows={3}
              className={cn(inputCls(), "resize-none")}
            />
          </Field>

        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}
