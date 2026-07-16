"use client"

/**
 * "My Requests" — the employee side of Asset Request. Lists only the caller's
 * own requests (via `/api/asset-requests?mine=1`, which force-scopes even for a
 * viewAll holder) and lets them raise a new one. Gated on `AssetRequest:view`.
 */

import { useState, useEffect, useCallback } from "react"
import { Loader2, ClipboardList, Plus, Package, Cloud } from "lucide-react"
import { cn } from "@/lib/utils"
import { RequirePerm } from "@/components/require-perm"
import NewRequestDialog, { type NewRequestPayload } from "@/components/asset-requests/NewRequestDialog"
import { ASSET_REQUEST_KIND_LABELS } from "@/types/assetRequest"
import type { AssetRequest, AssetRequestStatus } from "@/types/assetRequest"

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
  Rejected: "Rejected", PartiallyFulfilled: "Partially Assigned", Fulfilled: "Assigned", Cancelled: "Cancelled",
}

type Toast = { title: string; message: string; type?: "success" | "error" }

function fmtDate(value?: string | null) {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : value
}

function MyRequests() {
  const [requests, setRequests] = useState<AssetRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  function showToast(title: string, message: string, type: "success" | "error" = "success") {
    setToast({ title, message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/asset-requests?mine=1")
      const json = await res.json()
      setRequests(json?.data ?? [])
    } catch {
      setRequests([])
      showToast("Error", "Failed to load your requests", "error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(payload: NewRequestPayload) {
    const res = await fetch("/api/asset-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      showToast("Error", j.error ?? "Failed to submit request", "error")
      return
    }
    setShowNew(false)
    showToast("Request submitted", "Your request has been sent for approval.")
    await load()
  }

  const pending = requests.filter((r) => r.status === "Submitted" || r.status === "PendingApproval").length

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-800">My Requests</h1>
            <p className="text-xs text-gray-400">{pending} awaiting decision · {requests.length} total</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-700"
        >
          <Plus className="h-3.5 w-3.5" /> Raise a Request
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-accent-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-semibold">Item</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Qty</th>
                <th className="px-4 py-3 text-left font-semibold">Priority</th>
                <th className="px-4 py-3 text-left font-semibold">Required By</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Raised</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                  <div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                </td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-14 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <ClipboardList className="h-8 w-8 text-gray-200" />
                    No requests yet — click “Raise a Request” to get started
                  </div>
                </td></tr>
              ) : requests.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {r.itemKind === "Subscription"
                        ? <Cloud className="h-3.5 w-3.5 text-indigo-400" />
                        : <Package className="h-3.5 w-3.5 text-gray-400" />}
                      <span className="font-medium text-gray-800">{r.itemType}</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-gray-400">{ASSET_REQUEST_KIND_LABELS[r.itemKind]}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.requestType}</td>
                  <td className="px-4 py-3 text-gray-700">{r.quantityFulfilled}/{r.quantity}</td>
                  <td className="px-4 py-3 text-gray-600">{r.priority}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">{fmtDate(r.requiredBy)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", STATUS_STYLES[r.status])}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <NewRequestDialog onClose={() => setShowNew(false)} onSubmit={handleCreate} />}

      {toast && (
        <div className={cn(
          "fixed bottom-5 right-5 z-[60] max-w-xs rounded-xl border px-4 py-3 shadow-lg",
          toast.type === "error" ? "bg-red-50 border-red-200" : "bg-white border-gray-200",
        )}>
          <p className={cn("text-xs font-semibold", toast.type === "error" ? "text-red-700" : "text-gray-800")}>{toast.title}</p>
          <p className="mt-0.5 text-[11px] text-gray-500">{toast.message}</p>
        </div>
      )}
    </div>
  )
}

export default function MyRequestsPage() {
  return (
    <RequirePerm resource="AssetRequest" action="view">
      <MyRequests />
    </RequirePerm>
  )
}
