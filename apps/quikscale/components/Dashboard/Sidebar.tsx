"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import {
  LayoutDashboard, Target, CheckSquare, Activity,
  Calendar, FileText, TrendingUp, Building2,
  Users, User, CalendarDays, Briefcase, Clock,
  BookOpen, Star, List, UserCheck, Hash, BarChart,
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
    { label: "Daily Dashboard", href: "/meetings/daily",         icon: LayoutDashboard },
    { label: "Client Master",   href: "/meetings/client-master", icon: Briefcase },
    { label: "Client Members",  href: "/meetings/client-members",icon: Users },
    { label: "Daily Huddle",    href: "/meetings/daily-huddle",  icon: Clock },
    { label: "Weekly Meeting",  href: "/meetings/weekly",        icon: CalendarDays },
  ]},
  { label: "OPSP",           icon: FileText,      children: [
    { label: "Create OPSP",       href: "/opsp",            icon: FileText },
    { label: "OPSP HISTORY",      href: "/opsp/history",    icon: BookOpen },
    { label: "OPSP Review",       href: "/opsp/review",     icon: Star },
    { label: "Category Mgmt",     href: "/opsp/categories", icon: List },
  ]},
  { label: "Performance",    icon: TrendingUp,    children: [
    { label: "Scorecard",          href: "/performance/scorecard",    icon: BarChart2 },
    { label: "Individual",         href: "/performance/individual",   icon: User },
    { label: "Teams",              href: "/performance/teams",        icon: Users },
    { label: "Trends",             href: "/performance/trends",       icon: LineChart },
    { label: "Reviews",            href: "/performance/reviews",      icon: ClipboardList },
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
          isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        )}>
        <span className={cn(
          "flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg",
          isActive ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
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
          isActive ? "text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        )}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className={cn(
            "flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg",
            isActive ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
          )}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate">{item.label}</span>
        </div>
        <ChevronDown className={cn("flex-shrink-0 h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ml-1", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden">
            {/* Tree — pl-[12px] shifts the whole sub-list right; each row has pl-[28px] for connector */}
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
                      width: 1.5, backgroundColor: "#d1d5db",
                    }} />
                    {/* Horizontal L-branch */}
                    <span className="absolute" style={{
                      left: 10, top: "50%", width: 16, height: 1.5,
                      backgroundColor: "#d1d5db",
                    }} />

                    <Link href={child.href}
                      className={cn(
                        "flex items-center gap-2 py-[5px] px-1 rounded-lg transition-colors min-w-0",
                        active ? "text-blue-700" : "text-gray-500 hover:text-gray-800"
                      )}>
                      <span className={cn(
                        "flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md transition-colors",
                        active ? "bg-blue-50 text-blue-600 ring-1 ring-blue-200" : "bg-gray-100 text-gray-400"
                      )}>
                        <ChildIcon className="h-3 w-3" />
                      </span>
                      <span className={cn(
                        "truncate text-[12.5px] font-medium min-w-0",
                        active ? "text-blue-700" : "text-gray-600"
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
        isActive ? "bg-blue-100 text-blue-600" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
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
    <div className="h-full flex flex-col bg-white border-r border-gray-200 overflow-hidden">
      {/* Logo + collapse toggle */}
      <div className={cn(
        "flex items-center border-b border-gray-200 flex-shrink-0",
        collapsed ? "justify-center px-2 py-4" : "justify-between px-4 py-4"
      )}>
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded bg-gray-900 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm">G</div>
            <div className="leading-tight min-w-0">
              <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">GOAL</p>
              <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">GOAL</p>
            </div>
          </Link>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded bg-gray-900 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">G</div>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Collapse toggle — desktop only */}
          {!isMobile && (
            <button onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
          {/* Mobile close */}
          {isMobile && onClose && (
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500">
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
      {/* Desktop sidebar — animates between expanded and collapsed */}
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
