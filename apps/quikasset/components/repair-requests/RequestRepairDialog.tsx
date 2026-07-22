"use client"

import { useState } from "react"
import { X, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RepairRequestUrgency } from "@/types/repairRequest"

/**
 * Payload POSTed to /api/repair-requests. The asset is fixed by the card the
 * dialog was opened from — the employee only describes the fault + urgency.
 */
export type RequestRepairPayload = {
  assetId: string
  issueTitle: string
  issueDescription: string
  urgency: RepairRequestUrgency
}

/** The asset this request is for — passed in from the My Assets card. */
export type RepairTarget = {
  id: string
  itemName: string
  itemCode: string
}

interface Props {
  asset: RepairTarget
  onClose: () => void
  onSubmit: (payload: RequestRepairPayload) => Promise<void>
}

const URGENCIES: RepairRequestUrgency[] = ["Low", "Medium", "High", "Urgent"]

const inputCls = (err?: string) =>
  cn(
    "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white",
    err ? "border-red-300" : "border-gray-200",
  )

function Field({
  label, required, error, children,
}: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

/**
 * Employee "Request Repair" form. Opened from a My Assets card with the asset
 * pre-selected; submits a repair request (status Submitted) for approver review.
 */
export default function RequestRepairDialog({ asset, onClose, onSubmit }: Props) {
  const [issueTitle, setIssueTitle] = useState("")
  const [issueDescription, setIssueDescription] = useState("")
  const [urgency, setUrgency] = useState<RepairRequestUrgency>("Medium")
  const [errors, setErrors] = useState<{ issueTitle?: string; issueDescription?: string }>({})
  const [saving, setSaving] = useState(false)

  function validate() {
    const e: typeof errors = {}
    if (!issueTitle.trim()) e.issueTitle = "Required"
    if (!issueDescription.trim()) e.issueDescription = "Required"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      await onSubmit({
        assetId: asset.id,
        issueTitle: issueTitle.trim(),
        issueDescription: issueDescription.trim(),
        urgency,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-accent-100 flex items-center justify-center flex-shrink-0">
              <Wrench className="w-4 h-4 text-accent-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Request Repair</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Fixed asset context */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Asset</p>
            <p className="text-xs font-semibold text-gray-800">{asset.itemName}</p>
            <p className="font-mono text-[10px] text-gray-400">{asset.itemCode}</p>
          </div>

          <Field label="Issue Title" required error={errors.issueTitle}>
            <input
              value={issueTitle}
              onChange={(e) => { setIssueTitle(e.target.value); setErrors((x) => ({ ...x, issueTitle: "" })) }}
              placeholder="e.g. Screen flickers and goes black"
              className={inputCls(errors.issueTitle)}
            />
          </Field>

          <Field label="What's wrong?" required error={errors.issueDescription}>
            <textarea
              value={issueDescription}
              onChange={(e) => { setIssueDescription(e.target.value); setErrors((x) => ({ ...x, issueDescription: "" })) }}
              rows={4}
              placeholder="Describe the problem so IT can act on it…"
              className={cn(inputCls(errors.issueDescription), "resize-none")}
            />
          </Field>

          <Field label="Urgency" required>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as RepairRequestUrgency)}
              className={inputCls()}
            >
              {URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-xs font-semibold text-white rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </div>
    </div>
  )
}
