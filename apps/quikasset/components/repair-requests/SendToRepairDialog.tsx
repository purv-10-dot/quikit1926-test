"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import SearchableSelect from "@/components/assignments/SearchableSelect"
import type { Vendor } from "@/types/vendor"
import type { RepairRequest } from "@/types/repairRequest"

/**
 * Payload POSTed to /api/repair-requests/[id]/fulfil. The asset + issue text are
 * fixed by the request; the approver only supplies the repair logistics
 * (vendor/cost/dates), mirroring the direct "Send to Repair" form.
 */
export type SendToRepairPayload = {
  vendorId: string | null
  estimatedCost: string
  sentDate: string
  expectedReturn: string
  notes: string
}

interface Props {
  request: RepairRequest
  onClose: () => void
  onConfirm: (payload: SendToRepairPayload) => Promise<void>
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

const inputCls = (err?: string) => cn(
  "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white",
  err ? "border-red-300" : "border-gray-200",
)

/**
 * "Send to Repair" for an approved repair request. Loads active vendors for the
 * picker; the asset and issue come straight from the request (read-only). On
 * confirm the API creates a real AstRepair and marks the request Fulfilled.
 */
export default function SendToRepairDialog({ request, onClose, onConfirm }: Props) {
  const today = new Date().toISOString().split("T")[0]

  const [vendorId, setVendorId] = useState("")
  const [estimatedCost, setEstimatedCost] = useState("")
  const [sentDate, setSentDate] = useState(today)
  const [expectedReturn, setExpectedReturn] = useState("")
  const [notes, setNotes] = useState("")
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [errors, setErrors] = useState<{ sentDate?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/vendors?status=Active")
      .then((r) => r.json())
      .then((j) => setVendors(j.data ?? []))
      .catch(() => setVendors([]))
  }, [])

  const vendorOptions = vendors.map((v) => ({ value: v.id, label: v.name, sublabel: v.contactPerson ?? undefined }))

  async function handleConfirm() {
    if (!sentDate) {
      setErrors({ sentDate: "Required" })
      return
    }
    setSaving(true)
    await onConfirm({
      vendorId: vendorId || null,
      estimatedCost,
      sentDate,
      expectedReturn,
      notes,
    })
    setSaving(false)
  }

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
          {/* Fixed context from the request */}
          <div className="rounded-lg border border-accent-100 bg-accent-50/50 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Asset</p>
                <p className="text-xs text-gray-800 font-medium">{request.assetName ?? request.assetId}</p>
                <p className="font-mono text-[10px] text-gray-400">{request.assetCode ?? ""}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Reported by</p>
                <p className="text-xs text-gray-800 font-medium">{request.requesterName ?? request.requesterUserId}</p>
                <p className="text-[10px] text-gray-400">Urgency: {request.urgency}</p>
              </div>
            </div>
            <div className="pt-2 border-t border-accent-100/70">
              <p className="text-xs font-semibold text-gray-800">{request.issueTitle}</p>
              <p className="text-[11px] text-gray-600 whitespace-pre-wrap mt-0.5">{request.issueDescription}</p>
            </div>
          </div>

          {/* Vendor + Estimated Cost */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vendor / Service Center">
              <SearchableSelect
                options={vendorOptions} value={vendorId}
                onChange={setVendorId}
                placeholder="Select vendor" searchPlaceholder="Search vendors…"
              />
            </Field>
            <Field label="Estimated Cost">
              <input
                type="number" min="0" step="0.01"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="0.00"
                className={inputCls()}
              />
            </Field>
          </div>

          {/* Sent Date + Expected Return */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sent Date" required error={errors.sentDate}>
              <input
                type="date" value={sentDate}
                onChange={(e) => { setSentDate(e.target.value); setErrors({}) }}
                className={inputCls(errors.sentDate)}
              />
            </Field>
            <Field label="Expected Return Date">
              <input
                type="date" value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
                className={inputCls()}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
          <button onClick={handleConfirm} disabled={saving}
            className="px-6 py-2 text-xs font-semibold bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors">
            {saving ? "Sending…" : "Send to Repair"}
          </button>
        </div>
      </div>
    </div>
  )
}
