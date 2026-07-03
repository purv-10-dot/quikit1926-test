"use client"

import { useState, useEffect } from "react"
import { X, User } from "lucide-react"
import { cn } from "@/lib/utils"
import SearchableSelect from "@/components/assignments/SearchableSelect"
import type { Asset } from "@/types/asset"
import type { Assignment } from "@/types/assignment"

type FormData = {
  assetId: string
  issueTitle: string
  issueDescription: string
  vendor: string
  estimatedCost: string
  sentDate: string
  expectedReturn: string
  notes: string
}

interface Props {
  onClose: () => void
  onSave: (data: FormData) => Promise<void>
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

export default function SendToRepairModal({ onClose, onSave }: Props) {
  const today = new Date().toISOString().split("T")[0]

  const [form, setForm] = useState<FormData>({
    assetId: "", issueTitle: "", issueDescription: "",
    vendor: "", estimatedCost: "", sentDate: today, expectedReturn: "", notes: "",
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [saving, setSaving] = useState(false)
  const [assets, setAssets] = useState<Asset[]>([])
  const [assignee, setAssignee] = useState<Assignment | null>(null)
  const [loadingAssignee, setLoadingAssignee] = useState(false)

  useEffect(() => {
    fetch("/api/assets")
      .then((r) => r.json())
      .then((j) => {
        const data: Asset[] = j.data ?? []
        setAssets(data.filter((a) => a.assetStatus === "Available" || a.assetStatus === "Assigned"))
      })
  }, [])

  const selectedAsset = assets.find((a) => a.id === form.assetId)

  // Auto-fetch active assignee for any selected asset
  useEffect(() => {
    setAssignee(null)
    if (!form.assetId) return
    setLoadingAssignee(true)
    fetch(`/api/assignments?assetId=${form.assetId}`)
      .then((r) => r.json())
      .then((j) => {
        const data: Assignment[] = j.data ?? []
        setAssignee(data[0] ?? null)
      })
      .finally(() => setLoadingAssignee(false))
  }, [form.assetId])

  function set(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: "" }))
  }

  function validate() {
    const e: typeof errors = {}
    if (!form.assetId)               e.assetId          = "Required"
    if (!form.issueTitle.trim())     e.issueTitle        = "Required"
    if (!form.issueDescription.trim()) e.issueDescription = "Required"
    if (!form.sentDate)              e.sentDate          = "Required"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const assetOptions = assets.map((a) => ({
    value: a.id,
    label: a.itemName,
    sublabel: a.itemCode,
  }))

  const inputCls = (err?: string) => cn(
    "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white",
    err ? "border-red-300" : "border-gray-200"
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Send to Repair</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Asset */}
          <Field label="Asset" required error={errors.assetId}>
            <SearchableSelect
              options={assetOptions} value={form.assetId}
              onChange={(v) => set("assetId", v)}
              placeholder="Select Asset" searchPlaceholder="Search asset…"
              error={errors.assetId}
            />
          </Field>

          {/* Auto-populated info */}
          {selectedAsset && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-3 p-3 bg-accent-50/50 rounded-lg border border-accent-100">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Category</p>
                  <p className="text-xs text-gray-700 font-medium">{selectedAsset.category?.name ?? "—"}</p>
                  <p className="text-[10px] text-gray-400">{selectedAsset.baseCategory?.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Condition</p>
                  <p className="text-xs text-gray-700 font-medium">{selectedAsset.condition ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Current Status</p>
                  <span className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                    selectedAsset.assetStatus === "Available" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                  )}>
                    {selectedAsset.assetStatus}
                  </span>
                </div>
              </div>

              {/* Assignee info — shown when loading or an assignee is found */}
              {(loadingAssignee || assignee?.user) && (
                <div className="flex items-center gap-3 p-3 bg-yellow-50/60 rounded-lg border border-yellow-100">
                  <div className="w-7 h-7 rounded-full bg-yellow-200 flex items-center justify-center flex-shrink-0">
                    <User className="w-3.5 h-3.5 text-yellow-700" />
                  </div>
                  {loadingAssignee ? (
                    <p className="text-xs text-gray-400">Fetching assignee…</p>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-yellow-700 uppercase tracking-wide mb-0.5">Currently Assigned To</p>
                      <p className="text-xs font-semibold text-gray-800">{assignee!.user!.name}</p>
                      <p className="text-[10px] text-gray-500">{assignee!.user!.email}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Issue Title */}
          <Field label="Issue Title" required error={errors.issueTitle}>
            <input
              value={form.issueTitle}
              onChange={(e) => set("issueTitle", e.target.value)}
              placeholder="e.g. Screen not turning on"
              className={inputCls(errors.issueTitle)}
            />
          </Field>

          {/* Issue Description */}
          <Field label="Issue Description" required error={errors.issueDescription}>
            <textarea
              value={form.issueDescription}
              onChange={(e) => set("issueDescription", e.target.value)}
              placeholder="Describe the issue in detail…"
              rows={3}
              className={cn(inputCls(errors.issueDescription), "resize-none")}
            />
          </Field>

          {/* Vendor + Estimated Cost */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vendor / Service Center">
              <input
                value={form.vendor}
                onChange={(e) => set("vendor", e.target.value)}
                placeholder="e.g. Dell Service Center"
                className={inputCls()}
              />
            </Field>
            <Field label="Estimated Cost">
              <input
                type="number" min="0" step="0.01"
                value={form.estimatedCost}
                onChange={(e) => set("estimatedCost", e.target.value)}
                placeholder="0.00"
                className={inputCls()}
              />
            </Field>
          </div>

          {/* Sent Date + Expected Return */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sent Date" required error={errors.sentDate}>
              <input
                type="date" value={form.sentDate}
                onChange={(e) => set("sentDate", e.target.value)}
                className={inputCls(errors.sentDate)}
              />
            </Field>
            <Field label="Expected Return Date">
              <input
                type="date" value={form.expectedReturn}
                onChange={(e) => set("expectedReturn", e.target.value)}
                className={inputCls()}
              />
            </Field>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Additional notes…"
              rows={2}
              className={cn(inputCls(), "resize-none")}
            />
          </Field>

        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 text-xs font-semibold bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors">
            {saving ? "Sending…" : "Send to Repair"}
          </button>
        </div>
      </div>
    </div>
  )
}
