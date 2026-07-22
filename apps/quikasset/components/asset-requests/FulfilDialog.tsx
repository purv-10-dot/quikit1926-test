"use client"

import { useState, useEffect } from "react"
import { X, PackageCheck, Cloud, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { selectAssignableAssets } from "@/lib/assetRequests"
import type { AssetRequest } from "@/types/assetRequest"
import type { Asset } from "@/types/asset"

export type FulfilPayload = { assetId?: string; note?: string }

interface Props {
  request: AssetRequest
  onClose: () => void
  onConfirm: (payload: FulfilPayload) => Promise<void>
}

// Condition pill colours — mirror the Asset Inventory table for consistency.
const CONDITION_STYLES: Record<string, string> = {
  New: "bg-green-100 text-green-700",
  Good: "bg-blue-100 text-blue-700",
  Fair: "bg-yellow-100 text-yellow-700",
  Poor: "bg-orange-100 text-orange-700",
  Damaged: "bg-red-100 text-red-700",
}

/**
 * Assign an approved request.
 *  - Physical: pick one Available in-stock unit (matching the request's
 *    category) from a detailed list to hand over (one unit per confirm).
 *  - Subscription: no asset — record an optional provisioning note (Option A).
 */
export default function FulfilDialog({ request, onClose, onConfirm }: Props) {
  const isSubscription = request.itemKind === "Subscription"
  const [assetId, setAssetId] = useState("")
  const [note, setNote] = useState("")
  const [search, setSearch] = useState("")
  const [assets, setAssets] = useState<Asset[]>([])
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isSubscription) return
    fetch("/api/assets")
      .then((r) => r.json())
      .then((j) => setAssets(j?.data ?? []))
      .catch(() => setAssets([]))
  }, [isSubscription])

  async function handleConfirm() {
    if (!isSubscription && !assetId) {
      setError("Select an available unit to assign.")
      return
    }
    setSaving(true)
    await onConfirm(isSubscription ? { note: note.trim() || undefined } : { assetId })
    setSaving(false)
  }

  // Only Available stock matching this request's category (helper is unit-tested;
  // the API enforces the same category match server-side), then a client-side
  // search over name / code / serial.
  const assignable = selectAssignableAssets(assets, request)
  const q = search.trim().toLowerCase()
  const visible = q
    ? assignable.filter(
        (a) =>
          a.itemName.toLowerCase().includes(q) ||
          a.itemCode.toLowerCase().includes(q) ||
          a.serialNumber.toLowerCase().includes(q),
      )
    : assignable

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className={cn(
          "bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh]",
          isSubscription ? "max-w-md" : "max-w-2xl",
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-accent-100 flex-shrink-0">
              {isSubscription ? <Cloud className="w-4 h-4 text-accent-600" /> : <PackageCheck className="w-4 h-4 text-accent-600" />}
            </div>
            <h2 className="text-sm font-semibold text-gray-900">
              Assign {isSubscription ? "digital asset" : "from stock"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Summary — requested item */}
          <dl className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs flex items-center gap-2">
            <dt className="text-gray-400">Item</dt>
            <dd className="text-gray-800 font-medium">{request.itemType}</dd>
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
              <p className="text-[10px] text-gray-400">No stock item is handed over — the request is marked Assigned.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-gray-600">
                  Choose a unit to assign <span className="text-red-500">*</span>
                </label>
                {assignable.length > 0 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name or serial…"
                      className="w-56 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400 focus:bg-white"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr className="bg-accent-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                        <th className="w-10 px-3 py-2" />
                        <th className="text-left px-3 py-2 font-semibold">Item</th>
                        <th className="text-left px-3 py-2 font-semibold">Serial No.</th>
                        <th className="text-left px-3 py-2 font-semibold">Condition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-10 text-center text-gray-400">
                            {assignable.length === 0
                              ? `No available ${request.itemType} in stock to assign.`
                              : "No units match your search."}
                          </td>
                        </tr>
                      ) : (
                        visible.map((a) => {
                          const selected = a.id === assetId
                          return (
                            <tr
                              key={a.id}
                              onClick={() => { setAssetId(a.id); setError("") }}
                              className={cn(
                                "cursor-pointer border-t border-gray-100 transition-colors",
                                selected ? "bg-accent-50" : "hover:bg-gray-50",
                              )}
                            >
                              <td className="px-3 py-2.5 text-center">
                                <span
                                  className={cn(
                                    "inline-flex h-4 w-4 items-center justify-center rounded-full border",
                                    selected ? "border-accent-600 bg-accent-600" : "border-gray-300",
                                  )}
                                >
                                  {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-semibold text-gray-800">{a.itemName}</p>
                                <p className="font-mono text-[10px] text-gray-400">{a.itemCode}</p>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-gray-600">{a.serialNumber}</td>
                              <td className="px-3 py-2.5">
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", CONDITION_STYLES[a.condition] ?? "bg-gray-100 text-gray-600")}>
                                  {a.condition}
                                </span>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-[10px] text-gray-400">
                Only available “{request.itemType}” stock — assigns one unit to the requester.
              </p>
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
            disabled={saving || (!isSubscription && !assetId)}
            className="px-5 py-2 text-xs font-semibold text-white rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  )
}
