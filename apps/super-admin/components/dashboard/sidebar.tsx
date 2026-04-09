"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  AppWindow,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Organisations", href: "/dashboard/organisations", icon: Building2 },
  { label: "Users", href: "/dashboard/users", icon: Users },
  { label: "Apps", href: "/dashboard/apps", icon: AppWindow },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 border-r border-[var(--color-border)] bg-[var(--color-bg-primary)] flex flex-col">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--color-secondary)] text-white font-bold text-sm">
          QIT
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
            Super Admin
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)]">QuikIT Platform</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--color-secondary-light)] text-[var(--color-secondary-dark)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text-primary)]"
              }`}
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
