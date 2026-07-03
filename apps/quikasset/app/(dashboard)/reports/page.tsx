"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts"
import {
  Download, Loader2, Pencil, Trash2, Plus, BarChart2,
  AlertTriangle, Wallet, RefreshCw,
} from "lucide-react"
import * as XLSX from "xlsx"
import { cn } from "@/lib/utils"
import FiscalBudgetModal, { type FiscalBudget, type FiscalBudgetFormData } from "@/components/assets/FiscalBudgetModal"

// ─── Types ────────────────────────────────────────────────────────────────────

type OverviewData = {
  totalAssets: number
  totalPortfolioValue: number
  assignedCount: number
  availableCount: number
  inRepairCount: number
  retiredCount: number
  totalRepairSpend: number
  ytdRepairSpend: number
  avgRepairCost: number
  idleAssetCount: number
  idleAssetValue: number
  budgetUtilPct: number | null
  monthlyRepairSpend: { month: string; amount: number }[]
}

type AssetValueRow = {
  id: string
  itemName: string
  itemCode: string
  category: string
  baseCategory: string
  purchaseDate: string
  price: number
  assetStatus: string
  condition?: string | null
  totalRepairCost?: number | null
  tco?: number | null
}

type RepairCostsData = {
  summary: {
    totalRepairs: number
    totalEstimated: number
    totalActual: number
    totalVariance: number
  }
  monthly: { month: string; estimated: number; actual: number }[]
  byVendor: { vendor: string; count: number; totalActual: number }[]
  byCategory: { category: string; totalActual: number }[]
  repairs: {
    id: string
    assetName: string
    assetCode: string
    category: string
    issueTitle: string
    vendor: string
    sentDate: string
    estimatedCost: number
    actualCost: number
    variance: number
    status: string
  }[]
}

type DeptRow = {
  department: string
  employeeCount: number
  assetCount: number
  totalAssetValue: number
  totalRepairCost: number
  totalSpend: number
}

type UtilizationData = {
  summary: {
    total: number
    assigned: number
    available: number
    inRepair: number
    retired: number
    assignedPct: number
    availablePct: number
    inRepairPct: number
    retiredPct: number
  }
  idleAssets: {
    id: string
    itemName: string
    itemCode: string
    category: string
    price: number
    daysIdle: number
    lastAssigned: string | null
  }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Asset Value", "Repair Costs", "Departments", "Budgets", "Utilization"] as const
type Tab = typeof TABS[number]

const REPAIR_STATUS_STYLES: Record<string, string> = {
  Pending:      "bg-yellow-50 text-yellow-700 border border-yellow-200",
  InRepair:     "bg-orange-50 text-orange-700 border border-orange-200",
  Repaired:     "bg-blue-50 text-blue-700 border border-blue-200",
  Recovered:    "bg-green-50 text-green-700 border border-green-200",
  Unrepairable: "bg-red-50 text-red-600 border border-red-200",
}

// ─── Shared Utilities ─────────────────────────────────────────────────────────

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—"
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n.toLocaleString()}`
}

function fmtDate(s?: string | null) {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function downloadExcel(rows: Record<string, unknown>[], sheetName: string, fileName: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, fileName)
}

// ─── Small shared components ──────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color,
}: {
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div className={cn("rounded-xl border p-4 flex flex-col gap-1", color)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-[11px] opacity-60">{sub}</p>}
    </div>
  )
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Loading…
    </div>
  )
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
      <BarChart2 className="w-8 h-8 text-gray-200" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch("/api/reports/overview")
      if (!res.ok) throw new Error()
      const json = await res.json()
      if (json.success === false) throw new Error()
      setData(json.data ?? null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleDownload() {
    if (!data) return
    const kpiRows = [
      { Metric: "Portfolio Value",    Value: data.totalPortfolioValue },
      { Metric: "YTD Repair Spend",   Value: data.ytdRepairSpend },
      { Metric: "Avg Repair Cost",    Value: data.avgRepairCost },
      { Metric: "Budget Util %",      Value: data.budgetUtilPct ?? "—" },
      { Metric: "Idle Assets",        Value: data.idleAssetCount },
      { Metric: "Idle Asset Value",   Value: data.idleAssetValue },
      { Metric: "Assets in Repair",   Value: data.inRepairCount },
      { Metric: "Fleet Size",         Value: data.totalAssets },
    ]
    const monthlyRows = data.monthlyRepairSpend.map((m) => ({
      Month: m.month, "Repair Spend": m.amount,
    }))
    downloadExcel([...kpiRows, {}, ...monthlyRows], "Overview", "reports-overview.xlsx")
  }

  if (loading) return <LoadingBlock />
  if (error)   return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <p className="text-sm text-red-500">Failed to load overview data.</p>
      <button onClick={load} className="px-4 py-2 text-xs font-medium bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors">Retry</button>
    </div>
  )
  if (!data)   return <EmptyBlock label="Could not load overview data" />

  const statusPie = [
    { name: "Assigned",  value: data.assignedCount,  color: "#3b82f6" },
    { name: "Available", value: data.availableCount,  color: "#22c55e" },
    { name: "In Repair", value: data.inRepairCount,   color: "#f97316" },
    { name: "Retired",   value: data.retiredCount,    color: "#9ca3af" },
  ]

  return (
    <div className="space-y-5">
      {/* Actions */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <p className="text-xs text-gray-500">Live snapshot of asset fleet performance</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard label="Portfolio Value"   value={fmtCurrency(data.totalPortfolioValue)} color="bg-blue-50 border-blue-100 text-blue-900" />
        <KpiCard label="YTD Repair Spend"  value={fmtCurrency(data.ytdRepairSpend)}      color="bg-orange-50 border-orange-100 text-orange-900" />
        <KpiCard label="Avg Repair Cost"   value={fmtCurrency(data.avgRepairCost)}        color="bg-gray-50 border-gray-200 text-gray-900" />
        <KpiCard
          label="Budget Util"
          value={data.budgetUtilPct != null ? `${data.budgetUtilPct}%` : "No budgets"}
          color="bg-purple-50 border-purple-100 text-purple-900"
        />
        <KpiCard
          label="Idle Assets"
          value={String(data.idleAssetCount)}
          sub={fmtCurrency(data.idleAssetValue)}
          color="bg-yellow-50 border-yellow-100 text-yellow-900"
        />
        <KpiCard label="In Repair"   value={String(data.inRepairCount)} color="bg-red-50 border-red-100 text-red-900" />
        <KpiCard label="Fleet Size"  value={String(data.totalAssets)}   color="bg-green-50 border-green-100 text-green-900" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly Repair Spend Bar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-700 mb-4">Monthly Repair Spend</p>
          {data.monthlyRepairSpend.length === 0 ? (
            <EmptyBlock label="No monthly data" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.monthlyRepairSpend} barSize={18}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => fmtCurrency(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v: number) => [fmtCurrency(v), "Spend"]} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {data.monthlyRepairSpend.map((_, i) => (
                    <Cell key={i} fill="#f97316" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Asset Status Donut */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-700 mb-4">Asset Status</p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={statusPie}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={2}
              >
                {statusPie.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number, name: string) => [v, name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {statusPie.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span className="text-[10px] text-gray-600">{s.name} ({s.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Asset Value ─────────────────────────────────────────────────────────

function AssetValueTab() {
  const [rows, setRows]         = useState<AssetValueRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState("")
  const [catFilter, setCatFilter]   = useState("")
  const [statusFilter, setStatusFilter] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const json = await fetch("/api/reports/asset-value").then((r) => r.json())
      const data: AssetValueRow[] = json.data ?? []
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const categories  = Array.from(new Set(rows.map((r) => r.category))).filter(Boolean)
  const statuses    = Array.from(new Set(rows.map((r) => r.assetStatus))).filter(Boolean)

  const filtered = rows.filter((r) => {
    if (search && !r.itemName.toLowerCase().includes(search.toLowerCase()) && !r.itemCode.toLowerCase().includes(search.toLowerCase())) return false
    if (catFilter    && r.category   !== catFilter)    return false
    if (statusFilter && r.assetStatus !== statusFilter) return false
    return true
  })

  const totalPrice       = filtered.reduce((s, r) => s + (r.price ?? 0), 0)
  const totalRepairCost  = filtered.reduce((s, r) => s + (r.totalRepairCost ?? 0), 0)
  const totalTCO         = filtered.reduce((s, r) => s + (r.tco ?? 0), 0)

  function handleDownload() {
    const out = filtered.map((r, i) => ({
      "S.No":           i + 1,
      "Asset":          r.itemName,
      "Code":           r.itemCode,
      "Category":       r.category,
      "Base Category":  r.baseCategory,
      "Purchase Date":  fmtDate(r.purchaseDate),
      "Purchase Price": r.price,
      "Condition":      r.condition ?? "—",
      "Status":         r.assetStatus,
      "Repair Cost":    r.totalRepairCost ?? "—",
      "TCO":            r.tco ?? "—",
    }))
    downloadExcel(out, "Asset Value", "reports-asset-value.xlsx")
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Total Portfolio Value" value={fmtCurrency(rows.reduce((s, r) => s + r.price, 0))} color="bg-blue-50 border-blue-100 text-blue-900" />
        <KpiCard label="Total Repair Cost"     value={fmtCurrency(rows.reduce((s, r) => s + (r.totalRepairCost ?? 0), 0))} color="bg-orange-50 border-orange-100 text-orange-900" />
        <KpiCard label="Total TCO"             value={fmtCurrency(rows.reduce((s, r) => s + (r.tco ?? 0), 0))} color="bg-purple-50 border-purple-100 text-purple-900" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name / code…"
          className="px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent-400 w-48"
        />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400">
          <option value="">All Statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(search || catFilter || statusFilter) && (
          <button onClick={() => { setSearch(""); setCatFilter(""); setStatusFilter("") }} className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1.5 hover:bg-gray-100 rounded-lg transition-colors">Clear</button>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? <LoadingBlock /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-semibold w-10">S.No</th>
                  <th className="text-left px-4 py-3 font-semibold">Asset</th>
                  <th className="text-left px-4 py-3 font-semibold">Code</th>
                  <th className="text-left px-4 py-3 font-semibold">Category</th>
                  <th className="text-left px-4 py-3 font-semibold">Base Category</th>
                  <th className="text-left px-4 py-3 font-semibold">Purchase Date</th>
                  <th className="text-right px-4 py-3 font-semibold">Purchase Price</th>
                  <th className="text-left px-4 py-3 font-semibold">Condition</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Repair Cost</th>
                  <th className="text-right px-4 py-3 font-semibold">TCO</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-14 text-center text-gray-400">No assets found</td></tr>
                ) : filtered.map((r, i) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-[180px] truncate">{r.itemName}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-[10px]">{r.itemCode}</td>
                    <td className="px-4 py-3 text-gray-600">{r.category}</td>
                    <td className="px-4 py-3 text-gray-500">{r.baseCategory}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(r.purchaseDate)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium whitespace-nowrap">{fmtCurrency(r.price)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.condition ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{r.assetStatus}</td>
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtCurrency(r.totalRepairCost)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.tco != null
                        ? <span className={cn("font-medium", r.tco > r.price ? "text-orange-600" : "text-gray-700")}>{fmtCurrency(r.tco)}</span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                    <td colSpan={6} className="px-4 py-3 text-xs text-gray-600">Totals ({filtered.length} assets)</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-800 whitespace-nowrap">{fmtCurrency(totalPrice)}</td>
                    <td /><td />
                    <td className="px-4 py-3 text-right text-xs text-gray-800 whitespace-nowrap">{fmtCurrency(totalRepairCost)}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-800 whitespace-nowrap">{fmtCurrency(totalTCO)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Repair Costs ────────────────────────────────────────────────────────

function RepairCostsTab() {
  const [data, setData]         = useState<RepairCostsData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [from, setFrom]         = useState("")
  const [to, setTo]             = useState("")
  const [catFilter, setCatFilter]       = useState("")
  const [statusFilter, setStatusFilter] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set("from", from)
      if (to)   params.set("to", to)
      const res = await fetch(`/api/reports/repair-costs?${params}`)
      const json = await res.json()
      setData(json.data ?? null)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])

  const categories = data ? Array.from(new Set(data.repairs.map((r) => r.category))) : []
  const statuses   = data ? Array.from(new Set(data.repairs.map((r) => r.status))) : []

  const filteredRepairs = (data?.repairs ?? []).filter((r) => {
    if (catFilter    && r.category !== catFilter) return false
    if (statusFilter && r.status   !== statusFilter) return false
    return true
  })

  function handleDownload() {
    const out = filteredRepairs.map((r) => ({
      Asset:       r.assetName,
      Code:        r.assetCode,
      Category:    r.category,
      Issue:       r.issueTitle,
      Vendor:      r.vendor,
      "Sent Date": fmtDate(r.sentDate),
      Estimated:   r.estimatedCost,
      Actual:      r.actualCost,
      Variance:    r.variance,
      Status:      r.status,
    }))
    downloadExcel(out, "Repair Costs", "reports-repair-costs.xlsx")
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400" />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400">
          <option value="">All Statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(from || to || catFilter || statusFilter) && (
          <button onClick={() => { setFrom(""); setTo(""); setCatFilter(""); setStatusFilter("") }} className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1.5 hover:bg-gray-100 rounded-lg transition-colors">Clear</button>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDownload} disabled={!data} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {loading ? <LoadingBlock /> : !data ? <EmptyBlock label="Could not load repair cost data" /> : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Total Repairs"    value={String(data.summary.totalRepairs)}              color="bg-gray-50 border-gray-200 text-gray-900" />
            <KpiCard label="Total Estimated"  value={fmtCurrency(data.summary.totalEstimated)}       color="bg-blue-50 border-blue-100 text-blue-900" />
            <KpiCard label="Total Actual"     value={fmtCurrency(data.summary.totalActual)}          color="bg-orange-50 border-orange-100 text-orange-900" />
            <KpiCard
              label="Total Variance"
              value={fmtCurrency(Math.abs(data.summary.totalVariance))}
              sub={data.summary.totalVariance > 0 ? "Over budget" : data.summary.totalVariance < 0 ? "Under budget" : "On target"}
              color={data.summary.totalVariance > 0 ? "bg-red-50 border-red-100 text-red-900" : "bg-green-50 border-green-100 text-green-900"}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Monthly Estimated vs Actual */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-700 mb-4">Estimated vs Actual (Monthly)</p>
              {data.monthly.length === 0 ? <EmptyBlock label="No monthly data" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.monthly} barSize={12}>
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => fmtCurrency(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip formatter={(v: number, name: string) => [fmtCurrency(v), name]} />
                    <Bar dataKey="estimated" name="Estimated" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="actual"    name="Actual"    fill="#f97316" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Top Vendors */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-700 mb-4">Top Vendors by Spend</p>
              {data.byVendor.length === 0 ? <EmptyBlock label="No vendor data" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.byVendor.slice(0, 8)} layout="vertical" barSize={12}>
                    <XAxis type="number" tickFormatter={(v) => fmtCurrency(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="vendor" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                    <Tooltip formatter={(v: number) => [fmtCurrency(v), "Actual Spend"]} />
                    <Bar dataKey="totalActual" fill="#6366f1" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Repairs Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-semibold">Asset</th>
                    <th className="text-left px-4 py-3 font-semibold">Code</th>
                    <th className="text-left px-4 py-3 font-semibold">Category</th>
                    <th className="text-left px-4 py-3 font-semibold">Issue</th>
                    <th className="text-left px-4 py-3 font-semibold">Vendor</th>
                    <th className="text-left px-4 py-3 font-semibold">Sent Date</th>
                    <th className="text-right px-4 py-3 font-semibold">Estimated</th>
                    <th className="text-right px-4 py-3 font-semibold">Actual</th>
                    <th className="text-right px-4 py-3 font-semibold">Variance</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRepairs.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-14 text-center text-gray-400">No repairs found</td></tr>
                  ) : filteredRepairs.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-[140px] truncate">{r.assetName}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-[10px]">{r.assetCode}</td>
                      <td className="px-4 py-3 text-gray-600">{r.category}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">{r.issueTitle}</td>
                      <td className="px-4 py-3 text-gray-500">{r.vendor || "—"}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(r.sentDate)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtCurrency(r.estimatedCost)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-medium whitespace-nowrap">{fmtCurrency(r.actualCost)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={cn("font-medium", r.variance > 0 ? "text-red-600" : r.variance < 0 ? "text-green-600" : "text-gray-500")}>
                          {r.variance > 0 ? "+" : ""}{fmtCurrency(r.variance)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium", REPAIR_STATUS_STYLES[r.status] ?? "bg-gray-50 text-gray-600 border border-gray-200")}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab: Departments ─────────────────────────────────────────────────────────

function DepartmentsTab() {
  const [rows, setRows]       = useState<DeptRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const json = await fetch("/api/reports/department-costs").then((r) => r.json())
      const data: DeptRow[] = json.data ?? []
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const totals = {
    employeeCount:   rows.reduce((s, r) => s + r.employeeCount, 0),
    assetCount:      rows.reduce((s, r) => s + r.assetCount, 0),
    totalAssetValue: rows.reduce((s, r) => s + r.totalAssetValue, 0),
    totalRepairCost: rows.reduce((s, r) => s + r.totalRepairCost, 0),
    totalSpend:      rows.reduce((s, r) => s + r.totalSpend, 0),
  }

  function handleDownload() {
    const out = rows.map((r) => ({
      Department:     r.department,
      Employees:      r.employeeCount,
      Assets:         r.assetCount,
      "Asset Value":  r.totalAssetValue,
      "Repair Cost":  r.totalRepairCost,
      "Total Spend":  r.totalSpend,
    }))
    downloadExcel(out, "Departments", "reports-departments.xlsx")
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleDownload} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
          <Download className="w-3.5 h-3.5" /> Export Excel
        </button>
      </div>

      {loading ? <LoadingBlock /> : rows.length === 0 ? <EmptyBlock label="No department data" /> : (
        <>
          {/* Bar chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-700 mb-4">Total Spend by Department</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rows} barSize={24}>
                <XAxis dataKey="department" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => fmtCurrency(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={65} />
                <Tooltip formatter={(v: number) => [fmtCurrency(v), "Total Spend"]} />
                <Bar dataKey="totalSpend" radius={[4, 4, 0, 0]}>
                  {rows.map((_, i) => {
                    const colors = ["#3b82f6", "#8b5cf6", "#22c55e", "#f97316", "#6366f1", "#f59e0b", "#ef4444", "#14b8a6"]
                    return <Cell key={i} fill={colors[i % colors.length]} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-semibold">Department</th>
                    <th className="text-right px-4 py-3 font-semibold">Employees</th>
                    <th className="text-right px-4 py-3 font-semibold">Assets</th>
                    <th className="text-right px-4 py-3 font-semibold">Asset Value</th>
                    <th className="text-right px-4 py-3 font-semibold">Repair Cost</th>
                    <th className="text-right px-4 py-3 font-semibold">Total Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.department} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors cursor-default">
                      <td className="px-4 py-3 font-medium text-gray-800">{r.department}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{r.employeeCount}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{r.assetCount}</td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{fmtCurrency(r.totalAssetValue)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtCurrency(r.totalRepairCost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{fmtCurrency(r.totalSpend)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-xs text-gray-600">Totals</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-800">{totals.employeeCount}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-800">{totals.assetCount}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-800 whitespace-nowrap">{fmtCurrency(totals.totalAssetValue)}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-800 whitespace-nowrap">{fmtCurrency(totals.totalRepairCost)}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-800 whitespace-nowrap">{fmtCurrency(totals.totalSpend)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab: Budgets ─────────────────────────────────────────────────────────────

function BudgetsTab() {
  const [budgets, setBudgets]     = useState<FiscalBudget[]>([])
  const [actuals, setActuals]     = useState<Record<string, { q1: number; q2: number; q3: number; q4: number }>>({})
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editBudget, setEditBudget] = useState<FiscalBudget | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<FiscalBudget | null>(null)
  const [deleting, setDeleting]   = useState(false)
  const [selectedChartFY, setSelectedChartFY] = useState<string>("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [bsJson, acJson] = await Promise.all([
        fetch("/api/fiscal-budgets").then((r) => r.json()),
        fetch("/api/reports/budgets").then((r) => r.json()),
      ])
      const bs: FiscalBudget[] = bsJson.data ?? []
      const ac = acJson.data ?? {}
      setBudgets(bs)
      setActuals(ac)
      setSelectedChartFY((prev) => {
        if (prev) return prev
        const now = new Date()
        const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
        const currentFY = `FY ${fyStart}-${String(fyStart + 1).slice(-2)}`
        return bs.find((b) => b.fiscalYear === currentFY)?.fiscalYear ?? bs[0]?.fiscalYear ?? ""
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave(data: FiscalBudgetFormData) {
    const url = editBudget ? `/api/fiscal-budgets/${editBudget.id}` : "/api/fiscal-budgets"
    const method = editBudget ? "PUT" : "POST"
    await fetch(url, {
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
    setShowModal(false)
    setEditBudget(undefined)
    await load()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await fetch(`/api/fiscal-budgets/${deleteTarget.id}`, { method: "DELETE" })
    setDeleteTarget(null)
    setDeleting(false)
    await load()
  }

  function handleDownload() {
    const rows = budgets.map((b) => {
      const ac = actuals[b.fiscalYear] ?? { q1: 0, q2: 0, q3: 0, q4: 0 }
      const totalBudget = b.q1Amount + b.q2Amount + b.q3Amount + b.q4Amount
      const totalActual = ac.q1 + ac.q2 + ac.q3 + ac.q4
      return {
        "Fiscal Year": b.fiscalYear,
        "Q1 Budget": b.q1Amount, "Q1 Actual": ac.q1,
        "Q2 Budget": b.q2Amount, "Q2 Actual": ac.q2,
        "Q3 Budget": b.q3Amount, "Q3 Actual": ac.q3,
        "Q4 Budget": b.q4Amount, "Q4 Actual": ac.q4,
        "Total Budget": totalBudget,
        "Total Actual": totalActual,
        "Variance": totalBudget - totalActual,
        "Utilization %": totalBudget > 0 ? `${Math.round((totalActual / totalBudget) * 100)}%` : "—",
      }
    })
    downloadExcel(rows, "Budgets", "reports-budgets.xlsx")
  }

  const totalBudget = budgets.reduce((s, b) => s + b.q1Amount + b.q2Amount + b.q3Amount + b.q4Amount, 0)
  const totalActual = Object.values(actuals).reduce((s, a) => s + a.q1 + a.q2 + a.q3 + a.q4, 0)

  const now = new Date()
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  const currentFY = `FY ${fyStart}-${String(fyStart + 1).slice(-2)}`
  const chartBudget = budgets.find((b) => b.fiscalYear === selectedChartFY) ?? budgets.find((b) => b.fiscalYear === currentFY) ?? budgets[0]
  const chartActuals = chartBudget ? (actuals[chartBudget.fiscalYear] ?? { q1: 0, q2: 0, q3: 0, q4: 0 }) : null
  const chartData = chartBudget && chartActuals ? [
    { quarter: "Q1 (Apr–Jun)", budget: chartBudget.q1Amount, actual: chartActuals.q1 },
    { quarter: "Q2 (Jul–Sep)", budget: chartBudget.q2Amount, actual: chartActuals.q2 },
    { quarter: "Q3 (Oct–Dec)", budget: chartBudget.q3Amount, actual: chartActuals.q3 },
    { quarter: "Q4 (Jan–Mar)", budget: chartBudget.q4Amount, actual: chartActuals.q4 },
  ] : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div />
        <div className="flex flex-wrap gap-2">
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={handleDownload} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"><Download className="w-3.5 h-3.5" /> Export Excel</button>
          <button onClick={() => { setEditBudget(undefined); setShowModal(true) }} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors"><Plus className="w-3.5 h-3.5" /> Add Fiscal Year</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Total Allocated"    value={fmtCurrency(totalBudget)}          color="bg-blue-50 border-blue-100 text-blue-900" />
        <KpiCard label="Total Actual Spend" value={fmtCurrency(totalActual)}          color="bg-orange-50 border-orange-100 text-orange-900" />
        <KpiCard label="Variance"           value={fmtCurrency(totalBudget - totalActual)} color={totalBudget - totalActual >= 0 ? "bg-green-50 border-green-100 text-green-900" : "bg-red-50 border-red-100 text-red-900"} />
      </div>

      {/* Chart for selected FY */}
      {chartBudget && chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-gray-700">Budget vs Actual</p>
            {budgets.length > 1 && (
              <select
                value={selectedChartFY || chartBudget.fiscalYear}
                onChange={(e) => setSelectedChartFY(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white"
              >
                {budgets.map((b) => (
                  <option key={b.id} value={b.fiscalYear}>
                    {b.fiscalYear}{b.fiscalYear === currentFY ? " (Current)" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mb-4">Asset purchases + repair costs per quarter</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barSize={22} barGap={4}>
              <XAxis dataKey="quarter" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => fmtCurrency(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={65} />
              <Tooltip formatter={(v: number, name: string) => [fmtCurrency(v), name === "budget" ? "Budget" : "Actual"]} />
              <Bar dataKey="budget" fill="#93c5fd" radius={[4, 4, 0, 0]} name="budget" />
              <Bar dataKey="actual" fill="#3b82f6" radius={[4, 4, 0, 0]} name="actual" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#93c5fd] inline-block" /><span className="text-[10px] text-gray-500">Budget</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#3b82f6] inline-block" /><span className="text-[10px] text-gray-500">Actual</span></div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? <LoadingBlock /> : budgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
            <Wallet className="w-8 h-8 text-gray-200" />
            <p className="text-sm">No fiscal budgets yet. Click &ldquo;Add Fiscal Year&rdquo; to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-semibold">Fiscal Year</th>
                  <th className="text-right px-4 py-3 font-semibold">Q1 Budget</th>
                  <th className="text-right px-4 py-3 font-semibold">Q1 Actual</th>
                  <th className="text-right px-4 py-3 font-semibold">Q2 Budget</th>
                  <th className="text-right px-4 py-3 font-semibold">Q2 Actual</th>
                  <th className="text-right px-4 py-3 font-semibold">Q3 Budget</th>
                  <th className="text-right px-4 py-3 font-semibold">Q3 Actual</th>
                  <th className="text-right px-4 py-3 font-semibold">Q4 Budget</th>
                  <th className="text-right px-4 py-3 font-semibold">Q4 Actual</th>
                  <th className="text-right px-4 py-3 font-semibold">Total Budget</th>
                  <th className="text-right px-4 py-3 font-semibold">Total Actual</th>
                  <th className="text-right px-4 py-3 font-semibold">Util %</th>
                  <th className="text-left px-4 py-3 font-semibold w-16">Actions</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => {
                  const ac = actuals[b.fiscalYear] ?? { q1: 0, q2: 0, q3: 0, q4: 0 }
                  const tBudget = b.q1Amount + b.q2Amount + b.q3Amount + b.q4Amount
                  const tActual = ac.q1 + ac.q2 + ac.q3 + ac.q4
                  const utilPct = tBudget > 0 ? Math.round((tActual / tBudget) * 100) : null
                  const over = utilPct != null && utilPct > 100
                  return (
                    <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {b.fiscalYear}
                        {b.fiscalYear === currentFY && <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold bg-accent-100 text-accent-700 rounded">Current</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtCurrency(b.q1Amount)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtCurrency(ac.q1)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtCurrency(b.q2Amount)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtCurrency(ac.q2)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtCurrency(b.q3Amount)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtCurrency(ac.q3)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtCurrency(b.q4Amount)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{fmtCurrency(ac.q4)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{fmtCurrency(tBudget)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-700 whitespace-nowrap">{fmtCurrency(tActual)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {utilPct != null
                          ? <span className={cn("font-semibold", over ? "text-red-600" : "text-green-700")}>{utilPct}%</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditBudget(b); setShowModal(true) }} className="p-1.5 text-gray-400 hover:text-accent-600 hover:bg-accent-50 rounded transition-colors"><Pencil className="w-3 h-3" /></button>
                          <button onClick={() => setDeleteTarget(b)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <FiscalBudgetModal budget={editBudget} onClose={() => { setShowModal(false); setEditBudget(undefined) }} onSave={handleSave} />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Delete Budget</h3>
                <p className="text-xs text-gray-500 mt-0.5">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-xs text-gray-700">Delete fiscal budget for <span className="font-semibold">{deleteTarget.fiscalYear}</span>?</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-5 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Utilization ─────────────────────────────────────────────────────────

function UtilizationTab() {
  const [data, setData]         = useState<UtilizationData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [idleDays, setIdleDays] = useState<30 | 60 | 90>(30)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/reports/utilization")
      const json = await res.json()
      setData(json.data ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filteredIdle = (data?.idleAssets ?? []).filter((a) => a.daysIdle >= idleDays)

  function handleDownload() {
    const out = filteredIdle.map((a) => ({
      Asset:          a.itemName,
      Code:           a.itemCode,
      Category:       a.category,
      "Purchase Price": a.price,
      "Days Idle":    a.daysIdle,
      "Last Assigned": fmtDate(a.lastAssigned),
    }))
    downloadExcel(out, "Idle Assets", "reports-utilization.xlsx")
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleDownload} disabled={loading || !data} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
          <Download className="w-3.5 h-3.5" /> Export Excel
        </button>
      </div>

      {loading ? <LoadingBlock /> : !data ? <EmptyBlock label="Could not load utilization data" /> : (
        <>
          {/* Summary section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Donut */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-700 mb-2">Asset Distribution</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Assigned",  value: data.summary.assigned,  color: "#3b82f6" },
                      { name: "Available", value: data.summary.available,  color: "#22c55e" },
                      { name: "In Repair", value: data.summary.inRepair,   color: "#f97316" },
                      { name: "Retired",   value: data.summary.retired,    color: "#9ca3af" },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={2}
                  >
                    {[
                      { color: "#3b82f6" },
                      { color: "#22c55e" },
                      { color: "#f97316" },
                      { color: "#9ca3af" },
                    ].map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Stat cards */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <KpiCard label="Assigned"  value={`${data.summary.assigned} (${data.summary.assignedPct}%)`}  color="bg-blue-50 border-blue-100 text-blue-900" />
              <KpiCard label="Available" value={`${data.summary.available} (${data.summary.availablePct}%)`} color="bg-green-50 border-green-100 text-green-900" />
              <KpiCard label="In Repair" value={`${data.summary.inRepair} (${data.summary.inRepairPct}%)`}  color="bg-orange-50 border-orange-100 text-orange-900" />
              <KpiCard label="Retired"   value={`${data.summary.retired} (${data.summary.retiredPct}%)`}    color="bg-gray-50 border-gray-200 text-gray-900" />
            </div>
          </div>

          {/* Idle Assets */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-700">Idle Assets</p>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {([30, 60, 90] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setIdleDays(d)}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                      idleDays === d ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    {d}+ days
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                      <th className="text-left px-4 py-3 font-semibold">Asset</th>
                      <th className="text-left px-4 py-3 font-semibold">Code</th>
                      <th className="text-left px-4 py-3 font-semibold">Category</th>
                      <th className="text-right px-4 py-3 font-semibold">Purchase Price</th>
                      <th className="text-right px-4 py-3 font-semibold">Days Idle</th>
                      <th className="text-left px-4 py-3 font-semibold">Last Assigned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIdle.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No idle assets found for {idleDays}+ days filter</td></tr>
                    ) : filteredIdle.map((a) => (
                      <tr
                        key={a.id}
                        className={cn(
                          "border-t border-gray-100 transition-colors",
                          a.daysIdle > 90 ? "bg-red-50/40 hover:bg-red-50/70" :
                          a.daysIdle > 60 ? "bg-yellow-50/40 hover:bg-yellow-50/70" :
                          "hover:bg-gray-50/60"
                        )}
                      >
                        <td className="px-4 py-3 font-medium text-gray-800 max-w-[160px] truncate">{a.itemName}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-[10px]">{a.itemCode}</td>
                        <td className="px-4 py-3 text-gray-600">{a.category}</td>
                        <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{fmtCurrency(a.price)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            "font-semibold",
                            a.daysIdle > 90 ? "text-red-600" :
                            a.daysIdle > 60 ? "text-yellow-600" :
                            "text-gray-700"
                          )}>
                            {a.daysIdle}d
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(a.lastAssigned)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredIdle.length > 0 && (
                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 text-[11px] text-gray-400">
                  {filteredIdle.length} idle asset{filteredIdle.length !== 1 ? "s" : ""} · {idleDays}+ days · Total value: {fmtCurrency(filteredIdle.reduce((s, a) => s + a.price, 0))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("Overview")

  // Track which tabs have been visited so we only load lazily
  const [visited, setVisited] = useState<Set<Tab>>(new Set(["Overview"]))

  function switchTab(t: Tab) {
    setTab(t)
    setVisited((prev) => new Set([...prev, t]))
  }

  return (
    <div className="p-4 sm:p-6">

      {/* Tab bar */}
      <div className="bg-white rounded-t-xl border border-gray-200 border-b-0">
        <div className="flex overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={cn(
                "flex items-center gap-2 px-5 py-3.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2",
                tab === t
                  ? "border-accent-500 text-accent-600 bg-accent-50/50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-b-xl border border-gray-200 border-t-0 p-4 sm:p-6">
        {tab === "Overview"      && <OverviewTab />}
        {tab === "Asset Value"   && (visited.has("Asset Value")   ? <AssetValueTab />   : <LoadingBlock />)}
        {tab === "Repair Costs"  && (visited.has("Repair Costs")  ? <RepairCostsTab />  : <LoadingBlock />)}
        {tab === "Departments"   && (visited.has("Departments")   ? <DepartmentsTab />  : <LoadingBlock />)}
        {tab === "Budgets"       && (visited.has("Budgets")       ? <BudgetsTab />      : <LoadingBlock />)}
        {tab === "Utilization"   && (visited.has("Utilization")   ? <UtilizationTab />  : <LoadingBlock />)}
      </div>

    </div>
  )
}
