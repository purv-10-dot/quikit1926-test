"use client"

import { useState, useEffect } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { Package, Users, CheckCircle, Wrench, IndianRupee, AlertTriangle, ArrowRight, Loader2, TrendingUp, XCircle } from "lucide-react"
import Link from "next/link"

type DashboardData = {
  stats: {
    totalAssets: number
    assigned: number
    available: number
    inRepair: number
    retired: number
    addedThisMonth: number
    portfolioValue: number
    ytdRepairCost: number
    totalUsers: number
  }
  categoryBreakdown: { name: string; count: number; color: string }[]
  recentlyAssigned: {
    id: string
    assignedAt: string
    asset: { itemName: string; itemCode: string; assetStatus: string }
    user: { name: string; department: string | null }
  }[]
  recentActivity: {
    id: string
    module: string
    action: string
    entityName: string
    createdAt: string
  }[]
  warrantyAlerts: {
    id: string
    itemName: string
    itemCode: string
    warrantyEndDate: string
    daysLeft: number
  }[]
}

function fmtCurrency(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n}`
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return "Just now"
  if (mins < 60)  return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs} hr ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return "Yesterday"
  if (days < 7)   return `${days} days ago`
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
}

const MODULE_DOT: Record<string, string> = {
  Assets:      "bg-blue-500",
  Assignments: "bg-purple-500",
  Repairs:     "bg-orange-400",
  Replacements:"bg-yellow-500",
  Users:       "bg-green-500",
}

const STATUS_STYLES: Record<string, string> = {
  Available: "bg-green-50 text-green-700",
  Assigned:  "bg-blue-50 text-blue-700",
  InRepair:  "bg-orange-50 text-orange-700",
  Retired:   "bg-gray-50 text-gray-500",
}

const STATUS_LABELS: Record<string, string> = {
  Available: "Available",
  Assigned:  "Assigned",
  InRepair:  "In Repair",
  Retired:   "Retired",
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((json) => { if (json?.success !== false) setData(json.data ?? null) })
      .catch(() => {})
  }, [])

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
      </div>
    )
  }

  const { stats, categoryBreakdown, recentlyAssigned, recentActivity, warrantyAlerts } = data
  const firstAlert = warrantyAlerts[0] ?? null
  const maxCount   = Math.max(...categoryBreakdown.map((c) => c.count), 1)
  const utilPct    = stats.totalAssets > 0 ? Math.round((stats.assigned / stats.totalAssets) * 100) : 0

  const kpiCards = [
    {
      label:      "Total Assets",
      value:      String(stats.totalAssets),
      sub:        stats.addedThisMonth > 0 ? `+${stats.addedThisMonth} this month` : "No new this month",
      subColor:   stats.addedThisMonth > 0 ? "text-green-600" : "text-gray-400",
      icon:       Package,
      iconBg:     "bg-blue-100",
      iconColor:  "text-blue-600",
    },
    {
      label:      "Assigned",
      value:      String(stats.assigned),
      sub:        `${utilPct}% utilization`,
      subColor:   "text-gray-500",
      icon:       Users,
      iconBg:     "bg-violet-100",
      iconColor:  "text-violet-600",
    },
    {
      label:      "Available",
      value:      String(stats.available),
      sub:        "Ready to assign",
      subColor:   "text-green-600",
      icon:       CheckCircle,
      iconBg:     "bg-green-100",
      iconColor:  "text-green-600",
    },
    {
      label:      "In Repair",
      value:      String(stats.inRepair),
      sub:        "Under maintenance",
      subColor:   "text-orange-500",
      icon:       Wrench,
      iconBg:     "bg-orange-100",
      iconColor:  "text-orange-500",
    },
    {
      label:      "Retired",
      value:      String(stats.retired),
      sub:        "Decommissioned",
      subColor:   "text-gray-400",
      icon:       XCircle,
      iconBg:     "bg-gray-100",
      iconColor:  "text-gray-400",
    },
    {
      label:      "Portfolio Value",
      value:      fmtCurrency(stats.portfolioValue),
      sub:        `${stats.totalUsers} active users`,
      subColor:   "text-blue-500",
      icon:       IndianRupee,
      iconBg:     "bg-emerald-100",
      iconColor:  "text-emerald-600",
    },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* Warranty Alert */}
      {firstAlert && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span className="text-amber-800 text-xs">
            <strong>Warranty Alert:</strong> {firstAlert.itemName} ({firstAlert.itemCode}) expires in{" "}
            <strong>{firstAlert.daysLeft} day{firstAlert.daysLeft !== 1 ? "s" : ""}</strong>.
            {warrantyAlerts.length > 1 && (
              <span className="ml-1 text-amber-600">+{warrantyAlerts.length - 1} more expiring soon.</span>
            )}
          </span>
          <Link href="/assets" className="ml-auto text-accent-600 hover:underline font-medium whitespace-nowrap flex items-center gap-1 text-xs">
            View assets <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
            <p className={`text-xs mt-1 ${card.subColor}`}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts + Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Assets by Category */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Assets by Category</h2>
            <span className="text-xs text-gray-400">{stats.totalAssets} total</span>
          </div>
          <div className="space-y-2.5">
            {categoryBreakdown.map((item) => (
              <div key={item.name} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-32 flex-shrink-0 truncate">{item.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${(item.count / maxCount) * 100}%`, backgroundColor: item.color }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-700 w-7 text-right">{item.count}</span>
                <span className="text-[10px] text-gray-400 w-8 text-right">
                  {Math.round((item.count / stats.totalAssets) * 100)}%
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryBreakdown} barSize={28}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  cursor={{ fill: "#f3f4f6" }}
                  formatter={(v: number) => [v, "Assets"]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {categoryBreakdown.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Recent Activity</h2>
            <TrendingUp className="w-3.5 h-3.5 text-gray-400" />
          </div>
          {recentActivity.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-400">No activity yet</div>
          ) : (
            <div className="space-y-4 overflow-y-auto flex-1">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className={`w-2 h-2 rounded-full ${MODULE_DOT[item.module] ?? "bg-gray-400"} mt-1.5 flex-shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800">{item.action}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{item.entityName}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{fmtRelative(item.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Recently Assigned + Repair Cost Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Recently Assigned Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Recently Assigned</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">{stats.assigned} active assignment{stats.assigned !== 1 ? "s" : ""}</p>
            </div>
            <Link href="/assignments" className="text-xs text-accent-600 hover:underline font-medium flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent-50 text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-semibold">Asset</th>
                  <th className="text-left px-5 py-3 font-semibold">Code</th>
                  <th className="text-left px-5 py-3 font-semibold">Assigned To</th>
                  <th className="text-left px-5 py-3 font-semibold">Dept</th>
                  <th className="text-left px-5 py-3 font-semibold">Date</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentlyAssigned.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No assignments yet</td></tr>
                ) : recentlyAssigned.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800">{row.asset.itemName}</td>
                    <td className="px-5 py-3 text-gray-400 font-mono text-[10px]">{row.asset.itemCode}</td>
                    <td className="px-5 py-3 text-gray-700">{row.user.name}</td>
                    <td className="px-5 py-3 text-gray-500">{row.user.department ?? "—"}</td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(row.assignedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLES[row.asset.assetStatus] ?? "bg-gray-100 text-gray-600"}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                        {STATUS_LABELS[row.asset.assetStatus] ?? row.asset.assetStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Fleet Health Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Fleet Health</h2>
          <div className="space-y-3">
            {[
              { label: "Assigned",  count: stats.assigned,  total: stats.totalAssets, color: "#3b82f6" },
              { label: "Available", count: stats.available, total: stats.totalAssets, color: "#22c55e" },
              { label: "In Repair", count: stats.inRepair,  total: stats.totalAssets, color: "#f97316" },
              { label: "Retired",   count: stats.retired,   total: stats.totalAssets, color: "#9ca3af" },
            ].map(({ label, count, total, color }) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{label}</span>
                    <span className="font-semibold text-gray-800">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">YTD Repair Cost</span>
              <span className="font-semibold text-gray-800">{fmtCurrency(stats.ytdRepairCost)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Active Employees</span>
              <span className="font-semibold text-gray-800">{stats.totalUsers}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Portfolio Value</span>
              <span className="font-semibold text-gray-800">{fmtCurrency(stats.portfolioValue)}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
