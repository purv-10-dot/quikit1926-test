"use client"

/**
 * Pending Approvals queue — admin/approver side of Asset Request (Module 1).
 * Reads the live queue from `/api/asset-requests` and drives approve/reject via
 * `/api/asset-requests/[id]/decision` and fulfilment via `.../fulfil`.
 */

import { useState, useEffect, useCallback } from "react"
import { Loader2, Inbox, Check, X, Package, Cloud, PackageCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { RequirePerm } from "@/components/require-perm"
import ApproveRejectDialog from "@/components/asset-requests/ApproveRejectDialog"
import FulfilDialog, { type FulfilPayload } from "@/components/asset-requests/FulfilDialog"
import type { AssetRequest, AssetRequestDecision, AssetRequestStatus } from "@/types/assetRequest"

const STATUS_STYLES: Record<AssetRequestStatus, string> = {
  Draft:              "bg-gray-50 text-gray-500 border border-gray-200",
  Submitted:          "bg-blue-50 text-blue-700 border border-blue-200",
  PendingApproval:    "bg-yellow-50 text-yellow-700 border border-yellow-200",
  Approved:           "bg-green-50 text-green-700 border border-green-200",
  Rejected:           "bg-red-50 text-red-600 border border-red-200",
  PartiallyFulfilled: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  Fulfilled:          "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Cancelled:          "bg-gray-100 text-gray-400 border border-gray-200",
}

const STATUS_LABELS: Record<AssetRequestStatus, string> = {
  Draft: "Draft", Submitted: "Submitted", PendingApproval: "Pending Approval", Approved: "Approved",
  Rejected: "Rejected", PartiallyFulfilled: "Partially Fulfilled", Fulfilled: "Fulfilled", Cancelled: "Cancelled",
}

/** Statuses an approver can decide on. */
const DECIDABLE: ReadonlySet<AssetRequestStatus> = new Set(["Submitted", "PendingApproval"])
/** Statuses that can still be fulfilled. */
const FULFILLABLE: ReadonlySet<AssetRequestStatus> = new Set(["Approved", "PartiallyFulfilled"])

type Toast = { title: string; message: string; type?: "success" | "error" }

function PendingApprovalsQueue() {
  const [requests, setRequests] = useState<AssetRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<{ request: AssetRequest; action: AssetRequestDecision } | null>(null)
  const [fulfilFor, setFulfilFor] = useState<AssetRequest | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  function showToast(title: string, message: string, type: "success" | "error" = "success") {
    setToast({ title, message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/asset-requests")
      const json = await res.json()
      setRequests(json?.data ?? [])
    } catch {
      setRequests([])
      showToast("Error", "Failed to load requests", "error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDecision(note: string) {
    if (!dialog) return
    const { request, action } = dialog
    try {
      const res = await fetch(`/api/asset-requests/${request.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        showToast("Error", j.error ?? "Action failed", "error")
        return
      }
      setDialog(null)
      showToast(action === "approve" ? "Request approved" : "Request rejected", `${request.itemType} — ${request.requesterName ?? request.requesterUserId}`)
      await load()
    } catch {
      showToast("Error", "Action failed", "error")
    }
  }

  async function handleFulfil(payload: FulfilPayload) {
    if (!fulfilFor) return
    try {
      const res = await fetch(`/api/asset-requests/${fulfilFor.id}/fulfil`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        showToast("Error", j.error ?? "Fulfilment failed", "error")
        return
      }
      setFulfilFor(null)
      showToast("Request fulfilled", fulfilFor.itemType)
      await load()
    } catch {
      showToast("Error", "Fulfilment failed", "error")
    }
  }

  const pendingCount = requests.filter((r) => DECIDABLE.has(r.status)).length

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
          <Inbox className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-gray-800">Pending Approvals</h1>
          <p className="text-xs text-gray-400">{pendingCount} awaiting decision · {requests.length} total</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-accent-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-semibold">Requester</th>
                <th className="px-4 py-3 text-left font-semibold">Item</th>
                <th className="px-4 py-3 text-left font-semibold">Qty</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Priority</th>
                <th className="px-4 py-3 text-left font-semibold">Required By</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-gray-400">
                  <div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                </td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-14 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2"><Inbox className="h-8 w-8 text-gray-200" /> No requests in the queue</div>
                </td></tr>
              ) : requests.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{r.requesterName ?? r.requesterUserId}</p>
                    <p className="text-[10px] text-gray-400">{r.requesterEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {r.itemKind === "Subscription"
                        ? <Cloud className="h-3.5 w-3.5 text-indigo-400" />
                        : <Package className="h-3.5 w-3.5 text-gray-400" />}
                      <span className="font-medium text-gray-800">{r.itemType}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{r.itemKind}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.quantityFulfilled}/{r.quantity}</td>
                  <td className="px-4 py-3 text-gray-600">{r.requestType}</td>
                  <td className="px-4 py-3 text-gray-600">{r.priority}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.requiredBy ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", STATUS_STYLES[r.status])}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {DECIDABLE.has(r.status) ? (
                        <>
                          <button
                            onClick={() => setDialog({ request: r, action: "approve" })}
                            className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1.5 text-[10px] font-semibold text-green-700 hover:bg-green-100 transition-colors"
                          >
                            <Check className="h-3 w-3" /> Approve
                          </button>
                          <button
                            onClick={() => setDialog({ request: r, action: "reject" })}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1.5 text-[10px] font-semibold text-red-600 hover:bg-red-100 transition-colors"
                          >
                            <X className="h-3 w-3" /> Reject
                          </button>
                        </>
                      ) : FULFILLABLE.has(r.status) ? (
                        <button
                          onClick={() => setFulfilFor(r)}
                          className="inline-flex items-center gap-1 rounded-lg bg-accent-50 px-2 py-1.5 text-[10px] font-semibold text-accent-700 hover:bg-accent-100 transition-colors"
                        >
                          <PackageCheck className="h-3 w-3" /> Fulfil
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog && (
        <ApproveRejectDialog
          request={dialog.request}
          action={dialog.action}
          onClose={() => setDialog(null)}
          onConfirm={handleDecision}
        />
      )}

      {fulfilFor && (
        <FulfilDialog request={fulfilFor} onClose={() => setFulfilFor(null)} onConfirm={handleFulfil} />
      )}

      {toast && (
        <div className={cn(
          "fixed bottom-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg border max-w-xs",
          toast.type === "error" ? "bg-red-50 border-red-200" : "bg-white border-gray-200",
        )}>
          <p className={cn("text-xs font-semibold", toast.type === "error" ? "text-red-700" : "text-gray-800")}>{toast.title}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{toast.message}</p>
        </div>
      )}
    </div>
  )
}

export default function AssetRequestsPage() {
  // The queue is the approver's view of every request → AssetRequest:viewAll.
  return (
    <RequirePerm resource="AssetRequest" action="viewAll">
      <PendingApprovalsQueue />
    </RequirePerm>
  )
}
