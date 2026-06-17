"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Users,
  Network,
  Settings,
  ChevronRight,
  Clock,
  Palmtree,
  Wallet,
  Banknote,
  UserPlus,
  Heart,
  FileText,
  Package,
  Sparkles,
  Target,
  BarChart3,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Pencil,
  CheckSquare,
  Bell,
  Plus,
  MoreVertical,
  LifeBuoy,
  Receipt,
  Moon,
  Sun,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useRoles, hasAnyRole } from "@/lib/hooks/use-roles";
import { withBasePath } from "@/lib/utils/base-path";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { Tooltip } from "@/components/hrms/tooltip";

interface NavLeaf { label: string; href: string; roles?: string[]; perms?: string[]; hideForSuperAdmin?: boolean }
interface NavChild {
  label: string;
  href?: string;
  roles?: string[];
  perms?: string[];
  children?: NavLeaf[];
}

type Section = "core" | "hr" | "finance" | "growth" | "assets" | "settings";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  section: Section;
  roles?: string[];
  perms?: string[];
  children?: NavChild[];
}

const SECTION_LABELS: Record<Section, string> = {
  core: "Core",
  hr: "HR",
  finance: "Finance",
  growth: "Growth",
  assets: "Assets",
  settings: "Settings",
};

const SECTION_ORDER: Section[] = ["core", "hr", "finance", "growth", "assets", "settings"];

const navigation: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={18} />, section: "core" },
  // AI Copilot hidden for now.
  // { label: "AI Copilot", href: "/ai-copilot", icon: <Sparkles size={18} />, section: "core", perms: ["hrms.employee.read", "hrms.performance.read"] },
  { label: "Todo", href: "/tasks", icon: <CheckSquare size={18} />, section: "core", perms: ["hrms.employee.read_self"] },
  {
    label: "Help Desk",
    href: "/tickets",
    icon: <LifeBuoy size={18} />,
    section: "core",
    perms: ["hrms.ticket.read", "hrms.ticket.read_self", "hrms.ticket.read_assigned", "hrms.ticket.raise"],
  },
  {
    label: "People",
    icon: <Users size={18} />,
    section: "hr",
    perms: ["hrms.employee.read", "hrms.employee.read_team"],
    children: [
      { label: "People", href: "/org-chart", perms: ["hrms.employee.read", "hrms.employee.read_team", "hrms.org.read"] },
      { label: "Employment History", href: "/employees/history", perms: ["hrms.employee.read"] },
      { label: "Delegations", href: "/delegations", perms: ["hrms.employee.read", "hrms.employee.read_team"] },
      { label: "Onboarding", href: "/onboarding", perms: ["hrms.onboarding.read", "hrms.onboarding.write"] },
      { label: "Offboarding", href: "/offboarding", perms: ["hrms.offboarding.read", "hrms.offboarding.write"] },
      { label: "Raise Requisition", href: "/recruit/raise", roles: ["admin"] },
      { label: "Requisition Approvals", href: "/recruit/approvals", roles: ["admin"] },
    ],
  },
  {
    label: "Time & Attendance",
    icon: <Clock size={18} />,
    section: "hr",
    perms: ["hrms.attendance.read", "hrms.attendance.read_self", "hrms.attendance.read_team", "hrms.attendance.punch", "hrms.roster.read", "hrms.roster.read_self", "hrms.roster.read_team"],
    children: [
      { label: "Attendance", href: "/attendance", perms: ["hrms.attendance.read", "hrms.attendance.read_self", "hrms.attendance.read_team"] },
      { label: "Admin Attendance", href: "/attendance/admin", perms: ["hrms.attendance.read", "hrms.attendance.read_team"] },
      { label: "Regularization Approvals", href: "/attendance/regularizations", perms: ["hrms.attendance.approve", "hrms.attendance.read_team"] },
      { label: "Duty Roster", href: "/duty-roster", perms: ["hrms.roster.read", "hrms.roster.read_self", "hrms.roster.read_team"] },
      { label: "Shifts", href: "/shifts", perms: ["hrms.attendance.manage"] },
      { label: "Time Records", href: "/time-logs", perms: ["hrms.attendance.read", "hrms.attendance.read_self"] },
    ],
  },
  {
    label: "Leaves",
    icon: <Palmtree size={18} />,
    section: "hr",
    perms: ["hrms.leave.read", "hrms.leave.read_self", "hrms.leave.read_team", "hrms.leave.apply"],
    children: [
      { label: "My Leaves", href: "/leaves", perms: ["hrms.leave.read_self", "hrms.leave.apply"] },
      { label: "Team Leaves", href: "/leaves/team-leaves", perms: ["hrms.leave.read_team"] },
      { label: "Leave & Holiday Calendar", href: "/leaves/calendar" },
      { label: "Policies", href: "/leaves/policies", perms: ["hrms.leave.manage"] },
      { label: "Policy Documents", href: "/leaves/policy-documents", perms: ["hrms.leave_policy.read"] },
    ],
  },
  {
    label: "Work From Home",
    href: "/wfh/my-requests",
    icon: <Palmtree size={18} />,
    section: "hr",
    perms: ["hrms.employee.read_self"],
  },
  {
    // Top-level Claims & Declarations — single home for Reimbursements,
    // FBP, IT Declaration, and POI. No permission gate so every employee
    // sees the page; individual tabs (IT Decl settings, POI settings) own
    // their internal admin/employee distinction.
    label: "Claims & Declarations",
    href: "/claims-declarations",
    icon: <Receipt size={18} />,
    section: "hr",
    perms: ["hrms.employee.read_self"],
  },
  {
    label: "Expenses",
    href: "/expenses",
    icon: <Wallet size={18} />,
    section: "finance",
    perms: ["hrms.expense.read", "hrms.expense.read_self", "hrms.expense.read_team", "hrms.expense.submit"],
  },
  {
    label: "Payroll",
    icon: <Banknote size={18} />,
    section: "finance",
    perms: ["hrms.settings.read", "hrms.settings.write"],
    children: [
      { label: "Analytics", href: "/payroll", perms: ["hrms.settings.read", "hrms.settings.write"] },
      { label: "Pay Runs", href: "/payroll/runs", perms: ["hrms.settings.write"] },
      { label: "Employee Salaries", href: "/payroll/employee-salaries", perms: ["hrms.settings.write"] },
      { label: "Approvals", href: "/payroll/approvals", perms: ["hrms.settings.write"] },
      { label: "Tax Filings", href: "/payroll/tax-filings", perms: ["hrms.settings.write"] },
      { label: "TDS & Challans", href: "/payroll/tds", perms: ["hrms.settings.write"] },
      { label: "One-Time Pay & Deductions", href: "/payroll/one-time-earnings", perms: ["hrms.settings.write"] },
      { label: "Full & Final", href: "/payroll/full-final", perms: ["hrms.settings.write"] },
      { label: "Reports", href: "/payroll/reports", perms: ["hrms.reports.read", "hrms.settings.write"] },
      { label: "My Payroll", href: "/payroll/my-payslips" },
      { label: "Loans & Giving", href: "/payroll/advances", perms: ["hrms.settings.write"] },
      { label: "Mid-year Joiners", href: "/payroll/setup/prior-payroll", perms: ["hrms.settings.write"] },
    ],
  },
  {
    label: "Performance",
    icon: <Target size={18} />,
    section: "growth",
    perms: ["hrms.performance.read", "hrms.performance.read_self", "hrms.performance.read_team"],
    children: [
      { label: "Goals", href: "/performance/goals" },
      { label: "KRA/KPI Templates", href: "/performance/kra-templates", perms: ["hrms.settings.write"] },
      { label: "KRA Assignments", href: "/performance/kra-assignments", perms: ["hrms.settings.write"] },
      { label: "Reviews", href: "/performance/reviews" },
      { label: "Feedback", href: "/performance/feedback" },
      { label: "PIP", href: "/performance/pip", perms: ["hrms.performance.pip"] },
    ],
  },
  {
    label: "Recruit",
    icon: <UserPlus size={18} />,
    section: "growth",
    perms: ["hrms.recruit.read", "hrms.recruit.write"],
    children: [
      { label: "Requisitions", href: "/recruit/requisitions" },
      { label: "Candidates", href: "/recruit/candidates" },
      { label: "Pipeline", href: "/recruit/pipeline" },
      { label: "Interviews", href: "/recruit/interviews", perms: ["hrms.recruit.interview"] },
      { label: "Offers", href: "/recruit/offers", perms: ["hrms.recruit.offer"] },
    ],
  },
  {
    label: "Engage",
    icon: <Heart size={18} />,
    section: "growth",
    perms: ["hrms.engage.read", "hrms.engage.post"],
    children: [
      { label: "Social Wall", href: "/engage/social-wall" },
      { label: "Announcements", href: "/engage/announcements" },
      { label: "Surveys", href: "/engage/surveys" },
      { label: "Recognition", href: "/engage/recognition" },
      { label: "Approvals", href: "/engage/approvals", perms: ["hrms.engage.approve", "hrms.feedback.approve"] },
    ],
  },
  {
    label: "Assets",
    href: "/assets",
    icon: <Package size={18} />,
    section: "assets",
    perms: ["hrms.asset.read", "hrms.asset.read_self", "hrms.asset.read_team"],
  },
  {
    label: "Documents",
    icon: <FileText size={18} />,
    section: "assets",
    perms: ["hrms.document.read", "hrms.document.read_self", "hrms.document.read_team"],
    children: [
      { label: "Company Documents", href: "/documents", perms: ["hrms.document.read"] },
      { label: "My Vault", href: "/documents/my-vault", perms: ["hrms.document.read_self"] },
      { label: "Candidate Documents", href: "/recruit/documents" },
      { label: "Candidate Document Types", href: "/settings/candidate-documents" },
      { label: "E-Signatures", href: "/esign", perms: ["hrms.document.write"] },
    ],
  },
  {
    label: "Reports",
    icon: <BarChart3 size={18} />,
    section: "settings",
    perms: ["hrms.reports.read", "hrms.audit.read"],
    children: [
      { label: "Dashboards", href: "/dashboards", perms: ["hrms.reports.read"] },
      { label: "Analytics", href: "/analytics", perms: ["hrms.reports.read"] },
      { label: "Query Builder", href: "/reports", perms: ["hrms.reports.read"] },
    ],
  },
  {
    label: "Users",
    href: "/settings/users",
    icon: <UserPlus size={18} />,
    section: "settings",
    perms: ["hrms.user.invite"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: <Settings size={18} />,
    section: "settings",
    perms: ["hrms.settings.read", "hrms.settings.write", "hrms.rbac.manage", "hrms.org.read", "hrms.audit.read"],
  },
];


function childHasActive(child: NavChild, pathname: string): boolean {
  if (child.href && pathname === child.href) return true;
  return child.children?.some((c) => pathname === c.href) ?? false;
}

export function Sidebar() {
  const rawPathname = usePathname();
  const router = useRouter();
  const api = useApiClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { roles } = useRoles();
  const { hasAnyPermission, permissions, employee, preBoarding } = useDashboardConfig();
  const isSuper = permissions.includes("*");
  const pathname = mounted ? rawPathname : "";

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("hrms.sidebarCollapsed");
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") localStorage.setItem("hrms.sidebarCollapsed", String(next));
      return next;
    });
  };

  const nodeVisible = (n: { roles?: string[]; perms?: string[]; hideForSuperAdmin?: boolean }) => {
    if (n.hideForSuperAdmin && isSuper) return false;
    if (isSuper) return true;
    if (n.perms && n.perms.length > 0) return hasAnyPermission(n.perms);
    return hasAnyRole(roles, n.roles);
  };

  // Notification unread count — polled (realtime/SSE removed). Refreshes every
  // 60s + on window focus so the badge stays current without Redis pub/sub.
  const { data: unreadData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/api/v1/hrms/notifications/unread-count"),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const unreadCount = unreadData?.data?.count ?? 0;

  const { data: company } = useQuery({
    queryKey: ["settings", "company"],
    queryFn: () => api.get<{ companyName: string; logo: string | null }>("/api/v1/hrms/settings/company"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
  const companyName = company?.data?.companyName ?? "QuikIT HRMS";
  const companyLogo = company?.data?.logo ?? null;

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const isTopLevel = !key.includes(">");
      if (isTopLevel) {
        const nested: Record<string, boolean> = {};
        Object.keys(prev).forEach((k) => { if (k.includes(">")) nested[k] = prev[k]; });
        if (prev[key] === true) return { ...nested, [key]: false };
        return { ...nested, [key]: true };
      }
      return { ...prev, [key]: !prev[key] };
    });

  const visibleNav = useMemo(() => {
    // PreBoarding lockdown: replace the whole menu with a single "My
    // Onboarding" link. The user can't see anything else until HR confirms
    // employment (or the joining-date cron flips them to Active).
    if (preBoarding && employee?.id) {
      const lockdown: NavItem[] = [
        {
          label: "My Onboarding",
          href: `/onboarding/${employee.id}`,
          icon: <FileText size={18} />,
          section: "core",
        },
      ];
      return lockdown;
    }

    const base = navigation
      .filter(nodeVisible)
      .map((item) => {
        if (!item.children) return item;
        const filteredChildren = item.children
          .filter(nodeVisible)
          .map((c) => {
            if (!c.children) return c;
            const leaves = c.children.filter(nodeVisible);
            return leaves.length ? { ...c, children: leaves } : null;
          })
          .filter((c): c is NavChild => c !== null);
        return filteredChildren.length ? { ...item, children: filteredChildren } : null;
      })
      .filter((item): item is NavItem => item !== null);

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles, permissions, preBoarding, employee?.id]);

  const grouped = useMemo(() => {
    const map: Record<Section, NavItem[]> = { core: [], hr: [], finance: [], growth: [], assets: [], settings: [] };
    visibleNav.forEach((it) => { map[it.section].push(it); });
    return map;
  }, [visibleNav]);

  return (
    <aside className={clsx(
      "relative bg-[#1A2638] text-white/85 flex flex-col h-screen shrink-0 font-[var(--font-sans)] transition-[width] duration-200",
      collapsed ? "w-[72px]" : "w-[260px]",
    )}>
      {/* Brand */}
      <div className={clsx("pt-4 pb-3 flex items-start gap-2", collapsed ? "px-3 justify-center" : "px-4")}>
        <Link href="/dashboard" className="flex items-center gap-2.5 group flex-1 min-w-0">
          {companyLogo ? (
            <div className="w-10 h-10 rounded-lg bg-white overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={withBasePath(companyLogo)} alt={companyName} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shrink-0">
              <span className="text-[#1A2638] text-[13px] font-extrabold tracking-tight leading-none">
                {companyName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              </span>
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-bold text-[14px] text-white truncate leading-tight">{companyName}</div>
              <div className="text-[10px] text-white/55 font-semibold tracking-[0.15em] uppercase mt-0.5">HRMS Platform</div>
            </div>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            className="shrink-0 w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
          >
            <ChevronsLeft size={15} />
          </button>
        )}
        {collapsed && (
          <button
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            className="absolute -right-3 top-7 z-50 w-6 h-6 rounded-full bg-white text-[#1A2638] shadow-md ring-2 ring-[#1A2638] hover:bg-orange-400 hover:text-white transition flex items-center justify-center"
          >
            <ChevronsRight size={13} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={clsx(
        "flex-1 overflow-y-auto pb-3 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]",
        collapsed ? "px-2 pt-3" : "px-3 pt-1",
      )}>
        {(() => {
          const manualTop = Object.keys(expanded).find((k) => !k.includes(">") && expanded[k] === true);
          const anyExplicitFalse = Object.entries(expanded).some(([k, v]) => !k.includes(">") && v === false);
          const renderItem = (item: NavItem) => {
          if (item.children) {
            const isChildActive = item.children.some((c) => childHasActive(c, pathname));
            const explicit = expanded[item.label];
            const isOpen = manualTop
              ? manualTop === item.label
              : (explicit === false || anyExplicitFalse ? false : isChildActive);

            if (collapsed) {
              // Collapsed: show as icon-only button, click navigates to first child href
              const firstChild = item.children[0];
              const target = firstChild?.children?.[0]?.href ?? firstChild?.href ?? "#";
              return (
                <Tooltip key={item.label} content={item.label} placement="right" delay={150}>
                  <Link
                    href={target}
                    className={clsx(
                      "relative flex items-center justify-center w-12 h-12 mx-auto rounded-xl transition-all",
                      isChildActive
                        ? "bg-white/15 text-white"
                        : "text-white/70 hover:text-white hover:bg-white/5",
                    )}
                  >
                    {isChildActive && <span className="absolute right-0 top-2 bottom-2 w-1 rounded-l bg-orange-400" />}
                    {item.icon}
                  </Link>
                </Tooltip>
              );
            }

            const firstChildHref = (() => {
              for (const c of item.children) {
                if (c.href) return c.href;
                if (c.children?.[0]?.href) return c.children[0].href;
              }
              return null;
            })();
            return (
              <div key={item.label} className="space-y-0.5">
                <button
                  onClick={() => {
                    toggle(item.label);
                    if (firstChildHref) router.push(firstChildHref);
                  }}
                  title={item.label}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-[13.5px] rounded-xl transition-all",
                    isChildActive
                      ? "text-white bg-white/15 font-semibold"
                      : isOpen
                        ? "text-white bg-white/5 font-semibold"
                        : "text-white/70 hover:text-white hover:bg-white/5 font-medium",
                  )}
                >
                  <span className={clsx("flex-shrink-0", isOpen ? "text-white" : "text-white/60")}>
                    {item.icon}
                  </span>
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  <ChevronRight
                    size={14}
                    className={clsx(
                      "flex-shrink-0 transition-transform duration-200",
                      isOpen ? "text-white" : "text-white/50",
                      isOpen && "rotate-90",
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="ml-[22px] pl-2 border-l border-white/10 space-y-0.5 pt-0.5">
                    {item.children.map((child) => {
                      if (child.children) {
                        const groupKey = `${item.label}>${child.label}`;
                        const groupActive = child.children.some((g) => pathname === g.href);
                        const groupOpen = expanded[groupKey] ?? groupActive;
                        return (
                          <div key={groupKey}>
                            <button
                              onClick={() => toggle(groupKey)}
                              className={clsx(
                                "w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] rounded-lg transition",
                                groupActive
                                  ? "text-white bg-white/15 font-semibold"
                                  : "text-white/70 hover:text-white hover:bg-white/5 font-medium",
                              )}
                            >
                              <span className="flex-1 text-left truncate">{child.label}</span>
                              <ChevronRight size={11} className={clsx("text-white/50 transition-transform", groupOpen && "rotate-90")} />
                            </button>
                            {groupOpen && (
                              <div className="ml-3 pl-2 border-l border-white/10 space-y-0.5 pt-0.5">
                                {child.children.map((g) => {
                                  const isActive = pathname === g.href;
                                  return (
                                    <Link
                                      key={g.href}
                                      href={g.href}
                                      className={clsx(
                                        "block px-3 py-1.5 text-[12.5px] rounded-lg transition-all",
                                        isActive
                                          ? "bg-white/20 text-white font-semibold"
                                          : "text-white/70 hover:text-white hover:bg-white/5 font-medium",
                                      )}
                                    >
                                      {g.label}
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }
                      const isActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href!}
                          className={clsx(
                            "block px-3 py-1.5 text-[12.5px] rounded-lg transition-all",
                            isActive
                              ? "bg-white/20 text-white font-semibold"
                              : "text-white/70 hover:text-white hover:bg-white/5 font-medium",
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive = pathname === item.href;
          if (collapsed) {
            return (
              <Tooltip key={item.href} content={item.label} placement="right" delay={150}>
                <Link
                  href={item.href!}
                  className={clsx(
                    "relative flex items-center justify-center w-12 h-12 mx-auto rounded-xl transition-all",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:text-white hover:bg-white/5",
                  )}
                >
                  {isActive && <span className="absolute right-0 top-2 bottom-2 w-1 rounded-l bg-orange-400" />}
                  {item.icon}
                </Link>
              </Tooltip>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href!}
              title={item.label}
              className={clsx(
                "relative flex items-center gap-3 px-3 py-2.5 text-[13.5px] rounded-xl transition-all",
                isActive
                  ? "bg-white/15 text-white font-semibold"
                  : "text-white/70 hover:text-white hover:bg-white/5 font-medium",
              )}
            >
              {isActive && <span className="absolute right-0 top-2 bottom-2 w-1 rounded-l bg-orange-400" />}
              <span className={clsx("flex-shrink-0", isActive ? "text-white" : "text-white/60")}>
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        };

        return (
          <>
            {SECTION_ORDER.map((sec) => {
              const items = grouped[sec];
              if (!items || items.length === 0) return null;
              return (
                <div key={sec} className={clsx(collapsed ? "mb-2" : "mb-3")}>
                  {!collapsed && (
                    <div className="px-3 pt-3 pb-1.5 text-[10px] font-bold tracking-[0.18em] uppercase text-white/40">
                      {SECTION_LABELS[sec]}
                    </div>
                  )}
                  <div className="space-y-1">
                    {items.map(renderItem)}
                  </div>
                </div>
              );
            })}

          </>
        );
        })()}
      </nav>

      {/* Notification bell with live badge */}
      <div className={clsx("border-t border-white/10 py-3", collapsed ? "px-3" : "px-4")}>
        <Link
          href="/notifications"
          className={clsx(
            "relative flex items-center gap-3 rounded-xl transition-all",
            collapsed ? "justify-center w-12 h-12 mx-auto" : "px-3 py-2.5",
            pathname === "/notifications"
              ? "bg-white/15 text-white font-semibold"
              : "text-white/70 hover:text-white hover:bg-white/5",
          )}
        >
          <span className="relative flex-shrink-0">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </span>
          {!collapsed && <span className="text-[13.5px] font-medium truncate">Notifications</span>}
        </Link>

        <SidebarThemeToggle collapsed={collapsed} />
      </div>

    </aside>
  );
}

const THEME_KEY = "hrms.theme";

/** Dark/light theme toggle styled for the dark sidebar; respects collapsed state. */
function SidebarThemeToggle({ collapsed }: { collapsed: boolean }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem(THEME_KEY)) || "light";
    const isDark = stored === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (typeof window !== "undefined") localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  };

  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={clsx(
        "mt-1 flex items-center gap-3 rounded-xl transition-all text-white/70 hover:text-white hover:bg-white/5",
        collapsed ? "justify-center w-12 h-12 mx-auto" : "px-3 py-2.5 w-full",
      )}
    >
      <span className="flex-shrink-0">{dark ? <Sun size={18} /> : <Moon size={18} />}</span>
      {!collapsed && (
        <span className="text-[13.5px] font-medium truncate">{dark ? "Light mode" : "Dark mode"}</span>
      )}
    </button>
  );
}

