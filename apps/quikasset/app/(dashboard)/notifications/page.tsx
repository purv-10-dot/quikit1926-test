"use client"

import { useState, useEffect, useCallback } from "react"
import { useRevalidateOnFocus } from "@/lib/hooks/useRevalidateOnFocus"
import {
  Package, ArrowLeftRight, Wrench, AlertTriangle, RefreshCw,
  Users, Bell, Search, CheckCheck, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Pagination from "@/components/ui/Pagination"

type Notif = {
  id: string
  type: "asset" | "assignment" | "repair" | "warranty" | "replacement" | "user" | "system"
  title: string
  body: string
  createdAt: string
  source: string
}

const TYPE_CONFIG = {
  asset:       { icon: Package,        color: "bg-blue-100 text-blue-600",    border: "border-blue-400",   badge: "bg-blue-50 text-blue-600 border-blue-100"    },
  assignment:  { icon: ArrowLeftRight, color: "bg-purple-100 text-purple-600", border: "border-purple-400", badge: "bg-purple-50 text-purple-600 border-purple-100" },
  repair:      { icon: Wrench,         color: "bg-orange-100 text-orange-600", border: "border-orange-400", badge: "bg-orange-50 text-orange-600 border-orange-100" },
  warranty:    { icon: AlertTriangle,  color: "bg-amber-100 text-amber-600",   border: "border-amber-400",  badge: "bg-amber-50 text-amber-600 border-amber-100"   },
  replacement: { icon: RefreshCw,      color: "bg-yellow-100 text-yellow-600", border: "border-yellow-400", badge: "bg-yellow-50 text-yellow-600 border-yellow-100" },
  user:        { icon: Users,          color: "bg-green-100 text-green-600",   border: "border-green-400",  badge: "bg-green-50 text-green-600 border-green-100"   },
  system:      { icon: Bell,           color: "bg-gray-100 text-gray-600",     border: "border-gray-400",   badge: "bg-gray-50 text-gray-500 border-gray-200"      },
} as const

const TABS = ["All", "Assets", "Assignments", "Repairs", "Warranty", "Replacements", "Users"] as const
type Tab = (typeof TABS)[number]

const TAB_TYPE_MAP: Record<Tab, Notif["type"] | null> = {
  All:          null,
  Assets:       "asset",
  Assignments:  "assignment",
  Repairs:      "repair",
  Warranty:     "warranty",
  Replacements: "replacement",
  Users:        "user",
}

const LS_KEY = "qa_notif_read_ids"

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...ids]))
  } catch { /* noop */ }
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notif[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("All")
  const [search, setSearch] = useState("")
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Load read state from localStorage on mount
  useEffect(() => {
    setReadIds(getReadIds())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/notifications")
      const json = await res.json()
      const data: Notif[] = json.data ?? []
      setNotifications(data)
    } catch {
      // silently fail — no toast needed for notification page
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useRevalidateOnFocus(load)

  const markRead = useCallback((ids: string[]) => {
    setReadIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      saveReadIds(next)
      return next
    })
  }, [])

  // Filter pipeline
  const filtered = notifications.filter((n) => {
    const typeMatch = TAB_TYPE_MAP[activeTab] === null || n.type === TAB_TYPE_MAP[activeTab]
    if (!typeMatch) return false
    if (search) {
      const q = search.toLowerCase()
      if (!n.title.toLowerCase().includes(q) && !n.body.toLowerCase().includes(q)) return false
    }
    return true
  })

  useEffect(() => { setPage(1) }, [activeTab, search])
  const paginatedNotifs = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Stats
  const totalCount    = notifications.length
  const unreadCount   = notifications.filter((n) => !readIds.has(n.id)).length
  const warrantyCount = notifications.filter((n) => n.type === "warranty").length
  const repairCount   = notifications.filter((n) => n.type === "repair" && n.id.startsWith("repair-alert-")).length

  return (
    <div className="p-4 sm:p-6">

      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-sm font-semibold text-gray-800">Notification Center</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            System event log — all notifications that would be sent via email
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              const visibleIds = filtered.map((n) => n.id)
              markRead(visibleIds)
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600">
          <Bell className="w-3.5 h-3.5 text-gray-400" />
          <span className="font-medium">Total:</span>
          <span className="font-bold text-gray-800">{totalCount}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs">
          <span className="font-medium text-gray-600">Unread:</span>
          <span className={cn(
            "font-bold px-1.5 py-0.5 rounded-full text-[10px]",
            unreadCount > 0 ? "bg-accent-600 text-white" : "bg-gray-100 text-gray-500"
          )}>
            {unreadCount}
          </span>
        </div>
        {warrantyCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-medium text-amber-700">Warranty alerts:</span>
            <span className="font-bold text-amber-800 bg-amber-200 px-1.5 py-0.5 rounded-full text-[10px]">{warrantyCount}</span>
          </div>
        )}
        {repairCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-xs">
            <Wrench className="w-3.5 h-3.5 text-orange-500" />
            <span className="font-medium text-orange-700">Repair follow-ups:</span>
            <span className="font-bold text-orange-800 bg-orange-200 px-1.5 py-0.5 rounded-full text-[10px]">{repairCount}</span>
          </div>
        )}
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        {/* Pill tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {TABS.map((tab) => {
            const typeKey = TAB_TYPE_MAP[tab]
            const count = typeKey === null
              ? notifications.length
              : notifications.filter((n) => n.type === typeKey).length
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors border",
                  activeTab === tab
                    ? "bg-accent-600 text-white border-accent-600 shadow-sm"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700"
                )}
              >
                {tab}
                {count > 0 && (
                  <span className={cn(
                    "ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold",
                    activeTab === tab ? "bg-accent-500 text-white" : "bg-gray-100 text-gray-500"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications…"
            className="pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent-400 w-52"
          />
        </div>
      </div>

      {/* Notification List */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading notifications…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
            <Bell className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-400">No notifications</p>
          <p className="text-xs text-gray-300">
            {search ? "Try a different search term" : "Nothing to show for this filter"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {paginatedNotifs.map((notif) => {
            const cfg = TYPE_CONFIG[notif.type]
            const Icon = cfg.icon
            const isRead = readIds.has(notif.id)
            const isWarranty = notif.type === "warranty"

            return (
              <div
                key={notif.id}
                onClick={() => markRead([notif.id])}
                onMouseEnter={() => setHoveredId(notif.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={cn(
                  "relative group flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all",
                  // Unread: colored left border + tinted bg
                  !isRead && "border-l-2",
                  !isRead && cfg.border,
                  // Warranty cards get special amber tint
                  isWarranty && !isRead
                    ? "bg-amber-50/70 border-amber-200"
                    : isWarranty && isRead
                    ? "bg-amber-50/30 border-gray-200"
                    : !isRead
                    ? "bg-blue-50/30 border-gray-200"
                    : "bg-white border-gray-200",
                  "hover:shadow-sm hover:border-gray-300"
                )}
              >
                {/* Icon circle */}
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", cfg.color)}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn(
                      "text-xs font-semibold truncate",
                      !isRead ? "text-gray-800" : "text-gray-600"
                    )}>
                      {notif.title}
                    </span>
                    <span className={cn(
                      "flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border uppercase tracking-wide",
                      cfg.badge
                    )}>
                      {notif.source}
                    </span>
                    {!isRead && (
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent-500" />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
                    {notif.body}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {fmtRelative(notif.createdAt)}
                  </p>
                </div>

                {/* Mark as read button — shows on hover */}
                {!isRead && hoveredId === notif.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      markRead([notif.id])
                    }}
                    className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-accent-600 bg-white border border-accent-200 rounded-lg hover:bg-accent-50 transition-colors shadow-sm"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Mark read
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} className="mt-4 bg-white rounded-xl border border-gray-200 px-4" />
    </div>
  )
}
