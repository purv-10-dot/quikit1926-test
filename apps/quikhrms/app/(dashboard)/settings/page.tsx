"use client";

import Link from "next/link";
import { clsx } from "clsx";
import {
  Building2, Users, Shield, Sliders, Palette, Zap, ChevronRight,
  Briefcase, MapPin, Network, Award, GitBranch, CalendarDays,
  FileText, ClipboardList, LayoutGrid, Link2, RotateCcw, ShieldAlert,
} from "lucide-react";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

interface SectionLink {
  label: string;
  href: string;
  perms?: string[];
}

interface Section {
  title: string;
  accent: "emerald" | "blue" | "amber" | "purple" | "cyan";
  icon: React.ReactNode;
  links: SectionLink[];
}

const SECTIONS: Section[] = [
  {
    title: "Organisation",
    accent: "emerald",
    icon: <Building2 size={16} />,
    links: [
      { label: "Company Profile", href: "/settings/company", perms: ["hrms.settings.read", "hrms.settings.write"] },
      { label: "Departments", href: "/settings/departments", perms: ["hrms.org.read", "hrms.org.write"] },
      { label: "Designations", href: "/settings/designations", perms: ["hrms.org.read", "hrms.org.write"] },
      { label: "Work Locations", href: "/settings/locations", perms: ["hrms.org.read", "hrms.org.write"] },
      { label: "Teams", href: "/settings/teams", perms: ["hrms.org.read", "hrms.org.write"] },
      { label: "Grades", href: "/settings/grades", perms: ["hrms.org.read", "hrms.org.write"] },
      { label: "Legal Entities", href: "/settings/legal-entities", perms: ["hrms.settings.write"] },
    ],
  },
  {
    title: "Users & Roles",
    accent: "blue",
    icon: <Users size={16} />,
    links: [
      { label: "Invite Users", href: "/settings/users", perms: ["hrms.user.invite"] },
      { label: "Employees", href: "/employees", perms: ["hrms.employee.read", "hrms.employee.read_team"] },
      { label: "Roles & Permissions", href: "/settings/roles", perms: ["hrms.rbac.manage"] },
      { label: "User Permissions", href: "/settings/user-permissions", perms: ["hrms.rbac.manage"] },
      { label: "Delegations", href: "/delegations", perms: ["hrms.employee.read", "hrms.employee.read_team"] },
      { label: "Audit Log", href: "/settings/audit-log", perms: ["hrms.audit.read"] },
    ],
  },
  {
    title: "Setup & Configurations",
    accent: "amber",
    icon: <Sliders size={16} />,
    links: [
      { label: "Holiday Calendar", href: "/settings/holiday-calendar", perms: ["hrms.settings.write"] },
      { label: "Approval Chains", href: "/settings/approval-chains", perms: ["hrms.settings.write"] },
      { label: "Hiring Pipelines", href: "/settings/pipelines", perms: ["hrms.recruit.write"] },
      { label: "Candidate Documents", href: "/settings/candidate-documents", perms: ["hrms.recruit.write"] },
      { label: "Leave Policies", href: "/leaves/policies", perms: ["hrms.leave.manage"] },
      { label: "Expense Policies", href: "/expenses/policies", perms: ["hrms.expense.manage"] },
      { label: "Shifts", href: "/shifts", perms: ["hrms.attendance.manage"] },
      { label: "Ticket Categories", href: "/tickets/categories", perms: ["hrms.ticket.manage"] },
    ],
  },
  {
    title: "Customisations",
    accent: "purple",
    icon: <Palette size={16} />,
    links: [
      { label: "Onboarding Templates", href: "/onboarding/templates", perms: ["hrms.onboarding.write"] },
      { label: "Offer Letter Branding", href: "/settings/branding", perms: ["hrms.settings.write"] },
      { label: "Report Templates", href: "/reports", perms: ["hrms.reports.manage"] },
      { label: "Email Templates", href: "/settings/email-templates", perms: ["hrms.settings.write"] },
    ],
  },
  {
    title: "Automations",
    accent: "cyan",
    icon: <Zap size={16} />,
    links: [
      { label: "Scheduled Jobs", href: "/time-logs", perms: ["hrms.attendance.manage"] },
    ],
  },
];

const QUICK_LINKS: { label: string; href: string; icon: React.ReactNode; perms?: string[] }[] = [
  { label: "Company", href: "/settings/company", icon: <Building2 size={14} />, perms: ["hrms.settings.read"] },
  { label: "Departments", href: "/settings/departments", icon: <Network size={14} />, perms: ["hrms.org.read"] },
  { label: "Designations", href: "/settings/designations", icon: <Briefcase size={14} />, perms: ["hrms.org.read"] },
  { label: "Locations", href: "/settings/locations", icon: <MapPin size={14} />, perms: ["hrms.org.read"] },
  { label: "Grades", href: "/settings/grades", icon: <Award size={14} />, perms: ["hrms.org.read"] },
  { label: "Holidays", href: "/settings/holiday-calendar", icon: <CalendarDays size={14} /> },
  { label: "Pipelines", href: "/settings/pipelines", icon: <GitBranch size={14} />, perms: ["hrms.recruit.write"] },
  { label: "Approvals", href: "/settings/approval-chains", icon: <Link2 size={14} /> },
  { label: "Roles", href: "/settings/roles", icon: <Shield size={14} />, perms: ["hrms.rbac.manage"] },
  { label: "Audit", href: "/settings/audit-log", icon: <FileText size={14} />, perms: ["hrms.audit.read"] },
];

const ACCENT_BG: Record<Section["accent"], string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  blue: "bg-[#dbeafe] text-[#3b82f6]",
  amber: "bg-amber-50 text-amber-600",
  purple: "bg-purple-50 text-purple-600",
  cyan: "bg-cyan-50 text-cyan-600",
};

export default function SettingsPage() {
  const { hasAnyPermission, permissions } = useDashboardConfig();
  const isSuper = permissions.includes("*");
  const allow = (p?: string[]) => !p || p.length === 0 || isSuper || hasAnyPermission(p);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm">
            <Sliders size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">Configure your organisation, users, policies, and automations.</p>
          </div>
        </div>

        {/* Quick links row */}
        <div className="flex flex-wrap gap-1.5 mt-5 pt-4 border-t border-gray-100">
          {QUICK_LINKS.filter((q) => allow(q.perms)).map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-[#dbeafe] hover:text-[#2563eb] border border-gray-200 hover:border-[#bfdbfe] rounded-md transition"
            >
              {q.icon}
              {q.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Grouped sections */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <LayoutGrid size={16} className="text-gray-500" />
          <h2 className="text-base font-semibold text-gray-900">Organisation Settings</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {SECTIONS.map((s) => {
            const links = s.links.filter((l) => allow(l.perms));
            if (links.length === 0) return null;
            return (
              <div
                key={s.title}
                className="rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition bg-white flex flex-col"
              >
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center", ACCENT_BG[s.accent])}>
                    {s.icon}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{s.title}</h3>
                </div>
                <div className="py-1 flex-1">
                  {links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="group flex items-center justify-between gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#2563eb] transition"
                    >
                      <span>{l.label}</span>
                      <ChevronRight size={13} className="text-gray-300 group-hover:text-[#3b82f6] opacity-0 group-hover:opacity-100 transition" />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tips footer */}
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#dbeafe] flex items-center justify-center flex-shrink-0">
          <ClipboardList size={15} className="text-[#3b82f6]" />
        </div>
        <div className="text-xs text-gray-600">
          <p className="font-semibold text-gray-800">Need granular control?</p>
          <p className="mt-0.5">Use <Link href="/settings/roles" className="text-[#3b82f6] font-medium hover:underline">Roles & Permissions</Link> to define fine-grained access.</p>
        </div>
      </div>

      {/* Danger Zone */}
      {allow(["hrms.settings.write"]) && (
        <div className="rounded-xl border border-red-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-red-100 bg-gradient-to-r from-red-50 to-white flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-600" />
            <h2 className="text-sm font-semibold text-gray-900">Danger Zone</h2>
          </div>
          <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 flex-1 min-w-[240px]">
              <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <RotateCcw size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Reset Payroll Setup</p>
                <p className="text-xs text-gray-500 mt-0.5">Wipe all payroll data and restart the 7-step walkthrough. Cannot be undone.</p>
              </div>
            </div>
            <Link
              href="/settings/payroll-reset"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-red-300 text-red-700 bg-white hover:bg-red-50 rounded-md text-xs font-semibold transition"
            >
              <RotateCcw size={12} /> Reset Payroll
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
