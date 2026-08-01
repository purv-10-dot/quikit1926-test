"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  Building2, Users, Shield, Sliders, Palette, ChevronRight,
  Briefcase, MapPin, Network, GitBranch, CalendarDays,
  FileText, ClipboardList, LayoutGrid, Link2, RotateCcw, ShieldAlert,
  Home, Mail, Clock, Receipt,
  ShieldCheck, BarChart3, CalendarClock,
  LifeBuoy, ExternalLink,
} from "lucide-react";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { PageBackground } from "@/components/hrms/page-background";

interface Item {
  label: string;
  href: string;
  icon: React.ReactNode;
  perms?: string[];
}

interface CategoryDef {
  key: string;
  title: string;
  description: string;
  accent: "purple" | "emerald" | "amber" | "blue";
  icon: React.ReactNode;
  items: Item[];
}

const CATEGORIES: CategoryDef[] = [
  {
    key: "organisation",
    title: "Organization",
    description: "Manage company structure and organizational settings",
    accent: "purple",
    icon: <Building2 size={18} />,
    items: [
      { label: "Company Profile", href: "/settings/company", icon: <Building2 size={14} />, perms: ["hrms.settings.read", "hrms.settings.write"] },
      { label: "Departments", href: "/settings/departments", icon: <Network size={14} />, perms: ["hrms.org.read", "hrms.org.write"] },
      { label: "Designations", href: "/settings/designations", icon: <Briefcase size={14} />, perms: ["hrms.org.read", "hrms.org.write"] },
      { label: "Work Locations", href: "/settings/locations", icon: <MapPin size={14} />, perms: ["hrms.org.read", "hrms.org.write"] },
      // "Teams", "Grades" and "Legal Entities" hidden from Settings — nothing
      // else was removed, the pages/APIs/data models are all untouched, so any
      // of them can be brought back by re-adding its one line here.
    ],
  },
  {
    key: "users-roles",
    title: "Users & Roles",
    description: "Manage users, roles, permissions and access controls",
    accent: "emerald",
    icon: <Users size={18} />,
    items: [
      // "Invite Users" and "Employees" removed from Settings — reachable
      // elsewhere already (sidebar → Users, sidebar → People → Directory).
      { label: "Roles & Permissions", href: "/settings/roles", icon: <Shield size={14} />, perms: ["hrms.rbac.manage"] },
      { label: "User Permissions", href: "/settings/user-permissions", icon: <ShieldCheck size={14} />, perms: ["hrms.rbac.manage"] },
      { label: "Audit Log", href: "/settings/audit-log", icon: <FileText size={14} />, perms: ["hrms.audit.read"] },
    ],
  },
  {
    key: "setup-configuration",
    title: "Setup & Configuration",
    description: "Configure HR policies, workflows and system preferences",
    accent: "amber",
    icon: <Sliders size={18} />,
    items: [
      { label: "Holiday Calendar", href: "/settings/holiday-calendar", icon: <CalendarDays size={14} />, perms: ["hrms.settings.write"] },
      { label: "Approval Chains", href: "/settings/approval-chains", icon: <Link2 size={14} />, perms: ["hrms.settings.write"] },
      { label: "Hiring Pipelines", href: "/settings/pipelines", icon: <GitBranch size={14} />, perms: ["hrms.recruit.write"] },
      { label: "Candidate Documents", href: "/settings/candidate-documents", icon: <FileText size={14} />, perms: ["hrms.recruit.write"] },
      { label: "Leave Policies", href: "/leaves/policies", icon: <CalendarClock size={14} />, perms: ["hrms.leave.manage"] },
      { label: "Expense Policies", href: "/expenses/policies", icon: <Receipt size={14} />, perms: ["hrms.expense.manage"] },
      { label: "Shifts", href: "/shifts", icon: <Clock size={14} />, perms: ["hrms.attendance.manage"] },
      { label: "WFH Quota", href: "/settings/wfh-quota", icon: <Home size={14} />, perms: ["hrms.attendance.manage", "hrms.employee.write"] },
    ],
  },
  {
    key: "customisations",
    title: "Customizations",
    description: "Customize templates, branding and system communications",
    accent: "blue",
    icon: <Palette size={18} />,
    items: [
      { label: "Pre-Onboarding Templates", href: "/pre-onboarding/templates", icon: <ClipboardList size={14} />, perms: ["hrms.onboarding.write"] },
      { label: "Onboarding Templates", href: "/onboarding/templates", icon: <ClipboardList size={14} />, perms: ["hrms.onboarding.write"] },
      { label: "Offboarding Templates", href: "/offboarding/templates", icon: <ClipboardList size={14} />, perms: ["hrms.offboarding.write"] },
      { label: "Offer Letter Branding", href: "/settings/branding", icon: <Palette size={14} />, perms: ["hrms.settings.write"] },
      { label: "Joining Letter Branding", href: "/settings/joining-letter", icon: <FileText size={14} />, perms: ["hrms.settings.write"] },
      { label: "Resignation Acceptance Letter", href: "/settings/resignation-letter", icon: <FileText size={14} />, perms: ["hrms.settings.write"] },
      { label: "Exit Letters (Relieving / Experience)", href: "/settings/exit-letters", icon: <FileText size={14} />, perms: ["hrms.settings.write"] },
      { label: "Report Templates", href: "/reports", icon: <BarChart3 size={14} />, perms: ["hrms.reports.manage"] },
      { label: "Email Templates", href: "/settings/email-templates", icon: <Mail size={14} />, perms: ["hrms.settings.write"] },
    ],
  },
];

const ACCENT: Record<CategoryDef["accent"], { circle: string; pill: string; button: string }> = {
  purple: { circle: "bg-purple-100 text-purple-600", pill: "bg-purple-100 text-purple-700", button: "bg-purple-100 text-purple-700 hover:bg-purple-200" },
  emerald: { circle: "bg-emerald-100 text-emerald-600", pill: "bg-emerald-100 text-emerald-700", button: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" },
  amber: { circle: "bg-amber-100 text-amber-600", pill: "bg-amber-100 text-amber-700", button: "bg-amber-100 text-amber-700 hover:bg-amber-200" },
  blue: { circle: "bg-blue-100 text-blue-600", pill: "bg-blue-100 text-blue-700", button: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
};

export default function SettingsPage() {
  const { hasAnyPermission, permissions } = useDashboardConfig();
  const isSuper = permissions.includes("*");
  const allow = (p?: string[]) => !p || p.length === 0 || isSuper || hasAnyPermission(p);

  // "all" shows every category card; picking one from the left nav narrows
  // the grid to just that category.
  const [activeKey, setActiveKey] = useState<string>("all");

  const visibleCategories = useMemo(
    () =>
      CATEGORIES.map((c) => ({ ...c, items: c.items.filter((i) => allow(i.perms)) }))
        .filter((c) => c.items.length > 0)
        .filter((c) => activeKey === "all" || c.key === activeKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions, activeKey],
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />

      {/* ── Left: Settings sub-nav ─────────────────────────── */}
      <aside className="w-full lg:w-64 shrink-0 space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm shrink-0">
              <Sliders size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold text-gray-900">Settings</h1>
              <p className="text-[11px] text-gray-500 truncate">Manage your HRMS preferences</p>
            </div>
          </div>

          <nav className="space-y-0.5">
            <button
              type="button"
              onClick={() => setActiveKey("all")}
              className={clsx(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition text-left",
                activeKey === "all" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50",
              )}
            >
              <LayoutGrid size={15} /> All Settings
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setActiveKey(c.key)}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition text-left",
                  activeKey === c.key ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50",
                )}
              >
                {c.icon} {c.title}
              </button>
            ))}
          </nav>
        </div>

        {/* Danger Zone */}
        {allow(["hrms.settings.write"]) && (
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-red-100 dark:border-red-900/40 bg-gradient-to-r from-red-50 to-white dark:from-red-950/40 dark:to-transparent flex items-center gap-2">
              <ShieldAlert size={14} className="text-red-600 dark:text-red-400" />
              <h2 className="text-[12.5px] font-semibold text-gray-900 dark:text-red-100">Danger Zone</h2>
            </div>
            <div className="p-3.5">
              <div className="flex items-start gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                  <RotateCcw size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-gray-900">Reset Payroll Setup</p>
                  <p className="text-[10.5px] text-gray-500 mt-0.5 leading-relaxed">Wipe all payroll data and restart the 7-step walkthrough. Cannot be undone.</p>
                </div>
              </div>
              <Link
                href="/settings/payroll-reset"
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 bg-white dark:bg-transparent hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg text-xs font-medium transition"
              >
                <RotateCcw size={13} /> Reset Payroll
              </Link>
            </div>
          </div>
        )}

        {/* Need Help */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <LifeBuoy size={16} />
            </div>
            <h3 className="text-[13px] font-semibold text-gray-900">Need Help?</h3>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            Explore our documentation or contact support for assistance.
          </p>
          <button
            type="button"
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-indigo-600 text-xs font-semibold hover:bg-gray-50 transition"
          >
            View Help Center <ExternalLink size={12} />
          </button>
        </div>
      </aside>

      {/* ── Right: category cards ──────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{activeKey === "all" ? "All Settings" : CATEGORIES.find((c) => c.key === activeKey)?.title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage all aspects of your HRMS in one place</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
          {visibleCategories.map((c) => {
            const a = ACCENT[c.accent];
            return (
              <div key={c.key} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-col">
                <div className="flex items-center gap-2.5">
                  <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", a.circle)}>{c.icon}</div>
                  <h3 className="text-[13px] font-semibold text-gray-900 flex-1 min-w-0 truncate">{c.title}</h3>
                  <span className={clsx("text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0", a.pill)}>{c.items.length}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-2 mb-3 leading-relaxed">{c.description}</p>

                <div className="flex-1">
                  {c.items.map((i) => (
                    <SettingRow key={i.href} item={i} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SettingRow({ item }: { item: Item }) {
  return (
    <Link
      href={item.href}
      className="group flex items-center gap-2 px-3 py-2 text-[13px] text-gray-700 hover:text-[#16a34a] hover:bg-gray-50 transition rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bbf7d0]"
    >
      <span className="text-gray-400 group-hover:text-[#22c55e] transition shrink-0">{item.icon}</span>
      <span className="truncate flex-1 min-w-0">{item.label}</span>
      <ChevronRight size={13} className="text-gray-300 group-hover:text-[#22c55e] opacity-0 group-hover:opacity-100 transition shrink-0" />
    </Link>
  );
}
