"use client"

import { useState, useEffect, useCallback } from "react"
import { useRevalidateOnFocus } from "@/lib/hooks/useRevalidateOnFocus"
import { Search, Download, RefreshCw, Loader2, ClipboardList } from "lucide-react"
import { cn } from "@/lib/utils"
import * as XLSX from "xlsx"
import Pagination from "@/components/ui/Pagination"

type AuditLog = {
  id: string
  module: string
  action: string
  entityId: string
  entityName: string
  details?: string | null
  createdAt: string
}

const TABS = ["All", "Assets", "Assignments", "Repairs", "Replacements", "Users"] as const
type Tab = typeof TABS[number]

const MODULE_STYLES: Record<string, string> = {
  Assets:       "bg-blue-100 text-blue-700",
  Assignments:  "bg-purple-100 text-purple-700",
  Repairs:      "bg-orange-100 text-orange-700",
  Replacements: "bg-yellow-100 text-yellow-700",
  Users:        "bg-green-100 text-green-700",
}

const ACTION_STYLES: Record<string, string> = {
  "Asset Created":        "bg-green-50 text-green-700 border-green-200",
  "Asset Updated":        "bg-blue-50 text-blue-700 border-blue-200",
  "Asset Deleted":        "bg-red-50 text-red-600 border-red-200",
  "Asset Assigned":       "bg-purple-50 text-purple-700 border-purple-200",
  "Asset Returned":       "bg-gray-50 text-gray-600 border-gray-200",
  "Sent to Repair":       "bg-orange-50 text-orange-700 border-orange-200",
  "Marked Recovered":     "bg-green-50 text-green-700 border-green-200",
  "Marked Unrepairable":  "bg-red-50 text-red-600 border-red-200",
  "Replacement Assigned": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Replacement Ended":    "bg-gray-50 text-gray-600 border-gray-200",
  "User Created":         "bg-green-50 text-green-700 border-green-200",
  "User Updated":         "bg-blue-50 text-blue-700 border-blue-200",
  "User Deleted":         "bg-red-50 text-red-600 border-red-200",
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
}

export default function AuditLogPage() {
  const [tab, setTab]       = useState<Tab>("All")
  const [logs, setLogs]     = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [from, setFrom]     = useState("")
  const [to, setTo]         = useState("")
  const [page, setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tab !== "All") params.set("module", tab)
      if (search)        params.set("search", search)
      if (from)          params.set("from", from)
      if (to)            params.set("to", to)
      const j = await fetch(`/api/audit-logs?${params}`).then((r) => r.json())
      const data: AuditLog[] = j.data ?? []
      setLogs(data)
      setPage(1)
    } finally {
      setLoading(false)
    }
  }, [tab, search, from, to])

  useEffect(() => { load() }, [load])
  useRevalidateOnFocus(load)

  function downloadExcel() {
    const rows = logs.map((l) => ({
      "Date & Time": fmt(l.createdAt),
      "Module":      l.module,
      "Action":      l.action,
      "Entity":      l.entityName,
      "Details":     l.details ?? "",
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Audit Log")
    XLSX.writeFile(wb, `audit-log-${tab.toLowerCase()}-${new Date().toISOString().split("T")[0]}.xlsx`)
  }

  const paginated = logs.slice((page - 1) * pageSize, page * pageSize)
  const counts: Record<Tab, number> = {
    All:          logs.length,
    Assets:       logs.filter((l) => l.module === "Assets").length,
    Assignments:  logs.filter((l) => l.module === "Assignments").length,
    Repairs:      logs.filter((l) => l.module === "Repairs").length,
    Replacements: logs.filter((l) => l.module === "Replacements").length,
    Users:        logs.filter((l) => l.module === "Users").length,
  }

  return (
    <>
      <div className="p-4 sm:p-6 space-y-4">

        {/* Header actions */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actions, entities…"
                className="pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent-400 w-56"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 font-medium">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 font-medium">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400" />
            </div>
            {(search || from || to) && (
              <button onClick={() => { setSearch(""); setFrom(""); setTo("") }}
                className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={downloadExcel}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              <Download className="w-3.5 h-3.5" /> Export Excel
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex items-center gap-2 px-5 py-3.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2",
                  tab === t
                    ? "border-accent-500 text-accent-600 bg-accent-50/50"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                )}
              >
                {t}
                {tab === "All" || t === tab ? (
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold",
                    tab === t ? "bg-accent-100 text-accent-700" : "bg-gray-100 text-gray-500"
                  )}>
                    {counts[t]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-semibold w-48">Date & Time</th>
                  {tab === "All" && <th className="text-left px-4 py-3 font-semibold w-32">Module</th>}
                  <th className="text-left px-4 py-3 font-semibold w-44">Action</th>
                  <th className="text-left px-4 py-3 font-semibold">Entity</th>
                  <th className="text-left px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={tab === "All" ? 5 : 4} className="px-5 py-16 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                  </td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={tab === "All" ? 5 : 4} className="px-5 py-14 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <ClipboardList className="w-8 h-8 text-gray-200" />
                      No audit records found
                    </div>
                  </td></tr>
                ) : paginated.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap font-mono text-[10px]">{fmt(l.createdAt)}</td>
                    {tab === "All" && (
                      <td className="px-4 py-3">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", MODULE_STYLES[l.module] ?? "bg-gray-100 text-gray-600")}>
                          {l.module}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded border text-[10px] font-medium", ACTION_STYLES[l.action] ?? "bg-gray-50 text-gray-600 border-gray-200")}>
                        {l.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-[220px] truncate">{l.entityName}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[260px] truncate">{l.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination total={logs.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} className="px-4" />
        </div>

      </div>
    </>
  )
}
