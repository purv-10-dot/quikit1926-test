"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import ImportAssetModal from "@/components/assets/ImportAssetModal"
import AddEditAssetModal from "@/components/assets/AddEditAssetModal"
import { Upload, Plus, Search, Pencil, Trash2, CheckCircle2, X, AlertTriangle, Download, Loader2, Laptop, Smartphone, Monitor, Printer, Server, HardDrive, Camera, Car, Wrench, Cpu, Wifi, Headphones, Package, Box, Tablet, BookOpen, Armchair, SlidersHorizontal, ChevronUp, Wallet, ChevronRight } from "lucide-react"
import FiscalBudgetModal, { type FiscalBudget, type FiscalBudgetFormData } from "@/components/assets/FiscalBudgetModal"
import Pagination from "@/components/ui/Pagination"
import { RequirePerm } from "@/components/require-perm"
import { cn } from "@/lib/utils"
import type { Asset } from "@/types/asset"
import * as XLSX from "xlsx"
import type { LucideIcon } from "lucide-react"

const ICON_MAP: { keywords: string[]; icon: LucideIcon; color: string }[] = [
  { keywords: ["laptop", "notebook", "macbook"],               icon: Laptop,       color: "bg-blue-100 text-blue-600"    },
  { keywords: ["phone", "mobile", "iphone", "android"],        icon: Smartphone,   color: "bg-green-100 text-green-600"  },
  { keywords: ["monitor", "screen", "display", "tv"],          icon: Monitor,      color: "bg-indigo-100 text-indigo-600"},
  { keywords: ["printer", "scanner", "copier"],                icon: Printer,      color: "bg-orange-100 text-orange-600"},
  { keywords: ["server", "rack", "nas"],                       icon: Server,       color: "bg-purple-100 text-purple-600"},
  { keywords: ["hard drive", "ssd", "hdd", "storage", "disk"], icon: HardDrive,    color: "bg-gray-100 text-gray-600"    },
  { keywords: ["camera", "webcam", "cctv"],                    icon: Camera,       color: "bg-pink-100 text-pink-600"    },
  { keywords: ["car", "vehicle", "truck", "bike"],             icon: Car,          color: "bg-yellow-100 text-yellow-600"},
  { keywords: ["wrench", "tool", "equipment"],                 icon: Wrench,       color: "bg-red-100 text-red-600"      },
  { keywords: ["cpu", "processor", "chip"],                    icon: Cpu,          color: "bg-cyan-100 text-cyan-600"    },
  { keywords: ["router", "wifi", "switch", "network"],         icon: Wifi,         color: "bg-teal-100 text-teal-600"    },
  { keywords: ["headphone", "headset", "earphone", "speaker"], icon: Headphones,   color: "bg-violet-100 text-violet-600"},
  { keywords: ["tablet", "ipad"],                              icon: Tablet,       color: "bg-sky-100 text-sky-600"      },
  { keywords: ["book", "manual", "document"],                  icon: BookOpen,     color: "bg-amber-100 text-amber-600"  },
  { keywords: ["chair", "desk", "table", "furniture"],         icon: Armchair,     color: "bg-lime-100 text-lime-600"    },
]

function getAssetIcon(asset: Asset): { icon: LucideIcon; color: string } {
  const haystack = `${asset.itemName} ${asset.category?.name ?? ""} ${asset.baseCategory?.name ?? ""}`.toLowerCase()
  for (const { keywords, icon, color } of ICON_MAP) {
    if (keywords.some((k) => haystack.includes(k))) return { icon, color }
  }
  return asset.assetType === "Consumable"
    ? { icon: Package, color: "bg-orange-100 text-orange-500" }
    : { icon: Box,     color: "bg-slate-100 text-slate-500"   }
}

const STATUS_STYLES: Record<Asset["assetStatus"], string> = {
  Available: "bg-green-100 text-green-700",
  Assigned:  "bg-blue-100 text-blue-700",
  InRepair:  "bg-orange-100 text-orange-700",
  Retired:   "bg-gray-100 text-gray-500",
}

const STATUS_LABELS: Record<Asset["assetStatus"], string> = {
  Available: "Available",
  Assigned:  "Assigned",
  InRepair:  "In Repair",
  Retired:   "Retired",
}

export default function AssetInventoryPage() {
  // Full org register — only asset managers/admins (Asset:viewAll). Members are
  // routed to /employee-view ("My Assets"); the /api/assets endpoint also scopes
  // defensively, so this guard is UX, not the security boundary.
  return (
    <RequirePerm resource="Asset" action="viewAll">
      <AssetInventory />
    </RequirePerm>
  )
}

function AssetInventory() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState({ item: "", serialNumber: "", assetType: "", category: "", location: "", condition: "", status: "" })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  const [deleteAsset, setDeleteAsset] = useState<Asset | null>(null)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [toast, setToast] = useState<{ message: string; sub: string } | null>(null)
  const [fiscalBudgets, setFiscalBudgets] = useState<FiscalBudget[]>([])
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const [editFiscalBudget, setEditFiscalBudget] = useState<FiscalBudget | undefined>()
  const [showAllBudgets, setShowAllBudgets] = useState(false)
  const [selectedFY, setSelectedFY] = useState<string>("")
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

  const loadAssets = useCallback(async () => {
    try {
      const res = await fetch("/api/assets")
      const json = await res.json()
      setAssets(json.data ?? [])
    } catch { showToast("Error", "Failed to load assets") }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { loadAssets() }, [loadAssets])

  const loadFiscalBudgets = useCallback(async () => {
    try {
      const json = await fetch("/api/fiscal-budgets").then((r) => r.json())
      const data: FiscalBudget[] = json.data ?? []
      setFiscalBudgets(data)
      setSelectedFY((prev) => prev || getCurrentFY())
    } catch {}
  }, [])

  useEffect(() => { loadFiscalBudgets() }, [loadFiscalBudgets])
  useEffect(() => { setPage(1) }, [search, filters])

  function getCurrentFY(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1 // 1-based
    const fyStart = month >= 4 ? year : year - 1
    return `FY ${fyStart}-${String(fyStart + 1).slice(-2)}`
  }

  function getAllFYears(): string[] {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const fyStart = month >= 4 ? year : year - 1
    const years: string[] = []
    for (let y = 2023; y <= fyStart + 2; y++) {
      years.push(`FY ${y}-${String(y + 1).slice(-2)}`)
    }
    return years
  }

  async function handleSaveFiscalBudget(data: FiscalBudgetFormData) {
    const url = editFiscalBudget ? `/api/fiscal-budgets/${editFiscalBudget.id}` : "/api/fiscal-budgets"
    const method = editFiscalBudget ? "PUT" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fiscalYear: data.fiscalYear,
        q1Amount: parseFloat(data.q1Amount) || 0,
        q2Amount: parseFloat(data.q2Amount) || 0,
        q3Amount: parseFloat(data.q3Amount) || 0,
        q4Amount: parseFloat(data.q4Amount) || 0,
        notes: data.notes || null,
      }),
    })
    if (res.ok) {
      setSelectedFY(data.fiscalYear)
      await loadFiscalBudgets()
    }
    setShowBudgetModal(false)
    setEditFiscalBudget(undefined)
  }

  const categories = useMemo(() => [...new Set(assets.map((a) => a.category?.name).filter(Boolean))].sort() as string[], [assets])
  const locations  = useMemo(() => [...new Set(assets.map((a) => a.location).filter(Boolean))].sort() as string[], [assets])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return assets.filter((a) => {
      if (q && !a.itemName.toLowerCase().includes(q) && !a.itemCode.toLowerCase().includes(q) &&
          !a.serialNumber.toLowerCase().includes(q) && !(a.baseCategory?.name ?? "").toLowerCase().includes(q) &&
          !(a.category?.name ?? "").toLowerCase().includes(q) && !a.location.toLowerCase().includes(q) &&
          !a.assetType.toLowerCase().includes(q)) return false
      if (filters.item && !a.itemName.toLowerCase().includes(filters.item.toLowerCase()) && !a.itemCode.toLowerCase().includes(filters.item.toLowerCase())) return false
      if (filters.serialNumber && !a.serialNumber.toLowerCase().includes(filters.serialNumber.toLowerCase())) return false
      if (filters.assetType && a.assetType !== filters.assetType) return false
      if (filters.category && a.category?.name !== filters.category) return false
      if (filters.location && a.location !== filters.location) return false
      if (filters.condition && a.condition !== filters.condition) return false
      if (filters.status && a.assetStatus !== filters.status) return false
      return true
    })
  }, [assets, search, filters])
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const activeFilterCount = Object.values(filters).filter(Boolean).length
  function clearFilters() { setFilters({ item: "", serialNumber: "", assetType: "", category: "", location: "", condition: "", status: "" }) }

  const filteredIds = useMemo(() => new Set(filtered.map((a) => a.id)), [filtered])
  const allSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id))
  const someSelected = filtered.some((a) => selected.has(a.id)) && !allSelected
  const selectedCount = [...selected].filter((id) => filteredIds.has(id)).length

  function toggleSelectAll() {
    if (allSelected) setSelected((p) => { const s = new Set(p); filtered.forEach((a) => s.delete(a.id)); return s })
    else setSelected((p) => { const s = new Set(p); filtered.forEach((a) => s.add(a.id)); return s })
  }
  function toggleSelect(id: string) {
    setSelected((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function handleExport() {
    const rows = filtered.map((a, i) => ({
      "S.No": i + 1,
      "Item Name": a.itemName,
      "Item Code": a.itemCode,
      "Serial Number": a.serialNumber,
      "Invoice Number": a.invoiceNumber,
      "Asset Type": a.assetType,
      "Base Category": a.baseCategory?.name ?? "",
      "Category": a.category?.name ?? "",
      "Warehouse": a.warehouse ?? "",
      "Price": a.price ?? "",
      "Purchase Date": a.purchaseDate,
      "Location": a.location,
      "Condition": a.condition,
      "Warranty End Date": a.warrantyEndDate ?? "",
      "Status": STATUS_LABELS[a.assetStatus],
      "Description": a.description,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Assets")
    XLSX.writeFile(wb, `asset-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast("Export successful", `${rows.length} asset${rows.length !== 1 ? "s" : ""} exported`)
  }

  async function handleImport(rows: Record<string, string>[]) {
    const res = await fetch("/api/assets/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows),
    })
    const json = await res.json()
    const result = json.data ?? json
    await loadAssets()
    setShowImport(false)
    showToast("Import complete", `${result.created} asset${result.created !== 1 ? "s" : ""} imported${result.failed > 0 ? `, ${result.failed} failed` : ""}`)
  }

  async function handleAddAsset(data: Omit<Asset, "id" | "createdAt" | "updatedAt" | "baseCategory" | "category">) {
    try {
      const res = await fetch("/api/assets", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      })
      const json = await res.json()
      const asset = json.data
      setAssets((p) => [asset, ...p])
      setShowAdd(false)
      showToast("Asset added", `${data.itemName} has been added to inventory`)
    } catch { showToast("Error", "Failed to add asset") }
  }

  async function handleEditAsset(data: Omit<Asset, "id" | "createdAt" | "updatedAt" | "baseCategory" | "category">) {
    if (!editAsset) return
    try {
      const res = await fetch(`/api/assets/${editAsset.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      })
      const json = await res.json()
      const updated = json.data
      setAssets((p) => p.map((a) => a.id === editAsset.id ? updated : a))
      setEditAsset(null)
      showToast("Asset updated", `${data.itemName} has been saved`)
    } catch { showToast("Error", "Failed to update asset") }
  }

  async function handleDelete() {
    if (!deleteAsset) return
    try {
      await fetch(`/api/assets/${deleteAsset.id}`, { method: "DELETE" })
      setAssets((p) => p.filter((a) => a.id !== deleteAsset.id))
      setSelected((p) => { const s = new Set(p); s.delete(deleteAsset.id); return s })
      showToast("Asset deleted", `${deleteAsset.itemName} has been removed`)
      setDeleteAsset(null)
    } catch { showToast("Error", "Failed to delete asset") }
  }

  async function handleBulkDelete() {
    const ids = [...selected].filter((id) => filteredIds.has(id))
    try {
      await fetch("/api/assets/bulk-delete", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
      })
      setAssets((p) => p.filter((a) => !selected.has(a.id)))
      setSelected(new Set()); setShowBulkDelete(false)
      showToast(`${ids.length} asset${ids.length !== 1 ? "s" : ""} deleted`, "Selected assets have been removed")
    } catch { showToast("Error", "Failed to delete assets") }
  }

  return (
    <>
      <div className="p-4 sm:p-6">
        {/* Fiscal Budget Widget */}
        {(() => {
          const currentFY = getCurrentFY()
          const viewFY = selectedFY || currentFY
          const viewBudget = fiscalBudgets.find((b) => b.fiscalYear === viewFY)
          const total = viewBudget
            ? viewBudget.q1Amount + viewBudget.q2Amount + viewBudget.q3Amount + viewBudget.q4Amount
            : 0

          function fmtAmt(n: number) {
            if (n === 0) return "—"
            if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`
            if (n >= 1_000)   return `₹${(n / 1_000).toFixed(0)}K`
            return `₹${n.toLocaleString()}`
          }

          const quarters = viewBudget
            ? [
                { label: "Q1 (Apr–Jun)", amount: viewBudget.q1Amount },
                { label: "Q2 (Jul–Sep)", amount: viewBudget.q2Amount },
                { label: "Q3 (Oct–Dec)", amount: viewBudget.q3Amount },
                { label: "Q4 (Jan–Mar)", amount: viewBudget.q4Amount },
              ]
            : []

          return (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 mb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">Asset Budget</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {viewBudget ? `Total allocated: ${fmtAmt(total)}` : "No budget set for this fiscal year"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Year selector — always shows all FYs */}
                  <select
                    value={viewFY}
                    onChange={(e) => setSelectedFY(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white"
                  >
                    {getAllFYears().map((fy) => (
                      <option key={fy} value={fy}>
                        {fy}{fy === currentFY ? " (Current)" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowAllBudgets((v) => !v)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    {showAllBudgets ? "Hide all" : "All years"}
                    <ChevronRight className={cn("w-3 h-3 transition-transform", showAllBudgets && "rotate-90")} />
                  </button>
                  {viewBudget ? (
                    <button
                      onClick={() => { setEditFiscalBudget(viewBudget); setShowBudgetModal(true) }}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Edit Budget
                    </button>
                  ) : (
                    <button
                      onClick={() => { setEditFiscalBudget(undefined); setShowBudgetModal(true) }}
                      className="px-3 py-1.5 text-xs font-medium bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors"
                    >
                      + Set Budget
                    </button>
                  )}
                </div>
              </div>

              {/* Quarter breakdown for selected FY */}
              {viewBudget && quarters.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
                  {quarters.map(({ label, amount }) => (
                    <div key={label} className="text-center">
                      <p className="text-[10px] text-gray-400 font-medium">{label}</p>
                      <p className="text-sm font-bold text-gray-800 mt-0.5">{fmtAmt(amount)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* All years expanded list */}
              {showAllBudgets && fiscalBudgets.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                  {fiscalBudgets.map((b) => {
                    const t = b.q1Amount + b.q2Amount + b.q3Amount + b.q4Amount
                    return (
                      <div
                        key={b.id}
                        className={cn("flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 group cursor-pointer", b.fiscalYear === viewFY && "bg-accent-50/60")}
                        onClick={() => setSelectedFY(b.fiscalYear)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-gray-700">{b.fiscalYear}</span>
                          {b.fiscalYear === currentFY && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-accent-100 text-accent-700 rounded">Current</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-3 text-[10px] text-gray-500">
                            <span>Q1: {fmtAmt(b.q1Amount)}</span>
                            <span>Q2: {fmtAmt(b.q2Amount)}</span>
                            <span>Q3: {fmtAmt(b.q3Amount)}</span>
                            <span>Q4: {fmtAmt(b.q4Amount)}</span>
                          </div>
                          <span className="text-xs font-bold text-gray-800 min-w-[60px] text-right">{fmtAmt(t)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditFiscalBudget(b); setShowBudgetModal(true) }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-accent-600 hover:bg-accent-50 rounded transition-all"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  <button
                    onClick={() => { setEditFiscalBudget(undefined); setShowBudgetModal(true) }}
                    className="w-full py-2 text-xs text-accent-600 hover:bg-accent-50 rounded-lg transition-colors font-medium"
                  >
                    + Add Fiscal Year Budget
                  </button>
                </div>
              )}
            </div>
          )
        })()}

        <div className="bg-white rounded-xl border border-gray-200">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">All Assets</h2>
                <p className="text-xs text-gray-400 mt-0.5">{filtered.length} of {assets.length} assets</p>
              </div>
              {selectedCount > 0 && (
                <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200">
                  <span className="text-xs font-semibold text-accent-700 bg-accent-50 px-2 py-0.5 rounded-full">{selectedCount} selected</span>
                  <button onClick={() => setShowBulkDelete(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                    <Trash2 className="w-3 h-3" /> Delete Selected
                  </button>
                  <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterCount > 0 && (
                <button onClick={clearFilters}
                  className="flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
                  <X className="w-3 h-3" /> {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
                </button>
              )}
              <button onClick={() => setShowFilters((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition-colors",
                  showFilters
                    ? "border-accent-200 bg-accent-50 text-accent-600 hover:bg-accent-100"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}>
                {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
                Filters
              </button>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets…"
                  className="pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:bg-white w-52" />
              </div>
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              <button onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Asset
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                  <th className="pl-4 pr-2 py-3 w-8">
                    <input type="checkbox" checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 accent-[var(--color-accent-600)] cursor-pointer" />
                  </th>
                  <th className="px-2 py-3 font-semibold text-center w-10">S.No</th>
                  <th className="text-left px-4 py-3 font-semibold">Item</th>
                  <th className="text-left px-4 py-3 font-semibold">Serial No.</th>
                  <th className="text-left px-4 py-3 font-semibold">Type</th>
                  <th className="text-left px-4 py-3 font-semibold">Category</th>
                  <th className="text-left px-4 py-3 font-semibold">Location</th>
                  <th className="text-left px-4 py-3 font-semibold">Condition</th>
                  <th className="text-left px-4 py-3 font-semibold">Warranty End</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Actions</th>
                </tr>
                {showFilters && (
                  <tr className="border-b border-accent-100 bg-accent-50/30">
                    <td colSpan={11} className="px-4 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Item / Code</label>
                          <input value={filters.item} onChange={(e) => setFilters((f) => ({ ...f, item: e.target.value }))}
                            placeholder="Filter item…"
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Serial No.</label>
                          <input value={filters.serialNumber} onChange={(e) => setFilters((f) => ({ ...f, serialNumber: e.target.value }))}
                            placeholder="Filter serial…"
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Type</label>
                          <select value={filters.assetType} onChange={(e) => setFilters((f) => ({ ...f, assetType: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                            <option value="">All Types</option>
                            <option value="Fixed">Fixed</option>
                            <option value="Consumable">Consumable</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Category</label>
                          <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                            <option value="">All Categories</option>
                            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Location</label>
                          <select value={filters.location} onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                            <option value="">All Locations</option>
                            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Condition</label>
                          <select value={filters.condition} onChange={(e) => setFilters((f) => ({ ...f, condition: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                            <option value="">All Conditions</option>
                            <option value="New">New</option>
                            <option value="Good">Good</option>
                            <option value="Fair">Fair</option>
                            <option value="Poor">Poor</option>
                            <option value="Damaged">Damaged</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Status</label>
                          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white">
                            <option value="">All Statuses</option>
                            <option value="Available">Available</option>
                            <option value="Assigned">Assigned</option>
                            <option value="InRepair">In Repair</option>
                            <option value="Retired">Retired</option>
                          </select>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="px-4 py-16 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading assets…</div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400">
                    {search ? "No assets match your search" : "No assets yet — click Add Asset to get started"}
                  </td></tr>
                ) : paginated.map((asset, idx) => {
                  const isSel = selected.has(asset.id)
                  return (
                    <tr key={asset.id} className={cn("border-t border-gray-100 transition-colors", isSel ? "bg-blue-50/60" : "hover:bg-gray-50/60")}>
                      <td className="pl-4 pr-2 py-3">
                        <input type="checkbox" checked={isSel} onChange={() => toggleSelect(asset.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 accent-[var(--color-accent-600)] cursor-pointer" />
                      </td>
                      <td className="px-2 py-3 text-center text-gray-400 font-medium">{(page - 1) * pageSize + idx + 1}</td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {(() => { const { icon: Icon, color } = getAssetIcon(asset); return <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", color)}><Icon className="w-4 h-4" /></div> })()}
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 truncate">{asset.itemName}</p>
                            <p className="text-gray-400 text-[10px] font-mono">{asset.itemCode}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 font-mono text-gray-600">{asset.serialNumber}</td>

                      <td className="px-4 py-3">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold",
                          asset.assetType === "Fixed" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700")}>
                          {asset.assetType}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <p className="text-gray-700 font-medium">{asset.category?.name ?? "—"}</p>
                        <p className="text-gray-400 text-[10px]">{asset.baseCategory?.name ?? ""}</p>
                      </td>

                      <td className="px-4 py-3 text-gray-600">{asset.location}</td>

                      <td className="px-4 py-3">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", {
                          "bg-green-100 text-green-700": asset.condition === "New",
                          "bg-blue-100 text-blue-700": asset.condition === "Good",
                          "bg-yellow-100 text-yellow-700": asset.condition === "Fair",
                          "bg-orange-100 text-orange-700": asset.condition === "Poor",
                          "bg-red-100 text-red-700": asset.condition === "Damaged",
                        })}>
                          {asset.condition}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-gray-500">
                        {asset.warrantyEndDate
                          ? new Date(asset.warrantyEndDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                          : "—"}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit", STATUS_STYLES[asset.assetStatus])}>
                            {STATUS_LABELS[asset.assetStatus]}
                          </span>
                          {(() => {
                            const rep = asset.replacementsReceived?.[0]
                            if (!rep?.isActive) return null
                            return rep.type === "Temporary" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-700 w-fit">
                                Temp Replacement{rep.endDate ? ` until ${new Date(rep.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 w-fit">
                                Perm Replacement
                              </span>
                            )
                          })()}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditAsset(asset)} title="Edit"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteAsset(asset)} title="Delete"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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

      {showImport && <ImportAssetModal onClose={() => setShowImport(false)} onImport={handleImport} />}
      {showAdd && <AddEditAssetModal onClose={() => setShowAdd(false)} onSave={handleAddAsset} />}
      {editAsset && <AddEditAssetModal asset={editAsset} onClose={() => setEditAsset(null)} onSave={handleEditAsset} />}
      {showBudgetModal && (
        <FiscalBudgetModal
          budget={editFiscalBudget}
          defaultFiscalYear={editFiscalBudget ? undefined : selectedFY || undefined}
          onClose={() => { setShowBudgetModal(false); setEditFiscalBudget(undefined) }}
          onSave={handleSaveFiscalBudget}
        />
      )}

      {deleteAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Delete Asset</h2>
              <button onClick={() => setDeleteAsset(null)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-6 flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Delete <span className="text-red-600">{deleteAsset.itemName}</span>?</p>
                <p className="text-xs text-gray-500 mt-2">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setDeleteAsset(null)} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDelete} className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Delete Selected Assets</h2>
              <button onClick={() => setShowBulkDelete(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-6 flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Delete <span className="text-red-600">{selectedCount} asset{selectedCount !== 1 ? "s" : ""}</span>?</p>
                <p className="text-xs text-gray-500 mt-2">This cannot be undone.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowBulkDelete(false)} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
              <button onClick={handleBulkDelete} className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Delete {selectedCount}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={cn("fixed bottom-6 right-6 z-50 transition-all duration-500", toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none")}>
        {toast && (
          <div className="bg-gray-900 text-white rounded-xl shadow-2xl px-4 py-3 flex flex-col gap-2 min-w-[280px]">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{toast.message}</p>
                <p className="text-xs text-gray-400 mt-0.5">{toast.sub}</p>
              </div>
              <button onClick={() => setToast(null)} className="text-gray-500 hover:text-white ml-1"><X className="w-3.5 h-3.5" /></button>
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
