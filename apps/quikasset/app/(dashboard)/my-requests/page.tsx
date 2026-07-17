"use client"

/**
 * "My Requests" — the employee side of Asset Request. Lists only the caller's
 * own requests (via `/api/asset-requests?mine=1`, which force-scopes even for a
 * viewAll holder) and lets them raise a new one. Gated on `AssetRequest:view`.
 */

import { Fragment, useState, useEffect, useCallback } from "react"
import { Loader2, ClipboardList, Plus, Info, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { RequirePerm } from "@/components/require-perm"
import NewRequestDialog, { type NewRequestPayload } from "@/components/asset-requests/NewRequestDialog"
import StatusStepper from "@/components/asset-requests/StatusStepper"
import type { AssetRequest, AssetRequestPriority } from "@/types/assetRequest"

const PRIORITY_STYLES: Record<AssetRequestPriority, string> = {
  Urgent: "bg-red-50 text-red-700 border border-red-200",
  High:   "bg-orange-50 text-orange-700 border border-orange-200",
  Medium: "bg-blue-50 text-blue-700 border border-blue-200",
  Low:    "bg-gray-100 text-gray-500 border border-gray-200",
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
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
                <th className="px-4 py-3 text-left font-semibold">Category</th>
                <th className="px-4 py-3 text-left font-semibold">Priority</th>
                <th className="px-4 py-3 text-left font-semibold">Required By</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Request Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-16 text-center text-gray-400">
                  <div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                </td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-14 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <ClipboardList className="h-8 w-8 text-gray-200" />
                    No requests yet — click “Raise a Request” to get started
                  </div>
                </td></tr>
              ) : requests.map((r) => {
                const note = r.decisionNote?.trim()
                const canExpand = Boolean(note)
                const isOpen = expandedId === r.id
                const rejected = r.status === "Rejected"
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => canExpand && setExpandedId(isOpen ? null : r.id)}
                      className={cn(
                        "border-t border-gray-100 transition-colors align-top",
                        canExpand ? "cursor-pointer hover:bg-gray-50" : "hover:bg-gray-50/60",
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{r.itemType}</p>
                        <p className="text-[10px] text-gray-400">{r.baseCategoryName ?? ""}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", PRIORITY_STYLES[r.priority])}>
                          {r.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{fmtDate(r.requiredBy)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusStepper status={r.status} />
                          {canExpand && (isOpen
                            ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                            : <Info className={cn("h-3.5 w-3.5", rejected ? "text-red-400" : "text-gray-400")} />)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmtDate(r.createdAt)}</td>
                    </tr>
                    {isOpen && note && (
                      <tr className={cn(rejected ? "bg-red-50/40" : "bg-gray-50/60")}>
                        <td colSpan={5} className="px-4 pb-3">
                          <div className={cn(
                            "flex items-start gap-2 rounded-lg border px-3 py-2",
                            rejected ? "border-red-100 bg-red-50" : "border-gray-200 bg-white",
                          )}>
                            <Info className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", rejected ? "text-red-500" : "text-gray-400")} />
                            <div>
                              <p className={cn("text-[10px] font-semibold uppercase tracking-wide", rejected ? "text-red-600" : "text-gray-500")}>
                                {rejected ? "Rejection reason" : "Reviewer note"}
                              </p>
                              <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap">{note}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
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
