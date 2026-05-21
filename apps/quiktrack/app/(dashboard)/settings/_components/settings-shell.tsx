"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Database, Settings as SettingsIcon, Users } from "lucide-react";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

const NAV: {
  key: string;
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}[] = [
  // { key: "general", label: "General", href: "/settings", icon: SettingsIcon },
  { key: "user-management", label: "User Management", href: "/settings/user-management", icon: Users, adminOnly: true },
  { key: "migration", label: "Migration", href: "/settings/migration", icon: Database, adminOnly: true },
];

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const perms = useMyPermissions();
  // Hide admin-only entries from non-admin users. The pages still re-enforce
  // via <RequirePerm adminOnly> so direct URL hits are safe too.
  const visibleNav = NAV.filter((n) => !n.adminOnly || perms.isAdmin);
  const isActive = (href: string) =>
    href === "/settings" ? pathname === href : pathname?.startsWith(href);

  return (
    <div className="flex h-[calc(100vh-48px)]">
      <aside className="w-60 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to QuikTrack
          </Link>
          <h2 className="mt-2 text-sm font-semibold text-gray-900">Settings</h2>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleNav.map((n) => {
            const Icon = n.icon;
            const active = isActive(n.href);
            return (
              <Link
                key={n.key}
                href={n.href}
                className={`flex items-center gap-2 px-4 py-2 text-sm ${
                  active
                    ? "bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600"
                    : "text-gray-700 hover:bg-gray-50 border-l-2 border-transparent"
                }`}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 bg-white overflow-y-auto">{children}</main>
    </div>
  );
}
