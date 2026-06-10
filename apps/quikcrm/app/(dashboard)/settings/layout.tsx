"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  Building2,
  Phone,
  ChevronDown,
  ChevronRight,
  FileText,
  Gauge,
  Layers3,
  ListChecks,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Profile",
    items: [
      { href: "/settings/profile", label: "My Profile", icon: Users },
      { href: "/settings/company", label: "Company", icon: Building2 },
    ],
  },
  {
    group: "Users & Teams",
    items: [
      { href: "/settings/users", label: "Users", icon: Users },
      { href: "/settings/teams", label: "Teams", icon: Layers3 },
      { href: "/settings/sales-groups", label: "Sales Groups", icon: Workflow },
      { href: "/settings/permissions", label: "Permission Templates", icon: ShieldCheck },
    ],
  },
  {
    group: "Leads",
    items: [
      { href: "/settings/lead-scoring", label: "Lead Scoring", icon: Gauge },
      { href: "/settings/fields", label: "Lead Fields", icon: SlidersHorizontal },
      { href: "/settings/stages", label: "Lead Stages", icon: ListChecks },
      { href: "/settings/sources", label: "Lead Sources", icon: Layers3 },
    ],
  },
  {
    group: "Call Disposition",
    items: [
      { href: "/settings/call-dispositions", label: "Call Dispositions", icon: Phone },
    ],
  },
  {
    group: "Products",
    items: [
      { href: "/settings/product-categories", label: "Categories & Brands", icon: Layers3 },
      { href: "/settings/product-fields", label: "Product Fields", icon: SlidersHorizontal },
      { href: "/settings/quote-templates", label: "Quote Templates", icon: FileText },
    ],
  },
  {
    group: "Other",
    items: [
      { href: "/settings/integrations", label: "Integrations", icon: Workflow },
      { href: "/settings/audit", label: "Audit Log", icon: ShieldCheck },
      { href: "/settings/notifications", label: "Notifications", icon: Bell },
    ],
  },
];

const COLLAPSIBLE_GROUPS = new Set([
  "Users & Teams",
  "Leads",
  "Call Disposition",
  "Products",
  "Other",
]);

function isCollapsibleGroup(groupName: string): boolean {
  return COLLAPSIBLE_GROUPS.has(groupName);
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SettingsSidebar({
  pathname,
  groups,
  query,
  onQueryChange,
  onNavigate,
}: {
  pathname: string;
  groups: typeof NAV;
  query: string;
  onQueryChange: (value: string) => void;
  onNavigate?: () => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    // Start every collapsible group collapsed, then open the one that contains
    // the current page so the active item is always visible on mount.
    const initial = Object.fromEntries(
      [...COLLAPSIBLE_GROUPS].map((group) => [group, false]),
    );
    for (const group of NAV) {
      if (
        isCollapsibleGroup(group.group) &&
        group.items.some((item) => isActive(pathname, item.href))
      ) {
        initial[group.group] = true;
      }
    }
    return initial;
  });

  const isSearching = query.trim().length > 0;

  useEffect(() => {
    if (!isSearching) return;
    setExpandedGroups((prev) => {
      const next = { ...prev };
      for (const group of groups) {
        if (isCollapsibleGroup(group.group)) {
          next[group.group] = true;
        }
      }
      return next;
    });
  }, [isSearching, groups]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  return (
    <div className="rounded-2xl border border-crm-border bg-white p-3 shadow-sm lg:sticky lg:top-4">
      <label className="relative mb-3 block">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-crm-muted"
        />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search settings..."
          className="h-10 w-full rounded-lg border border-crm-border bg-white pl-9 pr-3 text-sm text-crm-text outline-none transition focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
          aria-label="Search settings"
        />
      </label>

      <div className="space-y-5">
        {groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-crm-border px-3 py-6 text-center">
            <p className="text-sm font-medium text-crm-text">No section found</p>
            <p className="mt-1 text-xs text-crm-muted">Try another keyword.</p>
          </div>
        ) : (
          groups.map((group) => {
            const collapsible = isCollapsibleGroup(group.group);
            const expanded = !collapsible || expandedGroups[group.group] !== false;

            return (
            <div key={group.group}>
              {collapsible ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.group)}
                  aria-expanded={expanded}
                  className="mb-2 flex w-full items-center justify-between rounded-md px-2 py-1 text-left transition hover:bg-crm-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-crm-muted">
                    {group.group}
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={
                      "shrink-0 text-crm-muted transition-transform duration-200 " +
                      (expanded ? "" : "-rotate-90")
                    }
                  />
                </button>
              ) : (
                <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-crm-muted">
                  {group.group}
                </div>
              )}
              {expanded && (
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={onNavigate}
                        className={
                          "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow " +
                          (active
                            ? "bg-crm-blue-soft font-medium text-crm-blue"
                            : "text-crm-text hover:bg-crm-panel")
                        }
                      >
                        {active && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-crm-blue transition-all duration-200"
                          />
                        )}
                        <Icon
                          size={16}
                          className={active ? "text-crm-blue" : "text-crm-muted group-hover:text-crm-text"}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              )}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeItem = useMemo(
    () => NAV.flatMap((group) => group.items).find((item) => isActive(pathname, item.href)),
    [pathname],
  );

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV;
    return NAV.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((group) => group.items.length > 0);
  }, [query]);

  return (
    <div className="min-w-0 bg-slate-50/70 px-2 pb-6 pt-2 sm:px-4 sm:pb-8 lg:px-6">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-4 rounded-2xl border border-crm-border bg-white px-4 py-4 shadow-sm sm:px-6">
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

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-crm-text sm:text-2xl">
                Settings
              </h1>
              <p className="mt-1 text-sm text-crm-muted">
                Manage profile, users, lead pipelines, product catalog, and integrations.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-crm-border bg-white px-3 py-2 text-sm font-medium text-crm-text transition hover:bg-crm-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow lg:hidden"
            >
              <Settings2 size={16} />
              Browse sections
            </button>
          </div>
        </header>

        <div className="flex min-w-0 flex-col gap-6 lg:flex-row">
          <aside className="hidden shrink-0 lg:block lg:w-80">
            <SettingsSidebar
              pathname={pathname}
              groups={visibleGroups}
              query={query}
              onQueryChange={setQuery}
            />
          </aside>

          {mobileOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 bg-slate-900/30"
                onClick={() => setMobileOpen(false)}
              />
              <aside className="absolute inset-y-0 left-0 w-[88vw] max-w-sm border-r border-crm-border bg-white p-3 shadow-xl">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-crm-text">Settings navigation</h2>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-md p-1.5 text-crm-muted transition hover:bg-crm-panel hover:text-crm-text"
                    aria-label="Close settings navigation"
                  >
                    <X size={16} />
                  </button>
                </div>
                <SettingsSidebar
                  pathname={pathname}
                  groups={visibleGroups}
                  query={query}
                  onQueryChange={setQuery}
                  onNavigate={() => setMobileOpen(false)}
                />
              </aside>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="min-w-0 rounded-2xl border border-crm-border bg-white p-4 shadow-sm sm:p-6 [&_.crm-card]:rounded-xl [&_.crm-card]:border [&_.crm-card]:border-crm-border [&_.crm-card]:shadow-sm [&_.crm-card]:transition [&_.crm-card]:hover:shadow-md [&_.crm-input]:h-11 [&_.crm-input]:rounded-lg [&_.crm-input]:border-crm-border [&_.crm-input]:bg-white [&_.crm-input]:focus-visible:ring-2 [&_.crm-input]:focus-visible:ring-crm-blue-glow">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
