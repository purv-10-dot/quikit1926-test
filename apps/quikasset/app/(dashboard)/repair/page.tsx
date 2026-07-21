"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Search, Pencil, Trash2, Loader2, Wrench, CheckCircle2, RotateCcw, XCircle, ArrowLeftRight, StopCircle, SlidersHorizontal, ChevronUp, X } from "lucide-react"
import { cn } from "@/lib/utils"
import SendToRepairModal from "@/components/repairs/SendToRepairModal"
import UpdateRepairModal from "@/components/repairs/UpdateRepairModal"
import AssignReplacementModal from "@/components/repairs/AssignReplacementModal"
import RecoveryOptionsModal, { type RecoveryAction } from "@/components/repairs/RecoveryOptionsModal"
import type { Repair, RepairStatus } from "@/types/repair"
import type { Replacement } from "@/types/replacement"
import Pagination from "@/components/ui/Pagination"

type Toast = { title: string; message: string; type?: "success" | "error" }

function useToast() {
  const [toast, setToast] = useState<Toast | null>(null)
  const show = useCallback((title: string, message: string, type: "success" | "error" = "success") => {
    setToast({ title, message, type })
    setTimeout(() => setToast(null), 3500)
  }, [])
  return { toast, show }
}

const STATUS_STYLES: Record<RepairStatus, string> = {
  Pending:      "bg-yellow-50 text-yellow-700 border border-yellow-200",
  InRepair:     "bg-orange-50 text-orange-700 border border-orange-200",
  Repaired:     "bg-blue-50 text-blue-700 border border-blue-200",
  Recovered:    "bg-green-50 text-green-700 border border-green-200",
  Unrepairable: "bg-red-50 text-red-600 border border-red-200",
}

const STATUS_LABELS: Record<RepairStatus, string> = {
  Pending:      "Pending",
  InRepair:     "In Repair",
  Repaired:     "Repaired",
  Recovered:    "Recovered",
  Unrepairable: "Unrepairable",
}

type ConfirmAction = {
  type: "markInRepair" | "markRepaired" | "markRecovered" | "markUnrepairable" | "delete" | "endReplacement"
  repair?: Repair
  replacement?: Replacement
}

// Map repairId → active replacement
type ReplacementMap = Record<string, Replacement | undefined>

export default function RepairPage() {
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [replacements, setReplacements] = useState<ReplacementMap>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ asset: "", vendor: "", status: "" })
  const [statusFilter] = useState<RepairStatus | "">("")
  const [showAdd, setShowAdd] = useState(false)
  const [editRepair, setEditRepair] = useState<Repair | null>(null)
  const [replacementRepair, setReplacementRepair] = useState<Repair | null>(null)
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null)
  const [recoveryModal, setRecoveryModal] = useState<{ repair: Repair; replacement: Replacement } | null>(null)
  const { toast, show: showToast } = useToast()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  async function load() {
    setLoading(true)
    try {
      const repairsJson = await fetch("/api/repairs").then((r) => r.json())
      const data: Repair[] = repairsJson.data ?? []
      setRepairs(data)
      // Load active replacements for all repairs
      const allReplJson = await fetch("/api/replacements").then((r) => r.json())
      const allRepl: Replacement[] = allReplJson.data ?? []
      const map: ReplacementMap = {}
      for (const r of allRepl) {
        if (r.isActive) map[r.repairId] = r
      }
      setReplacements(map)
    } catch {
      showToast("Error", "Failed to load", "error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Display/filter label: linked vendor name, falling back to legacy free text.
  const vendorLabel = (r: Repair) => r.vendorRef?.name ?? r.vendor ?? ""
  const vendors = [...new Set(repairs.map(vendorLabel).filter(Boolean))].sort() as string[]

  const filtered = repairs.filter((r) => {
    if (search) {
      const q = search.toLowerCase()
      const matchSearch = [r.asset?.itemName, r.asset?.itemCode, r.issueTitle, vendorLabel(r), r.asset?.category?.name].some((v) => v?.toLowerCase().includes(q))
      if (!matchSearch) return false
    }
    if (statusFilter && r.status !== statusFilter) return false
    if (filters.asset && !r.asset?.itemName?.toLowerCase().includes(filters.asset.toLowerCase()) && !r.asset?.itemCode?.toLowerCase().includes(filters.asset.toLowerCase())) return false
    if (filters.vendor && vendorLabel(r) !== filters.vendor) return false
    if (filters.status && r.status !== filters.status) return false
    return true
  })

  useEffect(() => { setPage(1) }, [search, statusFilter, filters])
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  function clearFilters() { setFilters({ asset: "", vendor: "", status: "" }) }

  async function handleCreate(form: {
    assetId: string; issueTitle: string; issueDescription: string
    vendorId: string; estimatedCost: string; sentDate: string; expectedReturn: string; notes: string
  }) {
    try {
      const res = await fetch("/api/repairs", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const created: Repair = json.data
      setRepairs((p) => [created, ...p])
      setShowAdd(false)
      showToast("Sent to Repair", `${created.asset?.itemName} logged for repair`)
    } catch {
      showToast("Error", "Failed to log repair", "error")
    }
  }

  async function handleUpdate(form: {
    issueTitle: string; issueDescription: string; sentDate: string
    vendorId: string; estimatedCost: string; actualCost: string
    expectedReturn: string; returnedDate: string; notes: string
  }) {
    if (!editRepair) return
    try {
      const res = await fetch(`/api/repairs/${editRepair.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const updated: Repair = json.data
      setRepairs((p) => p.map((r) => (r.id === updated.id ? updated : r)))
      setEditRepair(null)
      showToast("Updated", "Repair record updated")
    } catch {
      showToast("Error", "Failed to update", "error")
    }
  }

  async function handleAssignReplacement(form: {
    assetId: string; userId: string; type: "Temporary" | "Permanent"
    startDate: string; endDate: string; notes: string
  }) {
    if (!replacementRepair) return
    try {
      const res = await fetch("/api/replacements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, repairId: replacementRepair.id }),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const created: Replacement = json.data
      setReplacements((p) => ({ ...p, [replacementRepair.id]: created }))
      setReplacementRepair(null)
      showToast("Replacement Assigned", `${created.asset?.itemName} assigned as ${created.type.toLowerCase()} replacement`)
    } catch {
      showToast("Error", "Failed to assign replacement", "error")
    }
  }

  async function handleAction() {
    if (!confirm) return

    // End replacement
    if (confirm.type === "endReplacement" && confirm.replacement) {
      try {
        const res = await fetch(`/api/replacements/${confirm.replacement.id}`, { method: "PATCH" })
        if (!res.ok) throw new Error()
        setReplacements((p) => {
          const next = { ...p }
          delete next[confirm.replacement!.repairId]
          return next
        })
        setConfirm(null)
        showToast("Replacement Ended", `${confirm.replacement.asset?.itemName} is now available again`)
      } catch {
        showToast("Error", "Failed to end replacement", "error")
      }
      return
    }

    if (!confirm.repair) return
    const { type, repair } = confirm

    if (type === "delete") {
      try {
        await fetch(`/api/repairs/${repair.id}`, { method: "DELETE" })
        setRepairs((p) => p.filter((r) => r.id !== repair.id))
        setReplacements((p) => { const n = { ...p }; delete n[repair.id]; return n })
        showToast("Deleted", "Repair record removed")
      } catch {
        showToast("Error", "Failed to delete", "error")
      }
      setConfirm(null)
      return
    }

    try {
      const res = await fetch(`/api/repairs/${repair.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: type }),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const updated: Repair = json.data
      setRepairs((p) => p.map((r) => (r.id === updated.id ? updated : r)))

      // Auto-end temp replacement for markRepaired and markUnrepairable
      // (markRecovered with a temp replacement is handled by RecoveryOptionsModal instead)
      if (type === "markRepaired" || type === "markUnrepairable") {
        const repl = replacements[repair.id]
        if (repl?.isActive && repl.type === "Temporary") {
          await fetch(`/api/replacements/${repl.id}`, { method: "PATCH" })
          setReplacements((p) => { const n = { ...p }; delete n[repair.id]; return n })
        }
      }

      setConfirm(null)
      const msgs: Record<string, string> = {
        markInRepair:     "Asset sent to vendor",
        markRepaired:     "Asset repaired and now Available for assignment",
        markRecovered:    "Asset recovered and marked Available",
        markUnrepairable: "Asset marked unrepairable and retired",
      }
      showToast("Status Updated", msgs[type] ?? "Done")
    } catch {
      showToast("Error", "Action failed", "error")
    }
  }

  async function handleRecovery(action: RecoveryAction) {
    if (!recoveryModal) return
    const { repair, replacement } = recoveryModal
    try {
      const res = await fetch(`/api/repairs/${repair.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markRecovered", replacementId: replacement.id, replacementAction: action }),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const updated: Repair = json.data
      setRepairs((p) => p.map((r) => (r.id === updated.id ? updated : r)))
      setReplacements((p) => { const n = { ...p }; delete n[repair.id]; return n })
      setRecoveryModal(null)
      const msgs: Record<RecoveryAction, string> = {
        makePermanent:    `${replacement.user?.name} permanently keeps ${replacement.asset?.itemName}`,
        returnAndReassign: `Recovered asset reassigned to ${replacement.user?.name}`,
        justRelease:      "Both assets are now available",
      }
      showToast("Recovery Complete", msgs[action])
    } catch {
      showToast("Error", "Recovery action failed", "error")
    }
  }

  function fmt(d?: string | null) {
    if (!d) return "—"
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  const counts = {
    total:        repairs.length,
    inRepair:     repairs.filter((r) => r.status === "InRepair").length,
    repaired:     repairs.filter((r) => r.status === "Repaired").length,
    recovered:    repairs.filter((r) => r.status === "Recovered").length,
    unrepairable: repairs.filter((r) => r.status === "Unrepairable").length,
  }

  const CONFIRM_CONFIG: Record<string, { label: string; desc: string; btn: string; color: string; iconBg: string; icon: React.ReactNode }> = {
    markInRepair:     { label: "Mark as In Repair?", desc: "Asset status will be set to In Repair.", btn: "Confirm", color: "bg-orange-600 hover:bg-orange-700", iconBg: "bg-orange-100", icon: <Wrench className="w-4 h-4 text-orange-600" /> },
    markRepaired:     { label: "Mark as Repaired?", desc: "Asset will be set back to Available immediately. Any temporary replacement will be released automatically.", btn: "Confirm", color: "bg-blue-600 hover:bg-blue-700", iconBg: "bg-blue-100", icon: <CheckCircle2 className="w-4 h-4 text-blue-600" /> },
    markRecovered:    { label: "Mark as Recovered?", desc: "Confirms the asset has been physically received back. Asset remains Available.", btn: "Confirm Recovery", color: "bg-green-600 hover:bg-green-700", iconBg: "bg-green-100", icon: <RotateCcw className="w-4 h-4 text-green-600" /> },
    markUnrepairable: { label: "Mark as Unrepairable?", desc: "Asset will be retired. Any temporary replacement will be released automatically.", btn: "Confirm", color: "bg-red-600 hover:bg-red-700", iconBg: "bg-red-100", icon: <XCircle className="w-4 h-4 text-red-500" /> },
    delete:           { label: "Delete Record?", desc: "This repair record will be permanently removed.", btn: "Delete", color: "bg-red-600 hover:bg-red-700", iconBg: "bg-red-100", icon: <Trash2 className="w-4 h-4 text-red-500" /> },
    endReplacement:   { label: "End Replacement?", desc: "The replacement asset will be released back to the available pool.", btn: "End Replacement", color: "bg-gray-700 hover:bg-gray-800", iconBg: "bg-gray-100", icon: <StopCircle className="w-4 h-4 text-gray-500" /> },
  }

  return (
    <>
      <div className="p-4 sm:p-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: "Total", value: counts.total, color: "bg-blue-50 text-blue-700" },
            { label: "In Repair", value: counts.inRepair, color: "bg-orange-50 text-orange-700" },
            { label: "Repaired", value: counts.repaired, color: "bg-blue-50 text-blue-700" },
            { label: "Recovered", value: counts.recovered, color: "bg-green-50 text-green-700" },
            { label: "Unrepairable", value: counts.unrepairable, color: "bg-red-50 text-red-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-4 flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              <span className={cn("text-lg font-bold px-3 py-0.5 rounded-lg", s.color)}>{s.value}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Repair Records</h2>
              <p className="text-xs text-gray-400 mt-0.5">{filtered.length} of {repairs.length} records</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
                  <X className="w-3 h-3" /> {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
                </button>
              )}
              <button onClick={() => setShowFilters((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition-colors",
                  showFilters ? "border-accent-200 bg-accent-50 text-accent-600 hover:bg-accent-100" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}>
                {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
                Filters
              </button>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search repairs…"
                  className="pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:bg-white w-48" />
              </div>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Send to Repair
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3 text-center w-10 font-semibold">S.No</th>
                  <th className="text-left px-4 py-3 font-semibold">Asset</th>
                  <th className="text-left px-4 py-3 font-semibold">Category</th>
                  <th className="text-left px-4 py-3 font-semibold">Issue</th>
                  <th className="text-left px-4 py-3 font-semibold">Vendor</th>
                  <th className="text-left px-4 py-3 font-semibold">Sent Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Est. / Actual</th>
                  <th className="text-left px-4 py-3 font-semibold">Replacement</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Actions</th>
                </tr>
                {showFilters && (
                  <tr className="border-b border-accent-100 bg-accent-50/30">
                    <td colSpan={10} className="px-4 py-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Asset / Code</label>
                          <input value={filters.asset} onChange={(e) => setFilters((f) => ({ ...f, asset: e.target.value }))} placeholder="Filter asset…" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Vendor</label>
                          <select value={filters.vendor} onChange={(e) => setFilters((f) => ({ ...f, vendor: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                            <option value="">All Vendors</option>
                            {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</label>
                          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                            <option value="">All Statuses</option>
                            <option value="Pending">Pending</option>
                            <option value="InRepair">In Repair</option>
                            <option value="Repaired">Repaired</option>
                            <option value="Recovered">Recovered</option>
                            <option value="Unrepairable">Unrepairable</option>
                          </select>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="px-4 py-16 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-14 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Wrench className="w-8 h-8 text-gray-200" />
                      {search || statusFilter ? "No records match your filters" : "No repair records yet — click Send to Repair to get started"}
                    </div>
                  </td></tr>
                ) : paginated.map((r, idx) => {
                  const repl = replacements[r.id]
                  const canReplace = (r.status === "InRepair" || r.status === "Repaired") && !repl
                  return (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors align-top">
                      <td className="px-4 py-3 text-center text-gray-400 font-medium">{(page - 1) * pageSize + idx + 1}</td>

                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{r.asset?.itemName ?? "—"}</p>
                        <p className="text-gray-400 text-[10px] mt-0.5">{r.asset?.itemCode}</p>
                      </td>

                      <td className="px-4 py-3">
                        <p className="text-gray-700">{r.asset?.category?.name ?? "—"}</p>
                        <p className="text-gray-400 text-[10px] mt-0.5">{r.asset?.baseCategory?.name}</p>
                      </td>

                      <td className="px-4 py-3 max-w-[150px]">
                        <p className="font-medium text-gray-800 truncate">{r.issueTitle}</p>
                        <p className="text-gray-400 text-[10px] mt-0.5 truncate">{r.issueDescription}</p>
                      </td>

                      <td className="px-4 py-3 text-gray-600">{vendorLabel(r) || "—"}</td>

                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        <p>{fmt(r.sentDate)}</p>
                        {r.sentByName && (
                          <p className="text-gray-400 text-[10px] mt-0.5">by {r.sentByName}</p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <p className="text-gray-700">{r.estimatedCost != null ? `₹${r.estimatedCost.toLocaleString()}` : "—"}</p>
                        {r.actualCost != null && <p className="text-[10px] text-gray-400 mt-0.5">Actual: ₹{r.actualCost.toLocaleString()}</p>}
                      </td>

                      {/* Replacement column */}
                      <td className="px-4 py-3 min-w-[160px]">
                        {repl ? (
                          <div className={cn(
                            "rounded-lg p-2 border text-[10px] space-y-1",
                            repl.type === "Temporary"
                              ? "bg-yellow-50 border-yellow-100"
                              : "bg-blue-50 border-blue-100"
                          )}>
                            <div className="flex items-center justify-between gap-1">
                              <span className={cn(
                                "font-semibold px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide",
                                repl.type === "Temporary" ? "bg-yellow-200 text-yellow-800" : "bg-blue-200 text-blue-800"
                              )}>
                                {repl.type}
                              </span>
                              {repl.type === "Temporary" && (
                                <button
                                  onClick={() => setConfirm({ type: "endReplacement", replacement: repl })}
                                  title="End Replacement"
                                  className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  <StopCircle className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <p className="font-semibold text-gray-800 truncate">{repl.asset?.itemName}</p>
                            <p className="text-gray-500 truncate">{repl.user?.name}</p>
                            {repl.endDate && (
                              <p className="text-gray-400">Until {fmt(repl.endDate)}</p>
                            )}
                          </div>
                        ) : canReplace ? (
                          <button
                            onClick={() => setReplacementRepair(r)}
                            className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium text-accent-600 bg-accent-50 border border-accent-200 rounded-lg hover:bg-accent-100 transition-colors whitespace-nowrap"
                          >
                            <ArrowLeftRight className="w-3 h-3" /> Assign Replacement
                          </button>
                        ) : (
                          <span className="text-gray-300 text-[10px]">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap", STATUS_STYLES[r.status])}>
                          {STATUS_LABELS[r.status]}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {(r.status === "InRepair" || r.status === "Repaired") && (
                            <button
                              onClick={() => {
                                const repl = replacements[r.id]
                                if (repl?.isActive && repl.type === "Temporary") {
                                  setRecoveryModal({ repair: r, replacement: repl })
                                } else {
                                  setConfirm({ type: "markRecovered", repair: r })
                                }
                              }}
                              title="Mark as Recovered"
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(r.status === "InRepair" || r.status === "Repaired") && (
                            <button onClick={() => setConfirm({ type: "markUnrepairable", repair: r })} title="Mark as Unrepairable"
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => setEditRepair(r)} title="Edit Record"
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setConfirm({ type: "delete", repair: r })} title="Delete Record"
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} className="px-4" />
        </div>
      </div>

      {showAdd && <SendToRepairModal onClose={() => setShowAdd(false)} onSave={handleCreate} />}
      {editRepair && <UpdateRepairModal repair={editRepair} onClose={() => setEditRepair(null)} onSave={handleUpdate} />}
      {recoveryModal && (
        <RecoveryOptionsModal
          repair={recoveryModal.repair}
          replacement={recoveryModal.replacement}
          onClose={() => setRecoveryModal(null)}
          onConfirm={handleRecovery}
        />
      )}
      {replacementRepair && (
        <AssignReplacementModal
          repair={replacementRepair}
          onClose={() => setReplacementRepair(null)}
          onSave={handleAssignReplacement}
        />
      )}

      {/* Confirm Dialog */}
      {confirm && (() => {
        const cfg = CONFIRM_CONFIG[confirm.type]
        const name = confirm.replacement?.asset?.itemName ?? confirm.repair?.asset?.itemName ?? ""
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={cn("w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0", cfg.iconBg)}>
                  {cfg.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{cfg.label}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="font-medium">{name}</span> — {cfg.desc}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirm(null)}
                  className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={handleAction}
                  className={cn("px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors", cfg.color)}>
                  {cfg.btn}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed bottom-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg border max-w-xs",
          toast.type === "error" ? "bg-red-50 border-red-200" : "bg-white border-gray-200"
        )}>
          <p className={cn("text-xs font-semibold", toast.type === "error" ? "text-red-700" : "text-gray-800")}>{toast.title}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{toast.message}</p>
        </div>
      )}
    </>
  )
}
