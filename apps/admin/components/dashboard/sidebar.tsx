"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PATHS } from "@/lib/constants";
import { useDisabledModules } from "@/lib/hooks/useFeatureFlagsForApp";
import { isModuleEnabled } from "@quikit/shared/moduleRegistry";
import {
  LayoutDashboard,
  Users,
  FolderTree,
  AppWindow,
  Settings,
  ShieldCheck,
} from "lucide-react";

const navItems = [
  { key: "overview", label: "Overview", href: PATHS.DASHBOARD, icon: LayoutDashboard },
  { key: "members", label: "Members", href: PATHS.MEMBERS, icon: Users },
  { key: "teams", label: "Teams", href: PATHS.TEAMS, icon: FolderTree },
  { key: "apps", label: "Apps", href: PATHS.APPS, icon: AppWindow },
  { key: "roles", label: "Roles", href: PATHS.ROLES, icon: ShieldCheck },
  { key: "settings", label: "Settings", href: PATHS.SETTINGS, icon: Settings },
];

interface SidebarProps {
  orgName?: string | null;
  brandColor?: string | null;
}

export function Sidebar({ orgName, brandColor }: SidebarProps) {
  const pathname = usePathname();
  const disabled = useDisabledModules();
  const visibleNav = navItems.filter((item) => isModuleEnabled(item.key, disabled));

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 border-r border-[var(--color-border)] bg-[var(--color-bg-primary)] flex flex-col">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-[var(--color-border)]">
        <div
          className="flex items-center justify-center h-8 w-8 rounded-lg text-white font-bold text-sm"
          style={{ backgroundColor: brandColor || "#6366f1" }}
        >
          {orgName?.charAt(0)?.toUpperCase() || "Q"}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
            {orgName || "QuikScale"}
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)]">Admin Portal</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleNav.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== PATHS.DASHBOARD && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-secondary-light)] text-[var(--color-secondary-dark)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
