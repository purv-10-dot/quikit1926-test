"use client"

import { useState, useEffect } from "react"
import { X, PackageCheck, Cloud } from "lucide-react"
import SearchableSelect from "@/components/assignments/SearchableSelect"
import type { AssetRequest } from "@/types/assetRequest"
import type { Asset } from "@/types/asset"

export type FulfilPayload = { assetId?: string; note?: string }

interface Props {
  request: AssetRequest
  onClose: () => void
  onConfirm: (payload: FulfilPayload) => Promise<void>
}

/**
 * Fulfil an approved request.
 *  - Physical: pick one Available asset to hand over (one unit per confirm).
 *  - Subscription: no asset — record an optional provisioning note (Option A).
 */
export default function FulfilDialog({ request, onClose, onConfirm }: Props) {
  const isSubscription = request.itemKind === "Subscription"
  const [assetId, setAssetId] = useState("")
  const [note, setNote] = useState("")
  const [assets, setAssets] = useState<Asset[]>([])
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const remaining = request.quantity - request.quantityFulfilled

  useEffect(() => {
    if (isSubscription) return
    fetch("/api/assets")
      .then((r) => r.json())
      .then((j) => setAssets((j?.data ?? []).filter((a: Asset) => a.assetStatus === "Available")))
      .catch(() => setAssets([]))
  }, [isSubscription])

  async function handleConfirm() {
    if (!isSubscription && !assetId) {
      setError("Select an available asset to hand over.")
      return
    }
    setSaving(true)
    await onConfirm(isSubscription ? { note: note.trim() || undefined } : { assetId })
    setSaving(false)
  }

  const assetOptions = assets.map((a) => ({ value: a.id, label: a.itemName, sublabel: a.itemCode }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-accent-100 flex-shrink-0">
              {isSubscription ? <Cloud className="w-4 h-4 text-accent-600" /> : <PackageCheck className="w-4 h-4 text-accent-600" />}
            </div>
            <h2 className="text-sm font-semibold text-gray-900">
              Fulfil {isSubscription ? "subscription" : "from stock"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <dl className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs space-y-1.5">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-400">Item</dt>
              <dd className="text-gray-800 font-medium text-right">{request.itemType}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-400">Remaining</dt>
              <dd className="text-gray-700 text-right">{remaining} of {request.quantity}</dd>
            </div>
          </dl>

          {isSubscription ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Provisioning note <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="e.g. seat/license reference, vendor…"
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white"
              />
              <p className="text-[10px] text-gray-400">No asset is assigned — the request is marked Fulfilled.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Available asset <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={assetOptions}
                value={assetId}
                onChange={(v) => { setAssetId(v); setError("") }}
                placeholder="Select an available asset"
                searchPlaceholder="Search asset…"
                error={error}
              />
              <p className="text-[10px] text-gray-400">Hands over one unit and assigns it to the requester.</p>
              {error && <p className="text-[10px] text-red-500">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-5 py-2 text-xs font-semibold text-white rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Fulfilling…" : "Fulfil"}
          </button>
        </div>
      </div>
    </div>
  )
}
