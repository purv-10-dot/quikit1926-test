"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Building2,
  ChevronDown,
  Gauge,
  KeyRound,
  Layers3,
  ListChecks,
  LogOut,
  Menu,
  Package,
  Phone,
  Plug,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Target,
  User,
  Users,
  Workflow,
  X,
} from "lucide-react";
import Link from "next/link";
import { AppSwitcher } from "@quikit/ui";
import { useAuth } from "@/hooks/use-auth";
import { isCrmAdmin } from "@/lib/auth/is-crm-admin";
import { useSidebar } from "@/components/layout/sidebar-context";
import { GlobalLogActivity } from "@/components/layout/global-log-activity";
import { NotificationBell } from "@/components/notifications/notification-bell";

const SETTINGS_MENU = [
  {
    section: "Personal Settings",
    items: [
      {
        href: "/settings/profile",
        icon: User,
        label: "My Profile",
        description: "Update your name, photo, and preferences",
      },
      {
        href: "/settings/company",
        icon: Building2,
        label: "Company",
        description: "Organization name, branding, and details",
      },
    ],
  },
  {
    section: "Users & Teams",
    items: [
      {
        href: "/settings/users",
        icon: Users,
        label: "Users",
        description: "Manage access, roles, and credentials",
      },
      {
        href: "/settings/teams",
        icon: Layers3,
        label: "Teams",
        description: "Organize users into structured teams",
      },
      {
        href: "/settings/sales-groups",
        icon: Workflow,
        label: "Sales Groups",
        description: "Manage territories and sales groups",
      },
      {
        href: "/settings/permissions",
        icon: ShieldCheck,
        label: "Permission Templates",
        description: "Create reusable permission sets",
      },
    ],
  },
  {
    section: "CRM Settings",
    items: [
      {
        href: "/settings/lead-scoring",
        icon: Gauge,
        label: "Leads",
        description: "Scoring rules, fields, stages, and sources",
      },
      {
        href: "/settings/call-dispositions",
        icon: Phone,
        label: "Call Disposition",
        description: "Define call outcome categories",
      },
      {
        href: "/settings/product-categories",
        icon: Package,
        label: "Products",
        description: "Categories, custom fields, and quote templates",
      },
      {
        href: "/settings/activity-types",
        icon: ListChecks,
        label: "Activity Types",
        description: "Define activity types and their custom fields",
      },
      {
        href: "/settings/activity-targets",
        icon: Target,
        label: "Activity Targets",
        description: "Set daily activity targets for salespeople",
        // Super Admin / Org Admin / CRM Administrator only.
        adminOnly: true,
      },
    ],
  },
  {
    section: "Integrations & Access",
    items: [
      {
        href: "/settings/email",
        icon: Plug,
        label: "Integrations",
        description: "Connect third-party tools and services",
      },
      // {
      //   href: "/settings/api-keys",
      //   icon: KeyRound,
      //   label: "API Keys",
      //   description: "Secret keys for public API integrations",
      // },
      // {
      //   href: "/settings/audit",
      //   icon: ScrollText,
      //   label: "Audit Log",
      //   description: "Review changes and activity history",
      // },
      {
        href: "/settings/notifications",
        icon: Bell,
        label: "Notifications",
        description: "Manage notification rules and recipients",
      },
    ],
  },
];

export function TopBar() {
  const { user, logout } = useAuth();
  const { setMobileOpen } = useSidebar();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click / Escape
  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setProfileOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  // Close settings dropdown on outside click / Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSettingsOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email?.split("@")[0] || "User";
  const firstName = user?.firstName || fullName.split(" ")[0];

  // Hide admin-only settings items (e.g. Activity Targets) for non-admins.
  // Sections that end up empty after filtering are dropped entirely.
  const isAdmin = isCrmAdmin(user?.role);
  const visibleMenu = SETTINGS_MENU.map((section) => ({
    ...section,
    items: section.items.filter((item) => !("adminOnly" in item && item.adminOnly) || isAdmin),
  })).filter((section) => section.items.length > 0);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-crm-border bg-white/95 px-3 backdrop-blur sm:px-4 lg:px-6">
      {/* Mobile drawer trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="crm-btn-ghost h-9 w-9 p-0 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>

      <h1 className="text-base font-semibold text-crm-text">
        Welcome, {firstName}!
      </h1>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <GlobalLogActivity />

        {/* Settings icon + dropdown */}
        <div className="relative" ref={settingsRef}>
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className={
              "flex h-9 w-9 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow " +
              (settingsOpen
                ? "bg-crm-blue-soft text-crm-blue"
                : "text-crm-muted hover:bg-crm-panel hover:text-crm-text")
            }
            title="Settings"
            aria-label="Settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
          >
            <Settings size={18} />
          </button>

          {settingsOpen && (
            <>
              {/* Mobile backdrop */}
              <div
                className="fixed inset-0 z-40 md:hidden"
                onClick={() => setSettingsOpen(false)}
                aria-hidden="true"
              />

              {/* Dropdown panel — fixed full-height on mobile, absolute card on desktop */}
              <div
                role="dialog"
                aria-label="Settings menu"
                className="fixed inset-x-0 top-14 bottom-0 z-50 overflow-y-auto bg-white md:absolute md:inset-auto md:bottom-auto md:right-0 md:top-full md:mt-2 md:w-[360px] md:max-h-[80vh] md:overflow-y-auto md:rounded-xl md:border md:border-crm-border md:shadow-crm-dropdown"
              >
                {/* Panel header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-crm-border bg-white/95 px-4 py-3 backdrop-blur-sm">
                  <span className="text-sm font-semibold text-crm-text">Settings</span>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-crm-muted transition hover:bg-crm-panel hover:text-crm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
                    aria-label="Close settings"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Sections */}
                {visibleMenu.map((section, si) => (
                  <div key={section.section} className={si > 0 ? "border-t border-crm-border" : ""}>
                    <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-crm-muted">
                      {section.section}
                    </div>
                    <div className="px-2 pb-2">
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setSettingsOpen(false)}
                            className="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition hover:bg-crm-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
                          >
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-crm-border bg-white text-crm-muted transition group-hover:border-crm-blue group-hover:bg-crm-blue-soft group-hover:text-crm-blue">
                              <Icon size={15} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-crm-text group-hover:text-crm-blue">
                                {item.label}
                              </span>
                              <span className="block text-xs text-crm-muted">
                                {item.description}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-crm-muted transition hover:bg-crm-panel hover:text-crm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
          title="Search"
          aria-label="Search"
        >
          <Search size={18} />
        </button>
        <NotificationBell />
<AppSwitcher />

        <div className="relative ml-1" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            className="flex h-9 items-center gap-1 rounded-full pl-0.5 pr-1.5 transition hover:bg-crm-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
            title={user?.email || ""}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-crm-border bg-crm-panel text-crm-muted">
              <User size={16} />
            </span>
            <ChevronDown size={14} className="text-crm-muted" />
          </button>
          {profileOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-crm-border bg-white py-1 shadow-crm-dropdown"
            >
              <div className="px-4 py-3">
                <div className="truncate text-sm font-semibold text-crm-text">
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="truncate text-xs text-crm-muted">{user?.email}</div>
                {user?.role && (
                  <div className="mt-1 truncate text-xs text-crm-muted">{user.role}</div>
                )}
              </div>
              <div className="my-1 border-t border-crm-border" />
              <button
                type="button"
                onClick={() => logout()}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-crm-text hover:bg-crm-panel"
                role="menuitem"
              >
                <LogOut size={16} className="text-crm-muted" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/30 px-3 pt-16 backdrop-blur-sm"
          onClick={() => setSearchOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-xl rounded-xl border border-crm-border bg-white p-2 shadow-crm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-2 py-1">
              <Search size={16} className="shrink-0 text-crm-muted" />
              <input
                autoFocus
                placeholder="Search leads, accounts, contacts…"
                className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-crm-muted"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded text-crm-muted hover:bg-crm-panel"
                aria-label="Close search"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
