"use client"

/**
 * Employee Requests — unified admin queue merging the AstAssetRequest and
 * AstRepairRequest approver queues into one table. Data comes from
 * `/api/employee-requests` (two typed arrays, per-type viewAll gated); the merge,
 * sort, filter, search, and action-routing are the pure helpers in
 * `@/lib/employeeRequests`. Approve/reject is identical for both types (routed to
 * each type's decision endpoint); the post-approval step is type-aware — Assign
 * (FulfilDialog) for asset requests, Send to Repair (SendToRepairDialog) for
 * repair requests. All dialogs are reused unchanged.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import { Loader2, Inbox, Check, X, PackageCheck, Wrench, Search, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMyPermissions } from "@/lib/hooks/useMyPermissions"

import AssetApproveRejectDialog from "@/components/asset-requests/ApproveRejectDialog"
import FulfilDialog, { type FulfilPayload } from "@/components/asset-requests/FulfilDialog"
import RepairApproveRejectDialog from "@/components/repair-requests/ApproveRejectDialog"
import SendToRepairDialog, { type SendToRepairPayload } from "@/components/repair-requests/SendToRepairDialog"

import {
  normalizeRows, matchesType, matchesSearch, rowActions, apiBase,
  requesterName, requesterCode, detailTitle, detailSubtitle, severity, statusOf,
  type EmployeeRequestRow, type RequestFilter, type Severity,
} from "@/lib/employeeRequests"
import type { AssetRequest } from "@/types/assetRequest"
import type { RepairRequest } from "@/types/repairRequest"

const SEVERITY_STYLES: Record<Severity, string> = {
  Urgent: "bg-red-50 text-red-700 border border-red-200",
  High:   "bg-orange-50 text-orange-700 border border-orange-200",
  Medium: "bg-blue-50 text-blue-700 border border-blue-200",
  Low:    "bg-gray-100 text-gray-500 border border-gray-200",
}

// Covers both status enums (asset + repair) in one map.
const STATUS_STYLES: Record<string, string> = {
  Draft:              "bg-gray-100 text-gray-500",
  Submitted:          "bg-blue-50 text-blue-700",
  PendingApproval:    "bg-blue-50 text-blue-700",
  Approved:           "bg-amber-50 text-amber-700",
  PartiallyFulfilled: "bg-amber-50 text-amber-700",
  Fulfilled:          "bg-green-50 text-green-700",
  Rejected:           "bg-red-50 text-red-700",
  Cancelled:          "bg-gray-100 text-gray-500",
}

const STATUS_LABELS: Record<string, string> = {
  PendingApproval: "Pending",
  PartiallyFulfilled: "Partial",
}

const TYPE_STYLES: Record<"asset" | "repair", string> = {
  asset:  "bg-indigo-50 text-indigo-700 border border-indigo-200",
  repair: "bg-orange-50 text-orange-700 border border-orange-200",
}

const FILTERS: { key: RequestFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "asset", label: "Asset" },
  { key: "repair", label: "Repair" },
]

type Toast = { title: string; message: string; type?: "success" | "error" }

type DialogState =
  | { type: "decide"; row: EmployeeRequestRow; action: "approve" | "reject" }
  | { type: "assign"; row: Extract<EmployeeRequestRow, { kind: "asset" }> }
  | { type: "send"; row: Extract<EmployeeRequestRow, { kind: "repair" }> }
  | null

function EmployeeRequestsQueue() {
  const [rows, setRows] = useState<EmployeeRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<RequestFilter>("all")
  const [search, setSearch] = useState("")
  const [dialog, setDialog] = useState<DialogState>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  function showToast(title: string, message: string, type: "success" | "error" = "success") {
    setToast({ title, message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const json = await fetch("/api/employee-requests").then((r) => r.json())
      const assetRequests: AssetRequest[] = json?.data?.assetRequests ?? []
      const repairRequests: RepairRequest[] = json?.data?.repairRequests ?? []
      setRows(normalizeRows(assetRequests, repairRequests))
    } catch {
      setRows([])
      showToast("Error", "Failed to load requests", "error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(
    () => rows.filter((r) => matchesType(r, filter) && matchesSearch(r, search)),
    [rows, filter, search],
  )

  const pendingCount = useMemo(
    () => rows.filter((r) => rowActions(r).includes("decide")).length,
    [rows],
  )

  async function handleDecision(note: string) {
    if (!dialog || dialog.type !== "decide") return
    const { row, action } = dialog
    try {
      const res = await fetch(`${apiBase(row)}/${row.id}/decision`, {
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
      showToast(action === "approve" ? "Request approved" : "Request rejected", detailTitle(row))
      await load()
    } catch {
      showToast("Error", "Action failed", "error")
    }
  }

  async function handleAssign(payload: FulfilPayload) {
    if (!dialog || dialog.type !== "assign") return
    const { row } = dialog
    try {
      const res = await fetch(`/api/asset-requests/${row.id}/fulfil`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        showToast("Error", j.error ?? "Couldn't assign asset", "error")
        return
      }
      setDialog(null)
      showToast("Asset assigned", row.raw.itemType)
      await load()
    } catch {
      showToast("Error", "Couldn't assign asset", "error")
    }
  }

  async function handleSend(payload: SendToRepairPayload) {
    if (!dialog || dialog.type !== "send") return
    const { row } = dialog
    try {
      const res = await fetch(`/api/repair-requests/${row.id}/fulfil`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: payload.vendorId,
          estimatedCost: payload.estimatedCost ? Number(payload.estimatedCost) : null,
          sentDate: payload.sentDate,
          expectedReturn: payload.expectedReturn || null,
          notes: payload.notes || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        showToast("Error", j.error ?? "Couldn't send to repair", "error")
        return
      }
      setDialog(null)
      showToast("Sent to repair", row.raw.issueTitle)
      await load()
    } catch {
      showToast("Error", "Couldn't send to repair", "error")
    }
  }

  function renderActions(row: EmployeeRequestRow) {
    const actions = rowActions(row)
    if (actions.length === 0) return <span className="text-[10px] text-gray-300">—</span>

    const approveReject = (
      <>
        <button
          onClick={() => setDialog({ type: "decide", row, action: "approve" })}
          className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1.5 text-[10px] font-semibold text-green-700 hover:bg-green-100 transition-colors"
        >
          <Check className="h-3 w-3" /> Approve
        </button>
        <button
          onClick={() => setDialog({ type: "decide", row, action: "reject" })}
          className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1.5 text-[10px] font-semibold text-red-600 hover:bg-red-100 transition-colors"
        >
          <X className="h-3 w-3" /> Reject
        </button>
      </>
    )

    return (
      <div className="flex items-center justify-end gap-1">
        {actions.includes("decide") && approveReject}
        {actions.includes("asset-assign") && row.kind === "asset" && (
          <button
            onClick={() => setDialog({ type: "assign", row })}
            className="inline-flex items-center gap-1 rounded-lg bg-accent-50 px-2 py-1.5 text-[10px] font-semibold text-accent-700 hover:bg-accent-100 transition-colors"
          >
            <PackageCheck className="h-3 w-3" /> Assign
          </button>
        )}
        {actions.includes("repair-send") && row.kind === "repair" && (
          <button
            onClick={() => setDialog({ type: "send", row })}
            className="inline-flex items-center gap-1 rounded-lg bg-accent-50 px-2 py-1.5 text-[10px] font-semibold text-accent-700 hover:bg-accent-100 transition-colors"
          >
            <Wrench className="h-3 w-3" /> Send to Repair
          </button>
        )}
        {actions.includes("reject-backout") && (
          <button
            onClick={() => setDialog({ type: "decide", row, action: "reject" })}
            className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1.5 text-[10px] font-semibold text-red-600 hover:bg-red-100 transition-colors"
          >
            <X className="h-3 w-3" /> Reject
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-800">Employee Requests</h1>
            <p className="text-xs text-gray-400">{pendingCount} awaiting decision · {rows.length} total</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Type filter */}
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
                  filter === f.key ? "bg-accent-100 text-accent-700" : "text-gray-500 hover:text-gray-700",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requester or item…"
              className="w-56 rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-accent-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-semibold">Requester</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Details</th>
                <th className="px-4 py-3 text-left font-semibold">Priority</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-16 text-center text-gray-400">
                  <div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                </td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-14 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="h-8 w-8 text-gray-200" />
                    {rows.length === 0 ? "No employee requests in the queue" : "No requests match your filters"}
                  </div>
                </td></tr>
              ) : visible.map((row) => (
                <tr key={`${row.kind}-${row.id}`} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{requesterName(row)}</p>
                    {requesterCode(row) && <p className="text-[10px] text-gray-400">{requesterCode(row)}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", TYPE_STYLES[row.kind])}>
                      {row.kind}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[240px]">
                    <p className="font-medium text-gray-800">{detailTitle(row)}</p>
                    <p className="text-[10px] text-gray-400 truncate">{detailSubtitle(row)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", SEVERITY_STYLES[severity(row)])}>
                      {severity(row)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLES[statusOf(row)] ?? "bg-gray-100 text-gray-500")}>
                      {STATUS_LABELS[statusOf(row)] ?? statusOf(row)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{renderActions(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approve / Reject — the per-type dialog (identical logic, type-appropriate summary) */}
      {dialog?.type === "decide" && dialog.row.kind === "asset" && (
        <AssetApproveRejectDialog
          request={dialog.row.raw}
          action={dialog.action}
          onClose={() => setDialog(null)}
          onConfirm={handleDecision}
        />
      )}
      {dialog?.type === "decide" && dialog.row.kind === "repair" && (
        <RepairApproveRejectDialog
          request={dialog.row.raw}
          action={dialog.action}
          onClose={() => setDialog(null)}
          onConfirm={handleDecision}
        />
      )}

      {/* Post-approval — type-aware fulfilment */}
      {dialog?.type === "assign" && (
        <FulfilDialog request={dialog.row.raw} onClose={() => setDialog(null)} onConfirm={handleAssign} />
      )}
      {dialog?.type === "send" && (
        <SendToRepairDialog request={dialog.row.raw} onClose={() => setDialog(null)} onConfirm={handleSend} />
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

/**
 * OR-gate: this page merges two separately-gated queues, so it's visible to
 * holders of EITHER `AssetRequest:viewAll` or `RepairRequest:viewAll` (admin
 * short-circuits). RequirePerm only checks a single pair, so we gate inline.
 */
export default function EmployeeRequestsPage() {
  const { loading, isAdmin, has } = useMyPermissions()
  const allowed = isAdmin || has("AssetRequest", "viewAll") || has("RepairRequest", "viewAll")

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-sm">Checking access…</span>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white px-8 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <ShieldAlert className="h-6 w-6 text-red-500" />
          </div>
          <h2 className="text-sm font-semibold text-gray-800">Access restricted</h2>
          <p className="text-xs leading-relaxed text-gray-500">
            You don&apos;t have permission to view this page. Contact an organisation
            administrator if you believe this is a mistake.
          </p>
        </div>
      </div>
    )
  }

  return <EmployeeRequestsQueue />
}
