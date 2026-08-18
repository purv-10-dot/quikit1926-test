"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "next-auth";
import { ThemeApplier } from "@quikit/ui/theme-applier";
import {
  LayoutDashboard,
  Zap,
  LayoutGrid,
  Clock,
  BarChart3,
  CheckCircle2,
  Plug,
  Settings,
  Search,
  Bell,
  Plus,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Workflows", href: "/workflows", icon: Zap },
  { label: "Templates", href: "/templates", icon: LayoutGrid },
];

const MONITOR_NAV: NavItem[] = [
  { label: "Run History", href: "/runs", icon: Clock },
  { label: "Insights", href: "/insights", icon: BarChart3 },
  { label: "Approvals", href: "/approvals", icon: CheckCircle2 },
];

const SETUP_NAV: NavItem[] = [
  { label: "Connections", href: "/connections", icon: Plug },
  { label: "Settings", href: "/settings", icon: Settings },
];

function initialsFrom(session: Session | null): string {
  const first = session?.user?.firstName ?? "";
  const last = session?.user?.lastName ?? "";
  if (first || last) return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "U";
  const name = session?.user?.name ?? session?.user?.email ?? "U";
  return name.slice(0, 2).toUpperCase();
}

export function DashboardShell({
  session,
  children,
}: {
  session: Session | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const quikitUrl = process.env.NEXT_PUBLIC_QUIKIT_URL ?? "";

  function NavLink({ item }: { item: NavItem }) {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {item.label}
      </Link>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-bg-secondary)]">
      <ThemeApplier />

      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col bg-accent-800 px-3 py-4 text-white">
        <div className="flex items-center gap-2 px-2 pb-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
            <Zap className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold">QuikFlow</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Monitor
          </p>
          {MONITOR_NAV.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Setup
          </p>
          {SETUP_NAV.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>

        {quikitUrl ? (
          <a
            href={`${quikitUrl}/apps`}
            className="mt-2 flex items-center gap-2 border-t border-white/10 px-3 pt-3 text-sm text-white/60 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            All apps
          </a>
        ) : null}
      </aside>

      {/* Main column */}
      <div className="ml-60 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 py-3">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search workflows…"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-accent-400"
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/workflows/new")}
              className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
            >
              <Plus className="h-4 w-4" />
              Create workflow
            </button>
            <button
              type="button"
              aria-label="Notifications"
              className="relative rounded-lg p-2 text-gray-500 hover:bg-[var(--color-bg-secondary)]"
            >
              <Bell className="h-5 w-5" />
            </button>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-600 text-sm font-semibold text-white">
              {initialsFrom(session)}
            </span>
          </div>
        </header>

        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
