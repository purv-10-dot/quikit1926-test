"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  HelpCircle,
  LogOut,
  Menu,
  Search,
  Settings,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { AppSwitcher } from "@quikit/ui";
import { useAuth } from "@/hooks/use-auth";
import { useSidebar } from "@/components/layout/sidebar-context";
import { GlobalLogActivity } from "@/components/layout/global-log-activity";

export function TopBar() {
  const { user, logout } = useAuth();
  const { setMobileOpen } = useSidebar();
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email?.split("@")[0] || "User";
  const firstName = user?.firstName || fullName.split(" ")[0];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-crm-border bg-white/95 px-3 backdrop-blur sm:px-4 lg:px-6">
      {/* Mobile drawer trigger — visible <lg only. Desktop collapse toggle now
       * lives inside the sidebar brand block. */}
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
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-crm-muted transition hover:bg-crm-panel hover:text-crm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
          title="Search"
          aria-label="Search"
        >
          <Search size={18} />
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-crm-muted transition hover:bg-crm-panel hover:text-crm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </button>
        <a
          href="https://docs.quikcrm.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-crm-muted transition hover:bg-crm-panel hover:text-crm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
          title="Help & docs"
          aria-label="Help and documentation"
        >
          <HelpCircle size={18} />
        </a>

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
              <Link
                href="/settings/profile"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-crm-text hover:bg-crm-panel"
                role="menuitem"
              >
                <Settings size={16} className="text-crm-muted" />
                Settings
              </Link>
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

      {/* Search overlay — opens for any viewport size */}
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
