"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import {
  LayoutDashboard, Target, CheckSquare, Activity,
  Calendar, FileText, TrendingUp, Building2,
  Users, User, CalendarDays, Clock,
  BookOpen, Star, List, UserCheck, MessageSquare,
  ChevronDown, ChevronLeft, ChevronRight, X,
  BarChart2, LineChart, ClipboardList, Layers,
} from "lucide-react";

/* ─── Types ─── */
interface NavSubItem { label: string; href: string; icon: React.ElementType; }
interface NavItem { label: string; href?: string; icon: React.ElementType; children?: NavSubItem[]; }

/* ─── Navigation data ─── */
const navigation: NavItem[] = [
  { label: "Dashboard",      href: "/dashboard",  icon: LayoutDashboard },
  { label: "KPI",            icon: Target,        children: [
    { label: "Individual KPI", href: "/kpi",           icon: User },
    { label: "Teams KPI",      href: "/kpi/teams",     icon: Users },
  ]},
  { label: "Priority",       href: "/priority",   icon: CheckSquare },
  { label: "Org Setup",      icon: Building2,     children: [
    { label: "Teams",           href: "/org-setup/teams",    icon: Users },
    { label: "Users",           href: "/org-setup/users",    icon: User },
    { label: "Quarter Settings",href: "/org-setup/quarters", icon: CalendarDays },
  ]},
  { label: "WWW",            href: "/www",        icon: Activity },
  { label: "Meeting Rhythm", icon: Calendar,      children: [
    { label: "Dashboard",         href: "/meetings",            icon: LayoutDashboard },
    { label: "Daily Huddle",      href: "/meetings/daily-huddle", icon: Clock },
    { label: "Weekly Meeting",    href: "/meetings/weekly",     icon: CalendarDays },
    { label: "Monthly Meeting",   href: "/meetings/monthly",    icon: CalendarDays },
    { label: "Quarterly Offsite", href: "/meetings/quarterly",  icon: CalendarDays },
    { label: "Annual Planning",   href: "/meetings/annual",     icon: CalendarDays },
    { label: "Templates",         href: "/meetings/templates",  icon: List },
    { label: "History",           href: "/meetings/history",    icon: BookOpen },
  ]},
  { label: "OPSP",           icon: FileText,      children: [
    { label: "Create OPSP",       href: "/opsp",            icon: FileText },
    { label: "OPSP HISTORY",      href: "/opsp/history",    icon: BookOpen },
    { label: "OPSP Review",       href: "/opsp/review",     icon: Star },
    { label: "Category Mgmt",     href: "/opsp/categories", icon: List },
  ]},
  // ── R10a-h: Performance split into two nav groups ──────────────────────
  // URLs intentionally kept under `/performance/*` to avoid breaking
  // bookmarks, tests, and existing audit logs. Sidebar presents two
  // mental models: read-only Analytics vs write-heavy People workflows.
  { label: "Analytics",      icon: TrendingUp,    children: [
    { label: "Scorecard",          href: "/performance/scorecard",    icon: BarChart2 },
    { label: "Individual",         href: "/performance/individual",   icon: User },
    { label: "Teams",              href: "/performance/teams",        icon: Users },
    { label: "Trends",             href: "/performance/trends",       icon: LineChart },
  ]},
  { label: "People",         icon: UserCheck,     children: [
    { label: "Cycle",              href: "/performance/cycle",        icon: Activity },
    { label: "Goals",              href: "/performance/goals",        icon: Target },
    { label: "Self-Assessment",    href: "/performance/self",         icon: User },
    { label: "Reviews",            href: "/performance/reviews",      icon: ClipboardList },
    { label: "1:1s",               href: "/performance/one-on-one",   icon: Users },
    { label: "Feedback",           href: "/performance/feedback",     icon: MessageSquare },
    { label: "Talent",             href: "/performance/talent",       icon: Layers },
  ]},
];

/* ─── NavGroup (expanded mode) ─── */
function NavGroup({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isChildActive = item.children?.some(c => pathname === c.href || pathname?.startsWith(c.href + "/"));
  const isActive = item.href ? pathname === item.href : isChildActive;
  const [open, setOpen] = useState(isChildActive ?? false);
  const Icon = item.icon;

  if (!item.children) {
    return (
      <Link href={item.href!}
        className={cn(
          "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm font-medium transition-colors group min-w-0",
          isActive ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white/90"
        )}>
        <span className={cn(
          "flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg",
          isActive ? "bg-white/20 text-white" : "bg-white/10 text-white/50 group-hover:bg-white/15"
        )}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm font-medium transition-colors group min-w-0",
          isActive ? "text-white" : "text-white/60 hover:bg-white/10 hover:text-white/90"
        )}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className={cn(
            "flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg",
            isActive ? "bg-white/20 text-white" : "bg-white/10 text-white/50 group-hover:bg-white/15"
          )}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate">{item.label}</span>
        </div>
        <ChevronDown className={cn("flex-shrink-0 h-3.5 w-3.5 text-white/40 transition-transform duration-200 ml-1", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden">
            <div style={{ paddingLeft: 12 }} className="mt-0.5 pb-0.5">
              {item.children.map((child, idx) => {
                const active = pathname === child.href || pathname?.startsWith(child.href + "/");
                const ChildIcon = child.icon;
                const isLast = idx === item.children!.length - 1;
                return (
                  <div key={child.href} className="relative" style={{ paddingLeft: 28 }}>
                    {/* Vertical rail */}
                    <span className="absolute" style={{
                      left: 10, top: 0, bottom: isLast ? "50%" : 0,
                      width: 1.5, backgroundColor: "rgba(255,255,255,0.15)",
                    }} />
                    {/* Horizontal L-branch */}
                    <span className="absolute" style={{
                      left: 10, top: "50%", width: 16, height: 1.5,
                      backgroundColor: "rgba(255,255,255,0.15)",
                    }} />

                    <Link href={child.href}
                      className={cn(
                        "flex items-center gap-2 py-[5px] px-1 rounded-lg transition-colors min-w-0",
                        active ? "text-white" : "text-white/50 hover:text-white/80"
                      )}>
                      <span className={cn(
                        "flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md transition-colors",
                        active ? "bg-white/20 text-white ring-1 ring-white/20" : "bg-white/10 text-white/40"
                      )}>
                        <ChildIcon className="h-3 w-3" />
                      </span>
                      <span className={cn(
                        "truncate text-[12.5px] font-medium min-w-0",
                        active ? "text-white" : "text-white/60"
                      )}>
                        {child.label}
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── NavGroup (collapsed / icon-only mode) ─── */
function NavGroupCollapsed({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isChildActive = item.children?.some(c => pathname === c.href || pathname?.startsWith(c.href + "/"));
  const isActive = item.href ? pathname === item.href : isChildActive;
  const Icon = item.icon;
  const href = item.href ?? item.children?.[0]?.href ?? "#";

  return (
    <Link href={href} title={item.label}
      className={cn(
        "flex items-center justify-center w-9 h-9 rounded-lg mx-auto transition-colors",
        isActive ? "bg-white/20 text-white" : "text-white/50 hover:bg-white/10 hover:text-white/80"
      )}>
      <Icon className="h-4 w-4" />
    </Link>
  );
}

/* ─── Sidebar Content ─── */
interface SidebarContentProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  onClose?: () => void;
  isMobile?: boolean;
}
function SidebarContent({ collapsed, setCollapsed, onClose, isMobile }: SidebarContentProps) {
  return (
    <div className="w-full h-full flex flex-col bg-accent-800 overflow-hidden">
      {/* Logo + collapse toggle */}
      <div className={cn(
        "flex items-center border-b border-white/10 flex-shrink-0",
        collapsed ? "justify-center px-2 py-4" : "justify-between px-4 py-4"
      )}>
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded bg-white/20 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm">G</div>
            <div className="leading-tight min-w-0">
              <p className="text-xs font-bold text-white uppercase tracking-wide">GOAL</p>
              <p className="text-[10px] text-white/50 uppercase tracking-wide">GOAL</p>
            </div>
          </Link>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">G</div>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          {!isMobile && (
            <button onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
          {isMobile && onClose && (
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10 text-white/50">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={cn(
        "flex-1 py-3 overflow-y-auto overflow-x-hidden",
        collapsed ? "px-1 space-y-1" : "px-3 space-y-0.5"
      )}>
        {navigation.map((item) =>
          collapsed
            ? <NavGroupCollapsed key={item.label} item={item} />
            : <NavGroup key={item.label} item={item} />
        )}
      </nav>
    </div>
  );
}

/* ─── Exported Sidebar ─── */
interface SidebarProps { mobileOpen: boolean; onClose: () => void; }

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 56 : 220 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="hidden md:flex flex-shrink-0 h-screen overflow-hidden"
        style={{ minWidth: collapsed ? 56 : 220 }}
      >
        <SidebarContent collapsed={collapsed} setCollapsed={setCollapsed} />
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }} onClick={onClose}
              className="fixed inset-0 z-40 bg-black/40 md:hidden" />
            <motion.div initial={{ x: -220 }} animate={{ x: 0 }} exit={{ x: -220 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 bottom-0 z-50 md:hidden" style={{ width: 220 }}>
              <SidebarContent collapsed={false} setCollapsed={() => {}} onClose={onClose} isMobile />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
