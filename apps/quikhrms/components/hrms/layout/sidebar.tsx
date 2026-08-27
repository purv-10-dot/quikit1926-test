"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  UserCog,
  ClipboardList,
  Heart,
  FileText,
  Sparkles,
  Target,
  BarChart3,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Pencil,
  CheckSquare,
  Plus,
  MoreVertical,
  Receipt,
  Home,
  Menu,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useRoles, hasAnyRole } from "@/lib/hooks/use-roles";
import { withBasePath } from "@/lib/utils/base-path";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { Tooltip } from "@/components/hrms/tooltip";

export interface NavLeaf { label: string; href: string; roles?: string[]; perms?: string[]; hideForSuperAdmin?: boolean; navKey?: string }
export interface NavChild {
  label: string;
  href?: string;
  roles?: string[];
  perms?: string[];
  navKey?: string;
  children?: NavLeaf[];
}

type Section = "core" | "hr" | "finance" | "growth" | "assets" | "settings";

export interface NavItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  section: Section;
  roles?: string[];
  perms?: string[];
  navKey?: string;
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

// Sentinel for `openGroup`: the user explicitly collapsed the active group
// (distinct from `null`, which means "no interaction yet, use the route").
const COLLAPSED = "__collapsed__";

export const navigation: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={18} />, section: "core", navKey: "dashboard" },
  // AI Copilot hidden for now.
  // { label: "AI Copilot", href: "/ai-copilot", icon: <Sparkles size={18} />, section: "core", perms: ["hrms.employee.read", "hrms.performance.read"] },
  { label: "Todo", href: "/tasks", icon: <CheckSquare size={18} />, section: "core", perms: ["hrms.employee.read_self"], navKey: "tasks" },
  {
    label: "People",
    icon: <Users size={18} />,
    section: "hr",
    // `hrms.org.read` included so a plain employee can still reach the company
    // Directory (its own leaf perms allow it) — the group used to hide the only
    // child they qualify for, leaving the dashboard shortcut as the sole way in.
    perms: ["hrms.employee.read", "hrms.employee.read_team", "hrms.org.read"],
    children: [
      { label: "Directory", href: "/org-chart", perms: ["hrms.employee.read", "hrms.employee.read_team", "hrms.org.read"], navKey: "people.directory" },
      { label: "Employee Log", href: "/employees/history", perms: ["hrms.employee.read"], navKey: "people.history" },
      { label: "Delegations", href: "/delegations", perms: ["hrms.employee.read", "hrms.employee.read_team"], navKey: "people.delegations" },
      { label: "Pre-Onboarding", href: "/pre-onboarding", perms: ["hrms.onboarding.read", "hrms.onboarding.write"], navKey: "people.pre-onboarding" },
      { label: "Onboarding", href: "/onboarding", perms: ["hrms.onboarding.read", "hrms.onboarding.write"], navKey: "people.onboarding" },
      { label: "Offboarding", href: "/offboarding", perms: ["hrms.offboarding.read", "hrms.offboarding.write"], navKey: "people.offboarding" },
      { label: "Resignation Approvals", href: "/offboarding/resignation-approvals", perms: ["hrms.offboarding.approve"], navKey: "people.resignation-approvals" },
      { label: "New Requisition", href: "/recruit/raise", perms: ["hrms.recruit.write"], navKey: "people.requisition" },
      { label: "Approve Requisitions", href: "/recruit/approvals", perms: ["hrms.recruit.approve"], navKey: "people.requisition-approvals" },
    ],
  },
  {
    label: "Time & Attendance",
    icon: <Clock size={18} />,
    section: "hr",
    perms: ["hrms.attendance.read", "hrms.attendance.read_self", "hrms.attendance.read_team", "hrms.attendance.punch", "hrms.roster.read", "hrms.roster.read_self", "hrms.roster.read_team"],
    children: [
      { label: "My Attendance", href: "/attendance", perms: ["hrms.attendance.read", "hrms.attendance.read_self", "hrms.attendance.read_team"], navKey: "time.attendance" },
      { label: "Team Attendance", href: "/attendance/admin", perms: ["hrms.attendance.read", "hrms.attendance.read_team"], navKey: "time.attendance-admin" },
      { label: "Approve Regularizations", href: "/attendance/regularizations", perms: ["hrms.attendance.approve", "hrms.attendance.read_team"], navKey: "time.regularizations" },
      { label: "Shift Roster", href: "/duty-roster", perms: ["hrms.roster.read", "hrms.roster.read_self", "hrms.roster.read_team"], navKey: "time.roster" },
    ],
  },
  {
    label: "Leaves",
    icon: <Palmtree size={18} />,
    section: "hr",
    perms: ["hrms.leave.read", "hrms.leave.read_self", "hrms.leave.read_team", "hrms.leave.apply"],
    children: [
      { label: "My Leaves", href: "/leaves", perms: ["hrms.leave.read_self", "hrms.leave.apply"], navKey: "leave.my" },
      { label: "Team Approvals", href: "/leaves/team-leaves", perms: ["hrms.leave.read_team"], navKey: "leave.team" },
      { label: "Leave Calendar", href: "/holidays", navKey: "leave.calendar" },
      { label: "Leave Settings", href: "/leaves/policies", perms: ["hrms.leave.manage"], navKey: "leave.policies" },
    ],
  },
  {
    label: "Work From Home",
    icon: <Home size={18} />,
    section: "hr",
    perms: ["hrms.employee.read_self"],
    children: [
      { label: "My WFH", href: "/wfh/my-requests", navKey: "wfh.my" },
      { label: "Team Approvals", href: "/wfh/team", perms: ["hrms.employee.read_team"], navKey: "wfh.approvals" },
      { label: "Quota Groups", href: "/settings/wfh-quota", perms: ["hrms.employee.write"], navKey: "wfh.quota" },
      { label: "Employees In Group", href: "/wfh/groups", perms: ["hrms.employee.write"], navKey: "wfh.groups" },
    ],
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
    navKey: "claims",
  },
  {
    label: "Expenses",
    icon: <Wallet size={18} />,
    section: "finance",
    perms: ["hrms.expense.read", "hrms.expense.read_self", "hrms.expense.read_team", "hrms.expense.submit"],
    children: [
      // Approvals are merged into Claims via the "Awaiting my approval" filter,
      // so there's no separate Approvals sub-item.
      { label: "Claims", href: "/expenses", navKey: "expenses.claims" },
      { label: "Policies", href: "/expenses/policies", perms: ["hrms.expense.manage"], navKey: "expenses.policies" },
      { label: "Reports", href: "/expenses/reports", perms: ["hrms.expense.read"], navKey: "expenses.reports" },
    ],
  },
  {
    label: "Payroll",
    icon: <Banknote size={18} />,
    section: "finance",
    // `hrms.employee.read_self` included so every employee can reach their own
    // payslips ("My Payslips" carries no perms of its own). All the admin
    // leaves below stay gated on hrms.settings.* — this only opens self-service.
    perms: ["hrms.settings.read", "hrms.settings.write", "hrms.employee.read_self"],
    children: [
      { label: "Analytics", href: "/payroll", perms: ["hrms.settings.read", "hrms.settings.write"], navKey: "payroll.analytics" },
      { label: "Pay Runs", href: "/payroll/runs", perms: ["hrms.settings.write"], navKey: "payroll.runs" },
      { label: "Employee Salaries", href: "/payroll/employee-salaries", perms: ["hrms.settings.write"], navKey: "payroll.salaries" },
      { label: "Payroll Approvals", href: "/payroll/approvals", perms: ["hrms.settings.write"], navKey: "payroll.approvals" },
      { label: "Tax Filings", href: "/payroll/tax-filings", perms: ["hrms.settings.write"], navKey: "payroll.tax-filings" },
      { label: "TDS & Challans", href: "/payroll/tds", perms: ["hrms.settings.write"], navKey: "payroll.tds" },
      { label: "One-Time Pay", href: "/payroll/one-time-earnings", perms: ["hrms.settings.write"], navKey: "payroll.one-time" },
      { label: "Final Settlement", href: "/payroll/full-final", perms: ["hrms.settings.write"], navKey: "payroll.full-final" },
      { label: "Reports", href: "/payroll/reports", perms: ["hrms.reports.read", "hrms.settings.write"], navKey: "payroll.reports" },
      { label: "My Payslips", href: "/payroll/my-payslips", navKey: "payroll.my" },
      { label: "Loans & Giving", href: "/payroll/advances", perms: ["hrms.settings.write"], navKey: "payroll.advances" },
      { label: "Prior Payroll", href: "/payroll/setup/prior-payroll", perms: ["hrms.settings.write"], navKey: "payroll.prior" },
    ],
  },
  {
    label: "Performance",
    icon: <Target size={18} />,
    section: "growth",
    perms: ["hrms.performance.read", "hrms.performance.read_self", "hrms.performance.read_team"],
    children: [
      { label: "Goals", href: "/performance/goals", navKey: "perf.goals" },
      { label: "Scorecard Templates", href: "/performance/kra-templates", perms: ["hrms.settings.write"], navKey: "perf.kra-templates" },
      { label: "Assign KRAs", href: "/performance/kra-assignments", perms: ["hrms.settings.write"], navKey: "perf.kra-assignments" },
      { label: "Appraisals", href: "/performance/reviews", navKey: "perf.reviews" },
      { label: "Continuous Feedback", href: "/performance/feedback", navKey: "perf.feedback" },
      { label: "Improvement Plans", href: "/performance/pip", perms: ["hrms.performance.pip"], navKey: "perf.pip" },
    ],
  },
  {
    label: "Recruitment",
    icon: <UserPlus size={18} />,
    section: "growth",
    perms: ["hrms.recruit.read", "hrms.recruit.write", "hrms.recruit.read_self", "hrms.recruit.performance.read", "hrms.recruit.performance.read_self"],
    children: [
      { label: "Dashboard", href: "/recruit/dashboard", perms: ["hrms.recruit.read", "hrms.recruit.write", "hrms.recruit.read_self", "hrms.recruit.performance.read", "hrms.recruit.performance.read_self"], navKey: "recruit.dashboard" },
      { label: "Current Job Openings", href: "/recruit/requisitions", perms: ["hrms.recruit.read", "hrms.recruit.read_self"], navKey: "recruit.requisitions" },
      { label: "Candidate Database", href: "/recruit/candidates", perms: ["hrms.recruit.read", "hrms.recruit.read_self"], navKey: "recruit.candidates" },
      { label: "Hiring Pipeline", href: "/recruit/pipeline", perms: ["hrms.recruit.read", "hrms.recruit.read_self"], navKey: "recruit.pipeline" },
      { label: "Interview Pipeline", href: "/recruit/interviews", perms: ["hrms.recruit.interview"], navKey: "recruit.interviews" },
      { label: "Candidate Document", href: "/settings/candidate-documents", perms: ["hrms.recruit.write", "hrms.recruit.requisition.write"], navKey: "recruit.candidate-doc-types" },
    ],
  },
  {
    label: "Engage",
    icon: <Heart size={18} />,
    section: "growth",
    perms: ["hrms.engage.read", "hrms.engage.post"],
    children: [
      { label: "Social Wall", href: "/engage/social-wall", navKey: "engage.social-wall" },
      { label: "Announcements", href: "/engage/announcements", navKey: "engage.announcements" },
      { label: "Surveys", href: "/engage/surveys", navKey: "engage.surveys" },
      { label: "Recognition", href: "/engage/recognition", navKey: "engage.recognition" },
      { label: "Approvals", href: "/engage/approvals", perms: ["hrms.engage.approve", "hrms.feedback.approve"], navKey: "engage.approvals" },
    ],
  },
  {
    label: "Documents",
    icon: <FileText size={18} />,
    section: "assets",
    perms: ["hrms.document.read", "hrms.document.read_self", "hrms.document.read_team"],
    children: [
      { label: "Company Documents", href: "/documents", perms: ["hrms.document.read"], navKey: "documents.company" },
      { label: "Employee Documents", href: "/documents/employees", perms: ["hrms.document.read"], navKey: "documents.employees" },
      { label: "My Vault", href: "/documents/my-vault", perms: ["hrms.document.read_self"], navKey: "documents.my-vault" },
      { label: "Insurance", href: "/documents/insurance", perms: ["hrms.document.read"], navKey: "documents.insurance" },
    ],
  },
  {
    label: "Reports",
    icon: <BarChart3 size={18} />,
    section: "settings",
    perms: ["hrms.reports.read", "hrms.audit.read"],
    children: [
      { label: "Dashboards", href: "/dashboards", perms: ["hrms.reports.read"], navKey: "reports.dashboards" },
      { label: "Analytics", href: "/analytics", perms: ["hrms.reports.read"], navKey: "reports.analytics" },
      { label: "Query Builder", href: "/reports", perms: ["hrms.reports.read"], navKey: "reports.query-builder" },
    ],
  },
  {
    label: "Users",
    href: "/settings/users",
    icon: <UserCog size={18} />,
    section: "settings",
    perms: ["hrms.user.invite"],
    navKey: "admin.users",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: <Settings size={18} />,
    section: "settings",
    // Only true settings-admins see this — NOT plain directory viewers.
    // (hrms.org.read / hrms.audit.read removed so Directory access alone no
    //  longer surfaces the Settings tab.)
    perms: ["hrms.settings.read", "hrms.settings.write", "hrms.rbac.manage"],
    navKey: "admin.settings",
  },
];

function childHasActive(child: NavChild, pathname: string): boolean {
  if (child.href && pathname === child.href) return true;
  return child.children?.some((c) => pathname === c.href) ?? false;
}

/**
 * Active state for a leaf link, aware of a `?tab=` query so siblings that share
 * the same path (e.g. Expenses → Claims `/expenses` vs Approvals
 * `/expenses?tab=approvals`) highlight correctly. A query-less child is the
 * default for its path — active unless a sibling's tab matches the current one.
 */
function leafActive(href: string, pathname: string, currentTab: string, siblings: NavChild[]): boolean {
  const [hPath, hQuery] = href.split("?");
  if (pathname !== hPath) return false;
  const hTab = new URLSearchParams(hQuery ?? "").get("tab");
  if (hTab) return currentTab === hTab;
  const siblingTabMatches = siblings.some((s) => {
    if (!s.href || s.href === href) return false;
    const [sPath, sQuery] = s.href.split("?");
    if (sPath !== hPath) return false;
    const sTab = new URLSearchParams(sQuery ?? "").get("tab");
    return !!sTab && sTab === currentTab;
  });
  return !siblingTabMatches;
}

export function Sidebar() {
  const rawPathname = usePathname();
  const router = useRouter();
  const api = useApiClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Which module group is expanded — only one open at a time (accordion).
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { roles } = useRoles();
  const { hasAnyPermission, permissions, navKeys, employee, role, preBoarding } = useDashboardConfig();
  const isSuper = permissions.includes("*");
  const pathname = mounted ? rawPathname : "";
  const searchParams = useSearchParams();
  const currentTab = mounted ? (searchParams?.get("tab") ?? "") : "";

  // Navigation allow-list (default-allow). Super admins and roles with no
  // saved navKeys see everything their permissions permit; otherwise a tab is
  // shown only when its navKey is in the allow-list. Nodes without a navKey
  // (e.g. parent groups) are never restricted here.
  const navSet = useMemo(() => new Set(navKeys), [navKeys]);
  const navConfigured = !isSuper && navSet.size > 0;
  const navAllowed = (key?: string) => {
    if (!navConfigured || !key) return true;
    if (navSet.has(key)) return true;
    // A parent link (e.g. "leave.policies") stays visible when any of its child
    // tab keys ("leave.policies.types", …) is granted.
    for (const k of navSet) if (k.startsWith(`${key}.`)) return true;
    return false;
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleCollapsed = () => setCollapsed((c) => !c);
  // Auto-close the sidebar after picking a module (it opens on demand only).
  const closeSidebar = () => setCollapsed(true);

  const nodeVisible = (n: { roles?: string[]; perms?: string[]; hideForSuperAdmin?: boolean }) => {
    if (n.hideForSuperAdmin && isSuper) return false;
    if (isSuper) return true;
    if (n.perms && n.perms.length > 0) return hasAnyPermission(n.perms);
    return hasAnyRole(roles, n.roles);
  };

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
          icon: <ClipboardList size={18} />,
          section: "core",
        },
      ];
      return lockdown;
    }

    const visible = (n: { roles?: string[]; perms?: string[]; hideForSuperAdmin?: boolean; navKey?: string }) =>
      nodeVisible(n) && navAllowed(n.navKey);

    const base = navigation
      .filter(visible)
      .map((item) => {
        if (!item.children) return item;
        const filteredChildren = item.children
          .filter(visible)
          .map((c) => {
            if (!c.children) return c;
            const leaves = c.children.filter(visible);
            return leaves.length ? { ...c, children: leaves } : null;
          })
          .filter((c): c is NavChild => c !== null);
        return filteredChildren.length ? { ...item, children: filteredChildren } : null;
      })
      .filter((item): item is NavItem => item !== null);

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles, permissions, navKeys, preBoarding, employee?.id]);

  const grouped = useMemo(() => {
    const map: Record<Section, NavItem[]> = { core: [], hr: [], finance: [], growth: [], assets: [], settings: [] };
    visibleNav.forEach((it) => { map[it.section].push(it); });
    return map;
  }, [visibleNav]);

  // The group the current route lives in (open by default until the user
  // clicks another). `openGroup` overrides it once the user interacts.
  const activeGroupLabel = navigation.find((it) => it.children?.some((c) => childHasActive(c, pathname)))?.label ?? null;
  // `openGroup === null` means "no user interaction yet" → fall back to the
  // active route's group. `COLLAPSED` is an explicit user-triggered close, so
  // clicking the active group collapses it instead of snapping back open.
  const effectiveOpen = openGroup === COLLAPSED ? null : (openGroup ?? activeGroupLabel);

  const renderItem = (item: NavItem) => {
    // Leaf item — a simple icon + label row.
    if (!item.children) {
      const active = pathname === item.href;
      return (
        <Link
          key={item.href}
          href={item.href!}
          className={clsx(
            "flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[14px] transition-colors",
            active ? "bg-[#eaf1fe] text-[#1f2937] font-semibold" : "text-[#374151] font-medium hover:bg-gray-100",
          )}
        >
          <span className={clsx("shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]", active && "text-[#2563eb]")}>{item.icon}</span>
          <span className="truncate">{item.label}</span>
        </Link>
      );
    }

    // Group — expands inline (accordion). Children indented with a tree line.
    const isChildActive = item.children.some((c) => childHasActive(c, pathname));
    const isOpen = effectiveOpen === item.label;
    return (
      <div key={item.label}>
        <button
          onClick={() => setOpenGroup(isOpen ? COLLAPSED : item.label)}
          className={clsx(
            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[14px] transition-colors",
            isChildActive ? "text-[#2563eb] font-semibold" : "text-[#374151] font-medium hover:bg-gray-100",
          )}
        >
          <span className={clsx("shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]", isChildActive && "text-[#2563eb]")}>{item.icon}</span>
          <span className="flex-1 text-left truncate">{item.label}</span>
          <ChevronRight size={15} className={clsx("shrink-0 text-slate-400 transition-transform", isOpen && "rotate-90")} />
        </button>
        {isOpen && (
          <div className="ml-[22px] pl-3 my-0.5 border-l border-slate-200 space-y-0.5">
            {item.children.map((child) => {
              if (child.children) {
                const subActive = child.children.some((g) => pathname === g.href);
                return (
                  <div key={child.label}>
                    <div className={clsx("px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide", subActive ? "text-[#2563eb]" : "text-slate-400")}>{child.label}</div>
                    {child.children.map((g) => {
                      const a = pathname === g.href;
                      return (
                        <Link
                          key={g.href}
                          href={g.href}
                          className={clsx(
                            "block px-3 py-2 rounded-[9px] text-[13.5px] transition-colors",
                            a ? "bg-[#eaf1fe] text-[#1f2937] font-semibold" : "text-slate-500 font-medium hover:bg-gray-100 hover:text-[#374151]",
                          )}
                        >
                          {g.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              }
              const a = leafActive(child.href!, pathname, currentTab, item.children ?? []);
              return (
                <Link
                  key={child.href}
                  href={child.href!}
                  className={clsx(
                    "block px-3 py-2 rounded-[9px] text-[13.5px] transition-colors",
                    a ? "bg-[#eaf1fe] text-[#1f2937] font-semibold" : "text-slate-500 font-medium hover:bg-gray-100 hover:text-[#374151]",
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
  };

  return (
    <aside className="w-[248px] shrink-0 h-screen bg-white text-[#374151] border-r border-slate-200 flex flex-col font-[var(--font-sans)]">
      {/* Brand */}
      <Link href="/dashboard" className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-slate-100">
        {companyLogo ? (
          <div className="w-10 h-10 rounded-lg bg-white overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBasePath(companyLogo)} alt={companyName} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shrink-0">
            <span className="text-white text-[13px] font-extrabold tracking-tight leading-none">
              {companyName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </span>
          </div>
        )}
        <span className="font-bold text-[15px] text-slate-900 truncate">{companyName}</span>
      </Link>

      {/* Profile */}
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
        {SECTION_ORDER.map((sec) => {
          const items = grouped[sec];
          if (!items || items.length === 0) return null;
          return (
            <div key={sec} className="mb-0.5 space-y-0.5">
              {items.map(renderItem)}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

