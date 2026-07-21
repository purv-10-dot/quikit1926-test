"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Search, Undo2, Trash2, Loader2, ArrowLeftRight, Pencil, SlidersHorizontal, ChevronUp, X, Layers } from "lucide-react"
import Pagination from "@/components/ui/Pagination"
import { cn } from "@/lib/utils"
import AssignAssetModal from "@/components/assignments/AssignAssetModal"
import BulkAssignModal from "@/components/assignments/BulkAssignModal"
import EditAssignmentModal from "@/components/assignments/EditAssignmentModal"
import type { Assignment } from "@/types/assignment"
import type { Replacement } from "@/types/replacement"

type Toast = { title: string; message: string; type?: "success" | "error" }

function useToast() {
  const [toast, setToast] = useState<Toast | null>(null)
  const show = useCallback((title: string, message: string, type: "success" | "error" = "success") => {
    setToast({ title, message, type })
    setTimeout(() => setToast(null), 3500)
  }, [])
  return { toast, show }
}

const STATUS_STYLES: Record<string, string> = {
  Active:   "bg-green-50 text-green-700 border border-green-200",
  Returned: "bg-gray-100 text-gray-500 border border-gray-200",
}

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [replacements, setReplacements] = useState<Replacement[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"Assignments" | "Replacements">("Assignments")
  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ asset: "", employee: "", department: "", status: "" })
  const [editAssignment, setEditAssignment] = useState<Assignment | null>(null)
  const [confirmReturn, setConfirmReturn] = useState<Assignment | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Assignment | null>(null)
  const [replSearch, setReplSearch] = useState("")
  const [replShowAll, setReplShowAll] = useState(false)
  const { toast, show: showToast } = useToast()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [replPage, setReplPage] = useState(1)
  const [replPageSize, setReplPageSize] = useState(20)

  async function load() {
    setLoading(true)
    try {
      const [data, replData] = await Promise.all([
        fetch("/api/assignments").then((r) => r.json()),
        fetch("/api/replacements").then((r) => r.json()),
      ])
      setAssignments(data.data ?? [])
      setReplacements(replData.data ?? [])
    } catch {
      showToast("Error", "Failed to load assignments", "error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const departments = [...new Set(assignments.map((a) => a.user?.department).filter(Boolean))].sort() as string[]

  const filtered = assignments.filter((a) => {
    if (search) {
      const q = search.toLowerCase()
      const matchSearch = (
        a.asset?.itemName?.toLowerCase().includes(q) ||
        a.asset?.itemCode?.toLowerCase().includes(q) ||
        a.user?.name?.toLowerCase().includes(q) ||
        a.user?.department?.toLowerCase().includes(q) ||
        a.asset?.category?.name?.toLowerCase().includes(q) ||
        a.status?.toLowerCase().includes(q)
      )
      if (!matchSearch) return false
    }
    if (filters.asset && !a.asset?.itemName?.toLowerCase().includes(filters.asset.toLowerCase()) && !a.asset?.itemCode?.toLowerCase().includes(filters.asset.toLowerCase())) return false
    if (filters.employee && !a.user?.name?.toLowerCase().includes(filters.employee.toLowerCase())) return false
    if (filters.department && a.user?.department !== filters.department) return false
    if (filters.status && a.status !== filters.status) return false
    return true
  })

  const filteredRepls = replacements.filter((r) => {
    if (!replShowAll && !r.isActive) return false
    if (replSearch) {
      const q = replSearch.toLowerCase()
      return (
        r.asset?.itemName?.toLowerCase().includes(q) ||
        r.user?.name?.toLowerCase().includes(q) ||
        r.asset?.itemCode?.toLowerCase().includes(q)
      )
    }
    return true
  })

  useEffect(() => { setPage(1) }, [search, filters])
  useEffect(() => { setReplPage(1) }, [replSearch, replShowAll])
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  const paginatedRepls = filteredRepls.slice((replPage - 1) * replPageSize, replPage * replPageSize)
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  function clearFilters() { setFilters({ asset: "", employee: "", department: "", status: "" }) }

  async function handleAssign(form: {
    assetId: string; userId: string; assignedDate: string; expectedReturn: string; notes: string
  }) {
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const created: Assignment = json.data
      setAssignments((prev) => [created, ...prev])
      setShowAdd(false)
      showToast("Asset Assigned", `${created.asset?.itemName} assigned to ${created.user?.name}`)
    } catch {
      showToast("Error", "Failed to assign asset", "error")
    }
  }

  async function handleBulkAssign(form: { userId: string; assetIds: string[]; assignedDate: string; expectedReturn: string; notes: string }) {
    try {
      const res = await fetch("/api/assignments/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "")
      const created: Assignment[] = json.data ?? []
      setAssignments((prev) => [...created, ...prev])
      setShowBulk(false)
      showToast("Assets Assigned", `${created.length} asset${created.length === 1 ? "" : "s"} assigned to ${created[0]?.user?.name ?? "employee"}`)
    } catch (err) {
      showToast("Error", err instanceof Error && err.message ? err.message : "Failed to bulk assign", "error")
    }
  }

  async function handleEdit(data: { expectedReturn: string; notes: string }) {
    if (!editAssignment) return
    try {
      const res = await fetch(`/api/assignments/${editAssignment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedReturn: data.expectedReturn || null,
          notes: data.notes || null,
        }),
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const updated: Assignment = json.data
      setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      setEditAssignment(null)
      showToast("Assignment Updated", `${updated.asset?.itemName} assignment has been updated`)
    } catch {
      showToast("Error", "Failed to update assignment", "error")
    }
  }

  async function handleReturn() {
    if (!confirmReturn) return
    try {
      const res = await fetch(`/api/assignments/${confirmReturn.id}`, { method: "PATCH" })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const updated: Assignment = json.data
      setAssignments((prev) =>
        prev.map((a) => (a.id === updated.id ? { ...a, status: "Returned", returnedAt: updated.returnedAt } : a))
      )
      setConfirmReturn(null)
      showToast("Asset Returned", `${confirmReturn.asset?.itemName} marked as returned`)
    } catch {
      showToast("Error", "Failed to mark as returned", "error")
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    try {
      await fetch(`/api/assignments/${confirmDelete.id}`, { method: "DELETE" })
      setAssignments((prev) => prev.filter((a) => a.id !== confirmDelete.id))
      setConfirmDelete(null)
      showToast("Deleted", "Assignment record removed")
    } catch {
      showToast("Error", "Failed to delete assignment", "error")
    }
  }

  function fmt(dateStr?: string | null) {
    if (!dateStr) return "—"
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  const active = assignments.filter((a) => a.status === "Active").length
  const returned = assignments.filter((a) => a.status === "Returned").length

  return (
    <>
      <div className="p-4 sm:p-6">

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Assignments", value: assignments.length, color: "bg-blue-50 text-blue-700" },
            { label: "Active", value: active, color: "bg-green-50 text-green-700" },
            { label: "Returned", value: returned, color: "bg-gray-100 text-gray-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              <span className={cn("text-lg font-bold px-3 py-0.5 rounded-lg", s.color)}>{s.value}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">All Assignments</h2>
              <p className="text-xs text-gray-400 mt-0.5">{filtered.length} of {assignments.length} records</p>
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
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search assignments…"
                  className="pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:bg-white w-52"
                />
              </div>
              <button
                onClick={() => setShowBulk(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-accent-200 text-accent-700 bg-accent-50 rounded-lg hover:bg-accent-100 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" /> Bulk Assign
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Assign Asset
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100 mb-0">
            {(["Assignments", "Replacements"] as const).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={cn(
                  "px-5 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap",
                  activeTab === t
                    ? "border-accent-500 text-accent-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}>
                {t}
                {t === "Replacements" && replacements.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700">
                    {replacements.filter(r => r.isActive).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Assignments Tab */}
          {activeTab === "Assignments" && (
          <><div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3 font-semibold text-center w-10">S.No</th>
                  <th className="text-left px-4 py-3 font-semibold">Asset</th>
                  <th className="text-left px-4 py-3 font-semibold">Assigned To</th>
                  <th className="text-left px-4 py-3 font-semibold">Department</th>
                  <th className="text-left px-4 py-3 font-semibold">Category</th>
                  <th className="text-left px-4 py-3 font-semibold">Condition</th>
                  <th className="text-left px-4 py-3 font-semibold">Assigned Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Exp. Return</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Actions</th>
                </tr>
                {showFilters && (
                  <tr className="border-b border-accent-100 bg-accent-50/30">
                    <td colSpan={10} className="px-4 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Asset / Code</label>
                          <input value={filters.asset} onChange={(e) => setFilters((f) => ({ ...f, asset: e.target.value }))} placeholder="Filter asset…" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Employee</label>
                          <input value={filters.employee} onChange={(e) => setFilters((f) => ({ ...f, employee: e.target.value }))} placeholder="Filter employee…" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Department</label>
                          <select value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                            <option value="">All Departments</option>
                            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</label>
                          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                            <option value="">All Statuses</option>
                            <option value="Active">Active</option>
                            <option value="Returned">Returned</option>
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
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading assignments…
                    </div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <ArrowLeftRight className="w-8 h-8 text-gray-200" />
                      {search ? "No assignments match your search" : "No assignments yet — click Assign Asset to get started"}
                    </div>
                  </td></tr>
                ) : paginated.map((a, idx) => (
                  <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-center text-gray-400 font-medium">{(page - 1) * pageSize + idx + 1}</td>

                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">{a.asset?.itemName ?? "—"}</p>
                      <p className="text-gray-400 text-[10px] mt-0.5">{a.asset?.itemCode}</p>
                    </td>

                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{a.user?.name ?? "—"}</p>
                      <p className="text-gray-400 text-[10px] mt-0.5">{a.user?.employeeId}</p>
                    </td>

                    <td className="px-4 py-3 text-gray-600">{a.user?.department ?? "—"}</td>

                    <td className="px-4 py-3">
                      <p className="text-gray-700">{a.asset?.category?.name ?? "—"}</p>
                      <p className="text-gray-400 text-[10px] mt-0.5">{a.asset?.baseCategory?.name}</p>
                    </td>

                    <td className="px-4 py-3 text-gray-600">{a.condition}</td>

                    <td className="px-4 py-3 text-gray-600">
                      <p>{fmt(a.assignedAt)}</p>
                      {a.assignedByName && (
                        <p className="text-gray-400 text-[10px] mt-0.5">by {a.assignedByName}</p>
                      )}
                    </td>

                    <td className="px-4 py-3 text-gray-600">
                      {a.status === "Returned" && a.returnedAt
                        ? <span className="text-gray-400">Returned {fmt(a.returnedAt)}</span>
                        : fmt(a.expectedReturn)}
                    </td>

                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", STATUS_STYLES[a.status])}>
                        {a.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditAssignment(a)}
                          title="Edit Assignment"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {a.status === "Active" && (
                          <button
                            onClick={() => setConfirmReturn(a)}
                            title="Mark as Returned"
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDelete(a)}
                          title="Delete Record"
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} className="px-4" />
          </>)}

          {/* Replacements Tab */}
          {activeTab === "Replacements" && (
            <div>
              {/* Replacements filter bar */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    value={replSearch}
                    onChange={(e) => setReplSearch(e.target.value)}
                    placeholder="Search replacements…"
                    className="pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:bg-white w-full"
                  />
                </div>
                <button
                  onClick={() => setReplShowAll((v) => !v)}
                  className={cn(
                    "px-3 py-2 text-xs font-medium border rounded-lg transition-colors",
                    replShowAll
                      ? "border-accent-200 bg-accent-50 text-accent-600 hover:bg-accent-100"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {replShowAll ? "Showing All" : "Active Only"}
                </button>
              </div>

              {/* Replacements table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                      <th className="px-4 py-3 font-semibold text-center w-10">S.No</th>
                      <th className="text-left px-4 py-3 font-semibold">Replacement Asset</th>
                      <th className="text-left px-4 py-3 font-semibold">Assigned To</th>
                      <th className="text-left px-4 py-3 font-semibold">Original Repair</th>
                      <th className="text-left px-4 py-3 font-semibold">Type</th>
                      <th className="text-left px-4 py-3 font-semibold">Start Date</th>
                      <th className="text-left px-4 py-3 font-semibold">End Date</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={8} className="px-4 py-16 text-center text-gray-400">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Loading replacements…
                        </div>
                      </td></tr>
                    ) : filteredRepls.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                        <div className="flex flex-col items-center gap-2">
                          <ArrowLeftRight className="w-8 h-8 text-gray-200" />
                          No replacements found
                        </div>
                      </td></tr>
                    ) : paginatedRepls.map((r, idx) => (
                      <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 text-center text-gray-400 font-medium">{(replPage - 1) * replPageSize + idx + 1}</td>

                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-800">{r.asset?.itemName ?? "—"}</p>
                          <p className="text-gray-400 text-[10px] mt-0.5">{r.asset?.itemCode}</p>
                        </td>

                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{r.user?.name ?? "—"}</p>
                          <p className="text-gray-400 text-[10px] mt-0.5">{r.user?.employeeId}</p>
                        </td>

                        <td className="px-4 py-3 text-gray-600">
                          {r.repair?.asset?.itemName ?? "—"}
                        </td>

                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                            r.type === "Temporary"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-blue-100 text-blue-700"
                          )}>
                            {r.type}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-gray-600">{fmt(r.startDate)}</td>

                        <td className="px-4 py-3 text-gray-600">
                          {r.endDate ? fmt(r.endDate) : <span className="text-gray-400">No end date</span>}
                        </td>

                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                            r.isActive
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : "bg-gray-100 text-gray-500 border border-gray-200"
                          )}>
                            {r.isActive ? "Active" : "Ended"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination total={filteredRepls.length} page={replPage} pageSize={replPageSize} onPageChange={setReplPage} onPageSizeChange={setReplPageSize} className="px-4" />
            </div>
          )}
        </div>
      </div>

      {/* Assign Modal */}
      {showAdd && <AssignAssetModal onClose={() => setShowAdd(false)} onSave={handleAssign} />}

      {/* Bulk Assign Modal */}
      {showBulk && <BulkAssignModal onClose={() => setShowBulk(false)} onSave={handleBulkAssign} />}

      {/* Edit Modal */}
      {editAssignment && (
        <EditAssignmentModal
          assignment={editAssignment}
          onClose={() => setEditAssignment(null)}
          onSave={handleEdit}
        />
      )}

      {/* Return Confirmation */}
      {confirmReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <Undo2 className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Mark as Returned?</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  This will return <span className="font-medium">{confirmReturn.asset?.itemName}</span> and set it back to Available.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmReturn(null)} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleReturn} className="px-4 py-2 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Confirm Return</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Delete Assignment?</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Remove assignment record for <span className="font-medium">{confirmDelete.asset?.itemName}</span>. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed bottom-5 right-5 z-[60] flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border max-w-xs",
          toast.type === "error" ? "bg-red-50 border-red-200" : "bg-white border-gray-200"
        )}>
          <div className="flex-1">
            <p className={cn("text-xs font-semibold", toast.type === "error" ? "text-red-700" : "text-gray-800")}>{toast.title}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{toast.message}</p>
          </div>
        </div>
      )}
    </>
  )
}
