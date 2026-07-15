"use client"

import { useState } from "react"
import { X, CheckCircle2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AssetRequest, AssetRequestDecision } from "@/types/assetRequest"

interface Props {
  request: AssetRequest
  action: AssetRequestDecision
  onClose: () => void
  /** Resolve with the (optional for approve, required for reject) decision note. */
  onConfirm: (note: string) => Promise<void>
}

/**
 * Approve / Reject confirmation for a single Asset Request. The queue opens this
 * in either mode. A note is optional when approving, required when rejecting
 * (so a rejection always carries a reason). Pure presentation — the caller owns
 * the API call.
 */
export default function ApproveRejectDialog({ request, action, onClose, onConfirm }: Props) {
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const isReject = action === "reject"

  async function handleConfirm() {
    if (isReject && !note.trim()) {
      setError("A reason is required when rejecting a request.")
      return
    }
    setSaving(true)
    await onConfirm(note.trim())
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                isReject ? "bg-red-100" : "bg-green-100",
              )}
            >
              {isReject ? (
                <XCircle className="w-4 h-4 text-red-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              )}
            </div>
            <h2 className="text-sm font-semibold text-gray-900">
              {isReject ? "Reject request" : "Approve request"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Request summary */}
          <dl className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs space-y-1.5">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-400">Item</dt>
              <dd className="text-gray-800 font-medium text-right">
                {request.itemType} <span className="text-gray-400">×{request.quantity}</span>
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-400">Requested by</dt>
              <dd className="text-gray-700 text-right">{request.requesterName ?? request.requesterUserId}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-400">Type / Priority</dt>
              <dd className="text-gray-700 text-right">{request.requestType} · {request.priority}</dd>
            </div>
            <div className="pt-1.5 border-t border-gray-200/70">
              <dt className="text-gray-400 mb-0.5">Justification</dt>
              <dd className="text-gray-700">{request.justification}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">
              {isReject ? "Reason" : "Note"}
              {isReject && <span className="text-red-500 ml-0.5">*</span>}
              {!isReject && <span className="text-gray-400 font-normal ml-1">(optional)</span>}
            </label>
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); setError("") }}
              rows={3}
              placeholder={isReject ? "Why is this being rejected?" : "Add an optional note…"}
              className={cn(
                "w-full px-3 py-2 text-xs border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white",
                error ? "border-red-300" : "border-gray-200",
              )}
            />
            {error && <p className="text-[10px] text-red-500">{error}</p>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className={cn(
              "px-5 py-2 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50",
              isReject ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700",
            )}
          >
            {saving ? "Saving…" : isReject ? "Reject" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  )
}
