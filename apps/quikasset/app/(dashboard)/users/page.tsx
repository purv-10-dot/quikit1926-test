"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import ImportModal from "@/components/users/ImportModal"
import AddEditUserModal from "@/components/users/AddEditUserModal"
import DeleteConfirmModal from "@/components/users/DeleteConfirmModal"
import { Upload, UserPlus, Search, Pencil, Trash2, CheckCircle2, X, AlertTriangle, Download, Loader2, SlidersHorizontal, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { User } from "@/types/user"
import * as XLSX from "xlsx"
import Pagination from "@/components/ui/Pagination"

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-600", "bg-red-500",
  "bg-cyan-500", "bg-rose-500",
]

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase()
}

function avatarColor(id: string) {
  let hash = 0
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState({ employee: "", employeeId: "", contact: "", department: "", designation: "", joiningDate: "", status: "" })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [toast, setToast] = useState<{ message: string; sub: string } | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const showToast = useCallback((message: string, sub: string) => {
    setToast({ message, sub })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users")
      const json = await res.json()
      setUsers(json.data ?? [])
    } catch {
      showToast("Error", "Failed to load users")
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadUsers() }, [loadUsers])

  const departments = useMemo(() => [...new Set(users.map((u) => u.department).filter(Boolean))].sort() as string[], [users])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter((u) => {
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q) &&
          !u.employeeId.toLowerCase().includes(q) && !(u.department || "").toLowerCase().includes(q) &&
          !(u.designation || "").toLowerCase().includes(q)) return false
      if (filters.employee && !u.name.toLowerCase().includes(filters.employee.toLowerCase()) && !u.email.toLowerCase().includes(filters.employee.toLowerCase())) return false
      if (filters.employeeId && !u.employeeId.toLowerCase().includes(filters.employeeId.toLowerCase())) return false
      if (filters.contact && !(u.contact || "").toLowerCase().includes(filters.contact.toLowerCase())) return false
      if (filters.department && u.department !== filters.department) return false
      if (filters.designation && !(u.designation || "").toLowerCase().includes(filters.designation.toLowerCase())) return false
      if (filters.joiningDate && !(u.joiningDate || "").includes(filters.joiningDate)) return false
      if (filters.status && u.status !== filters.status) return false
      return true
    })
  }, [users, search, filters])

  useEffect(() => { setPage(1) }, [search, filters])
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  const activeFilterCount = Object.values(filters).filter(Boolean).length
  function clearFilters() { setFilters({ employee: "", employeeId: "", contact: "", department: "", designation: "", joiningDate: "", status: "" }) }

  const filteredIds = useMemo(() => new Set(filtered.map((u) => u.id)), [filtered])
  const allSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.id))
  const someSelected = filtered.some((u) => selected.has(u.id)) && !allSelected
  const selectedCount = [...selected].filter((id) => filteredIds.has(id)).length

  function toggleSelectAll() {
    if (allSelected) {
      setSelected((prev) => { const s = new Set(prev); filtered.forEach((u) => s.delete(u.id)); return s })
    } else {
      setSelected((prev) => { const s = new Set(prev); filtered.forEach((u) => s.add(u.id)); return s })
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function handleExport() {
    const rows = filtered.map((u, i) => ({
      "S.No": i + 1,
      "Employee Name": u.name,
      "Employee ID": u.employeeId,
      "Email": u.email,
      "Contact": u.contact || "",
      "Department": u.department || "",
      "Designation": u.designation || "",
      "Joining Date": u.joiningDate || "",
      "Status": u.status,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws["!cols"] = [
      { wch: 6 }, { wch: 22 }, { wch: 12 }, { wch: 30 },
      { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 10 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Users")
    XLSX.writeFile(wb, `user-directory-${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast("Export successful", `${rows.length} user${rows.length !== 1 ? "s" : ""} exported to Excel`)
  }

  async function handleImport(imported: Omit<User, "id">[]) {
    try {
      await Promise.all(
        imported.map((u) =>
          fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(u),
          })
        )
      )
      await loadUsers()
      setShowImport(false)
      showToast("Import successful", `${imported.length} user${imported.length !== 1 ? "s" : ""} added to the directory`)
    } catch {
      showToast("Import failed", "Some users could not be imported")
    }
  }

  async function handleAddUser(data: Omit<User, "id">) {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      const user = json.data
      setUsers((prev) => [...prev, user])
      setShowAdd(false)
      showToast("User added", `${data.name} has been added to the directory`)
    } catch {
      showToast("Error", "Failed to add user")
    }
  }

  async function handleEditUser(data: Omit<User, "id">) {
    if (!editUser) return
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      const updated = json.data
      setUsers((prev) => prev.map((u) => u.id === editUser.id ? updated : u))
      setEditUser(null)
      showToast("User updated", `${data.name}'s details have been saved`)
    } catch {
      showToast("Error", "Failed to update user")
    }
  }

  async function handleDelete() {
    if (!deleteUser) return
    const name = deleteUser.name
    try {
      await fetch(`/api/users/${deleteUser.id}`, { method: "DELETE" })
      setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id))
      setSelected((prev) => { const s = new Set(prev); s.delete(deleteUser.id); return s })
      setDeleteUser(null)
      showToast("User deleted", `${name} has been permanently removed`)
    } catch {
      showToast("Error", "Failed to delete user")
    }
  }

  async function handleBulkDelete() {
    const ids = [...selected].filter((id) => filteredIds.has(id))
    const count = ids.length
    try {
      await fetch("/api/users/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      setUsers((prev) => prev.filter((u) => !selected.has(u.id)))
      setSelected(new Set())
      setShowBulkDelete(false)
      showToast(`${count} user${count !== 1 ? "s" : ""} deleted`, "Selected users have been permanently removed")
    } catch {
      showToast("Error", "Failed to delete selected users")
    }
  }

  async function toggleStatus(user: User) {
    const newStatus = user.status === "Active" ? "Inactive" : "Active"
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json()
      const updated = json.data
      setUsers((prev) => prev.map((u) => u.id === user.id ? updated : u))
    } catch {
      showToast("Error", "Failed to update status")
    }
  }

  return (
    <>
      <div className="p-4 sm:p-6">
        <div className="bg-white rounded-xl border border-gray-200">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">All Users</h2>
                <p className="text-xs text-gray-400 mt-0.5">{filtered.length} of {users.length} users</p>
              </div>
              {selectedCount > 0 && (
                <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200">
                  <span className="text-xs font-semibold text-accent-700 bg-accent-50 px-2 py-0.5 rounded-full">
                    {selectedCount} selected
                  </span>
                  <button
                    onClick={() => setShowBulkDelete(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete Selected
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
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
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users..."
                  className="pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:bg-white w-52"
                />
              </div>
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Import
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add New
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                  <th className="pl-4 pr-2 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 accent-[var(--color-accent-600)] cursor-pointer"
                    />
                  </th>
                  <th className="px-2 py-3 font-semibold text-center w-10">S.No</th>
                  <th className="text-left px-4 py-3 font-semibold">Employee</th>
                  <th className="text-left px-4 py-3 font-semibold">Employee ID</th>
                  <th className="text-left px-4 py-3 font-semibold">Contact</th>
                  <th className="text-left px-4 py-3 font-semibold">Department</th>
                  <th className="text-left px-4 py-3 font-semibold">Designation</th>
                  <th className="text-left px-4 py-3 font-semibold">Joining Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Actions</th>
                </tr>
                {showFilters && (
                  <tr className="border-b border-accent-100 bg-accent-50/30">
                    <td colSpan={10} className="px-4 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Name / Email</label>
                          <input value={filters.employee} onChange={(e) => setFilters((f) => ({ ...f, employee: e.target.value }))} placeholder="Filter…" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Employee ID</label>
                          <input value={filters.employeeId} onChange={(e) => setFilters((f) => ({ ...f, employeeId: e.target.value }))} placeholder="Filter…" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Contact</label>
                          <input value={filters.contact} onChange={(e) => setFilters((f) => ({ ...f, contact: e.target.value }))} placeholder="Filter…" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Department</label>
                          <select value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                            <option value="">All Departments</option>
                            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Designation</label>
                          <input value={filters.designation} onChange={(e) => setFilters((f) => ({ ...f, designation: e.target.value }))} placeholder="Filter…" className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Joining Date</label>
                          <input type="date" value={filters.joiningDate} onChange={(e) => setFilters((f) => ({ ...f, joiningDate: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</label>
                          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                            <option value="">All Statuses</option>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-gray-400">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading users…</span>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                      No users found
                    </td>
                  </tr>
                ) : paginated.map((user, idx) => {
                  const isSelected = selected.has(user.id)
                  return (
                    <tr
                      key={user.id}
                      className={cn(
                        "border-t border-gray-100 transition-colors",
                        isSelected ? "bg-blue-50/60" : "hover:bg-gray-50/60"
                      )}
                    >
                      <td className="pl-4 pr-2 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(user.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 accent-[var(--color-accent-600)] cursor-pointer"
                        />
                      </td>

                      <td className="px-2 py-3 text-center text-gray-400 font-medium">{(page - 1) * pageSize + idx + 1}</td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0", avatarColor(user.id))}>
                            {getInitials(user.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 truncate">{user.name}</p>
                            <p className="text-gray-400 text-[10px] truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono text-gray-600">{user.employeeId}</td>
                      <td className="px-4 py-3 text-gray-500">{user.contact || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{user.department || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{user.designation || "—"}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {user.joiningDate
                          ? new Date(user.joiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                          : "—"}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleStatus(user)}
                            title={`Click to mark ${user.status === "Active" ? "Inactive" : "Active"}`}
                            className={cn(
                              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none",
                              user.status === "Active" ? "bg-green-500" : "bg-gray-300"
                            )}
                          >
                            <span className={cn(
                              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                              user.status === "Active" ? "translate-x-4" : "translate-x-1"
                            )} />
                          </button>
                          <span className={cn("text-[10px] font-semibold", user.status === "Active" ? "text-green-600" : "text-gray-400")}>
                            {user.status}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditUser(user)}
                            title="Edit user"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteUser(user)}
                            title="Delete user"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
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

      {/* Modals */}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />}
      {showAdd && <AddEditUserModal onClose={() => setShowAdd(false)} onSave={handleAddUser} />}
      {editUser && <AddEditUserModal user={editUser} onClose={() => setEditUser(null)} onSave={handleEditUser} />}
      {deleteUser && (
        <DeleteConfirmModal userName={deleteUser.name} onClose={() => setDeleteUser(null)} onConfirm={handleDelete} />
      )}

      {/* Bulk delete confirmation */}
      {showBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Delete Selected Users</h2>
              <button onClick={() => setShowBulkDelete(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-6 flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Permanently delete <span className="text-red-600">{selectedCount} user{selectedCount !== 1 ? "s" : ""}</span>?
                </p>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  This is a hard delete and cannot be undone. All data for the selected users will be permanently removed.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setShowBulkDelete(false)}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete {selectedCount} User{selectedCount !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={cn(
        "fixed bottom-6 right-6 z-50 transition-all duration-500",
        toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}>
        {toast && (
          <div className="bg-gray-900 text-white rounded-xl shadow-2xl px-4 py-3 flex flex-col gap-2 min-w-[280px]">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{toast.message}</p>
                <p className="text-xs text-gray-400 mt-0.5">{toast.sub}</p>
              </div>
              <button onClick={() => setToast(null)} className="text-gray-500 hover:text-white ml-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 rounded-full animate-[shrink_4s_linear_forwards]" />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
