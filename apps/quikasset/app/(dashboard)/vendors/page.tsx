"use client"

/**
 * Vendor Management — list / add / edit / remove vendors (admin master data).
 * Gated on `Vendor:view`. Vendors are linked from Repair records (the free-text
 * repair "vendor" field becomes a picker sourcing this list).
 *
 * NOTE: the backing API (`/api/vendors`) + `AstVendor` table land with schema
 * sign-off. This page is built against the planned shape (like the Asset Request
 * shells) — until the API exists the list simply loads empty.
 */

import { useState, useEffect, useCallback } from "react"
import { Loader2, Building2, Plus, Pencil, Trash2, Mail, Phone, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { RequirePerm } from "@/components/require-perm"
import AddEditVendorModal, { type VendorPayload } from "@/components/vendors/AddEditVendorModal"
import type { Vendor, VendorStatus } from "@/types/vendor"

const STATUS_STYLES: Record<VendorStatus, string> = {
  Active:   "bg-green-50 text-green-700 border border-green-200",
  Inactive: "bg-gray-100 text-gray-500 border border-gray-200",
}

type Toast = { title: string; message: string; type?: "success" | "error" }

function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [editVendor, setEditVendor] = useState<Vendor | null>(null)
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  function showToast(title: string, message: string, type: "success" | "error" = "success") {
    setToast({ title, message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/vendors")
      const json = await res.json()
      setVendors(json?.data ?? [])
    } catch {
      setVendors([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleAdd(payload: VendorPayload) {
    const res = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { showToast("Error", json.error ?? "Failed to add vendor", "error"); return }
    setShowAdd(false)
    showToast("Vendor added", payload.name)
    await load()
  }

  async function handleEdit(payload: VendorPayload) {
    if (!editVendor) return
    const res = await fetch(`/api/vendors/${editVendor.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { showToast("Error", json.error ?? "Failed to update vendor", "error"); return }
    setEditVendor(null)
    showToast("Vendor updated", payload.name)
    await load()
  }

  async function handleDelete() {
    if (!deleteVendor) return
    const res = await fetch(`/api/vendors/${deleteVendor.id}`, { method: "DELETE" })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { showToast("Error", json.error ?? "Failed to delete vendor", "error"); setDeleteVendor(null); return }
    setDeleteVendor(null)
    showToast("Vendor removed", deleteVendor.name)
    await load()
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? vendors.filter((v) =>
        v.name.toLowerCase().includes(q) ||
        (v.contactPerson ?? "").toLowerCase().includes(q) ||
        (v.email ?? "").toLowerCase().includes(q) ||
        (v.phone ?? "").toLowerCase().includes(q))
    : vendors

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-800">Vendors</h1>
            <p className="text-xs text-gray-400">{vendors.length} total</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add Vendor
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">All Vendors</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors…"
            className="w-52 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400 focus:bg-white"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-accent-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-semibold">Vendor</th>
                <th className="px-4 py-3 text-left font-semibold">Contact Person</th>
                <th className="px-4 py-3 text-left font-semibold">Contact</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-16 text-center text-gray-400">
                  <div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-14 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="h-8 w-8 text-gray-200" />
                    {search ? "No vendors match your search" : "No vendors yet — click Add Vendor to create one"}
                  </div>
                </td></tr>
              ) : filtered.map((v) => (
                <tr key={v.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{v.name}</p>
                    {v.address && <p className="text-[10px] text-gray-400 max-w-xs truncate">{v.address}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{v.contactPerson ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex flex-col gap-0.5">
                      {v.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" /> {v.phone}</span>}
                      {v.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3 text-gray-400" /> {v.email}</span>}
                      {!v.phone && !v.email && "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLES[v.status])}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditVendor(v)}
                        className="p-1.5 text-gray-400 hover:text-accent-600 hover:bg-accent-50 rounded-lg transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteVendor(v)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <AddEditVendorModal onClose={() => setShowAdd(false)} onSave={handleAdd} />}
      {editVendor && <AddEditVendorModal vendor={editVendor} onClose={() => setEditVendor(null)} onSave={handleEdit} />}

      {deleteVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Delete &ldquo;{deleteVendor.name}&rdquo;?</p>
              <p className="text-xs text-gray-500 mt-1">Repairs already linked to this vendor keep their record; new repairs won&rsquo;t be able to select it.</p>
            </div>
            <div className="flex gap-2 w-full">
              <button onClick={() => setDeleteVendor(null)} className="flex-1 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

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

export default function VendorsPage() {
  return (
    <RequirePerm resource="Vendor" action="view">
      <Vendors />
    </RequirePerm>
  )
}
