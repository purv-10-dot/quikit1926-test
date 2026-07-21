"use client"

/**
 * "My Repair Requests" — the employee side of the Repair Request feature. Lists
 * only the caller's own requests (via `/api/repair-requests?mine=1`, which
 * force-scopes even for a viewAll holder). Raising a new request happens from the
 * "Request Repair" button on a My Assets card, so this page is tracking-only.
 * Gated on `RepairRequest:view`.
 */

import { Fragment, useState, useEffect, useCallback } from "react"
import { Loader2, Wrench, Info, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { RequirePerm } from "@/components/require-perm"
import StatusStepper from "@/components/repair-requests/StatusStepper"
import type { RepairRequest, RepairRequestUrgency } from "@/types/repairRequest"

const URGENCY_STYLES: Record<RepairRequestUrgency, string> = {
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

function MyRepairRequests() {
  const [requests, setRequests] = useState<RepairRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  function showToast(title: string, message: string, type: "success" | "error" = "success") {
    setToast({ title, message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/repair-requests?mine=1")
      const json = await res.json()
      setRequests(json?.data ?? [])
    } catch {
      setRequests([])
      showToast("Error", "Failed to load your repair requests", "error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pending = requests.filter((r) => r.status === "Submitted").length

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
          <Wrench className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-gray-800">My Repair Requests</h1>
          <p className="text-xs text-gray-400">{pending} awaiting decision · {requests.length} total</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-accent-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-semibold">Asset</th>
                <th className="px-4 py-3 text-left font-semibold">Issue</th>
                <th className="px-4 py-3 text-left font-semibold">Urgency</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Requested</th>
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
                    <Wrench className="h-8 w-8 text-gray-200" />
                    No repair requests yet — open “My Assets” and use “Request Repair” on a faulty asset
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
                        <p className="font-medium text-gray-800">{r.assetName ?? r.assetId}</p>
                        <p className="font-mono text-[10px] text-gray-400">{r.assetCode ?? ""}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700">{r.issueTitle}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", URGENCY_STYLES[r.urgency])}>
                          {r.urgency}
                        </span>
                      </td>
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

export default function MyRepairRequestsPage() {
  return (
    <RequirePerm resource="RepairRequest" action="view">
      <MyRepairRequests />
    </RequirePerm>
  )
}
