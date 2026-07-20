"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import SearchableSelect from "@/components/assignments/SearchableSelect"
import type { Repair } from "@/types/repair"
import type { Vendor } from "@/types/vendor"

interface Props {
  repair: Repair
  onClose: () => void
  onSave: (data: {
    issueTitle: string; issueDescription: string; sentDate: string
    vendorId: string; estimatedCost: string; actualCost: string
    expectedReturn: string; returnedDate: string; notes: string
  }) => Promise<void>
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

export default function UpdateRepairModal({ repair, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    issueTitle:       repair.issueTitle ?? "",
    issueDescription: repair.issueDescription ?? "",
    sentDate:         repair.sentDate ?? "",
    vendorId:         repair.vendorId ?? "",
    estimatedCost:    repair.estimatedCost != null ? String(repair.estimatedCost) : "",
    actualCost:       repair.actualCost != null ? String(repair.actualCost) : "",
    expectedReturn:   repair.expectedReturn ?? "",
    returnedDate:     repair.returnedDate ?? "",
    notes:            repair.notes ?? "",
  })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({})
  const [saving, setSaving] = useState(false)
  const [vendors, setVendors] = useState<Vendor[]>([])

  useEffect(() => {
    fetch("/api/vendors?status=Active").then((r) => r.json()).then((j) => setVendors(j.data ?? []))
  }, [])
  const vendorOptions = vendors.map((v) => ({ value: v.id, label: v.name, sublabel: v.contactPerson ?? undefined }))

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: "" }))
  }

  function validate() {
    const e: typeof errors = {}
    if (!form.issueTitle.trim())      e.issueTitle      = "Required"
    if (!form.issueDescription.trim()) e.issueDescription = "Required"
    if (!form.sentDate)               e.sentDate        = "Required"
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Edit Repair Record</h2>
            <p className="text-xs text-gray-400 mt-0.5">{repair.asset?.itemName} — {repair.asset?.itemCode}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Asset info */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-accent-50/50 rounded-lg border border-accent-100">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Category</p>
              <p className="text-xs text-gray-700 font-medium">{repair.asset?.category?.name ?? "—"}</p>
              <p className="text-[10px] text-gray-400">{repair.asset?.baseCategory?.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Condition</p>
              <p className="text-xs text-gray-700 font-medium">{repair.asset?.condition ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Serial No.</p>
              <p className="text-xs text-gray-700 font-mono">{repair.asset?.serialNumber ?? "—"}</p>
            </div>
          </div>

          {/* Issue Title */}
          <Field label="Issue Title" required error={errors.issueTitle}>
            <input value={form.issueTitle} onChange={(e) => set("issueTitle", e.target.value)}
              placeholder="e.g. Screen not turning on"
              className={inputCls(errors.issueTitle)} />
          </Field>

          {/* Issue Description */}
          <Field label="Issue Description" required error={errors.issueDescription}>
            <textarea value={form.issueDescription} onChange={(e) => set("issueDescription", e.target.value)}
              placeholder="Describe the issue in detail…" rows={3}
              className={cn(inputCls(errors.issueDescription), "resize-none")} />
          </Field>

          {/* Vendor + Sent Date */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vendor / Service Center">
              <SearchableSelect
                options={vendorOptions} value={form.vendorId}
                onChange={(v) => set("vendorId", v)}
                placeholder="Select vendor" searchPlaceholder="Search vendors…"
              />
              {!form.vendorId && repair.vendor && (
                <p className="text-[10px] text-gray-400">Previously (free text): {repair.vendor}</p>
              )}
            </Field>
            <Field label="Sent Date" required error={errors.sentDate}>
              <input type="date" value={form.sentDate}
                onChange={(e) => set("sentDate", e.target.value)}
                className={inputCls(errors.sentDate)} />
            </Field>
          </div>

          {/* Estimated Cost + Actual Cost */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Estimated Cost">
              <input type="number" min="0" step="0.01"
                value={form.estimatedCost} onChange={(e) => set("estimatedCost", e.target.value)}
                placeholder="0.00" className={inputCls()} />
            </Field>
            <Field label="Actual Cost">
              <input type="number" min="0" step="0.01"
                value={form.actualCost} onChange={(e) => set("actualCost", e.target.value)}
                placeholder="0.00" className={inputCls()} />
            </Field>
          </div>

          {/* Expected Return + Actual Return */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Expected Return Date">
              <input type="date" value={form.expectedReturn}
                onChange={(e) => set("expectedReturn", e.target.value)} className={inputCls()} />
            </Field>
            <Field label="Actual Return Date">
              <input type="date" value={form.returnedDate}
                onChange={(e) => set("returnedDate", e.target.value)} className={inputCls()} />
            </Field>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
              placeholder="Additional notes…" rows={2}
              className={cn(inputCls(), "resize-none")} />
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
