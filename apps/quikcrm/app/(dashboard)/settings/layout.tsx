"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isCrmAdmin } from "@/lib/auth/is-crm-admin";

// Each tab group maps to a multi-page settings section.
// Single-page sections (Company, Profile, Call Dispositions) need no tabs.

const TAB_GROUPS = [
  {
    tabs: [
      // Users is admin-only — see adminOnly filtering in SettingsLayout below.
      { href: "/settings/users", label: "Users", adminOnly: true },
      { href: "/settings/teams", label: "Teams" },
      { href: "/settings/sales-groups", label: "Sales Groups" },
      { href: "/settings/permissions", label: "Permission Templates" },
    ],
  },
  {
    tabs: [
      { href: "/settings/lead-scoring", label: "Lead Scoring" },
      { href: "/settings/fields", label: "Lead Fields" },
      { href: "/settings/stages", label: "Lead Stages" },
      { href: "/settings/sources", label: "Lead Sources" },
    ],
  },
  {
    tabs: [
      { href: "/settings/product-categories", label: "Categories & Brands" },
      { href: "/settings/product-fields", label: "Product Fields" },
      { href: "/settings/quote-templates", label: "Quote Templates" },
    ],
  },
  {
    tabs: [
      { href: "/settings/activity-types", label: "Activity Types" },
      { href: "/settings/activity-targets", label: "Activity Targets" },
      // Sales Cost is admin-only — see adminOnly filtering in SettingsLayout below.
      { href: "/settings/sales-cost", label: "Sales Cost", adminOnly: true },
    ],
  },
  {
    tabs: [
      { href: "/settings/email", label: "Email Accounts" },
      // { href: "/settings/api-keys", label: "API Keys" },
      // { href: "/settings/audit", label: "Audit Log" },
      { href: "/settings/notifications", label: "Notifications" },
    ],
  },
];

const ALL_NAV_ITEMS = [
  { href: "/settings/profile", label: "My Profile" },
  { href: "/settings/company", label: "Company" },
  { href: "/settings/users", label: "Users" },
  { href: "/settings/teams", label: "Teams" },
  { href: "/settings/sales-groups", label: "Sales Groups" },
  { href: "/settings/permissions", label: "Permission Templates" },
  { href: "/settings/lead-scoring", label: "Lead Scoring" },
  { href: "/settings/fields", label: "Lead Fields" },
  { href: "/settings/stages", label: "Lead Stages" },
  { href: "/settings/sources", label: "Lead Sources" },
  { href: "/settings/prospects", label: "Prospects" },
  { href: "/settings/call-dispositions", label: "Call Dispositions" },
  { href: "/settings/product-categories", label: "Categories & Brands" },
  { href: "/settings/product-fields", label: "Product Fields" },
  { href: "/settings/quote-templates", label: "Quote Templates" },
  { href: "/settings/activity-types", label: "Activity Types" },
  { href: "/settings/activity-targets", label: "Activity Targets" },
  { href: "/settings/sales-cost", label: "Sales Cost" },
  { href: "/settings/email", label: "Email Accounts" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/audit", label: "Audit Log" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/support", label: "Support Status" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = isCrmAdmin(user?.role);

  const activeItem = useMemo(
    () => ALL_NAV_ITEMS.find((item) => isActive(pathname, item.href)),
    [pathname],
  );

  // Find which tab group (if any) the current page belongs to. Matched against
  // the UNFILTERED tabs so a non-admin sitting on Teams still gets the group's
  // tab bar — only the admin-only tabs are dropped from what renders.
  const activeTabGroup = useMemo(() => {
    const group = TAB_GROUPS.find((g) => g.tabs.some((t) => isActive(pathname, t.href)));
    if (!group) return undefined;
    const tabs = group.tabs.filter(
      (t) => !("adminOnly" in t && t.adminOnly) || isAdmin,
    );
    return tabs.length > 0 ? { ...group, tabs } : undefined;
  }, [pathname, isAdmin]);

  return (
    <div className="min-w-0 bg-slate-50/70 px-2 pb-6 pt-2 sm:px-4 sm:pb-8 lg:px-6">
      <div className="mx-auto max-w-[1400px]">
        {/* Breadcrumb + page header */}
        <header className="mb-4 rounded-2xl border border-crm-border bg-white px-4 py-4 shadow-sm sm:px-6">
          <Link
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-crm-muted transition hover:bg-crm-panel hover:text-crm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
          >
            <ArrowLeft size={15} />
            Back
          </Link>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-crm-muted">
            <Link href="/dashboard" className="transition hover:text-crm-text">
              Workspace
            </Link>
            <ChevronRight size={13} />
            <span>Settings</span>
            {activeItem && (
              <>
                <ChevronRight size={13} />
                <span className="text-crm-text">{activeItem.label}</span>
              </>
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-crm-text sm:text-2xl">
            Settings
          </h1>
          <p className="mt-1 text-sm text-crm-muted">
            Manage profile, users, lead pipelines, product catalog, and integrations.
          </p>
        </header>

        {/* Section tab bar — shown whenever the current page belongs to a multi-page group */}
        {activeTabGroup && (
          <div className="mb-4 overflow-x-auto">
            <div className="flex min-w-max gap-1 rounded-xl border border-crm-border bg-white p-1 shadow-sm">
              {activeTabGroup.tabs.map((tab) => {
                const active = isActive(pathname, tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={
                      "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow " +
                      (active
                        ? "bg-crm-blue-soft text-crm-blue"
                        : "text-crm-muted hover:bg-crm-panel hover:text-crm-text")
                    }
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Full-width content */}
        <div className="min-w-0 rounded-2xl border border-crm-border bg-white p-4 shadow-sm sm:p-6 [&_.crm-card]:rounded-xl [&_.crm-card]:border [&_.crm-card]:border-crm-border [&_.crm-card]:shadow-sm [&_.crm-card]:transition [&_.crm-card]:hover:shadow-md [&_.crm-input]:h-11 [&_.crm-input]:rounded-lg [&_.crm-input]:border-crm-border [&_.crm-input]:bg-white [&_.crm-input]:focus-visible:ring-2 [&_.crm-input]:focus-visible:ring-crm-blue-glow">
          {children}
        </div>
      </div>
    </div>
  );
}
