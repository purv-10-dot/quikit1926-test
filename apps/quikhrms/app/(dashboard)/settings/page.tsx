"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  Building2, Users, Shield, Sliders, Palette, ChevronRight,
  Briefcase, MapPin, Network, Award, GitBranch, CalendarDays,
  FileText, ClipboardList, LayoutGrid, Link2, RotateCcw, ShieldAlert,
  Search, Star, Home, Mail, Clock, Receipt, UserPlus,
  ShieldCheck, BarChart3, Landmark, UserCog, CalendarClock,
  X, PinOff,
} from "lucide-react";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { PageBackground } from "@/components/hrms/page-background";

interface Item {
  label: string;
  href: string;
  icon: React.ReactNode;
  perms?: string[];
  keywords?: string;
}

interface Section {
  title: string;
  accent: "emerald" | "blue" | "amber" | "purple" | "cyan" | "rose";
  icon: React.ReactNode;
  items: Item[];
}

const SECTIONS: Section[] = [
  {
    title: "Organisation",
    accent: "emerald",
    icon: <Building2 size={16} />,
    items: [
      { label: "Company Profile", href: "/settings/company", icon: <Building2 size={14} />, perms: ["hrms.settings.read", "hrms.settings.write"], keywords: "org organisation name logo" },
      { label: "Departments", href: "/settings/departments", icon: <Network size={14} />, perms: ["hrms.org.read", "hrms.org.write"] },
      { label: "Designations", href: "/settings/designations", icon: <Briefcase size={14} />, perms: ["hrms.org.read", "hrms.org.write"], keywords: "job title" },
      { label: "Work Locations", href: "/settings/locations", icon: <MapPin size={14} />, perms: ["hrms.org.read", "hrms.org.write"], keywords: "office branch site" },
      { label: "Teams", href: "/settings/teams", icon: <Users size={14} />, perms: ["hrms.org.read", "hrms.org.write"] },
      { label: "Grades", href: "/settings/grades", icon: <Award size={14} />, perms: ["hrms.org.read", "hrms.org.write"], keywords: "level band" },
      { label: "Legal Entities", href: "/settings/legal-entities", icon: <Landmark size={14} />, perms: ["hrms.settings.write"], keywords: "company entity registration" },
    ],
  },
  {
    title: "Users & Roles",
    accent: "blue",
    icon: <Users size={16} />,
    items: [
      { label: "Invite Users", href: "/settings/users", icon: <UserPlus size={14} />, perms: ["hrms.user.invite"], keywords: "add member invitation" },
      { label: "Employees", href: "/employees", icon: <Users size={14} />, perms: ["hrms.employee.read", "hrms.employee.read_team"], keywords: "staff people directory" },
      { label: "Roles & Permissions", href: "/settings/roles", icon: <Shield size={14} />, perms: ["hrms.rbac.manage"], keywords: "rbac access control" },
      { label: "User Permissions", href: "/settings/user-permissions", icon: <ShieldCheck size={14} />, perms: ["hrms.rbac.manage"], keywords: "rbac access override" },
      { label: "Delegations", href: "/delegations", icon: <UserCog size={14} />, perms: ["hrms.employee.read", "hrms.employee.read_team"], keywords: "delegate stand-in cover" },
      { label: "Audit Log", href: "/settings/audit-log", icon: <FileText size={14} />, perms: ["hrms.audit.read"], keywords: "activity history trail" },
    ],
  },
  {
    title: "Setup & Configurations",
    accent: "amber",
    icon: <Sliders size={16} />,
    items: [
      { label: "Holiday Calendar", href: "/settings/holiday-calendar", icon: <CalendarDays size={14} />, perms: ["hrms.settings.write"], keywords: "holidays public leave days" },
      { label: "Approval Chains", href: "/settings/approval-chains", icon: <Link2 size={14} />, perms: ["hrms.settings.write"], keywords: "workflow approver" },
      { label: "Hiring Pipelines", href: "/settings/pipelines", icon: <GitBranch size={14} />, perms: ["hrms.recruit.write"], keywords: "recruitment stages ats" },
      { label: "Candidate Documents", href: "/settings/candidate-documents", icon: <FileText size={14} />, perms: ["hrms.recruit.write"], keywords: "recruitment files" },
      { label: "Leave Policies", href: "/leaves/policies", icon: <CalendarClock size={14} />, perms: ["hrms.leave.manage"], keywords: "time off vacation" },
      { label: "Expense Policies", href: "/expenses/policies", icon: <Receipt size={14} />, perms: ["hrms.expense.manage"], keywords: "reimbursement claims" },
      { label: "Shifts", href: "/shifts", icon: <Clock size={14} />, perms: ["hrms.attendance.manage"], keywords: "roster timing rota" },
      { label: "WFH Quota", href: "/settings/wfh-quota", icon: <Home size={14} />, perms: ["hrms.attendance.manage", "hrms.employee.write"], keywords: "work from home remote quota groups" },
    ],
  },
  {
    title: "Customisations",
    accent: "purple",
    icon: <Palette size={16} />,
    items: [
      { label: "Pre-Onboarding Templates", href: "/pre-onboarding/templates", icon: <ClipboardList size={14} />, perms: ["hrms.onboarding.write"], keywords: "pre-boarding bgv background verification pre joining checklist" },
      { label: "Onboarding Templates", href: "/onboarding/templates", icon: <ClipboardList size={14} />, perms: ["hrms.onboarding.write"], keywords: "joining checklist" },
      { label: "Offboarding Templates", href: "/offboarding/templates", icon: <ClipboardList size={14} />, perms: ["hrms.offboarding.write"], keywords: "exit clearance checklist" },
      { label: "Offer Letter Branding", href: "/settings/branding", icon: <Palette size={14} />, perms: ["hrms.settings.write"], keywords: "brand logo colour theme offer letter" },
      { label: "Joining Letter Branding", href: "/settings/joining-letter", icon: <FileText size={14} />, perms: ["hrms.settings.write"], keywords: "appointment joining letter template onboarding" },
      { label: "Resignation Acceptance Letter", href: "/settings/resignation-letter", icon: <FileText size={14} />, perms: ["hrms.settings.write"], keywords: "resignation acceptance letter template offboarding exit" },
      { label: "Exit Letters (Relieving / Experience)", href: "/settings/exit-letters", icon: <FileText size={14} />, perms: ["hrms.settings.write"], keywords: "relieving experience letter certificate template offboarding exit" },
      { label: "Report Templates", href: "/reports", icon: <BarChart3 size={14} />, perms: ["hrms.reports.manage"], keywords: "analytics export" },
      { label: "Email Templates", href: "/settings/email-templates", icon: <Mail size={14} />, perms: ["hrms.settings.write"], keywords: "mail notification message" },
    ],
  },
];

// Default pinned favourites (first-run). Users can customise via the star toggle.
const DEFAULT_PINS = [
  "/settings/company",
  "/settings/departments",
  "/settings/designations",
  "/settings/locations",
  "/settings/holiday-calendar",
  "/settings/roles",
  "/settings/audit-log",
];

const PIN_STORAGE_KEY = "hrms.settings.pins";

const ACCENT_BG: Record<Section["accent"], string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  blue: "bg-[#dcfce7] text-[#22c55e]",
  amber: "bg-amber-50 text-amber-600",
  purple: "bg-purple-50 text-purple-600",
  cyan: "bg-cyan-50 text-cyan-600",
  rose: "bg-rose-50 text-rose-600",
};

export default function SettingsPage() {
  const { hasAnyPermission, permissions } = useDashboardConfig();
  const isSuper = permissions.includes("*");
  const allow = (p?: string[]) => !p || p.length === 0 || isSuper || hasAnyPermission(p);

  const [query, setQuery] = useState("");
  const [pins, setPins] = useState<Set<string>>(new Set());
  const [pinsLoaded, setPinsLoaded] = useState(false);

  // Load pinned favourites from localStorage (per-browser, per-user).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
      setPins(new Set<string>(raw ? JSON.parse(raw) : DEFAULT_PINS));
    } catch {
      setPins(new Set(DEFAULT_PINS));
    }
    setPinsLoaded(true);
  }, []);

  const persistPins = (next: Set<string>) => {
    try {
      window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore quota / private-mode errors */
    }
  };

  const togglePin = (href: string) => {
    setPins((prev) => {
      const next = new Set(prev);
      next.has(href) ? next.delete(href) : next.add(href);
      persistPins(next);
      return next;
    });
  };

  // Flatten all permitted items once for search + pinned lookup.
  const allItems = useMemo(
    () => SECTIONS.flatMap((s) => s.items).filter((i) => allow(i.perms)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions],
  );

  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;
  const matches = (i: Item) =>
    !isSearching || `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q);

  const searchResults = useMemo(
    () => (isSearching ? allItems.filter(matches) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, allItems],
  );

  const pinnedItems = allItems.filter((i) => pins.has(i.href));

  return (
    <div className="space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm">
            <Sliders size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-gray-900">Settings</h1>
            <p className="text-xs text-gray-500 mt-0.5">Configure your organisation, users, policies, and automations.</p>
          </div>
        </div>

        {/* Search */}
        <div role="search" className="mt-4">
          <label htmlFor="settings-search" className="sr-only">Search settings</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              id="settings-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings…  (e.g. leave, roles, holidays)"
              className="w-full pl-9 pr-9 py-2 text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#bbf7d0] focus:border-[#22c55e] focus:bg-white transition"
              autoComplete="off"
            />
            {isSearching && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Search results */}
      {isSearching ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <Search size={16} className="text-gray-500" />
            <h2 className="text-[13px] font-semibold text-gray-900">
              {searchResults.length} result{searchResults.length === 1 ? "" : "s"} for “{query.trim()}”
            </h2>
          </div>
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
              {searchResults.map((i) => (
                <SettingRow key={i.href} item={i} pinned={pins.has(i.href)} onTogglePin={togglePin} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-2">
                <Search size={16} className="text-gray-400" />
              </div>
              <p className="text-[13px] font-medium text-gray-700">No settings found</p>
              <p className="text-xs text-gray-500 mt-0.5">Try a different keyword or clear the search.</p>
            </div>
          )}
        </div>
      ) : (
        /* Grouped sections */
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-5">
            <LayoutGrid size={16} className="text-gray-500" />
            <h2 className="text-[13px] font-semibold text-gray-900">All Settings</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4">
            {SECTIONS.map((s) => {
              const items = s.items.filter((i) => allow(i.perms));
              if (items.length === 0) return null;
              return (
                <div
                  key={s.title}
                  className="rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition bg-white flex flex-col"
                >
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center", ACCENT_BG[s.accent])}>
                      {s.icon}
                    </div>
                    <h3 className="text-[13px] font-semibold text-gray-900">{s.title}</h3>
                    <span className="ml-auto text-[11px] font-medium text-gray-400">{items.length}</span>
                  </div>
                  <div className="py-1 flex-1">
                    {items.map((i) => (
                      <SettingRow key={i.href} item={i} pinned={pins.has(i.href)} onTogglePin={togglePin} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Danger Zone */}
      {!isSearching && allow(["hrms.settings.write"]) && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-red-100 dark:border-red-900/40 bg-gradient-to-r from-red-50 to-white dark:from-red-950/40 dark:to-transparent flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-600 dark:text-red-400" />
            <h2 className="text-[13px] font-semibold text-gray-900 dark:text-red-100">Danger Zone</h2>
          </div>
          <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 flex-1 min-w-[240px]">
              <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <RotateCcw size={16} />
              </div>
              <div>
                <p className="text-[13px] font-medium text-gray-900">Reset Payroll Setup</p>
                <p className="text-xs text-gray-500 mt-0.5">Wipe all payroll data and restart the 7-step walkthrough. Cannot be undone.</p>
              </div>
            </div>
            <Link
              href="/settings/payroll-reset"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 bg-white dark:bg-transparent hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md text-xs font-medium transition"
            >
              <RotateCcw size={13} /> Reset Payroll
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow({
  item,
  pinned,
  onTogglePin,
}: {
  item: Item;
  pinned: boolean;
  onTogglePin: (href: string) => void;
}) {
  return (
    <div className="group flex items-center rounded-md hover:bg-gray-50 transition">
      <Link
        href={item.href}
        className="flex flex-1 min-w-0 items-center gap-2 px-3 py-2 text-[13px] text-gray-700 group-hover:text-[#16a34a] transition rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bbf7d0]"
      >
        <span className="text-gray-400 group-hover:text-[#22c55e] transition shrink-0">{item.icon}</span>
        <span className="truncate">{item.label}</span>
        <ChevronRight size={13} className="ml-auto text-gray-300 group-hover:text-[#22c55e] opacity-0 group-hover:opacity-100 transition shrink-0" />
      </Link>
      <button
        type="button"
        onClick={() => onTogglePin(item.href)}
        aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
        aria-pressed={pinned}
        className={clsx(
          "px-2 py-2 shrink-0 rounded-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bbf7d0]",
          pinned
            ? "text-amber-400 hover:text-amber-500"
            : "text-gray-300 opacity-0 group-hover:opacity-100 hover:text-amber-400",
        )}
      >
        <Star size={14} className={pinned ? "fill-amber-400" : ""} />
      </button>
    </div>
  );
}
